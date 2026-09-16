"""
数据库迁移脚本：更新标签和模板字段
- 标签表：删除 use_count、is_featured 字段，添加 order 字段
- 模板表：添加 use_count、is_featured 字段
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings


async def migrate_tags_and_templates():
    """迁移标签和模板字段"""
    try:
        print(f"[*] 正在连接 MongoDB: {settings.mongodb_url}")
        client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=5000)
        
        # 测试连接
        await client.admin.command('ping')
        print("[+] MongoDB 连接成功")
        
        # 获取数据库
        db = client[settings.mongodb_db_name]
        print(f"[*] 使用数据库: {settings.mongodb_db_name}")
        
        # 1. 迁移标签表
        print("\n[*] 开始迁移标签表...")
        tags_count = await db.tags.count_documents({})
        print(f"   [*] 找到 {tags_count} 个标签")
        
        if tags_count > 0:
            # 删除 use_count 和 is_featured 字段，添加 order 字段
            # 为每个标签设置一个默认的 order 值（基于当前位置）
            tags = await db.tags.find({}).to_list(length=None)
            for idx, tag in enumerate(tags, start=1):
                update_data = {
                    "$set": {"order": idx},
                    "$unset": {"use_count": "", "is_featured": ""}
                }
                await db.tags.update_one({"_id": tag["_id"]}, update_data)
            
            print(f"   [+] 已更新 {len(tags)} 个标签")
            print("   [+] 删除字段: use_count, is_featured")
            print("   [+] 添加字段: order")
        else:
            print("   [!] 标签表为空，跳过迁移")
        
        # 2. 迁移模板表
        print("\n[*] 开始迁移模板表...")
        templates_count = await db.templates.count_documents({})
        print(f"   [*] 找到 {templates_count} 个模板")
        
        if templates_count > 0:
            # 添加 use_count 和 is_featured 字段
            # 默认 use_count = 0, is_featured = False
            result = await db.templates.update_many(
                {},
                {
                    "$set": {
                        "use_count": 0,
                        "is_featured": False
                    }
                }
            )
            print(f"   [+] 已更新 {result.modified_count} 个模板")
            print("   [+] 添加字段: use_count (默认0), is_featured (默认False)")
        else:
            print("   [!] 模板表为空，跳过迁移")
        
        print("\n[+] 数据库迁移完成！")
        
        # 验证迁移结果
        print("\n[*] 验证迁移结果:")
        
        # 检查标签
        sample_tag = await db.tags.find_one({})
        if sample_tag:
            print(f"   [*] 标签示例字段: {list(sample_tag.keys())}")
            has_order = "order" in sample_tag
            has_use_count = "use_count" in sample_tag
            has_is_featured = "is_featured" in sample_tag
            print(f"   [*] order 字段存在: {has_order}")
            print(f"   [*] use_count 字段已删除: {not has_use_count}")
            print(f"   [*] is_featured 字段已删除: {not has_is_featured}")
        
        # 检查模板
        sample_template = await db.templates.find_one({})
        if sample_template:
            print(f"   [*] 模板示例字段: {list(sample_template.keys())}")
            has_use_count = "use_count" in sample_template
            has_is_featured = "is_featured" in sample_template
            print(f"   [*] use_count 字段存在: {has_use_count}")
            print(f"   [*] is_featured 字段存在: {has_is_featured}")
        
        client.close()
        
    except Exception as e:
        print(f"[-] 数据库迁移失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(migrate_tags_and_templates())
