from fastapi import APIRouter, HTTPException, Response, Depends
from app.dependencies import get_admin_user_id
from app.database import get_database
from app.models import RechargePackage, RechargePackageCreate, RechargePackageUpdate
from typing import List, Optional
from datetime import datetime

router = APIRouter(prefix="/recharge-packages", tags=["recharge-packages"])


def _doc_to_package(doc: dict) -> Optional[RechargePackage]:
    try:
        clean = {k: v for k, v in doc.items() if k != "_id"}
        return RechargePackage(**clean)
    except Exception as e:
        print(f"[WARN] 跳过无效充值档位 id={doc.get('id')!r}: {e}")
        return None


@router.get("", response_model=List[RechargePackage])
async def list_recharge_packages(response: Response):
    """充值档位列表（管理端与客户端共用；客户端请仅展示 enabled=true）"""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    db = get_database()
    cursor = db.recharge_packages.find({}).sort([("sort_order", 1), ("created_at", 1)])
    raw = await cursor.to_list(length=200)
    out: List[RechargePackage] = []
    for doc in raw:
        m = _doc_to_package(doc)
        if m is not None:
            out.append(m)
    return out


@router.post("", response_model=RechargePackage)
async def create_recharge_package(body: RechargePackageCreate, admin_id: str = Depends(get_admin_user_id)):
    db = get_database()
    package_id = f"rp_{int(datetime.utcnow().timestamp() * 1000)}"
    now = datetime.utcnow()
    data = body.dict()
    data["id"] = package_id
    data["created_at"] = now
    data["updated_at"] = now
    await db.recharge_packages.insert_one(data)
    return RechargePackage(**data)


@router.get("/{package_id}", response_model=RechargePackage)
async def get_recharge_package(package_id: str):
    db = get_database()
    doc = await db.recharge_packages.find_one({"id": package_id})
    if not doc:
        raise HTTPException(status_code=404, detail="充值档位不存在")
    m = _doc_to_package(doc)
    if m is None:
        raise HTTPException(status_code=500, detail="充值档位数据无效")
    return m


@router.put("/{package_id}", response_model=RechargePackage)
async def update_recharge_package(package_id: str, body: RechargePackageUpdate, admin_id: str = Depends(get_admin_user_id)):
    db = get_database()
    existing = await db.recharge_packages.find_one({"id": package_id})
    if not existing:
        raise HTTPException(status_code=404, detail="充值档位不存在")
    update_data = body.dict(exclude_unset=True)
    if not update_data:
        m = _doc_to_package(existing)
        assert m is not None
        return m
    update_data["updated_at"] = datetime.utcnow()
    await db.recharge_packages.update_one({"id": package_id}, {"$set": update_data})
    updated = await db.recharge_packages.find_one({"id": package_id})
    m = _doc_to_package(updated or {})
    assert m is not None
    return m


@router.delete("/{package_id}")
async def delete_recharge_package(package_id: str, admin_id: str = Depends(get_admin_user_id)):
    db = get_database()
    result = await db.recharge_packages.delete_one({"id": package_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="充值档位不存在")
    return {"message": "充值档位已删除", "status": "success"}
