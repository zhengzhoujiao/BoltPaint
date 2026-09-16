from fastapi import APIRouter, Query, HTTPException, Depends
from app.dependencies import get_admin_user_id
from app.models import Tag, TagCreate, TagUpdate
from app.database import get_database
from datetime import datetime
from typing import List, Optional

router = APIRouter(prefix="/tags", tags=["tags"])


@router.post("", response_model=Tag)
async def create_tag(tag: TagCreate, admin_id: str = Depends(get_admin_user_id)):
    """创建标签"""
    db = get_database()
    
    # 检查标签值是否已存在
    existing_tag = await db.tags.find_one({"value": tag.value})
    if existing_tag:
        raise HTTPException(status_code=400, detail="标签值已存在")
    
    # 生成标签 ID
    tag_id = f"tag_{int(datetime.utcnow().timestamp() * 1000)}"
    
    tag_dict = {
        "id": tag_id,
        "label": tag.label,
        "value": tag.value,
        "order": tag.order,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    await db.tags.insert_one(tag_dict)
    tag_dict["_id"] = str(tag_dict.get("_id"))
    
    return Tag(**tag_dict)


@router.get("", response_model=List[Tag])
async def get_tags(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100)
):
    """获取标签列表，按 order 字段升序排序"""
    db = get_database()
    
    skip = (page - 1) * page_size
    
    # 获取标签列表，按 order 升序排序（数值越小越靠前）
    cursor = db.tags.find({}).sort("order", 1).skip(skip).limit(page_size)
    tags = await cursor.to_list(length=page_size)
    
    tag_list = []
    for tag in tags:
        tag["_id"] = str(tag["_id"])
        tag_list.append(Tag(**tag))
    
    return tag_list


@router.get("/{tag_id}", response_model=Tag)
async def get_tag(tag_id: str):
    """获取标签详情"""
    db = get_database()
    
    tag = await db.tags.find_one({"id": tag_id})
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    
    tag["_id"] = str(tag["_id"])
    return Tag(**tag)


@router.put("/{tag_id}", response_model=Tag)
async def update_tag(tag_id: str, tag_update: TagUpdate, admin_id: str = Depends(get_admin_user_id)):
    """更新标签"""
    db = get_database()
    
    # 检查标签是否存在
    tag = await db.tags.find_one({"id": tag_id})
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    
    # 构建更新数据
    update_data = {"updated_at": datetime.utcnow()}
    if tag_update.label is not None:
        update_data["label"] = tag_update.label
    if tag_update.value is not None:
        # 检查新的值是否与其他标签冲突
        existing_tag = await db.tags.find_one({"value": tag_update.value, "id": {"$ne": tag_id}})
        if existing_tag:
            raise HTTPException(status_code=400, detail="标签值已存在")
        update_data["value"] = tag_update.value
    if tag_update.order is not None:
        update_data["order"] = tag_update.order
    
    # 更新标签
    await db.tags.update_one(
        {"id": tag_id},
        {"$set": update_data}
    )
    
    # 返回更新后的标签
    updated_tag = await db.tags.find_one({"id": tag_id})
    updated_tag["_id"] = str(updated_tag["_id"])
    return Tag(**updated_tag)


@router.delete("/{tag_id}", response_model=dict)
async def delete_tag(tag_id: str, admin_id: str = Depends(get_admin_user_id)):
    """删除标签"""
    db = get_database()
    
    # 检查标签是否存在
    tag = await db.tags.find_one({"id": tag_id})
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    
    # 删除标签
    await db.tags.delete_one({"id": tag_id})
    
    return {
        "success": True,
        "message": "标签已删除",
        "tag_id": tag_id
    }


