from fastapi import APIRouter, Query, HTTPException, Depends
from app.dependencies import get_current_user_id, get_optional_user_id, get_admin_user_id
from app.models import Template, TemplateCreate, TemplateSubmitRequest, TemplateReviewRequest, TemplateStatus
from app.database import get_database
from bson import ObjectId
from datetime import datetime
from typing import List, Optional

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=dict)
async def get_templates(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None, description="搜索关键词（模板名称）"),
    tags: Optional[str] = Query(None, description="标签ID列表，多个用逗号分隔"),
    exclude_id: Optional[str] = Query(None, description="要排除的模板ID"),
    is_custom: Optional[bool] = Query(None, description="是否自定义模板"),
    creator_id: Optional[str] = Query(None, alias="creatorId", description="创建者ID"),
    status: Optional[str] = Query(None, description="模板状态"),
    user_id: Optional[str] = Depends(get_optional_user_id)
):
    """获取模板列表（分页、搜索、筛选）"""
    db = get_database()
    
    skip = (page - 1) * page_size
    
    # 构建查询条件
    query = {}
    
    # 权限与状态处理逻辑
    if status:
        # 如果请求特定状态，通常是用户查看自己的模版或管理员查看
        # 简单校验：如果查看非 APPROVED 状态，且不是管理员，则强制增加 creator_id 限制
        query["status"] = status
        
        if status != TemplateStatus.APPROVED:
            # 校验权限：只能看自己的，或者是管理员
            is_admin = False
            if user_id:
                user_record = await db.users.find_one({"id": user_id})
                is_admin = user_record.get("is_admin", False) if user_record else False
            
            if not is_admin:
                # 非管理员只能看自己创建的某状态模版
                if not user_id:
                    raise HTTPException(status_code=401, detail="请登录以查看非公开模版")
                query["creator_id"] = user_id
    else:
        # 默认只显示已审核通过的模板
        query["$or"] = [{"status": {"$exists": False}}, {"status": TemplateStatus.APPROVED}]
    
    if creator_id:
        query["creator_id"] = creator_id
        
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    if tags:
        tag_list = tags.split(",")
        query["tags"] = {"$in": tag_list}
        
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
        
    if is_custom is not None:
        if is_custom:
            query["is_custom"] = True
        else:
            # 对于非自定义模式，匹配 is_custom 为 false 或不存在该字段的情况
            query["is_custom"] = {"$ne": True}
    
    # 获取总数
    total = await db.templates.count_documents(query)
    
    # 获取用户收藏的模板 ID 列表
    collected_ids = set()
    if user_id:
        user = await db.users.find_one({"id": user_id})
        if user:
            collected_ids = set(user.get("collection_ids", []))
    
    # 获取分页数据
    cursor = db.templates.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    templates = await cursor.to_list(length=page_size)
    
    # 转换为响应模型
    template_list = []
    for template in templates:
        template["_id"] = str(template["_id"])
        template_dict = Template(**template).dict()
        # 添加收藏状态
        template_dict["is_collected"] = template["id"] in collected_ids
        template_list.append(template_dict)
    
    has_more = skip + page_size < total
    
    return {
        "data": template_list,
        "hasMore": has_more,
        "total": total
    }


@router.get("/{template_id}", response_model=dict)
async def get_template(
    template_id: str,
    user_id: Optional[str] = Depends(get_optional_user_id)
):
    """获取单个模板"""
    db = get_database()
    template = await db.templates.find_one({"id": template_id})
    
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    
    # 隐私检查：如果模板不是已审核通过状态，且当前用户不是创建者，且不是管理员，则无权查看
    status = template.get("status", TemplateStatus.APPROVED)
    if status != TemplateStatus.APPROVED:
        is_admin = False
        if user_id:
            user_record = await db.users.find_one({"id": user_id})
            is_admin = user_record.get("is_admin", False) if user_record else False
            
        if not is_admin and template.get("creator_id") != user_id:
            raise HTTPException(status_code=403, detail="该模板尚未通过审核")
            
    template["_id"] = str(template["_id"])
    template_dict = Template(**template).dict()
    
    # 检查用户是否收藏了该模板
    if user_id:
        user = await db.users.find_one({"id": user_id})
        template_dict["is_collected"] = template_id in user.get("collection_ids", []) if user else False
    else:
        template_dict["is_collected"] = False
    
    return template_dict


