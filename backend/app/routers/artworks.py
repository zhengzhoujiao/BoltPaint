from fastapi import APIRouter, Query, HTTPException, Depends
from app.dependencies import get_current_user_id, get_optional_user_id, get_admin_user_id
from app.models import Artwork, ArtworkCreate, ArtworkResponse, GenerationStatus, AspectRatio
from app.database import get_database
from app.services.storage import cleanup_task_image_files
from app.config import settings
from bson import ObjectId
from datetime import datetime
from typing import Optional, List, Literal

router = APIRouter(prefix="/artworks", tags=["artworks"])


@router.get("/admin/list")
async def admin_list_artworks(
    admin_id: str = Depends(get_admin_user_id),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="page_size"),
    artwork_name: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    author: Optional[str] = Query(None),
    template_id: Optional[str] = Query(None, alias="templateId"),
    release_status: Literal["all", "published", "unpublished"] = Query(
        "published",
        alias="releaseStatus",
        description="发布范围：published=仅已发布，unpublished=仅未发布，all=全部",
    ),
):
    """管理员：获取作品列表（分页+筛选）；默认仅已发布（与历史行为一致）"""
    db = get_database()

    query: dict = {}
    if release_status == "published":
        query["is_release"] = True
    elif release_status == "unpublished":
        query["is_release"] = False

    if artwork_name:
        query["artwork_name"] = {"$regex": artwork_name, "$options": "i"}

    if start_date or end_date:
        date_filter: dict = {}
        if start_date:
            try:
                date_filter["$gte"] = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            except ValueError:
                pass
        if end_date:
            try:
                date_filter["$lte"] = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            except ValueError:
                pass
        if date_filter:
            query["created_at"] = date_filter

    if author:
        query["$or"] = [
            {"user_name": {"$regex": author, "$options": "i"}},
            {"user_id": {"$regex": author, "$options": "i"}},
        ]

    if template_id:
        query["template_id"] = template_id

    total = await db.artworks.count_documents(query)
    skip = (page - 1) * page_size
    cursor = db.artworks.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    artworks = await cursor.to_list(length=page_size)

    artwork_list = []
    for artwork in artworks:
        try:
            artwork["_id"] = str(artwork["_id"])
            # 数据归一化，防止模型实例化失败导致 422
            artwork.setdefault("artwork_name", "Untitled")
            artwork.setdefault("user_name", "Unknown")
            artwork.setdefault("user_id", "Unknown")
            artwork.setdefault("user_avatar", "")
            artwork.setdefault("status", GenerationStatus.COMPLETED)
            artwork.setdefault("is_liked", False)
            artwork.setdefault("likes_count", 0)
            artwork.setdefault("aspect_ratio", AspectRatio.SQUARE)
            if "user_input_prompt" not in artwork:
                artwork["user_input_prompt"] = ""
            if "image_url" not in artwork:
                artwork["image_url"] = ""
            if "created_at" not in artwork:
                artwork["created_at"] = datetime.utcnow()
                
            artwork_list.append(Artwork(**artwork))
        except Exception as e:
            print(f"⚠️ 跳过异常作品数据 {artwork.get('id', 'unknown')}: {e}")
            continue

    return {"data": artwork_list, "total": total, "page": page, "page_size": page_size}


