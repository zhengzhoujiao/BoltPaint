from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
import jwt
from datetime import datetime, timedelta
from app.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/user/login", auto_error=False)

if not settings.password_encryption_key:
    raise RuntimeError(
        "PASSWORD_ENCRYPTION_KEY 未配置。请在 backend/.env.local 或运行环境中设置高强度随机值。"
    )

SECRET_KEY = settings.password_encryption_key
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_optional_user_id(request: Request, token: str | None = Depends(oauth2_scheme)) -> str | None:
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip() or None

    if not token:
        # 不再从 URL query 读取 token，避免进入访问日志、Referer、浏览器历史
        return None
        
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        return user_id
    except jwt.PyJWTError:
        return None
    except Exception:
        return None

async def get_current_user_id(request: Request, token: str | None = Depends(oauth2_scheme)) -> str:
    user_id = await get_optional_user_id(request, token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="您未登录或登录已过期",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id

async def get_admin_user_id(request: Request, token: str | None = Depends(oauth2_scheme)) -> str:
    user_id = await get_current_user_id(request, token)
    from app.database import get_database
    db = get_database()
    user = await db.users.find_one({"id": user_id})
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="权限不足，需要管理员权限")
    return user_id
