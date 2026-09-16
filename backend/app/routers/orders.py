from fastapi import APIRouter, Query, HTTPException, Request, Depends
from fastapi.responses import PlainTextResponse, RedirectResponse
from pydantic import BaseModel
from app.dependencies import get_current_user_id, get_admin_user_id
from app.models import Order, OrderCreate, OrderStatus, PaymentPlatform
from app.database import get_database
from app.config import settings
from app.services.alipay_service import alipay_service
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Literal, Optional
from urllib.parse import quote
import logging
import uuid

from pymongo import ReturnDocument

router = APIRouter(prefix="/orders", tags=["orders"])
logger = logging.getLogger(__name__)


def generate_order_id(prefix: str = "order") -> str:
    """业务订单号：毫秒时间戳 + 随机后缀，降低并发碰撞概率。"""
    return f"{prefix}_{int(datetime.utcnow().timestamp() * 1000)}_{uuid.uuid4().hex[:8]}"

def _amount_matches(expected: float, actual: object) -> bool:
    try:
        return Decimal(str(expected)).quantize(Decimal("0.01")) == Decimal(
            str(actual)
        ).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return False


async def _mark_alipay_order_paid(db, order_id: str, transaction_id: str) -> dict:
    """幂等更新订单并发豆；重复通知不会重复增加余额。"""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise ValueError("order_not_found")

    if transaction_id:
        duplicate = await db.orders.find_one(
            {"transaction_id": transaction_id, "id": {"$ne": order_id}}
        )
        if duplicate:
            raise ValueError("transaction_id_already_used")

    status = order.get("status")
    if status == OrderStatus.PENDING:
        now = datetime.utcnow()
        updated = await db.orders.find_one_and_update(
            {"id": order_id, "status": OrderStatus.PENDING},
            {
                "$set": {
                    "status": OrderStatus.PAID,
                    "transaction_id": transaction_id,
                    "paid_at": now,
                    "updated_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        order = updated or await db.orders.find_one({"id": order_id})
    elif status != OrderStatus.PAID:
        raise ValueError("order_status_invalid")

    if not order or order.get("status") != OrderStatus.PAID:
        raise ValueError("order_status_changed")

    recorded_trade_no = order.get("transaction_id")
    if recorded_trade_no and transaction_id and recorded_trade_no != transaction_id:
        raise ValueError("transaction_id_mismatch")

    now = datetime.utcnow()
    credit_result = await db.users.update_one(
        {
            "id": order["user_id"],
            "credited_order_ids": {"$ne": order_id},
        },
        {
            "$inc": {"balance_beans": int(order["beans_amount"])},
            "$addToSet": {"credited_order_ids": order_id},
            "$set": {"updated_at": now},
        },
    )
    if credit_result.matched_count == 0:
        user = await db.users.find_one({"id": order["user_id"]})
        if not user:
            raise ValueError("user_not_found")

    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"credited_at": now, "updated_at": now}},
    )
    return order


@router.post("", response_model=Order)
async def create_order(order: OrderCreate, user_id: str = Depends(get_current_user_id)):
    """创建充值订单"""
    db = get_database()
    
    # 强制使用 token 中的 user_id
    order_id = generate_order_id("order")
    
    order_dict = {
        "id": order_id,
        "user_id": user_id,
        "amount_cny": order.amount_cny,
        "beans_amount": order.beans_amount,
        "status": OrderStatus.PENDING,
        "platform": order.platform,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    await db.orders.insert_one(order_dict)
    order_dict["_id"] = str(order_dict.get("_id"))
    
    return Order(**order_dict)


class AlipayPaymentRequest(BaseModel):
    package_id: str
    pay_type: Literal["h5", "page"] = "page"


class AlipayPaymentResponse(BaseModel):
    payment_url: str
    order_id: str


@router.post("/alipay/pay", response_model=AlipayPaymentResponse)
async def create_alipay_payment(
    req: AlipayPaymentRequest,
    user_id: str = Depends(get_current_user_id),
):
    """在 BoltPaint 创建订单并直接生成支付宝收银台地址。"""
    if not alipay_service.is_available():
        raise HTTPException(503, "支付宝配置不完整，支付服务暂不可用")
    if not all(
        (
            settings.alipay_notify_url,
            settings.alipay_return_url,
            settings.payment_result_url,
        )
    ):
        raise HTTPException(503, "支付宝回调地址未配置，支付服务暂不可用")

    db = get_database()
    package_id = req.package_id.strip()
    package = await db.recharge_packages.find_one({"id": package_id})
    if not package or not package.get("enabled", True):
        raise HTTPException(400, "充值档位不存在或已下架")

    amount_cny = float(package["amount_cny"])
    beans_amount = int(package["beans_amount"])
    if amount_cny <= 0 or beans_amount <= 0:
        raise HTTPException(400, "档位配置无效")

    now = datetime.utcnow()
    order_id = generate_order_id("BP")
    label = (package.get("label") or "").strip()
    subject = (
        f"{label} · {beans_amount} 豆子"
        if label
        else f"BoltPaint 充值 {beans_amount} 豆子"
    )
    order = {
        "id": order_id,
        "user_id": user_id,
        "amount_cny": amount_cny,
        "beans_amount": beans_amount,
        "package_id": package_id,
        "status": OrderStatus.PENDING,
        "platform": PaymentPlatform.ALIPAY,
        "created_at": now,
        "updated_at": now,
    }
    await db.orders.insert_one(order)

    payment_url = alipay_service.create_payment(
        order_id=order_id,
        subject=subject,
        total_amount=amount_cny,
        pay_type=req.pay_type,
    )
    if not payment_url:
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"status": OrderStatus.FAILED, "updated_at": datetime.utcnow()}},
        )
        raise HTTPException(502, "创建支付宝订单失败，请稍后重试")

    return AlipayPaymentResponse(payment_url=payment_url, order_id=order_id)


