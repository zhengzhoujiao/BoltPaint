from fastapi import APIRouter, HTTPException, Depends
from app.dependencies import get_admin_user_id
from app.database import get_database
from datetime import datetime, timedelta
from typing import Dict, Any, List

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats", response_model=Dict[str, Any])
async def get_dashboard_stats(admin_id: str = Depends(get_admin_user_id)):
    """获取仪表盘统计数据"""
    db = get_database()
    
    # 1. 今日新增用户
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_new_users = await db.users.count_documents({"created_at": {"$gte": today_start}})
    
    # 2. 今日总收入 (从 paid 状态的 orders 统计)
    pipeline = [
        {
            "$match": {
                "status": "paid",
                "created_at": {"$gte": today_start}
            }
        },
        {
            "$group": {
                "_id": None,
                "total_amount": {"$sum": "$amount_cny"}
            }
        }
    ]
    revenue_result = await db.orders.aggregate(pipeline).to_list(length=1)
    today_revenue = revenue_result[0]["total_amount"] if revenue_result else 0
    
    # 3. 任务成功率 (总成功 / 总任务)
    total_tasks = await db.tasks.count_documents({})
    success_tasks = await db.tasks.count_documents({"status": "completed"})
    task_success_rate = round((success_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0
    
    # 4. 待处理工单
    pending_tickets = await db.tickets.count_documents({"status": "pending"})
    
    return {
        "todayNewUsers": today_new_users,
        "todayRevenue": today_revenue,
        "taskSuccessRate": task_success_rate,
        "pendingTickets": pending_tickets
    }

@router.get("/chart/user-growth", response_model=List[Dict[str, Any]])
async def get_user_growth_chart(admin_id: str = Depends(get_admin_user_id)):
    """近7日用户增长趋势"""
    db = get_database()
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=6)
    
    pipeline = [
        {
            "$match": {
                "created_at": {"$gte": start_date}
            }
        },
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}
                },
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id": 1}}
    ]
    
    results = await db.users.aggregate(pipeline).to_list(length=7)
    
    # 填充缺失日期
    chart_data = []
    data_map = {r["_id"]: r["count"] for r in results}
    
    for i in range(7):
        date = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        chart_data.append({
            "date": date,
            "count": data_map.get(date, 0)
        })
        
    return chart_data

@router.get("/chart/order-flow", response_model=List[Dict[str, Any]])
async def get_order_flow_chart(admin_id: str = Depends(get_admin_user_id)):
    """近7日订单流水"""
    db = get_database()
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=6)
    
    pipeline = [
        {
            "$match": {
                "status": "paid",
                "created_at": {"$gte": start_date}
            }
        },
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}
                },
                "amount": {"$sum": "$amount_cny"}
            }
        },
        {"$sort": {"_id": 1}}
    ]
    
    results = await db.orders.aggregate(pipeline).to_list(length=7)
    
    chart_data = []
    data_map = {r["_id"]: r["amount"] for r in results}
    
    for i in range(7):
        date = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        chart_data.append({
            "date": date,
            "amount": data_map.get(date, 0)
        })
        
    return chart_data
