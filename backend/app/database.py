from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
import asyncio


class Database:
    client: AsyncIOMotorClient = None


db = Database()


async def connect_to_mongo():
    """连接到 MongoDB"""
    try:
        db.client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=5000)
        # 测试连接
        await db.client.admin.command('ping')
        print("[OK] 已连接到 MongoDB")
    except Exception as e:
        print(f"[ERROR] MongoDB 连接失败: {e}")
        print("[WARN] 服务将继续运行，但数据库操作将失败")
        print("[TIP] 请确保 MongoDB 正在运行，或稍后重启服务")


async def close_mongo_connection():
    """关闭 MongoDB 连接"""
    if db.client:
        db.client.close()
        print("[INFO] 已断开 MongoDB 连接")


def get_database():
    """获取数据库实例"""
    if db.client is None:
        raise RuntimeError("MongoDB 未连接，请确保 MongoDB 正在运行")
    database = db.client[settings.mongodb_db_name]
    # 确保集合存在（MongoDB 会在首次插入时自动创建，但这里显式确保）
    return database

