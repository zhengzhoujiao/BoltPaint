from fastapi import APIRouter, HTTPException, Query, Body, Depends, Request
from app.dependencies import create_access_token, get_current_user_id, get_admin_user_id
from app.models import (
    User,
    SendCodeRequest, SendCodeResponse,
    VerifyCodeRequest, RegisterRequest, RegisterResponse,
    LoginRequest, LoginResponse,
    SendResetCodeRequest, ResetPasswordRequest
)
from app.database import get_database, db
from app.config import settings
from app.routers.settings import get_dynamic_setting
from app.services.sms_service import send_verification_sms, send_reset_password_sms
from pymongo import ReturnDocument
from bson import ObjectId
from datetime import datetime, timedelta
from typing import Optional, List
import random
import secrets
import base64
import hashlib
from cryptography.fernet import Fernet

router = APIRouter(prefix="/user", tags=["users"])

DEFAULT_USER_AVATAR = "https://picsum.photos/id/64/200/200"


def user_doc_to_api_dict(user: dict) -> dict:
    """Mongo 用户文档 → API：头像仅使用 avatar；旧文档 user_image 合并后剔除该键。"""
    out = dict(user)
    out.pop("phone_number", None)
    legacy = out.pop("user_image", None)
    av = out.get("avatar")
    if isinstance(av, str) and av.strip():
        out["avatar"] = av.strip()
    elif isinstance(legacy, str) and legacy.strip():
        out["avatar"] = legacy.strip()
    else:
        out["avatar"] = DEFAULT_USER_AVATAR
    return out


# 内存存储验证码（生产环境应使用 Redis）
verification_codes: dict[str, dict] = {}

# 内存存储密码重置验证码（与注册验证码分开存储）
reset_codes: dict[str, dict] = {}

# 登录失败记录：{ip: {"count": int, "first_fail": datetime, "locked_until": datetime | None}}
login_attempts: dict[str, dict] = {}

# 普通用户登录：10 次失败后封禁 15 分钟
LOGIN_MAX_ATTEMPTS = 10
LOGIN_LOCKOUT_SECONDS = 15 * 60
LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60

# 管理员登录：5 次失败后封禁 30 分钟
ADMIN_LOGIN_MAX_ATTEMPTS = 5
ADMIN_LOGIN_LOCKOUT_SECONDS = 30 * 60


def get_client_ip(request: Request) -> str:
    """获取真实客户端 IP，兼容 nginx X-Real-IP 代理头"""
    return request.headers.get("X-Real-IP") or request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.client.host


def check_login_rate_limit(ip: str, max_attempts: int, lockout_seconds: int, window_seconds: int):
    """检查 IP 是否处于封禁期，超出则抛出 429"""
    now = datetime.utcnow()
    record = login_attempts.get(ip)
    if not record:
        return
    locked_until = record.get("locked_until")
    if locked_until and now < locked_until:
        remaining = int((locked_until - now).total_seconds())
        mins, secs = divmod(remaining, 60)
        raise HTTPException(
            status_code=429,
            detail=f"登录尝试过于频繁，请 {mins} 分 {secs} 秒后再试"
        )
    # 超出统计窗口，重置记录
    first_fail = record.get("first_fail")
    if first_fail and (now - first_fail).total_seconds() > window_seconds:
        del login_attempts[ip]


def record_login_failure(ip: str, max_attempts: int, lockout_seconds: int):
    """记录一次登录失败；达到阈值则封禁该 IP"""
    now = datetime.utcnow()
    if ip not in login_attempts:
        login_attempts[ip] = {"count": 0, "first_fail": now, "locked_until": None}
    login_attempts[ip]["count"] += 1
    if login_attempts[ip]["count"] >= max_attempts:
        login_attempts[ip]["locked_until"] = now + timedelta(seconds=lockout_seconds)
        print(f"🔒 IP {ip} 登录失败 {login_attempts[ip]['count']} 次，封禁 {lockout_seconds // 60} 分钟")


