"""
Migration script: 为定价策略添加 model_id 字段
模版关联的定价策略决定生图使用的 Gemini 模型
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys
sys.path.append('.')
from app.config import settings

# 默认映射：BananaPro -> Pro 模型，Banana -> Flash 模型
DEFAULT_MODEL_MAP = {
    "BananaPro": "gemini-3-pro-image-preview",
    "Banana": "gemini-2.5-flash-image",
}


async def migrate_pricing_model_id():
    """为缺少 model_id 的定价策略添加默认值"""
    try:
        print(f"[*] Connecting to MongoDB: {settings.mongodb_url}")
        client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=5000)
        await client.admin.command('ping')
        print("[+] MongoDB connected successfully")

        db = client[settings.mongodb_db_name]
        coll = db.pricing_strategies

        missing = await coll.count_documents({"model_id": {"$exists": False}})
        if missing == 0:
            print("[OK] All pricing strategies already have model_id")
            client.close()
            return

        print(f"[*] Found {missing} pricing strategies without model_id")

        cursor = coll.find({"model_id": {"$exists": False}})
        updated = 0
        async for doc in cursor:
            strategy_id = doc.get("id")
            model_id = DEFAULT_MODEL_MAP.get(strategy_id, "gemini-3-pro-image-preview")
            await coll.update_one(
                {"id": strategy_id},
                {"$set": {"model_id": model_id}}
            )
            print(f"   [+] {strategy_id} -> model_id={model_id}")
            updated += 1

        print(f"\n[+] Migration completed: {updated} strategies updated")
        client.close()

    except Exception as e:
        print(f"[-] Migration failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    print("=" * 60)
    print("Pricing Model ID Migration")
    print("=" * 60)
    asyncio.run(migrate_pricing_model_id())