@router.get("/admin/{artwork_id}")
async def admin_get_artwork(artwork_id: str, admin_id: str = Depends(get_admin_user_id)):
    """管理员：获取单个作品详情（含模板名称）"""
    db = get_database()
    artwork = await db.artworks.find_one({"id": artwork_id})
    if not artwork:
        raise HTTPException(status_code=404, detail="作品不存在")

    artwork["_id"] = str(artwork["_id"])
    # 数据归一化
    artwork.setdefault("artwork_name", "Untitled")
    artwork.setdefault("user_name", "Unknown")
    artwork.setdefault("user_id", "Unknown")
    artwork.setdefault("user_avatar", "")
    artwork.setdefault("status", GenerationStatus.COMPLETED)
    artwork.setdefault("is_liked", False)
    artwork.setdefault("likes_count", 0)
    artwork.setdefault("aspect_ratio", AspectRatio.SQUARE)
    if "user_input_prompt" not in artwork:
        artwork["user_input_prompt"] = ""
    if "image_url" not in artwork:
        artwork["image_url"] = ""
    if "created_at" not in artwork:
        artwork["created_at"] = datetime.utcnow()

    # 查询模板名称
    template_name = None
    if artwork.get("template_id"):
        tmpl = await db.templates.find_one({"id": artwork["template_id"]}, {"name": 1})
        if tmpl:
            template_name = tmpl.get("name")

    result = Artwork(**artwork).model_dump()
    result["template_name"] = template_name
    return result


@router.get("", response_model=ArtworkResponse)
async def get_artworks(
    page: int = Query(1, ge=1, description="页码 (已弃用，建议使用 before_time)"),
    page_size: int = Query(10, ge=1, le=100),
    before_time: Optional[str] = Query(None, description="游标：在此时间之前的作品 (ISO 格式)"),
    search: Optional[str] = Query(None, description="搜索关键词（作品名称、提示词）"),
    is_release: Optional[bool] = Query(None, alias="isRelease", description="是否只显示已发布作品"),
    tags: Optional[str] = Query(None, description="标签筛选（多个标签用逗号分隔）"),
    user_id: Optional[str] = Depends(get_optional_user_id)
):
    """获取作品列表（分页、搜索、筛选）"""
    db = get_database()
    
    skip = (page - 1) * page_size
    
    # 构建查询条件
    query = {}
    
    # 游标分页核心：只加载比 before_time 早的数据
    if before_time:
        try:
            # 兼容多种 ISO 格式
            dt = datetime.fromisoformat(before_time.replace('Z', '+00:00'))
            query["created_at"] = {"$lt": dt}
        except ValueError:
            print(f"⚠️ 无效的 before_time 格式: {before_time}")

    if search:
        query["$or"] = [
            {"user_input_prompt": {"$regex": search, "$options": "i"}},
            {"artwork_name": {"$regex": search, "$options": "i"}}
        ]
    if is_release is not None:
        query["is_release"] = is_release
    
    # 标签筛选
    if tags:
        tag_list = [tag.strip() for tag in tags.split(',') if tag.strip()]
        if tag_list:
            query["tags"] = {"$in": tag_list}
    
    print(f"📊 作品查询条件: {query}")
    
    # 获取用户点赞的作品 ID 列表
    user = await db.users.find_one({"id": user_id})
    liked_ids = set(user.get("like_ids", [])) if user else set()
    
    # 获取分页数据，按创建时间倒序
    # 如果指定了 before_time，我们不再使用基于 page 的 skip
    if not before_time and page > 1:
        skip = (page - 1) * page_size
        cursor = db.artworks.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    else:
        # 游标模式或第一页
        cursor = db.artworks.find(query).sort("created_at", -1).limit(page_size + 1)
    
    artworks = await cursor.to_list(length=page_size + 1)
    
    # 判断是否还有更多
    has_more = len(artworks) > page_size
    if has_more:
        artworks = artworks[:page_size]
    
    print(f"📊 本页返回作品数: {len(artworks)}, hasMore: {has_more}")
    
    # 转换为响应模型
    artwork_list = []
    for artwork in artworks:
        artwork["_id"] = str(artwork["_id"])
        artwork["is_liked"] = artwork["id"] in liked_ids
        artwork_list.append(Artwork(**artwork))
    
    return ArtworkResponse(
        data=artwork_list,
        hasMore=has_more
    )