def record_login_success(ip: str):
    """登录成功，清除该 IP 的失败记录"""
    login_attempts.pop(ip, None)


def generate_verification_code() -> str:
    """生成6位数字验证码"""
    return str(random.randint(100000, 999999))


def get_fernet() -> Fernet:
    """获取加密实例，支持任意字符串作为密钥"""
    raw_key = settings.password_encryption_key
    if not raw_key:
        raise ValueError("password_encryption_key is not set in config")
        
    # 将任意字符串转换为 32 字节的 URL-safe Base64 编码密钥
    # 1. 计算 SHA-256 哈希（得到32字节的二进制数据）
    key_bytes = hashlib.sha256(raw_key.encode()).digest()
    # 2. 进行 URL-safe Base64 编码
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    
    return Fernet(fernet_key)


def encrypt_password(password: str) -> str:
    """使用可逆加密方法对密码进行加密"""
    if not password:
        return ""
    f = get_fernet()
    return f.encrypt(password.encode()).decode()


def decrypt_password(encrypted_password: str) -> str:
    """解密密码"""
    if not encrypted_password:
        return ""
    try:
        f = get_fernet()
        return f.decrypt(encrypted_password.encode()).decode()
    except Exception as e:
        print(f"❌ 密码解密失败: {e}")
        # 如果解密失败（可能是旧的哈希值），返回原始字符串
        return "[加密前数据/解密失败]"


def hash_password(password: str) -> str:
    """密码哈希 (现在改为可逆加密)"""
    return encrypt_password(password)


def _looks_like_sha256_hex(s: str) -> bool:
    """遗留脚本写入的 password_hash 可能为 64 位十六进制 SHA256"""
    if len(s) != 64:
        return False
    return all(c in "0123456789abcdefABCDEF" for c in s)


def plain_password_for_admin_display(stored_hash: Optional[str]) -> str:
    """管理员后台展示：由 password_hash 解密得到明文；SHA256 或失败时返回说明文字。"""
    if not stored_hash:
        return ""
    if isinstance(stored_hash, (bytes, bytearray)):
        stored_hash = stored_hash.decode("utf-8")
    stored_hash = str(stored_hash).strip()
    if not stored_hash:
        return ""
    if _looks_like_sha256_hex(stored_hash):
        return "（SHA256 存储，无法解密）"
    d = decrypt_password(stored_hash)
    if d.startswith("["):
        return "（解密失败）"
    return d


def verify_password(password: str, stored_data: str) -> bool:
    """验证密码：优先 Fernet 解密，兼容旧版 SHA256 哈希"""
    if not stored_data:
        return False
    # 1. 尝试 Fernet 可逆解密（当前 init_db 等使用的方式）
    try:
        decrypted = decrypt_password(stored_data)
        if decrypted and not decrypted.startswith("["):
            return decrypted == password
    except Exception:
        pass
    # 2. 兼容旧数据：存储的是 SHA256 哈希（如 check_db 创建的 admin）
    try:
        sha = hashlib.sha256(password.encode()).hexdigest()
        return sha == stored_data
    except Exception:
        return False


def clean_expired_codes():
    """清理过期的验证码"""
    current_time = datetime.utcnow()
    expired_phones = [
        phone for phone, data in verification_codes.items()
        if current_time > data["expires_at"]
    ]
    for phone in expired_phones:
        del verification_codes[phone]


def clean_expired_reset_codes():
    """清理过期的密码重置验证码"""
    current_time = datetime.utcnow()
    expired_phones = [
        phone for phone, data in reset_codes.items()
        if current_time > data["expires_at"]
    ]
    for phone in expired_phones:
        del reset_codes[phone]