@router.post("/alipay/notify", response_class=PlainTextResponse)
async def alipay_notify(request: Request):
    """支付宝异步通知：验签、核对订单金额并幂等入账。"""
    data = dict(await request.form())
    order_id = data.get("out_trade_no", "")
    trade_no = data.get("trade_no", "")
    logger.info(
        "Received Alipay notification: order=%s status=%s",
        order_id,
        data.get("trade_status"),
    )

    if not alipay_service.verify(data):
        logger.warning("Rejected Alipay notification with invalid signature")
        return PlainTextResponse("fail")
    if data.get("app_id") != settings.alipay_app_id:
        logger.warning("Rejected Alipay notification with mismatched app_id")
        return PlainTextResponse("fail")
    if data.get("trade_status") not in ("TRADE_SUCCESS", "TRADE_FINISHED"):
        return PlainTextResponse("success")
    if not order_id or not trade_no:
        return PlainTextResponse("fail")

    db = get_database()
    order = await db.orders.find_one({"id": order_id})
    if not order or not _amount_matches(order["amount_cny"], data.get("total_amount")):
        logger.warning("Rejected Alipay notification with invalid order or amount: %s", order_id)
        return PlainTextResponse("fail")

    try:
        await _mark_alipay_order_paid(db, order_id, trade_no)
    except ValueError as exc:
        logger.error("Failed to credit Alipay order %s: %s", order_id, exc)
        return PlainTextResponse("fail")

    return PlainTextResponse("success")


@router.get("/alipay/return")
async def alipay_return(request: Request):
    """支付宝同步回跳入口；业务到账仍以异步通知或主动查单结果为准。"""
    data = dict(request.query_params)
    order_id = data.get("out_trade_no", "")
    signature_valid = alipay_service.verify(data)
    result_url = settings.payment_result_url.strip()
    if not result_url:
        raise HTTPException(503, "未配置 PAYMENT_RESULT_URL")

    separator = "&" if "?" in result_url else "?"
    target = f"{result_url}{separator}order_id={quote(order_id)}"
    if not signature_valid:
        target += "&return_signature=invalid"
    return RedirectResponse(target)


