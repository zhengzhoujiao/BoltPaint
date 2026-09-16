import asyncio
import os
import sys
from datetime import datetime

# 将父目录添加到路径，以便导入 app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from pymongo import ReturnDocument

async def migrate_user_numbers():
    print("🚀 开始迁移用户会员编号...")
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.mongodb_db_name]

    # 1. 查找所有没有编号的用户，按创建时间排序
    cursor = db.users.find({"member_number": {"$exists": False}}).sort("created_at", 1)
    users_to_fix = await cursor.to_list(length=None)
    
    if not users_to_fix:
        # 再查一遍 member_number 为 None 的情况
        cursor = db.users.find({"member_number": None}).sort("created_at", 1)
        users_to_fix = await cursor.to_list(length=None)

    if not users_to_fix:
        print("✅ 没有发现需要修复编号的用户。")
        return

    print(f"📦 发现 {len(users_to_fix)} 个用户需要分配编号。")

    # 2. 获取当前计数器起始值
    counter = await db.counters.find_one({"id": "member_number"})
    current_seq = counter["seq"] if counter else 0
    print(f"🔢 当前计数器起始值: {current_seq}")

    # 3. 依次更新用户
    count = 0
    for user in users_to_fix:
        current_seq += 1
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"member_number": current_seq, "updated_at": datetime.utcnow()}}
        )
        count += 1
        if count % 10 == 0:
            print(f"已处理 {count}/{len(users_to_fix)} 个用户...")

    # 4. 更新计数器到最新值
    await db.counters.find_one_and_update(
        {"id": "member_number"},
        {"$set": {"seq": current_seq}},
        upsert=True
    )

    print(f"🎉 迁移完成！共处理 {count} 个用户。当前最大编号: {current_seq}")
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate_user_numbers())