@router.post("/send-reset-code", response_model=SendCodeResponse)
async def send_reset_code(request: SendResetCodeRequest):
    """发送密码重置验证码（手机号必须已注册）"""
    db_instance = get_database()
    clean_expired_reset_codes()

    # 检查手机号是否已注册
    existing_user = await db_instance.users.find_one({"phone": request.phone})
    if not existing_user:
        raise HTTPException(status_code=400, detail="该手机号未注册")

    # 频率限制：同一手机号 60 秒内只允许发送一次
    if request.phone in reset_codes:
        last_sent = reset_codes[request.phone].get("created_at")
        if last_sent and (datetime.utcnow() - last_sent).total_seconds() < 60:
            remaining = 60 - int((datetime.utcnow() - last_sent).total_seconds())
            raise HTTPException(status_code=429, detail=f"发送过于频繁，请 {remaining} 秒后重试")

    # 生成验证码
    code = generate_verification_code()
    expires_at = datetime.utcnow() + timedelta(seconds=300)  # 5分钟有效期

    # 存储验证码
    reset_codes[request.phone] = {
        "code": code,
        "expires_at": expires_at,
        "created_at": datetime.utcnow()
    }

    # 调用短信服务发送验证码（使用密码重置专属模板）
    try:
        await send_reset_password_sms(request.phone, code)
    except RuntimeError as e:
        reset_codes.pop(request.phone, None)
        raise HTTPException(status_code=500, detail=str(e))

    return SendCodeResponse(
        success=True,
        message="密码重置验证码已发送",
        expires_in=300
    )


