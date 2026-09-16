from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.dependencies import get_current_user_id
import os
import uuid
import shutil
import io
from PIL import Image
from app.config import settings
from app.services.storage import get_active_dir

router = APIRouter(prefix="/uploads", tags=["uploads"])

# 存储根目录由环境变量 OBJECT_STORAGE_DIR 决定（见 app/config.py）

@router.post("/image")
async def upload_image(file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    # 验证文件类型
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    # 根据对象存储开关获取上传目录
    upload_dir = get_active_dir("uploads")
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir, exist_ok=True)
    
    # 生成唯一文件名
    file_extension = os.path.splitext(file.filename)[1].lower()
    unique_id = str(uuid.uuid4())
    
    # 读取原始数据以检查大小
    image_bytes = await file.read()
    file_size_kb = len(image_bytes) / 1024
    
    # 如果大于 100KB，压缩为 WebP
    if file_size_kb > 100:
        try:
            # 参考 generate.py 中的缩略图生成逻辑
            img = Image.open(io.BytesIO(image_bytes))
            
            # 如果是带有 Alpha 通道的模式（如 RGBA），转换为 RGB 以减小体积（WebP 支持 Alpha，但如果是封面/参考图，通常不需要极高透明度细节）
            # 或者保持模式，WebP 自身支持
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            
            # 限制最大宽度（参考缩略图逻辑，设定为 1200px 以兼顾清晰度）
            max_width = 1200
            if img.width > max_width:
                ratio = max_width / img.width
                new_height = int(img.height * ratio)
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            
            # 保存为 WebP
            unique_filename = f"{unique_id}.webp"
            file_path = os.path.join(upload_dir, unique_filename)
            
            # 动态调整质量以确保文件大小在 100KB 左右或以下
            # 初始使用 85 质量 (参考 generate.py)
            img.save(file_path, 'WEBP', quality=85, method=6)
            
            # 如果还是太大，则再次压缩
            if os.path.getsize(file_path) > 100 * 1024:
                img.save(file_path, 'WEBP', quality=75, method=6)
                
            print(f"[UPLOAD] Compressed {file.filename} ({file_size_kb:.1f}KB) -> {unique_filename} ({os.path.getsize(file_path)/1024:.1f}KB)")
        except Exception as e:
            print(f"[ERROR] Compression failed, saving original: {e}")
            # 压缩失败则保存原图
            unique_filename = f"{unique_id}{file_extension}"
            file_path = os.path.join(upload_dir, unique_filename)
            with open(file_path, "wb") as buffer:
                buffer.write(image_bytes)
    else:
        # 小于 100KB，直接保存原图
        unique_filename = f"{unique_id}{file_extension}"
        file_path = os.path.join(upload_dir, unique_filename)
        with open(file_path, "wb") as buffer:
            buffer.write(image_bytes)
    
    # 返回可访问的 URL
    image_url = f"/boltPaint/static/{unique_filename}"
    
    return {
        "success": True,
        "filename": unique_filename,
        "url": image_url
    }
