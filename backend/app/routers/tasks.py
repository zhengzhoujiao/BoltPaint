from fastapi import APIRouter, HTTPException, Query, Depends
from app.dependencies import get_current_user_id, get_optional_user_id, get_admin_user_id
from app.models import Task, TaskStatus
from app.database import get_database
from app.services.storage import cleanup_task_image_files
from typing import List, Optional
from datetime import datetime

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=List[Task])
async def get_tasks(
    status: Optional[TaskStatus] = Query(None, description="Filter by task status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Page size"),
    user_id_query: Optional[str] = Query(None, alias="user_id", description="Filter by user ID (admin only)"),
    saved_as_artwork: Optional[bool] = Query(
        None,
        description="When status=completed: filter by saved_as_artwork (false = not yet saved to works; uses $ne True for false to include legacy docs without field)",
    ),
    current_user_id: Optional[str] = Depends(get_optional_user_id)
):
    """Get task list with pagination and filtering."""
    db = get_database()
    
    # Build query filter
    query_filter = {"is_deleted": {"$ne": True}}
    
    # Authorization logic
    is_admin = False
    if current_user_id:
        user_record = await db.users.find_one({"id": current_user_id})
        is_admin = user_record.get("is_admin", False) if user_record else False
    
    if is_admin:
        # Admin can filter by user_id_query or see all
        if user_id_query:
            query_filter["user_id"] = user_id_query
    else:
        # Regular user can only see their own tasks
        if not current_user_id:
            raise HTTPException(status_code=401, detail="Authentication required")
        query_filter["user_id"] = current_user_id
    
    if status:
        query_filter["status"] = status

    # WebApp「待保存」Tab：仅 completed 时生效；其它 status 下忽略该参数
    if status == TaskStatus.COMPLETED and saved_as_artwork is not None:
        if saved_as_artwork is False:
            query_filter["saved_as_artwork"] = {"$ne": True}
        else:
            query_filter["saved_as_artwork"] = True
    
    # Calculate skip
    skip = (page - 1) * page_size
    
    # Query tasks, sorted by creation time descending
    cursor = db.tasks.find(query_filter).sort("created_at", -1).skip(skip).limit(page_size)
    tasks = await cursor.to_list(length=page_size)
    
    task_list = []
    for task in tasks:
        task["_id"] = str(task["_id"])
        task_list.append(Task(**task))
    
    return task_list


@router.get("/{task_id}", response_model=Task)
async def get_task(task_id: str, current_user_id: str = Depends(get_current_user_id)):
    """获取任务详情"""
    db = get_database()
    
    # 权限检查
    user_record = await db.users.find_one({"id": current_user_id})
    is_admin = user_record.get("is_admin", False) if user_record else False
    
    # 构建查询：管理员看所有，用户看自己
    query = {"id": task_id, "is_deleted": {"$ne": True}}
    if not is_admin:
        query["user_id"] = current_user_id
        
    task = await db.tasks.find_one(query)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或无权查看")
    
    task["_id"] = str(task["_id"])
    return Task(**task)


@router.delete("/{task_id}")
async def delete_task(task_id: str, current_user_id: str = Depends(get_current_user_id)):
    """删除任务"""
    db = get_database()
    
    # 权限检查：只有所有者或管理员可删
    user_record = await db.users.find_one({"id": current_user_id})
    is_admin = user_record.get("is_admin", False) if user_record else False
    
    query = {"id": task_id}
    if not is_admin:
        query["user_id"] = current_user_id
        
    task = await db.tasks.find_one(query)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或无权操作")
    
    # 软删除任务
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"is_deleted": True, "updated_at": datetime.utcnow()}}
    )

    cleanup_task_image_files(task, artwork_deleted=False)

    return {"success": True, "message": "Task deleted successfully"}


@router.get("/stats/summary")
async def get_task_stats(user_id: str = Depends(get_current_user_id)):
    """Get user's task statistics"""
    db = get_database()
    
    # Count tasks by status (exclude deleted)
    base_filter = {"user_id": user_id, "is_deleted": {"$ne": True}}
    
    total = await db.tasks.count_documents(base_filter)
    
    generating_filter = base_filter.copy()
    generating_filter["status"] = TaskStatus.GENERATING
    generating = await db.tasks.count_documents(generating_filter)
    
    completed_filter = base_filter.copy()
    completed_filter["status"] = TaskStatus.COMPLETED
    completed = await db.tasks.count_documents(completed_filter)
    
    failed_filter = base_filter.copy()
    failed_filter["status"] = TaskStatus.FAILED
    failed = await db.tasks.count_documents(failed_filter)
    
    return {
        "total": total,
        "generating": generating,
        "completed": completed,
        "failed": failed
    }

import io
import os
import zipfile
from fastapi.responses import StreamingResponse
from urllib.parse import quote
from app.services.storage import resolve_storage_file

@router.get("/{task_id}/download_zip")
async def download_task_zip(task_id: str, current_user_id: str = Depends(get_current_user_id)):
    """下载生成任务的所有图片压缩包"""
    db = get_database()
    
    # 权限检查
    user_record = await db.users.find_one({"id": current_user_id})
    is_admin = user_record.get("is_admin", False) if user_record else False
    
    query = {"id": task_id, "is_deleted": {"$ne": True}}
    if not is_admin:
        query["user_id"] = current_user_id
        
    task = await db.tasks.find_one(query)
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或无权查看")
        
    images_to_zip = []
    
    # Check comic data
    if task.get("task_type") == "comic" and task.get("comic_data"):
        comic_data = task["comic_data"]
        pages = comic_data.get("pages", [])
        for page in pages:
            if page.get("image_url"):
                images_to_zip.append({
                    "url": page["image_url"],
                    "filename": f"page_{page.get('page_number')}.png" if not page.get("is_cover") else "cover.png"
                })
    elif task.get("image_url"):
        # Single image task fallback
        images_to_zip.append({
            "url": task["image_url"],
            "filename": "image.png"
        })
        
    if not images_to_zip:
        raise HTTPException(status_code=404, detail="No images found for this task")
        
    # Create zip in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for item in images_to_zip:
            url = item["url"]
            filename = item["filename"]
            
            # Resolve local file path
            local_path = None
            if url.startswith("/boltPaint/generated/"):
                local_path = resolve_storage_file("generated", url.replace("/boltPaint/generated/", ""))
            elif url.startswith("/boltPaint/static/"):
                local_path = resolve_storage_file("uploads", url.replace("/boltPaint/static/", ""))
            else:
                # If it's a full URL or unknown, we might not be able to zip it directly from local
                continue
                
            if local_path and os.path.exists(local_path):
                zip_file.write(local_path, arcname=filename)
                
    zip_buffer.seek(0)
    
    task_name = task.get("task_name") or "comic"
    # url encode task name to handle non-ascii chars in headers
    encoded_filename = quote(f"{task_name}.zip")
    
    headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
    }
    
    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers=headers
    )