@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """重置密码：验证手机验证码后更新密码"""
    db_instance = get_database()
    clean_expired_reset_codes()

    # 检查验证码是否存在
    if request.phone not in reset_codes:
        raise HTTPException(status_code=400, detail="验证码已过期或不存在，请重新获取")

    code_data = reset_codes[request.phone]

    # 检查是否过期
    if datetime.utcnow() > code_data["expires_at"]:
        del reset_codes[request.phone]
        raise HTTPException(status_code=400, detail="验证码已过期，请重新获取")

    # 验证码比对
    if code_data["code"] != request.code.strip():
        raise HTTPException(status_code=400, detail="验证码错误")

    # 检查用户是否存在
    existing_user = await db_instance.users.find_one({"phone": request.phone})
    if not existing_user:
        raise HTTPException(status_code=400, detail="该手机号未注册")

    # 更新密码
    new_password_hash = encrypt_password(request.new_password)
    await db_instance.users.update_one(
        {"phone": request.phone},
        {
            "$set": {
                "password_hash": new_password_hash,
                "phone": request.phone,
                "updated_at": datetime.utcnow(),
            }
        },
    )

    # 删除已使用的验证码
    del reset_codes[request.phone]

    print(f"✅ 密码重置成功: {request.phone}")
    return {"success": True, "message": "密码重置成功，请使用新密码登录"}


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, req: Request):
    """用户名密码登录"""
    print(f"🔐 收到登录请求: 用户名={request.username}")

    ip = get_client_ip(req)
    check_login_rate_limit(ip, LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT_SECONDS, LOGIN_ATTEMPT_WINDOW_SECONDS)

    try:
        # 检查数据库连接
        if db.client is None:
            print("❌ MongoDB 未连接")
            raise HTTPException(status_code=503, detail="数据库未连接，请检查 MongoDB 服务")
        
        db_instance = get_database()
        print(f"✅ 数据库连接正常")
        
        # 查找用户（通过用户名或手机号）
        print(f"🔍 正在查找用户: {request.username}")
        user = await db_instance.users.find_one({
            "$or": [
                {"username": request.username},
                {"phone": request.username},
            ]
        })
        
        if not user:
            print(f"❌ 用户不存在: {request.username}")
            record_login_failure(ip, LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT_SECONDS)
            raise HTTPException(status_code=401, detail="用户名或密码错误")
        
        print(f"✅ 找到用户: {user.get('username')}")
        
        # 取出密码哈希字段（统一使用 password_hash）
        stored_hash = user.get("password_hash")
        if not stored_hash:
            print(f"❌ 用户未设置密码: {request.username}")
            raise HTTPException(status_code=401, detail="该账号未设置密码，请使用手机号登录")
        
        # 检查账号是否被禁用
        if user.get("is_disabled", False):
            print(f"🔐 账号被禁用: {request.username}")
            raise HTTPException(status_code=403, detail="账号涉嫌违规操作，封禁中")
        
        if not verify_password(request.password, stored_hash):
            print(f"❌ 密码错误: {request.username}")
            record_login_failure(ip, LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT_SECONDS)
            raise HTTPException(status_code=401, detail="用户名或密码错误")
        
        # 登录成功，清除失败记录
        record_login_success(ip)

        # 生成 token
        token = create_access_token(data={"sub": user["id"]})
        
        user["_id"] = str(user["_id"])

        user_data = user_doc_to_api_dict(user)
        user_data = {k: v for k, v in user_data.items() if k != "password_hash"}
        user_obj = User(**user_data)
        
        print(f"✅ 登录成功: {user_obj.username}")
        
        return LoginResponse(
            success=True,
            message="登录成功",
            user=user_obj,
            token=token
        )
    except HTTPException:
        raise
    except RuntimeError as e:
        print(f"❌ 数据库错误: {e}")
        raise HTTPException(status_code=503, detail="数据库未连接，请检查 MongoDB 服务")
    except Exception as e:
        print(f"❌ 登录异常: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"登录失败: {str(e)}")


@router.post("/admin/login", response_model=LoginResponse)
async def admin_login(request: LoginRequest, req: Request):
    """管理员登录"""
    print(f"🔐 收到管理员登录请求: 用户名={request.username}")

    ip = get_client_ip(req)
    check_login_rate_limit(ip, ADMIN_LOGIN_MAX_ATTEMPTS, ADMIN_LOGIN_LOCKOUT_SECONDS, LOGIN_ATTEMPT_WINDOW_SECONDS)

    db_instance = get_database()
    
    # 查找用户（通过用户名或手机号）
    user = await db_instance.users.find_one({
        "$or": [
            {"username": request.username},
            {"phone": request.username},
        ]
    })
    
    if not user:
        record_login_failure(ip, ADMIN_LOGIN_MAX_ATTEMPTS, ADMIN_LOGIN_LOCKOUT_SECONDS)
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    
    # 取出密码哈希字段
    stored_hash = user.get("password_hash")
    if not stored_hash:
        raise HTTPException(status_code=401, detail="该账号未设置密码，请联系超级管理员")
    
    if not verify_password(request.password, stored_hash):
        record_login_failure(ip, ADMIN_LOGIN_MAX_ATTEMPTS, ADMIN_LOGIN_LOCKOUT_SECONDS)
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    
    # 检查账号是否被禁用
    if user.get("is_disabled", False):
        print(f"🔐 管理员账号被禁用: {request.username}")
        raise HTTPException(status_code=403, detail="账号涉嫌违规操作，封禁中")
    
    # 额外检查权限
    if not user.get("is_admin", False):
        print(f"⚠️ 非管理员尝试登录后台: {request.username}")
        record_login_failure(ip, ADMIN_LOGIN_MAX_ATTEMPTS, ADMIN_LOGIN_LOCKOUT_SECONDS)
        raise HTTPException(status_code=403, detail="权限不足，只有管理员可登录后台")
    
    # 登录成功，清除失败记录
    record_login_success(ip)

    # 生成 token
    token = create_access_token(data={"sub": user["id"]})
    
    user["_id"] = str(user["_id"])

    user_data = user_doc_to_api_dict(user)
    user_data = {k: v for k, v in user_data.items() if k != "password_hash"}
    user_obj = User(**user_data)
    
    print(f"✅ 管理员登录成功: {user_obj.username}")
    
    return LoginResponse(
        success=True,
        message="登录成功",
        user=user_obj,
        token=token
    )


@router.get("/me", response_model=User)
async def get_user_profile(user_id: str = Depends(get_current_user_id)):
    """获取当前用户信息"""
    try:
        if db.client is None:
            raise HTTPException(status_code=503, detail="数据库未连接")
        
        db_instance = get_database()
        user = await db_instance.users.find_one({"id": user_id})
        
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        
        user["_id"] = str(user["_id"])

        user_data = user_doc_to_api_dict(user)
        user_data = {k: v for k, v in user_data.items() if k not in ("password_hash", "last_daily_claim_date")}
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        user_data["can_claim_daily_today"] = user.get("last_daily_claim_date") != today_str
        return User(**user_data)
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail="数据库未连接，请检查 MongoDB 服务")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取用户信息失败: {str(e)}")


