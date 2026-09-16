from fastapi import APIRouter, Query, HTTPException, Depends
from app.dependencies import get_current_user_id, get_optional_user_id, get_admin_user_id
from app.models import Ticket, TicketCreate, TicketUpdate, TicketReply, TicketStatus, Message
from app.database import get_database
from datetime import datetime
from typing import List, Optional
import uuid

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.post("", response_model=Ticket)
async def create_ticket(ticket: TicketCreate, user_id: str = Depends(get_current_user_id)):
    """创建工单"""
    db = get_database()
    
    # 强制使用 token 中的 user_id
    ticket_id = f"ticket_{int(datetime.utcnow().timestamp() * 1000)}_{uuid.uuid4().hex[:8]}"
    
    # 创建初始消息
    initial_message = Message(
        content=ticket.content,
        timestamp=datetime.utcnow()
    )
    
    ticket_dict = {
        "id": ticket_id,
        "user_id": user_id,
        "support_id": None,
        "theme": ticket.theme,  # 工单主题
        "content": [initial_message.dict()],  # 用户消息列表
        "reply_content": [],  # 客服回复列表（初始为空）
        "status": TicketStatus.PENDING,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    await db.tickets.insert_one(ticket_dict)
    ticket_dict["_id"] = str(ticket_dict.get("_id"))
    
    return Ticket(**ticket_dict)


@router.get("", response_model=List[Ticket])
async def get_tickets(
    status: Optional[TicketStatus] = Query(None, description="工单状态筛选"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user_id: Optional[str] = Depends(get_optional_user_id)
):
    """获取工单列表"""
    db = get_database()
    
    # 权限校验：非管理员只能查看自己的工单
    is_admin = False
    if user_id:
        user_record = await db.users.find_one({"id": user_id})
        is_admin = user_record.get("is_admin", False) if user_record else False
    
    query = {}
    if not is_admin:
        if not user_id:
            raise HTTPException(status_code=401, detail="请登录以查看工单")
        query["user_id"] = user_id
    
    skip = (page - 1) * page_size
    
    if status:
        query["status"] = status
    
    # 获取工单列表，按更新时间倒序
    cursor = db.tickets.find(query).sort("updated_at", -1).skip(skip).limit(page_size)
    tickets = await cursor.to_list(length=page_size)
    
    ticket_list = []
    for ticket in tickets:
        ticket["_id"] = str(ticket["_id"])
        ticket_list.append(Ticket(**ticket))
    
    return ticket_list


@router.get("/{ticket_id}", response_model=Ticket)
async def get_ticket(
    ticket_id: str,
    user_id: Optional[str] = Depends(get_optional_user_id)
):
    """获取工单详情"""
    db = get_database()
    
    ticket = await db.tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    # 鉴权：只有所属用户或管理员可以查看
    is_admin = False
    if user_id:
        user_record = await db.users.find_one({"id": user_id})
        is_admin = user_record.get("is_admin", False) if user_record else False
        
    if not is_admin and ticket.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="无权查看此工单")
    
    # 仅当用户端（token 匹配工单所属用户）查看时，才将未读改为处理中
    if ticket.get("status") == TicketStatus.UNREAD and user_id and ticket.get("user_id") == user_id:
        await db.tickets.update_one(
            {"id": ticket_id},
            {"$set": {"status": TicketStatus.IN_PROGRESS, "updated_at": datetime.utcnow()}}
        )
        ticket["status"] = TicketStatus.IN_PROGRESS

    ticket["_id"] = str(ticket["_id"])
    return Ticket(**ticket)


@router.post("/{ticket_id}/reply", response_model=Ticket)
async def reply_ticket(ticket_id: str, reply: TicketReply, admin_id: str = Depends(get_admin_user_id)):
    """客服回复工单"""
    db = get_database()
    
    # 检查工单是否存在
    ticket = await db.tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    # 创建回复消息
    reply_message = Message(
        content=reply.reply_content,
        timestamp=datetime.utcnow()
    )
    
    # 更新工单：添加回复到reply_content数组
    update_data = {
        "$push": {"reply_content": reply_message.dict()},
        "$set": {
            "support_id": reply.support_id,  # 记录客服ID
            "status": TicketStatus.UNREAD,  # 更新状态为未读（待用户查看）
            "updated_at": datetime.utcnow()
        }
    }
    
    await db.tickets.update_one({"id": ticket_id}, update_data)
    
    # 获取更新后的工单
    updated_ticket = await db.tickets.find_one({"id": ticket_id})
    updated_ticket["_id"] = str(updated_ticket["_id"])
    
    return Ticket(**updated_ticket)


@router.post("/{ticket_id}/message", response_model=Ticket)
async def add_user_message(
    ticket_id: str,
    content: str = Query(..., description="消息内容"),
    user_id: str = Depends(get_current_user_id)
):
    """用户追加消息"""
    db = get_database()
    
    # 检查工单是否存在
    ticket = await db.tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    # 验证用户权限
    if ticket.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="无权操作此工单")
    
    # 创建用户消息
    user_message = Message(
        content=content,
        timestamp=datetime.utcnow()
    )
    
    # 更新工单：添加消息到content数组
    update_data = {
        "$push": {"content": user_message.dict()},
        "$set": {
            "status": TicketStatus.PENDING,  # 用户追加消息后开启/回归待处理状态
            "updated_at": datetime.utcnow()
        }
    }
    
    await db.tickets.update_one({"id": ticket_id}, update_data)
    
    # 获取更新后的工单
    updated_ticket = await db.tickets.find_one({"id": ticket_id})
    updated_ticket["_id"] = str(updated_ticket["_id"])
    
    return Ticket(**updated_ticket)


@router.put("/{ticket_id}/status", response_model=Ticket)
async def update_ticket_status(
    ticket_id: str,
    status: TicketStatus = Query(..., description="工单状态"),
    admin_id: str = Depends(get_admin_user_id)
):
    """更新工单状态（管理员/客服功能）"""
    db = get_database()
    
    # 检查工单是否存在
    ticket = await db.tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    # 构建更新数据
    update_data = {
        "status": status,
        "updated_at": datetime.utcnow(),
        "support_id": admin_id
    }
    
    # 更新工单状态
    await db.tickets.update_one(
        {"id": ticket_id},
        {"$set": update_data}
    )
    
    # 获取更新后的工单
    updated_ticket = await db.tickets.find_one({"id": ticket_id})
    updated_ticket["_id"] = str(updated_ticket["_id"])
    
    return Ticket(**updated_ticket)


@router.delete("/{ticket_id}", response_model=dict)
async def delete_ticket(ticket_id: str, admin_id: str = Depends(get_admin_user_id)):
    """删除工单（管理员功能）"""
    db = get_database()
    
    # 检查工单是否存在
    ticket = await db.tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    # 删除工单
    await db.tickets.delete_one({"id": ticket_id})
    
    return {"success": True, "message": "工单已删除"}