@router.get("/{order_id}/alipay/query")
async def query_alipay_payment(
    order_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """用户主动查单，作为支付宝异步通知延迟或丢失时的到账兜底。"""
    db = get_database()
    order = await db.orders.find_one({"id": order_id, "user_id": user_id})
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.get("status") == OrderStatus.PAID:
        return {"order_id": order_id, "status": OrderStatus.PAID}
    if not alipay_service.is_available():
        raise HTTPException(503, "支付宝服务暂不可用")

    result = alipay_service.query_payment(order_id)
    if not result:
        return {"order_id": order_id, "status": order.get("status")}
    if result.get("out_trade_no") != order_id:
        raise HTTPException(502, "支付宝查单结果与订单不匹配")
    if not _amount_matches(order["amount_cny"], result.get("total_amount")):
        raise HTTPException(502, "支付宝查单金额与订单不匹配")

    if result.get("trade_status") in ("TRADE_SUCCESS", "TRADE_FINISHED"):
        trade_no = result.get("trade_no", "")
        if not trade_no:
            raise HTTPException(502, "支付宝查单结果缺少交易号")
        try:
            await _mark_alipay_order_paid(db, order_id, trade_no)
        except ValueError as exc:
            logger.error("Failed to credit queried Alipay order %s: %s", order_id, exc)
            raise HTTPException(409, "订单入账失败，请联系客服") from exc
        return {"order_id": order_id, "status": OrderStatus.PAID}

    return {"order_id": order_id, "status": order.get("status")}


@router.get("", response_model=List[Order])
async def get_orders(
    status: Optional[OrderStatus] = Query(None, description="订单状态筛选"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    user_id: str = Depends(get_current_user_id)
):
    """获取订单列表"""
    db = get_database()
    
    skip = (page - 1) * page_size
    
    # 构建查询条件
    query = {"user_id": user_id}
    if status:
        query["status"] = status
    
    # 获取订单列表，按创建时间倒序
    cursor = db.orders.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    orders = await cursor.to_list(length=page_size)
    
    order_list = []
    for order in orders:
        order["_id"] = str(order["_id"])
        
        # 兼容旧字段名：create_time -> created_at
        if "create_time" in order and "created_at" not in order:
            order["created_at"] = order.pop("create_time")
        
        # 确保 updated_at 存在
        if "updated_at" not in order:
            order["updated_at"] = order.get("created_at")
            
        order_list.append(Order(**order))
    
    return order_list


@router.get("/{order_id}", response_model=Order)
async def get_order(order_id: str, current_user_id: str = Depends(get_current_user_id)):
    """获取订单详情"""
    db = get_database()
    
    # 权限检查
    user_record = await db.users.find_one({"id": current_user_id})
    is_admin = user_record.get("is_admin", False) if user_record else False
    
    # 构建查询：管理员看所有，用户看自己
    query = {"id": order_id}
    if not is_admin:
        query["user_id"] = current_user_id
        
    order = await db.orders.find_one(query)
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在或无权查看")
    
    order["_id"] = str(order["_id"])
    
    # 兼容旧字段名：create_time -> created_at
    if "create_time" in order and "created_at" not in order:
        order["created_at"] = order.pop("create_time")
    
    # 确保 updated_at 存在
    if "updated_at" not in order:
        order["updated_at"] = order.get("created_at")
    
    return Order(**order)


@router.post("/{order_id}/pay", response_model=dict)
async def pay_order(order_id: str, admin_id: str = Depends(get_admin_user_id)):
    """模拟支付订单（仅管理员可用，用于测试）"""
    db = get_database()
    
    # 检查订单是否存在
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    
    now = datetime.utcnow()
    updated = await db.orders.find_one_and_update(
        {"id": order_id, "status": OrderStatus.PENDING},
        {"$set": {"status": OrderStatus.PAID, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        if order.get("status") == OrderStatus.PAID:
            raise HTTPException(status_code=400, detail="订单已支付")
        raise HTTPException(status_code=400, detail="订单状态不正确")

    await db.users.update_one(
        {"id": order["user_id"]},
        {
            "$inc": {"balance_beans": order["beans_amount"]},
            "$set": {"updated_at": now},
        },
    )

    return {
        "success": True,
        "message": "支付成功",
        "order_id": order_id,
        "beans_added": order["beans_amount"]
    }


@router.post("/{order_id}/callback", response_model=dict)
async def payment_callback(
    order_id: str,
    payment_status: str = Query(..., description="支付状态（success/failed）"),
    transaction_id: Optional[str] = Query(None, description="第三方交易ID"),
    admin_id: str = Depends(get_admin_user_id)
):
    """支付回调接口（仅管理员可用，预留/测试用；线上由支付宝异步通知处理）"""
    db = get_database()
    
    # 检查订单是否存在
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    
    now = datetime.utcnow()
    if order["status"] != OrderStatus.PENDING:
        return {"success": False, "message": "订单已处理"}
    
    if payment_status == "success":
        updated = await db.orders.find_one_and_update(
            {"id": order_id, "status": OrderStatus.PENDING},
            {
                "$set": {
                    "status": OrderStatus.PAID,
                    "transaction_id": transaction_id,
                    "updated_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            return {"success": False, "message": "订单已处理"}

        await db.users.update_one(
            {"id": order["user_id"]},
            {
                "$inc": {"balance_beans": order["beans_amount"]},
                "$set": {"updated_at": now},
            },
        )

        return {
            "success": True,
            "message": "支付成功，余额已更新"
        }
    else:
        # 更新订单状态为失败
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {
                "status": OrderStatus.FAILED,
                "updated_at": datetime.utcnow()
            }}
        )
        
        return {
            "success": False,
            "message": "支付失败"
        }


@router.put("/{order_id}/refund", response_model=dict)
async def refund_order(order_id: str, admin_id: str = Depends(get_admin_user_id)):
    """退款订单（管理员功能）"""
    db = get_database()
    
    # 检查订单是否存在
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    
    # 检查订单状态
    if order["status"] != OrderStatus.PAID:
        raise HTTPException(status_code=400, detail="只能退款已支付的订单")
    
    # 更新订单状态为已退款
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": OrderStatus.REFUNDED,
            "updated_at": datetime.utcnow()
        }}
    )
    
    # 扣除用户余额
    await db.users.update_one(
        {"id": order["user_id"]},
        {
            "$inc": {"balance_beans": -order["beans_amount"]},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    return {
        "success": True,
        "message": "退款成功",
        "beans_refunded": order["beans_amount"]
    }
