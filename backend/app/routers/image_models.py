from fastapi import APIRouter, HTTPException, Response, Depends
from app.dependencies import get_admin_user_id
from app.database import get_database
from app.models import ImageModel, ImageModelCreate, ImageModelUpdate, GEMINI_IMAGE_MODELS, EVOLINK_IMAGE_MODELS, get_strategy_resolutions
from typing import List, Optional
from datetime import datetime

router = APIRouter(prefix="/models", tags=["image_models"])


async def _get_model_with_pricing(doc: dict, db) -> dict:
    """把定价策略的价格 join 到模型文档里，方便前端直接使用"""
    clean = {k: v for k, v in doc.items() if k != "_id"}
    strategy_id = clean.get("pricing_strategy_id")
    if strategy_id:
        strategy = await db.pricing_strategies.find_one({"id": strategy_id})
        if strategy:
            clean["supported_resolutions"] = get_strategy_resolutions(strategy)
            clean["price_1k"] = strategy.get("price_1k")
            clean["price_2k"] = strategy.get("price_2k")
            clean["price_4k"] = strategy.get("price_4k")
    return clean


@router.get("", response_model=List[ImageModel])
async def list_image_models(response: Response, enabled_only: bool = True):
    """获取生图模型列表（默认只返回已启用的）"""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    db = get_database()
    query = {"enabled": True} if enabled_only else {}
    cursor = db.image_models.find(query).sort("sort_order", 1)
    docs = await cursor.to_list(length=100)

    # 若 DB 为空，降级返回 GEMINI_IMAGE_MODELS 内置数据（兼容未初始化的环境）
    if not docs:
        return []

    result = []
    for doc in docs:
        enriched = await _get_model_with_pricing(doc, db)
        try:
            result.append(ImageModel(**enriched))
        except Exception as e:
            print(f"[WARN] 跳过无效模型文档 id={doc.get('id')!r}: {e}")
    return result


@router.get("/{model_id}", response_model=ImageModel)
async def get_image_model(model_id: str):
    """获取单个生图模型"""
    db = get_database()
    doc = await db.image_models.find_one({"id": model_id})
    if not doc:
        raise HTTPException(status_code=404, detail="模型不存在")
    enriched = await _get_model_with_pricing(doc, db)
    return ImageModel(**enriched)


@router.post("", response_model=ImageModel)
async def create_image_model(model: ImageModelCreate, admin_id: str = Depends(get_admin_user_id)):
    """创建生图模型"""
    db = get_database()
    existing = await db.image_models.find_one({"id": model.id})
    if existing:
        raise HTTPException(status_code=400, detail=f"模型 ID '{model.id}' 已存在")
    strategy = await db.pricing_strategies.find_one({"id": model.pricing_strategy_id})
    if not strategy:
        raise HTTPException(status_code=400, detail=f"定价策略 '{model.pricing_strategy_id}' 不存在")
    now = datetime.utcnow()
    doc = {**model.dict(), "created_at": now, "updated_at": now}
    await db.image_models.insert_one(doc)
    enriched = await _get_model_with_pricing(doc, db)
    return ImageModel(**enriched)


@router.put("/{model_id}", response_model=ImageModel)
async def update_image_model(model_id: str, update: ImageModelUpdate, admin_id: str = Depends(get_admin_user_id)):
    """更新生图模型"""
    db = get_database()
    existing = await db.image_models.find_one({"id": model_id})
    if not existing:
        raise HTTPException(status_code=404, detail="模型不存在")
    update_data = {k: v for k, v in update.dict(exclude_unset=True).items() if v is not None}
    if "pricing_strategy_id" in update_data:
        strategy = await db.pricing_strategies.find_one({"id": update_data["pricing_strategy_id"]})
        if not strategy:
            raise HTTPException(status_code=400, detail=f"定价策略 '{update_data['pricing_strategy_id']}' 不存在")
    update_data["updated_at"] = datetime.utcnow()
    await db.image_models.update_one({"id": model_id}, {"$set": update_data})
    updated = await db.image_models.find_one({"id": model_id})
    enriched = await _get_model_with_pricing(updated, db)
    return ImageModel(**enriched)


@router.delete("/{model_id}")
async def delete_image_model(model_id: str, admin_id: str = Depends(get_admin_user_id)):
    """删除生图模型"""
    db = get_database()
    existing = await db.image_models.find_one({"id": model_id})
    if not existing:
        raise HTTPException(status_code=404, detail="模型不存在")
    await db.image_models.delete_one({"id": model_id})
    return {"message": "删除成功", "status": "success"}