@router.post("", response_model=Template)
async def create_template(template: TemplateCreate, admin_id: str = Depends(get_admin_user_id)):
    """创建新模板（管理员功能）"""
    db = get_database()
    
    # 生成 ID
    template_id = f"t_{int(datetime.utcnow().timestamp() * 1000)}"
    
    template_dict = {
        "id": template_id,
        **template.dict(),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await db.templates.insert_one(template_dict)
    template_dict["_id"] = str(result.inserted_id)
    
    return Template(**template_dict)


@router.put("/{template_id}", response_model=Template)
async def update_template(template_id: str, template: TemplateCreate, admin_id: str = Depends(get_admin_user_id)):
    """更新模板（管理员功能）"""
    db = get_database()
    
    # 检查模板是否存在
    existing_template = await db.templates.find_one({"id": template_id})
    if not existing_template:
        raise HTTPException(status_code=404, detail="模板不存在")
    
    # 获取显式提供的字段，避免默认值覆盖
    update_data = template.dict(exclude_unset=True)
    
    final_update_data = {
        **update_data,
        "updated_at": datetime.utcnow()
    }
    
    # 使用 exclude_unset=True 后，未显式提供的字段（如 status, creator_id, model_id, is_custom）
    # 不会包含在 update_data 中，因此也就不会覆盖数据库中的原有值。
    
    await db.templates.update_one(
        {"id": template_id},
        {"$set": final_update_data}
    )
    
    # 获取更新后的模板
    updated_template = await db.templates.find_one({"id": template_id})
    updated_template["_id"] = str(updated_template["_id"])
    
    return Template(**updated_template)


@router.delete("/{template_id}", response_model=dict)
async def delete_template(template_id: str, admin_id: str = Depends(get_admin_user_id)):
    """删除模板（管理员功能）"""
    db = get_database()
    
    # 检查模板是否存在
    template = await db.templates.find_one({"id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    
    # 删除模板
    await db.templates.delete_one({"id": template_id})
    
    # 从所有用户的收藏中移除该模板
    await db.users.update_many(
        {"collection_ids": template_id},
        {"$pull": {"collection_ids": template_id}}
    )
    
    return {"success": True, "message": "模板已删除"}


@router.post("/{template_id}/collect", response_model=dict)
async def toggle_collect(
    template_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """切换收藏状态"""
    db = get_database()
    
    # 检查模板是否存在
    template = await db.templates.find_one({"id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    
    # 获取用户信息
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 获取用户当前的收藏列表
    collection_ids = user.get("collection_ids", [])
    is_collected = template_id in collection_ids
    
    if is_collected:
        # 取消收藏：从用户的 collection_ids 中移除
        await db.users.update_one(
            {"id": user_id},
            {"$pull": {"collection_ids": template_id}}
        )
        is_collected = False
    else:
        # 添加收藏：将模板 id 添加到用户的 collection_ids 中
        await db.users.update_one(
            {"id": user_id},
            {"$addToSet": {"collection_ids": template_id}}
        )
        is_collected = True
    
    return {"is_collected": is_collected}


@router.get("/user/collections", response_model=List[dict])
async def get_user_collections(user_id: str = Depends(get_current_user_id)):
    """获取用户收藏的模板列表"""
    db = get_database()
    
    # 获取用户信息
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 获取用户收藏的模板 ID 列表
    collection_ids = user.get("collection_ids", [])
    
    if not collection_ids:
        return []
    
    # 获取模板详情
    cursor = db.templates.find({"id": {"$in": collection_ids}}).sort("created_at", -1)
    templates = await cursor.to_list(length=None)
    
    template_list = []
    for template in templates:
        template["_id"] = str(template["_id"])
        template_dict = Template(**template).dict()
        template_dict["is_collected"] = True
        template_list.append(template_dict)
    
    return template_list


@router.post("/submit", response_model=dict)
async def submit_task_as_template(
    body: TemplateSubmitRequest,
    user_id: str = Depends(get_current_user_id)
):
    """用户将高阶生图任务保存为模板，提交管理员审核"""
    db = get_database()
    
    # 获取任务
    task = await db.tasks.find_one({"id": body.task_id, "user_id": user_id})
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或没有权限")
    
    if task.get("status") != "completed":
        raise HTTPException(status_code=400, detail="只有已完成的任务才能保存为模板")
    
    if task.get("saved_as_template"):
        raise HTTPException(status_code=400, detail="该任务已经保存为模板")
    
    if not task.get("image_url"):
        raise HTTPException(status_code=400, detail="任务尚无生成图片")
    
    _ar = task.get("aspect_ratio")
    _default_ar = None
    if _ar is not None:
        _default_ar = _ar.value if hasattr(_ar, "value") else str(_ar)

    # 创建模板记录（状态为 pending）
    template_id = f"t_{int(datetime.utcnow().timestamp() * 1000)}"
    template_data = {
        "id": template_id,
        "name": body.name,
        "description": body.description,
        "cover_image": task.get("image_url"),  # 用生成的图片作为封面
        "system_instruction": task.get("system_instruction") or "",
        "preset_prompt": task.get("user_input_prompt") or "",
        "pricing_strategy_id": task.get("pricing_strategy_id") or "BananaPro",
        "tags": body.tags,
        "reference_images": task.get("reference_images", []),
        "use_count": 0,
        "is_featured": False,
        "status": TemplateStatus.PENDING,
        "is_custom": True,
        "creator_id": user_id,
        "model_id": task.get("model_id"),
        "reject_reason": None,
        "default_aspect_ratio": _default_ar,
        "default_resolution": task.get("resolution"),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    await db.templates.insert_one(template_data)
    
    # 标记任务为已保存为模板
    await db.tasks.update_one(
        {"id": body.task_id},
        {"$set": {"saved_as_template": True, "updated_at": datetime.utcnow()}}
    )
    
    return {"success": True, "message": "模板已提交审核，审核通过后将对所有人可用", "template_id": template_id}


@router.get("/admin/pending", response_model=dict)
async def get_pending_templates(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin_id: str = Depends(get_admin_user_id)
):
    """获取待审核模板列表（管理员）"""
    db = get_database()
    
    skip = (page - 1) * page_size
    query = {"status": TemplateStatus.PENDING}
    total = await db.templates.count_documents(query)
    
    cursor = db.templates.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    templates = await cursor.to_list(length=page_size)
    
    template_list = []
    for template in templates:
        template["_id"] = str(template["_id"])
        t_dict = Template(**template).dict()
        # 获取创建者信息
        if template.get("creator_id"):
            creator = await db.users.find_one({"id": template["creator_id"]})
            t_dict["creator_name"] = creator.get("username") if creator else "Unknown"
            t_dict["creator_avatar"] = (
                (creator.get("avatar") or creator.get("user_image")) if creator else None
            )
        template_list.append(t_dict)
    
    return {
        "data": template_list,
        "hasMore": skip + page_size < total,
        "total": total
    }


@router.post("/admin/{template_id}/review", response_model=dict)
async def review_template(
    template_id: str,
    body: TemplateReviewRequest,
    admin_id: str = Depends(get_admin_user_id)
):
    """管理员审核模板（通过或驳回）"""
    db = get_database()
    
    # 获取模板
    template = await db.templates.find_one({"id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    
    if template.get("status") != TemplateStatus.PENDING:
        raise HTTPException(status_code=400, detail="该模板不在待审核状态")
    
    if body.action == "approve":
        new_status = TemplateStatus.APPROVED
        update = {"status": new_status, "updated_at": datetime.utcnow()}
        message = "模板已通过审核"
    elif body.action == "reject":
        new_status = TemplateStatus.REJECTED
        update = {"status": new_status, "reject_reason": body.reject_reason or "", "updated_at": datetime.utcnow()}
        message = "模板已驳回"
    else:
        raise HTTPException(status_code=400, detail="action 必须为 'approve' 或 'reject'")
    
    await db.templates.update_one({"id": template_id}, {"$set": update})
    
    return {"success": True, "message": message, "status": new_status}
