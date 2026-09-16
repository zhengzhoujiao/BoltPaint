"""
检查 MongoDB 连接和数据库状态
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings


async def check_database():
    """检查数据库连接和集合"""
    try:
        print(f"🔍 正在连接 MongoDB: {settings.mongodb_url}")
        client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=5000)
        
        # 测试连接
        await client.admin.command('ping')
        print("✅ MongoDB 连接成功")
        
        # 获取数据库
        db = client[settings.mongodb_db_name]
        print(f"📦 使用数据库: {settings.mongodb_db_name}")
        
        # 检查集合
        collections = await db.list_collection_names()
        print(f"📋 现有集合: {collections}")
        
        # 检查 users 集合
        if 'users' in collections:
            user_count = await db.users.count_documents({})
            print(f"👥 users 集合中有 {user_count} 个用户")
            
            # 检查管理员账号
            admin = await db.users.find_one({"username": settings.initial_admin_username})
            if admin:
                print("✅ 管理员账号存在")
                print(f"   - ID: {admin.get('id')}")
                print(f"   - 用户名: {admin.get('username')}")
                print(f"   - 是否管理员: {admin.get('is_admin')}")
            else:
                print("⚠️ 管理员账号不存在，请配置初始化账户后运行 database/init_db.py")
        else:
            print("⚠️ users 集合不存在，请配置初始化账户后运行 database/init_db.py")
        
        # 检查 templates 集合
        if 'templates' in collections:
            template_count = await db.templates.count_documents({})
            print(f"🎨 templates 集合中有 {template_count} 个模板")
        else:
            print("⚠️ templates 集合不存在")
        
        client.close()
        print("\n✅ 数据库检查完成")
        
    except Exception as e:
        print(f"❌ 数据库检查失败: {e}")
        print("\n💡 请确保:")
        print("   1. MongoDB 服务正在运行")
        print("   2. MongoDB 连接地址正确")
        print("   3. 有足够的权限访问数据库")


if __name__ == "__main__":
    asyncio.run(check_database())
