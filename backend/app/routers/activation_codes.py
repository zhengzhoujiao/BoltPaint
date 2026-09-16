"""激活码管理：后台生成、列表、删除；注册时校验并消耗"""
from fastapi import APIRouter, HTTPException, Query, Depends
from app.dependencies import get_admin_user_id
from app.database import get_database
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import secrets
import string

router = APIRouter(prefix="/activation-codes", tags=["activation-codes"])


def generate_code(length: int = 8) -> str:
    """生成指定长度的激活码（大写字母+数字）"""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class CreateActivationCodesRequest(BaseModel):
    """批量生成：传 count；单个自定义：传 code"""
    count: Optional[int] = None  # 生成数量，1-100
    code: Optional[str] = None   # 单个自定义激活码（可选）


@router.get("")
async def list_activation_codes(
    status: Optional[str] = Query(None, description="used | unused，不传则全部"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin_id: str = Depends(get_admin_user_id)
):
    """获取激活码列表（分页）"""
    db = get_database()
    query = {}
    if status == "used":
        query["used_at"] = {"$ne": None}
    elif status == "unused":
        query["used_at"] = None
    skip = (page - 1) * page_size
    cursor = db.activation_codes.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.activation_codes.count_documents(query)
    for item in items:
        item["_id"] = str(item["_id"])
    return {"data": items, "total": total, "page": page, "page_size": page_size}


@router.post("")
async def create_activation_codes(body: CreateActivationCodesRequest, admin_id: str = Depends(get_admin_user_id)):
    """生成激活码：传 count 批量生成，或传 code 添加单个自定义码"""
    db = get_database()
    created = []
    if body.code:
        code = body.code.strip().upper()
        if not code:
            raise HTTPException(status_code=400, detail="激活码不能为空")
        existing = await db.activation_codes.find_one({"code": code})
        if existing:
            raise HTTPException(status_code=400, detail=f"激活码 {code} 已存在")
        await db.activation_codes.insert_one({
            "code": code,
            "used_by_user_id": None,
            "used_at": None,
            "created_at": datetime.utcnow(),
        })
        created.append(code)
    elif body.count is not None:
        if body.count < 1 or body.count > 100:
            raise HTTPException(status_code=400, detail="生成数量需在 1-100 之间")
        for _ in range(body.count):
            while True:
                code = generate_code(8)
                if await db.activation_codes.find_one({"code": code}):
                    continue
                await db.activation_codes.insert_one({
                    "code": code,
                    "used_by_user_id": None,
                    "used_at": None,
                    "created_at": datetime.utcnow(),
                })
                created.append(code)
                break
    else:
        raise HTTPException(status_code=400, detail="请传 count 或 code")
    return {"created": created, "count": len(created)}


@router.delete("/{code}")
async def delete_activation_code(code: str, admin_id: str = Depends(get_admin_user_id)):
    """删除指定激活码（未使用的才可删除）"""
    db = get_database()
    code = code.strip().upper()
    doc = await db.activation_codes.find_one({"code": code})
    if not doc:
        raise HTTPException(status_code=404, detail="激活码不存在")
    if doc.get("used_at"):
        raise HTTPException(status_code=400, detail="已使用的激活码不能删除")
    await db.activation_codes.delete_one({"code": code})
    return {"message": "删除成功"}