@router.get("/{artwork_id}", response_model=Artwork)
async def get_artwork(artwork_id: str, user_id: Optional[str] = Depends(get_optional_user_id)):
    """获取单个作品"""
    db = get_database()
    artwork = await db.artworks.find_one({"id": artwork_id})
    
    if not artwork:
        raise HTTPException(status_code=404, detail="作品不存在")
    
    # 隐私检查：如果作品未发布，且当前用户不是作者，则无权查看
    if not artwork.get("is_release") and artwork.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="此作品未公开")
        
    # 检查是否点赞
    user = await db.users.find_one({"id": user_id})
    artwork["is_liked"] = artwork_id in user.get("like_ids", []) if user else False
    
    artwork["_id"] = str(artwork["_id"])
    return Artwork(**artwork)


@router.get("/user/{user_id}/works", response_model=List[Artwork])
async def get_user_works(user_id: str, current_user_id: Optional[str] = Depends(get_optional_user_id)):
    """获取用户的作品列表"""
    db = get_database()
    
    # 获取当前用户点赞的作品 ID 列表
    current_user = await db.users.find_one({"id": current_user_id})
    liked_ids = set(current_user.get("like_ids", [])) if current_user else set()
    
    # 构建查询条件
    query = {"user_id": user_id}
    # 如果不是查看自己的作品，则只显示已发布的
    if user_id != current_user_id:
        query["is_release"] = True
        
    # 获取用户作品，按创建时间倒序
    cursor = db.artworks.find(query).sort("created_at", -1)
    artworks = await cursor.to_list(length=None)
    
    artwork_list = []
    for artwork in artworks:
        artwork["_id"] = str(artwork["_id"])
        artwork["is_liked"] = artwork["id"] in liked_ids
        artwork_list.append(Artwork(**artwork))
    
    return artwork_list


