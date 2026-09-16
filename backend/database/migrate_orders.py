"""
订单字段迁移脚本
将旧的 create_time 字段迁移为 created_at 和 updated_at
"""
import asyncio
from app.database import get_database
from datetime import datetime


async def migrate_orders():
    """迁移订单字段名"""
    db = get_database()
    
    print("[*] 开始迁移订单字段...")
    
    # 查找所有使用旧字段名的订单
    old_orders = await db.orders.find({"create_time": {"$exists": True}}).to_list(length=None)
    
    if not old_orders:
        print("   [✓] 没有需要迁移的订单")
        return
    
    print(f"   [*] 找到 {len(old_orders)} 个需要迁移的订单")
    
    # 更新每个订单
    for order in old_orders:
        update_data = {
            "$set": {
                "created_at": order["create_time"],
                "updated_at": order.get("create_time", datetime.utcnow())
            },
            "$unset": {
                "create_time": ""
            }
        }
        
        await db.orders.update_one(
            {"_id": order["_id"]},
            update_data
        )
    
    print(f"   [✓] 成功迁移 {len(old_orders)} 个订单")


async def main():
    try:
        await migrate_orders()
        print("\n[✓] 迁移完成！")
    except Exception as e:
        print(f"\n[✗] 迁移失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
