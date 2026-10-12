from fastapi import APIRouter, HTTPException, Response, Depends
from app.dependencies import get_admin_user_id
from app.database import get_database
from app.models import (
    PricingStrategy,
    PricingStrategyCreate,
    PricingStrategyUpdate,
    GEMINI_IMAGE_MODELS,
    EVOLINK_IMAGE_MODELS,
    ALL_IMAGE_MODELS,
    DEFAULT_ADVANCED_MODEL,
    get_strategy_resolutions,
)
from typing import Any, List, Dict, Optional
from datetime import datetime

router = APIRouter(prefix="/pricing", tags=["pricing"])


def _doc_to_pricing_strategy(doc: dict) -> Optional[PricingStrategy]:
    """Mongo 文档转模型：去掉 _id，补全 model_id，单条损坏不拖垮整表。"""
    try:
        clean = {k: v for k, v in doc.items() if k != "_id"}
        if not clean.get("model_id"):
            clean["model_id"] = DEFAULT_ADVANCED_MODEL
        clean["supported_resolutions"] = get_strategy_resolutions(clean)
        return PricingStrategy(**clean)
    except Exception as e:
        print(f"[WARN] 跳过无效定价策略文档 id={doc.get('id')!r}: {e}")
        return None


@router.get("/models", response_model=Dict[str, Any])
async def get_available_models():
    """获取可用的 Gemini 生图模型结构化元数据（优先从 DB 读取，只返回已启用的，兜底 GEMINI_IMAGE_MODELS）"""
    db = get_database()
    # 仅返回已启用的模型
    cursor = db.image_models.find({"enabled": True}).sort("sort_order", 1)
    docs = await cursor.to_list(length=100)
    if docs:
        result: Dict[str, Any] = {}
        for doc in docs:
            model_id = doc.get("id")
            if model_id:
                result[model_id] = {
                    "name": doc.get("name", model_id),
                    "is_flash": doc.get("is_flash", False),
                    "supports_512": doc.get("supports_512", False),
                    "description": doc.get("description", ""),
                }
        return result
    # 兜底：返回写死的内置数据（兼容未初始化的旧环境）
    return ALL_IMAGE_MODELS


@router.get("", response_model=List[PricingStrategy])
async def get_pricing_strategies(response: Response):
    """获取所有定价策略（禁用缓存，避免 Web 端看到过期的策略列表）"""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    db = get_database()
    cursor = db.pricing_strategies.find({})
    raw = await cursor.to_list(length=200)
    out: List[PricingStrategy] = []
    for s in raw:
        m = _doc_to_pricing_strategy(s)
        if m is not None:
            out.append(m)
    return out

@router.post("", response_model=PricingStrategy)
async def create_pricing_strategy(strategy: PricingStrategyCreate, admin_id: str = Depends(get_admin_user_id)):
    """创建定价策略"""
    db = get_database()
    
    # 生成 ID
    strategy_id = f"ps_{int(datetime.utcnow().timestamp() * 1000)}"
    
    strategy_data = strategy.dict()
    strategy_data["id"] = strategy_id
    strategy_data["created_at"] = datetime.utcnow()
    strategy_data["updated_at"] = datetime.utcnow()
    
    await db.pricing_strategies.insert_one(strategy_data)
    return PricingStrategy(**strategy_data)

@router.get("/{strategy_id}", response_model=PricingStrategy)
async def get_pricing_strategy(strategy_id: str):
    """获取单个定价策略"""
    db = get_database()
    strategy = await db.pricing_strategies.find_one({"id": strategy_id})
    if not strategy:
        raise HTTPException(status_code=404, detail="Pricing strategy not found")
    return _doc_to_pricing_strategy(strategy)

@router.put("/{strategy_id}", response_model=PricingStrategy)
async def update_pricing_strategy(strategy_id: str, strategy_update: PricingStrategyUpdate, admin_id: str = Depends(get_admin_user_id)):
    """更新定价策略"""
    db = get_database()
    
    # 检查是否存在
    existing = await db.pricing_strategies.find_one({"id": strategy_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Pricing strategy not found")
    
    update_data = strategy_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    
    await db.pricing_strategies.update_one(
        {"id": strategy_id},
        {"$set": update_data}
    )
    
    updated = await db.pricing_strategies.find_one({"id": strategy_id})
    return _doc_to_pricing_strategy(updated)

@router.delete("/{strategy_id}")
async def delete_pricing_strategy(strategy_id: str, admin_id: str = Depends(get_admin_user_id)):
    """删除定价策略"""
    db = get_database()
    
    # 检查是否存在
    existing = await db.pricing_strategies.find_one({"id": strategy_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Pricing strategy not found")
    
    # 检查是否有模板正在使用该策略
    in_use = await db.templates.count_documents({"pricing_strategy_id": strategy_id})
    if in_use > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete strategy as it is in use by {in_use} templates")
    
    await db.pricing_strategies.delete_one({"id": strategy_id})
    return {"message": "Pricing strategy deleted successfully", "status": "success"}