@router.post("/claim-daily-beans")
async def claim_daily_free_beans(user_id: str = Depends(get_current_user_id)):
    """领取每日免费豆子（每天仅可领取一次）"""
    db = get_database()
    enabled = await get_dynamic_setting("daily_free_beans_enabled", False)
    if not enabled:
        raise HTTPException(status_code=400, detail="每日免费豆子功能未开放")
    amount = await get_dynamic_setting("daily_free_beans_amount", 10)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="每日可领取豆子数量未配置")
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    if user.get("last_daily_claim_date") == today_str:
        raise HTTPException(status_code=400, detail="今日已领取，明天再来吧")
    result = await db.users.find_one_and_update(
        {"id": user_id},
        {
            "$inc": {"balance_beans": amount},
            "$set": {"last_daily_claim_date": today_str, "updated_at": datetime.utcnow()}
        },
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"success": True, "balance_beans": result["balance_beans"], "claimed": amount}


@router.post("/send-code", response_model=SendCodeResponse)
async def send_verification_code(request: SendCodeRequest):
    """发送手机验证码"""
    db = get_database()
    
    # 清理过期验证码
    clean_expired_codes()
    
    # 检查手机号是否已注册
    existing_user = await db.users.find_one({"phone": request.phone})
    if existing_user:
        raise HTTPException(status_code=400, detail="该手机号已被注册")
    
    # 频率限制：同一手机号 60 秒内只允许发送一次
    if request.phone in verification_codes:
        last_sent = verification_codes[request.phone].get("created_at")
        if last_sent and (datetime.utcnow() - last_sent).total_seconds() < 60:
            remaining = 60 - int((datetime.utcnow() - last_sent).total_seconds())
            raise HTTPException(status_code=429, detail=f"发送过于频繁，请 {remaining} 秒后重试")
    
    # 生成验证码
    code = generate_verification_code()
    expires_at = datetime.utcnow() + timedelta(seconds=300)  # 5分钟有效期
    
    # 存储验证码
    verification_codes[request.phone] = {
        "code": code,
        "expires_at": expires_at,
        "created_at": datetime.utcnow()
    }
    
    # 调用短信服务发送验证码（sms_enabled=False 时仅打印到控制台）
    try:
        await send_verification_sms(request.phone, code)
    except RuntimeError as e:
        # 发送失败时清除验证码记录，防止无效残留
        verification_codes.pop(request.phone, None)
        raise HTTPException(status_code=500, detail=str(e))
    
    return SendCodeResponse(
        success=True,
        message="验证码已发送",
        expires_in=300
    )


@router.post("/verify-code", response_model=dict)
async def verify_code(request: VerifyCodeRequest):
    """验证验证码"""
    clean_expired_codes()
    
    if request.phone not in verification_codes:
        raise HTTPException(status_code=400, detail="验证码已过期或不存在，请重新获取")
    
    code_data = verification_codes[request.phone]
    
    if datetime.utcnow() > code_data["expires_at"]:
        del verification_codes[request.phone]
        raise HTTPException(status_code=400, detail="验证码已过期，请重新获取")
    
    if code_data["code"] != request.code:
        raise HTTPException(status_code=400, detail="验证码错误")
    
    # 验证成功，但不删除验证码（注册时还需要验证）
    return {
        "success": True,
        "message": "验证码正确"
    }


