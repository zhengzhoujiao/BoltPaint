"""
数据库迁移脚本：为模板表添加 description 字段
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings


async def migrate_add_description():
    """为模板表添加 description 字段"""
    try:
        print(f"[*] 正在连接 MongoDB: {settings.mongodb_url}")
        client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=5000)
        
        # 测试连接
        await client.admin.command('ping')
        print("[+] MongoDB 连接成功")
        
        # 获取数据库
        db = client[settings.mongodb_db_name]
        print(f"[*] 使用数据库: {settings.mongodb_db_name}")
        
        # 迁移模板表
        print("\n[*] 开始迁移模板表...")
        templates_count = await db.templates.count_documents({})
        print(f"   [*] 找到 {templates_count} 个模板")
        
        if templates_count > 0:
            # 为没有 description 字段的模板添加默认值
            result = await db.templates.update_many(
                {"description": {"$exists": False}},
                {"$set": {"description": ""}}
            )
            print(f"   [+] 已更新 {result.modified_count} 个模板，添加 description 字段")
        else:
            print("   [!] 模板表为空，跳过迁移")
        
        print("\n[+] 数据库迁移完成！")
        
        # 验证迁移结果
        print("\n[*] 验证迁移结果:")
        sample_template = await db.templates.find_one({})
        if sample_template:
            print(f"   [*] 模板示例字段: {list(sample_template.keys())}")
            has_description = "description" in sample_template
            print(f"   [*] description 字段存在: {has_description}")
        
        client.close()
        
    except Exception as e:
        print(f"[-] 数据库迁移失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(migrate_add_description())