@router.post("/{artwork_id}/like", response_model=dict)
async def toggle_like(artwork_id: str, user_id: str = Depends(get_current_user_id)):
    """切换点赞状态"""
    db = get_database()
    
    # 检查作品是否存在
    artwork = await db.artworks.find_one({"id": artwork_id})
    if not artwork:
        raise HTTPException(status_code=404, detail="作品不存在")
    
    # 获取用户信息
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 获取用户当前的点赞列表
    like_ids = user.get("like_ids", [])
    is_liked = artwork_id in like_ids
    
    if is_liked:
        # 取消点赞：从用户的 like_ids 中移除
        await db.users.update_one(
            {"id": user_id},
            {"$pull": {"like_ids": artwork_id}}
        )
        # 减少作品的点赞数
        await db.artworks.update_one(
            {"id": artwork_id},
            {
                "$inc": {"likes_count": -1},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        is_liked = False
    else:
        # 添加点赞：将作品 id 添加到用户的 like_ids 中
        await db.users.update_one(
            {"id": user_id},
            {"$addToSet": {"like_ids": artwork_id}}  # $addToSet 确保不重复
        )
        # 增加作品的点赞数
        await db.artworks.update_one(
            {"id": artwork_id},
            {
                "$inc": {"likes_count": 1},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        is_liked = True
    
    return {"is_liked": is_liked}


@router.get("/user/likes", response_model=List[Artwork])
async def get_liked_artworks(user_id: str = Depends(get_current_user_id)):
    """获取用户点赞的作品列表"""
    db = get_database()
    
    # 获取用户信息
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 获取用户点赞的作品 ID 列表
    liked_ids = user.get("like_ids", [])
    
    if not liked_ids:
        return []
    
    # 获取作品详情，按创建时间倒序
    cursor = db.artworks.find({"id": {"$in": liked_ids}}).sort("created_at", -1)
    artworks = await cursor.to_list(length=None)
    
    artwork_list = []
    for artwork in artworks:
        artwork["_id"] = str(artwork["_id"])
        artwork["is_liked"] = True
        artwork_list.append(Artwork(**artwork))
    
    return artwork_list


@router.post("", response_model=Artwork)
async def save_artwork(
    artwork_name: str = Query(..., description="作品名称"),
    artwork_id: str = Query(..., description="作品ID（生成接口返回的）"),
    is_release: bool = Query(False, alias="isRelease", description="是否发布"),
    user_id: str = Depends(get_current_user_id)
):
    """保存作品（从生成结果创建作品记录，并可选择发布）"""
    db = get_database()
    
    # 查找作品，确保只能保存自己的生成任务的结果？如果需要的话
    artwork = await db.artworks.find_one({"id": artwork_id})
    if not artwork:
        raise HTTPException(status_code=404, detail="作品不存在")
    if artwork.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="无权操作此作品")
    
    # 更新作品名称和发布状态
    await db.artworks.update_one(
        {"id": artwork_id},
        {
            "$set": {
                "artwork_name": artwork_name,
                "is_release": is_release,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    # 获取更新后的作品
    updated_artwork = await db.artworks.find_one({"id": artwork_id})
    updated_artwork["_id"] = str(updated_artwork["_id"])
    updated_artwork["is_liked"] = False
    
    return Artwork(**updated_artwork)


@router.put("/{artwork_id}/publish", response_model=dict)
async def toggle_publish(
    artwork_id: str,
    is_release: bool = Query(..., alias="isRelease"),
    user_id: str = Depends(get_current_user_id)
):
    """发布/取消发布作品"""
    db = get_database()
    
    # 检查作品是否存在且属于当前用户
    artwork = await db.artworks.find_one({"id": artwork_id})
    if not artwork:
        raise HTTPException(status_code=404, detail="作品不存在")
    if artwork.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="无权操作此作品")
    
    # 更新发布状态
    await db.artworks.update_one(
        {"id": artwork_id},
        {
            "$set": {
                "is_release": is_release,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    return {
        "success": True,
        "is_release": is_release,
        "message": "作品已发布" if is_release else "作品已取消发布"
    }


@router.put("/{artwork_id}", response_model=Artwork)
async def update_artwork(
    artwork_id: str,
    artwork_name: Optional[str] = Query(None, description="作品名称"),
    user_id: str = Depends(get_current_user_id)
):
    """更新作品信息"""
    db = get_database()
    
    # 检查作品是否存在且属于当前用户
    artwork = await db.artworks.find_one({"id": artwork_id})
    if not artwork:
        raise HTTPException(status_code=404, detail="作品不存在")
    if artwork.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="无权操作此作品")
    
    # 构建更新数据
    update_data = {"updated_at": datetime.utcnow()}
    if artwork_name:
        update_data["artwork_name"] = artwork_name
    
    # 更新作品
    await db.artworks.update_one(
        {"id": artwork_id},
        {"$set": update_data}
    )
    
    # 获取更新后的作品
    updated_artwork = await db.artworks.find_one({"id": artwork_id})
    updated_artwork["_id"] = str(updated_artwork["_id"])
    updated_artwork["is_liked"] = False
    
    return Artwork(**updated_artwork)


@router.delete("/{artwork_id}", response_model=dict)
async def delete_artwork(artwork_id: str, user_id: str = Depends(get_current_user_id)):
    """删除作品"""
    db = get_database()
    
    # 检查作品是否存在且属于当前用户
    artwork = await db.artworks.find_one({"id": artwork_id})
    if not artwork:
        raise HTTPException(status_code=404, detail="作品不存在")
    if artwork.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="无权操作此作品")

    source_tid = artwork.get("source_task_id")
    linked_task = None
    if source_tid:
        linked_task = await db.tasks.find_one(
            {"id": source_tid, "user_id": artwork.get("user_id")}
        )

    # 删除作品
    await db.artworks.delete_one({"id": artwork_id})

    # 若由任务保存而来，同步软删对应任务（与 tasks 删除逻辑一致）
    if source_tid:
        await db.tasks.update_one(
            {
                "id": source_tid,
                "user_id": artwork.get("user_id"),
            },
            {"$set": {"is_deleted": True, "updated_at": datetime.utcnow()}},
        )
        if linked_task:
            cleanup_task_image_files(linked_task, artwork_deleted=True)

    # 从所有用户的点赞中移除该作品
    await db.users.update_many(
        {"like_ids": artwork_id},
        {"$pull": {"like_ids": artwork_id}}
    )
    
    return {"success": True, "message": "作品已删除"}

