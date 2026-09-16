"""
数据库初始化脚本
根据文档中的数据模型设计初始化所有集合和示例数据
"""
import sys
from pathlib import Path

# 将 backend 目录加入路径，便于从 backend/database 下直接运行
_backend_root = Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
import hashlib
import secrets
import string
from datetime import datetime, timedelta
from typing import Any, Mapping, Optional


def _gen_invite_code() -> str:
    """生成 6 位大写字母+数字邀请码（与 users 注册逻辑一致）"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))


async def migrate_user_phone_single_field(db) -> None:
    """
    统一手机号：仅保留 `phone`。
    若文档仍有 `phone_number`，则在 `phone` 为空时用其补全，然后删除 `phone_number`。
    """
    now = datetime.utcnow()
    n = 0
    async for doc in db.users.find({"phone_number": {"$exists": True}}):
        uid = doc.get("id")
        if not uid:
            continue
        current = doc.get("phone")
        pn = doc.get("phone_number")
        set_fields = {"updated_at": now}
        if (not current or (isinstance(current, str) and not current.strip())) and pn and str(pn).strip():
            set_fields["phone"] = str(pn).strip()
        await db.users.update_one(
            {"id": uid},
            {"$set": set_fields, "$unset": {"phone_number": ""}},
        )
        n += 1
    if n:
        print(f"   [+] 已从 {n} 条用户文档移除 phone_number，并必要时用其补全 phone")

    try:
        await db.users.drop_index("uniq_phone_number_sparse")
        print("   [+] 已删除旧索引 uniq_phone_number_sparse")
    except Exception:
        pass


def _index_key_tuple(index_doc: Mapping[str, Any]) -> tuple:
    raw = index_doc.get("key")
    if not raw:
        return ()
    return tuple(dict(raw).items())


def _spec_key_tuple(keys: list) -> tuple:
    return tuple(keys)


def _index_options_compatible(existing: Mapping[str, Any], opts: dict) -> bool:
    """键序一致时，判断已有索引是否满足本次 create_index 的 unique / sparse 要求。"""
    if opts.get("unique") and not existing.get("unique"):
        return False
    if opts.get("sparse") and not existing.get("sparse"):
        return False
    return True


async def ensure_database_indexes(db) -> None:
    """创建业务索引（幂等）。已存在同键序且选项兼容的索引（含默认命名）则跳过，避免 IndexOptionsConflict。"""
    specs = [
        ("users", [("username", 1)], {"unique": True, "name": "uniq_username"}),
        ("users", [("phone", 1)], {"unique": True, "sparse": True, "name": "uniq_phone_sparse"}),
        ("users", [("id", 1)], {"unique": True, "name": "uniq_user_id"}),
        ("templates", [("id", 1)], {"unique": True, "name": "uniq_template_id"}),
        ("artworks", [("is_release", 1), ("created_at", -1)], {"name": "artworks_release_created"}),
        ("artworks", [("id", 1)], {"unique": True, "name": "uniq_artwork_id"}),
        ("artworks", [("source_task_id", 1)], {"unique": True, "sparse": True, "name": "uniq_artwork_source_task"}),
        ("orders", [("id", 1)], {"unique": True, "name": "uniq_order_id"}),
        ("orders", [("user_id", 1), ("created_at", -1)], {"name": "orders_user_created"}),
        ("tickets", [("user_id", 1), ("updated_at", -1)], {"name": "tickets_user_updated"}),
        ("tickets", [("id", 1)], {"unique": True, "name": "uniq_ticket_id"}),
        ("tasks", [("user_id", 1), ("created_at", -1)], {"name": "tasks_user_created"}),
        ("tasks", [("id", 1)], {"unique": True, "name": "uniq_task_id"}),
        ("activation_codes", [("code", 1)], {"unique": True, "name": "uniq_activation_code"}),
        ("tags", [("id", 1)], {"unique": True, "name": "uniq_tag_id"}),
        ("pricing_strategies", [("id", 1)], {"unique": True, "name": "uniq_pricing_strategy_id"}),
        ("image_models", [("id", 1)], {"unique": True, "name": "uniq_image_model_id"}),
        ("system_settings", [("key", 1)], {"unique": True, "name": "uniq_system_setting_key"}),
        ("counters", [("id", 1)], {"unique": True, "name": "uniq_counter_id"}),
        ("recharge_packages", [("id", 1)], {"unique": True, "name": "uniq_recharge_package_id"}),
    ]

    index_cache: dict[str, list[Any]] = {}

    async def _list_cached(coll_name: str) -> list[Any]:
        if coll_name not in index_cache:
            index_cache[coll_name] = [idx async for idx in db[coll_name].list_indexes()]
        return index_cache[coll_name]

    def _find_same_key(indexes: list[Any], keys: list) -> Any | None:
        want = _spec_key_tuple(keys)
        for idx in indexes:
            if _index_key_tuple(idx) == want:
                return idx
        return None

    for coll_name, keys, opts in specs:
        want_name = opts.get("name", "")
        try:
            indexes = await _list_cached(coll_name)
            existing = _find_same_key(indexes, keys)
            if existing is not None and _index_options_compatible(existing, opts):
                continue
            if existing is not None and not _index_options_compatible(existing, opts):
                await db[coll_name].drop_index(existing["name"])
                index_cache.pop(coll_name, None)
            await db[coll_name].create_index(keys, **opts)
            index_cache.pop(coll_name, None)
        except Exception as e:
            print(f"   [!] 索引创建失败 {coll_name} {want_name}: {e}")


async def init_database() -> bool:
    """初始化数据库，创建所有集合和示例数据。成功返回 True，失败返回 False。"""
    try:
        print(f"[*] 正在连接 MongoDB: {settings.mongodb_url}")
        client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=5000)
        
        # 测试连接
        await client.admin.command('ping')
        print("[+] MongoDB 连接成功")
        
        # 获取数据库
        db = client[settings.mongodb_db_name]
        print(f"[*] 使用数据库: {settings.mongodb_db_name}")
        
        # 初始化各个集合
        await init_users(db)
        await migrate_user_phone_single_field(db)
        await init_pricing_strategies(db)
        await init_image_models(db)
        await init_templates(db)
        await init_artworks(db)
        await init_tickets(db)
        await init_tags(db)
        await init_tasks(db)
        await init_system_settings(db)
        await init_recharge_packages(db)
        await ensure_database_indexes(db)

        # 统计数据（在关闭连接前）
        print("\n[+] 数据库初始化完成！")
        print("\n[*] 数据统计:")
        print(f"   - 用户: {await db.users.count_documents({})} 个")
        print(f"   - 模板: {await db.templates.count_documents({})} 个")
        print(f"   - 作品: {await db.artworks.count_documents({})} 个")
        print(f"   - 订单: {await db.orders.count_documents({})} 个")
        print(f"   - 工单: {await db.tickets.count_documents({})} 个")
        print(f"   - 标签: {await db.tags.count_documents({})} 个")
        print(f"   - 任务: {await db.tasks.count_documents({})} 个")
        print(f"   - 定价策略: {await db.pricing_strategies.count_documents({})} 个")
        print(f"   - 充值档位: {await db.recharge_packages.count_documents({})} 个")

        client.close()
        return True
        
    except Exception as e:
        print(f"[-] 数据库初始化失败: {e}")
        import traceback
        traceback.print_exc()
        print("\n[*] 请确保:")
        print("   1. MongoDB 服务正在运行")
        print("   2. MongoDB 连接地址正确")
        print("   3. 有足够的权限访问数据库")
        return False


import base64
from cryptography.fernet import Fernet

def get_fernet() -> Fernet:
    """获取加密实例"""
    raw_key = settings.password_encryption_key
    if not raw_key:
        raise ValueError("password_encryption_key is not set in config")
    key_bytes = hashlib.sha256(raw_key.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)

def encrypt_password(password: str) -> str:
    """加密密码"""
    if not password:
        return ""
    f = get_fernet()
    return f.encrypt(password.encode()).decode()


async def init_users(db):
    """初始化用户集合"""
    print("\n[*] 初始化用户集合...")
    
    # 检查是否已有用户数据
    user_count = await db.users.count_documents({})
    if user_count > 0:
        print(f"   [!] 用户集合已有 {user_count} 个用户，跳过初始化")
        return
    
    if not settings.initial_admin_password:
        raise ValueError(
            "INITIAL_ADMIN_PASSWORD 未配置，无法初始化管理员账号。"
            "请在 backend/.env.local 或运行环境中设置后重试。"
        )

    if not settings.initial_test_user_password:
        raise ValueError(
            "INITIAL_TEST_USER_PASSWORD 未配置，无法初始化演示用户。"
            "请在 backend/.env.local 或运行环境中设置后重试。"
        )

    # 创建管理员账号 - 使用可逆加密
    admin_password_encrypted = encrypt_password(settings.initial_admin_password)
    admin_user = {
        "id": "admin_001",
        "username": settings.initial_admin_username,
        "avatar": "/boltPaint/images/avatar/cat.jpeg",
        "balance_beans": 10000,
        "is_new_user": False,
        "password_hash": admin_password_encrypted,
        "wx_unionid": None,
        "is_admin": True,
        "invite_code": _gen_invite_code(),
        "like_ids": [],
        "collection_ids": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    # 创建测试用户 - 使用可逆加密
    test_password_encrypted = encrypt_password(settings.initial_test_user_password)
    test_users = [
        {
            "id": "u_001",
            "username": "测试",
            "phone": "13800138001",
            "avatar": "/boltPaint/images/avatar/cat.jpeg",
            "balance_beans": 500,
            "is_new_user": False,
            "password_hash": test_password_encrypted,
            "wx_unionid": None,
            "is_admin": False,
            "invite_code": _gen_invite_code(),
            "like_ids": [],
            "collection_ids": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
    ]
    
    await db.users.insert_one(admin_user)
    await db.users.insert_many(test_users)
    print(f"   [+] 已创建 {len(test_users) + 1} 个用户（1个管理员 + 1个测试用户）")


async def init_templates(db):
    """初始化模板集合"""
    print("\n[*] 初始化模板集合...")
    
    # 检查是否已有模板数据
    template_count = await db.templates.count_documents({})
    if template_count > 0:
        print(f"   [!] 模板集合已有 {template_count} 个模板，跳过初始化")
        return
    
    templates = [
        {
            "id": "t_001",
            "name": "赛博朋克 2077",
            "cover_image": "https://picsum.photos/id/20/400/400",
            "system_instruction": "You are a concept artist for a Cyberpunk movie. Use neon colors, high contrast, rainy streets, and futuristic technology.",
            "preset_prompt": "cyberpunk style, neon lights, highly detailed, 8k resolution, cinematic lighting",
            "description": "未来主义的霓虹城市和高科技角色风格。",
            "pricing_strategy_id": "BananaPro",
            "tags": ["tag_001", "tag_013", "tag_023", "tag_024"],  # 赛博朋克、科幻、细节丰富、杰作
            "use_count": 150,
            "is_featured": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": "t_002",
            "name": "吉卜力动漫",
            "cover_image": "https://picsum.photos/id/111/400/400",
            "system_instruction": "You are an anime background artist. Create lush landscapes, fluffy clouds, vibrant greens and blues, hand-painted texture.",
            "preset_prompt": "studio ghibli style, anime art, peaceful atmosphere, vibrant colors, masterpiece",
            "description": "受吉卜力工作室启发的治愈系动漫风格。",
            "pricing_strategy_id": "BananaPro",
            "tags": ["tag_002", "tag_009", "tag_017", "tag_024"],  # 动漫、风景、梦幻、杰作
            "use_count": 230,
            "is_featured": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": "t_003",
            "name": "古典油画",
            "cover_image": "https://picsum.photos/id/102/400/400",
            "system_instruction": "You are a master oil painter like Van Gogh. Use thick brush strokes, impasto technique, rich colors.",
            "preset_prompt": "oil painting, thick brushstrokes, impressionist style, canvas texture, fine art",
            "description": "经典的印象派油画质感。",
            "pricing_strategy_id": "BananaPro",
            "tags": ["tag_003", "tag_010", "tag_023", "tag_024"],  # 油画、人物、细节丰富、杰作
            "use_count": 85,
            "is_featured": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": "t_004",
            "name": "3D 渲染",
            "cover_image": "https://picsum.photos/id/250/400/400",
            "system_instruction": "You are a 3D modeler. Create cute, rounded characters with subsurface scattering, soft studio lighting, clay material.",
            "preset_prompt": "3d render, c4d, blender, cute, chibi, soft lighting, 4k",
            "description": "皮克斯风格的可爱 3D 角色设计。",
            "pricing_strategy_id": "Banana2",
            "tags": ["tag_005", "tag_022", "tag_023"],  # 写实、4K、细节丰富
            "use_count": 120,
            "is_featured": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": "t_005",
            "name": "水彩画风格",
            "cover_image": "https://picsum.photos/id/1018/400/400",
            "system_instruction": "You are a watercolor artist. Use soft, flowing colors, wet-on-wet technique, transparent layers, delicate brushwork.",
            "preset_prompt": "watercolor painting, soft colors, flowing brushstrokes, artistic, beautiful",
            "description": "柔和流动的水彩画风格。",
            "pricing_strategy_id": "Banana2",
            "tags": ["tag_004", "tag_009", "tag_017"],  # 水彩、风景、梦幻
            "use_count": 95,
            "is_featured": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": "t_006",
            "name": "写实摄影",
            "cover_image": "https://picsum.photos/id/1035/400/400",
            "system_instruction": "You are a professional photographer. Create realistic, high-quality photos with natural lighting, sharp focus, professional composition.",
            "preset_prompt": "photorealistic, professional photography, sharp focus, natural lighting, 8k",
            "description": "专业摄影级别的写实风格。",
            "pricing_strategy_id": "Banana2",
            "tags": ["tag_005", "tag_021", "tag_022", "tag_023"],  # 写实、高清、4K、细节丰富
            "use_count": 180,
            "is_featured": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
    ]
    
    await db.templates.insert_many(templates)
    print(f"   [+] 已创建 {len(templates)} 个模板")
    
    
async def init_pricing_strategies(db):
    """初始化定价策略集合（upsert，确保新增策略在已有数据库中也能补全）"""
    print("\n[*] 初始化定价策略集合...")

    strategies = [
        {
            "id": "BananaPro",
            "name": "NanoBanana Pro",
            "model_id": "nano-banana-pro-beta",
            "price_1k": 8,
            "price_2k": 15,
            "price_4k": 27,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": "Banana2",
            "name": "NanoBanana 2",
            "model_id": "nano-banana-2-beta",
            "price_1k": 5,
            "price_2k": 8,
            "price_4k": 13,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": "ZTurbo",
            "name": "ZTurbo",
            "model_id": "z-image-turbo",
            "price_1k": 2,
            "price_2k": 4,
            "price_4k": 6,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        {
            "id": "GPTImage2",
            "name": "GPT Image 2",
            "model_id": "gpt-image-2-beta",
            "price_1k": 10,
            "price_2k": 20,
            "price_4k": 35,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
    ]

    inserted = 0
    for s in strategies:
        existing = await db.pricing_strategies.find_one({"id": s["id"]})
        if not existing:
            await db.pricing_strategies.insert_one(s)
            inserted += 1
            print(f"   [+] 新增策略: {s['id']}")
        else:
            print(f"   [=] 已存在策略: {s['id']}，跳过")
    print(f"   [+] 定价策略初始化完成，新增 {inserted} 条")


async def init_image_models(db):
    """初始化生图模型配置集合（upsert，确保新增模型在已有数据库中也能补全）"""
    print("\n[*] 初始化生图模型配置集合...")

    models = [
        {
            "id": "nano-banana-pro-beta",
            "name": "NanoBanana Pro",
            "is_flash": False,
            "supports_512": False,
            "description": "最强生图模型，支持参考图，适合追求高质量的创作。",
            "pricing_strategy_id": "BananaPro",
            "enabled": True,
            "sort_order": 0,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        },
        {
            "id": "nano-banana-2-beta",
            "name": "NanoBanana 2",
            "is_flash": False,
            "supports_512": False,
            "description": "快速生图模型，支持参考图，适合快速预览和低成本出图。",
            "pricing_strategy_id": "Banana2",
            "enabled": True,
            "sort_order": 1,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        },
        {
            "id": "gpt-image-2-beta",
            "name": "GPT Image 2",
            "is_flash": False,
            "supports_512": False,
            "description": "OpenAI GPT 生图模型，支持参考图与高清输出。",
            "pricing_strategy_id": "GPTImage2",
            "enabled": True,
            "sort_order": 2,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        },
        {
            "id": "z-image-turbo",
            "name": "Z Image Turbo",
            "is_flash": False,
            "supports_512": False,
            "description": "Evolink Z Image Turbo 超快生图模型。",
            "pricing_strategy_id": "ZTurbo",
            "enabled": True,
            "sort_order": 3,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        },
    ]

    inserted = 0
    for m in models:
        existing = await db.image_models.find_one({"id": m["id"]})
        if not existing:
            await db.image_models.insert_one(m)
            inserted += 1
            print(f"   [+] 新增模型: {m['id']} ({m['name']})")
        else:
            print(f"   [=] 已存在模型: {m['id']}，跳过")
    print(f"   [+] 生图模型初始化完成，新增 {inserted} 条")


async def init_artworks(db):
    """初始化作品集合（不创建假数据）"""
    print("\n[*] 初始化作品集合...")
    
    # 检查集合是否存在，如果不存在则创建（MongoDB会自动创建）
    # 不创建任何假数据
    artwork_count = await db.artworks.count_documents({})
    print(f"   [+] 作品集合已就绪（当前有 {artwork_count} 个作品）")


async def init_orders(db):
    """初始化订单集合（不创建假数据）"""
    print("\n[*] 初始化订单集合...")
    
    # 检查集合是否存在，如果不存在则创建（MongoDB会自动创建）
    # 不创建任何假数据
    order_count = await db.orders.count_documents({})
    print(f"   [+] 订单集合已就绪（当前有 {order_count} 个订单）")


async def init_tickets(db):
    """初始化工单集合（不创建假数据）"""
    print("\n[*] 初始化工单集合...")
    
    # 检查集合是否存在，如果不存在则创建（MongoDB会自动创建）
    # 不创建任何假数据
    ticket_count = await db.tickets.count_documents({})
    print(f"   [+] 工单集合已就绪（当前有 {ticket_count} 个工单）")


async def update_user_likes_and_collections(db):
    """更新用户的点赞和收藏数据（在作品创建后调用）"""
    # 获取用户、作品和模板信息
    users = await db.users.find({"is_admin": False}).to_list(length=10)
    artworks = await db.artworks.find().to_list(length=10)
    templates = await db.templates.find().to_list(length=10)
    
    if not users:
        return
    
    # 为每个用户更新点赞和收藏数据（如果还没有设置）
    for i, user in enumerate(users):
        update_data = {}
        
        # 如果用户还没有 like_ids，设置一些示例点赞
        if "like_ids" not in user or not user.get("like_ids"):
            if artworks:
                # 根据用户索引分配不同的点赞作品
                like_count = min(i + 1, len(artworks))
                update_data["like_ids"] = [artworks[j]["id"] for j in range(like_count)]
        
        # 如果用户还没有 collection_ids，设置一些示例收藏
        if "collection_ids" not in user or not user.get("collection_ids"):
            if templates:
                # 根据用户索引分配不同的收藏模板
                collection_count = min(i + 1, len(templates))
                update_data["collection_ids"] = [templates[j]["id"] for j in range(collection_count)]
        
        if update_data:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": update_data}
            )


async def init_tags(db):
    """初始化标签集合 (幂等操作)"""
    print("\n[*] 初始化标签集合...")
    
    # 定义常用标签（按 order 排序）
    tags = [
        # 风格标签
        {"id": "tag_001", "label": "赛博朋克", "value": "cyberpunk", "order": 1},
        {"id": "tag_002", "label": "动漫", "value": "anime", "order": 2},
        {"id": "tag_003", "label": "油画", "value": "oil-painting", "order": 3},
        {"id": "tag_004", "label": "水彩", "value": "watercolor", "order": 4},
        {"id": "tag_005", "label": "写实", "value": "realistic", "order": 5},
        {"id": "tag_006", "label": "像素风", "value": "pixel-art", "order": 6},
        {"id": "tag_007", "label": "素描", "value": "sketch", "order": 7},
        {"id": "tag_008", "label": "抽象", "value": "abstract", "order": 8},
        
        # 主题标签
        {"id": "tag_009", "label": "风景", "value": "landscape", "order": 9},
        {"id": "tag_010", "label": "人物", "value": "portrait", "order": 10},
        {"id": "tag_011", "label": "动物", "value": "animal", "order": 11},
        {"id": "tag_012", "label": "建筑", "value": "architecture", "order": 12},
        {"id": "tag_013", "label": "科幻", "value": "sci-fi", "order": 13},
        {"id": "tag_014", "label": "奇幻", "value": "fantasy", "order": 14},
        {"id": "tag_015", "label": "自然", "value": "nature", "order": 15},
        {"id": "tag_016", "label": "城市", "value": "urban", "order": 16},
        
        # 氛围标签
        {"id": "tag_017", "label": "梦幻", "value": "dreamy", "order": 17},
        {"id": "tag_018", "label": "黑暗", "value": "dark", "order": 18},
        {"id": "tag_019", "label": "温馨", "value": "cozy", "order": 19},
        {"id": "tag_020", "label": "史诗", "value": "epic", "order": 20},
        
        # 质量标签
        {"id": "tag_021", "label": "高清", "value": "high-quality", "order": 21},
        {"id": "tag_022", "label": "4K", "value": "4k", "order": 22},
        {"id": "tag_023", "label": "细节丰富", "value": "detailed", "order": 23},
        {"id": "tag_024", "label": "杰作", "value": "masterpiece", "order": 24},
    ]
    
    # 使用 upsert 方式逐个更新或插入，确保幂等性
    now = datetime.utcnow()
    updated_count = 0
    for tag in tags:
        tag["updated_at"] = now
        # 如果是新插入，设置 created_at
        result = await db.tags.update_one(
            {"id": tag["id"]},
            {
                "$set": tag,
                "$setOnInsert": {"created_at": now}
            },
            upsert=True
        )
        updated_count += 1
    
    print(f"   [+] 标签集合初始化/同步完成，共处理 {updated_count} 个标签")


async def init_tasks(db):
    """初始化任务集合（不创建假数据）"""
    print("\n[*] 初始化任务集合...")
    
    # 检查集合是否存在，如果不存在则创建（MongoDB会自动创建）
    # 不创建任何假数据
    task_count = await db.tasks.count_documents({})
    print(f"   [+] 任务集合已就绪（当前有 {task_count} 个任务；索引由 ensure_database_indexes 创建）")


async def init_system_settings(db):
    """初始化系统设置集合"""
    print("\n[*] 初始化系统设置集合...")
    
    # 检查是否已有设置数据
    settings_count = await db.system_settings.count_documents({})
    if settings_count > 0:
        print(f"   [!] 系统设置集合已有 {settings_count} 条记录，跳过初始化")
        return
    default_settings = [
        {"key": "gemini_api_key", "value": settings.nano_banana_api_key},             # Google Gemini API 密钥
        {"key": "evolink_api_key", "value": settings.evolink_api_key},                # Evolink 中转站 API 密钥
        {"key": "referral_reward_amount", "value": 50},                              # 推荐新用户注册获得的豆子奖励
        {"key": "new_user_reward_amount", "value": 100},                             # 新用户注册获得的初始豆子奖励
        {"key": "daily_generation_limit", "value": 100},                             # 用户每日生图上限
        {"key": "daily_generation_limit_enabled", "value": True},                    # 是否开启每日生图上限
        {"key": "maintenance_mode", "value": False},                                 # 系统维护模式开关 (True 为停机维护)
        {"key": "announcement_text", "value": "欢迎使用 BoltPaint AI 生图系统！"}, # 系统公告内容
        {"key": "announcement_enabled", "value": True},                              # 是否启用公告展示
        {"key": "customer_service_wechat", "value": "BoltSupport"},                  # 客服微信号
        {"key": "customer_service_qr", "value": ""},                                 # 客服二维码图片 URL
        {"key": "registration_sms_code_required", "value": settings.sms_enabled},  # 注册是否强制短信验证码
    ]
    
    # 添加时间戳
    now = datetime.utcnow()
    for s in default_settings:
        s["created_at"] = now
        s["updated_at"] = now
        
    await db.system_settings.insert_many(default_settings)
    print(f"   [+] 已创建 {len(default_settings)} 条默认系统配置")


async def init_recharge_packages(db):
    """初始化支付宝直连支付使用的充值档位集合。"""
    print("\n[*] 初始化充值档位集合...")

    count = await db.recharge_packages.count_documents({})
    if count > 0:
        print(f"   [!] 充值档位已有 {count} 条，跳过默认数据")
        return

    now = datetime.utcnow()
    defaults = [
        {
            "id": "rp_starter",
            "amount_cny": 9.9,
            "beans_amount": 100,
            "label": "入门包",
            "sort_order": 10,
            "enabled": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "rp_standard",
            "amount_cny": 19.9,
            "beans_amount": 250,
            "label": "标准包",
            "sort_order": 20,
            "enabled": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "rp_premium",
            "amount_cny": 49.9,
            "beans_amount": 750,
            "label": "超值包",
            "sort_order": 30,
            "enabled": True,
            "created_at": now,
            "updated_at": now,
        },
    ]
    await db.recharge_packages.insert_many(defaults)
    print(f"   [+] 已创建 {len(defaults)} 个默认充值档位")


if __name__ == "__main__":
    import sys
    ok = asyncio.run(init_database())
    sys.exit(0 if ok else 1)