@router.post("/register", response_model=RegisterResponse)
async def register(request: RegisterRequest):
    """手机号注册"""
    db = get_database()
    
    # 清理过期验证码
    clean_expired_codes()
    
    # 若系统开启「注册需激活码」，则校验并消耗激活码
    activation_code_required = await get_dynamic_setting("activation_code_required", False)
    if activation_code_required:
        ac = (request.activation_code or "").strip().upper()
        if not ac:
            raise HTTPException(status_code=400, detail="请填写激活码")
        db_ac = await db.activation_codes.find_one({"code": ac, "used_at": None})
        if not db_ac:
            raise HTTPException(status_code=400, detail="激活码无效或已被使用")
        # 注册成功后再标记为已使用（在 insert_one 之后）
    
    # 短信验证码：由后台「注册需手机验证码」开关控制，未配置时默认与 sms_enabled 一致
    registration_sms_required = await get_dynamic_setting(
        "registration_sms_code_required", settings.sms_enabled
    )
    if registration_sms_required:
        if not request.phone or not request.phone.strip():
            raise HTTPException(status_code=400, detail="请填写手机号")
        if not request.code or not request.code.strip():
            raise HTTPException(status_code=400, detail="请填写短信验证码")
    
    if request.code and request.code.strip():
        if request.phone not in verification_codes:
            raise HTTPException(status_code=400, detail="验证码已过期，请重新获取")
        code_data = verification_codes[request.phone]
        if datetime.utcnow() > code_data["expires_at"]:
            del verification_codes[request.phone]
            raise HTTPException(status_code=400, detail="验证码已过期，请重新获取")
        if code_data["code"] != request.code.strip():
            raise HTTPException(status_code=400, detail="验证码错误")
    
    # 检查手机号是否已注册
    existing_user = await db.users.find_one({"phone": request.phone})
    if existing_user:
        raise HTTPException(status_code=400, detail="该手机号已被注册")
    
    # 检查用户名是否已存在
    existing_username = await db.users.find_one({"username": request.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="用户名已存在")
    
    # 获取会员编号 (从 1 开始)
    # 使用计数器保证并发下也是递增的
    counter = await db.counters.find_one_and_update(
        {"id": "member_number"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER
    )
    member_number = counter["seq"]

    # 创建新用户基本参数
    user_id = f"u_{int(datetime.utcnow().timestamp() * 1000)}"
    # 注册时依然使用加密存储
    password_encrypted = encrypt_password(request.password)
    default_avatar = f"https://picsum.photos/seed/{user_id}/200/200"
    avatar_url = request.avatar if request.avatar else default_avatar

    # 获取动态奖励配置
    new_user_reward = await get_dynamic_setting("new_user_reward_amount", 100)
    referral_reward = await get_dynamic_setting("referral_reward_amount", 50)
    
    # 查找邀请人并奖励
    referrer_id = None
    if request.referrer_code:
        referrer = await db.users.find_one({"invite_code": request.referrer_code})
        if referrer:
            referrer_id = referrer["id"]
            await db.users.update_one(
                {"id": referrer_id},
                {"$inc": {"balance_beans": referral_reward}}
            )
            print(f"[REFERRAL] User {referrer_id} rewarded {referral_reward} for referring {user_id}")

    # 生成邀请码 (6位大写字母+数字)
    import string
    invite_code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))

    new_user = {
        "id": user_id,
        "username": request.username,
        "phone": request.phone,
        "member_number": member_number,
        "avatar": avatar_url,
        "password_hash": password_encrypted,
        "is_admin": False,
        "balance_beans": new_user_reward,  # 使用动态配置
        "is_new_user": True,
        "invite_code": invite_code,
        "referrer_id": referrer_id,        # 记录是谁邀请的
        "like_ids": [],
        "collection_ids": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    ins = await db.users.insert_one(new_user)
    new_user["_id"] = str(ins.inserted_id)

    # 若开启了激活码且本次使用了激活码，则标记为已使用
    if activation_code_required and request.activation_code:
        ac = (request.activation_code or "").strip().upper()
        await db.activation_codes.update_one(
            {"code": ac},
            {"$set": {"used_by_user_id": user_id, "used_at": datetime.utcnow()}}
        )
    
    # 若本次使用了验证码，则删除已使用的验证码
    if request.code and request.code.strip() and request.phone in verification_codes:
        del verification_codes[request.phone]
    
    # 生成 token（使用 JWT）
    token = create_access_token(data={"sub": user_id})
    
    user_data = user_doc_to_api_dict(new_user)
    user_data = {k: v for k, v in user_data.items() if k != "password_hash"}
    user = User(**user_data)
    
    return RegisterResponse(
        success=True,
        message="注册成功",
        user=user,
        token=token
    )


@router.put("/me", response_model=User)
async def update_user_profile(
    user_id: str = Depends(get_current_user_id),
    username: Optional[str] = Query(None, description="用户名"),
    avatar: Optional[str] = Query(None, description="头像URL"),
):
    """更新用户信息（头像仅使用 avatar 字段）"""
    db = get_database()

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    update_data: dict = {"updated_at": datetime.utcnow()}

    if username:
        existing_user = await db.users.find_one({"username": username, "id": {"$ne": user_id}})
        if existing_user:
            raise HTTPException(status_code=400, detail="用户名已被占用")
        update_data["username"] = username

    if avatar is not None and str(avatar).strip() != "":
        update_data["avatar"] = str(avatar).strip()

    result = await db.users.find_one_and_update(
        {"id": user_id},
        {"$set": update_data, "$unset": {"user_image": ""}},
        return_document=True,
    )

    result["_id"] = str(result["_id"])
    user_data = user_doc_to_api_dict(result)
    user_data = {k: v for k, v in user_data.items() if k != "password_hash"}

    return User(**user_data)


# --- 管理员接口 ---

@router.get("", response_model=List[User])
async def list_users(
    skip: int = 0,
    limit: int = 20,
    username: Optional[str] = None,
    phone: Optional[str] = None,
    is_new_user: Optional[bool] = None,
    admin_id: str = Depends(get_admin_user_id)
):
    """(Admin) 获取用户列表"""
    db = get_database()
    query = {}
    if username:
        query["username"] = {"$regex": username, "$options": "i"}
    if phone:
        query["phone"] = {"$regex": phone, "$options": "i"}
    if is_new_user is not None:
        query["is_new_user"] = is_new_user
        
    cursor = db.users.find(query).skip(skip).limit(limit).sort("created_at", -1)
    users = []
    async for user in cursor:
        user["_id"] = str(user["_id"])
        user_data = user_doc_to_api_dict(user)
        user_data = {k: v for k, v in user_data.items() if k != "password_hash"}
        user_data["plain_password"] = plain_password_for_admin_display(user.get("password_hash"))
        users.append(User(**user_data))
    return users


@router.put("/{target_user_id}", response_model=User)
async def admin_update_user(
    target_user_id: str,
    admin_id: str = Depends(get_admin_user_id),
    username: Optional[str] = Body(None),
    phone: Optional[str] = Body(None, description="手机号"),
    balance_beans: Optional[int] = Body(None),
    is_new_user: Optional[bool] = Body(None),
    is_disabled: Optional[bool] = Body(None),
    password: Optional[str] = Body(None)
):
    """(Admin) 更新任意用户信息"""
    db = get_database()
    
    update_data = {"updated_at": datetime.utcnow()}
    if username is not None:
        update_data["username"] = username
    if phone is not None:
        update_data["phone"] = phone
    if balance_beans is not None:
        update_data["balance_beans"] = balance_beans
    if is_new_user is not None:
        update_data["is_new_user"] = is_new_user
    if is_disabled is not None:
        update_data["is_disabled"] = is_disabled
    if password is not None:
        update_data["password_hash"] = encrypt_password(password)
        
    result = await db.users.find_one_and_update(
        {"id": target_user_id},
        {"$set": update_data, "$unset": {"user_image": ""}},
        return_document=True,
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="用户不存在")
        
    result["_id"] = str(result["_id"])
    user_data = user_doc_to_api_dict(result)
    user_data = {k: v for k, v in user_data.items() if k != "password_hash"}
    user_data["plain_password"] = plain_password_for_admin_display(result.get("password_hash"))
    return User(**user_data)
