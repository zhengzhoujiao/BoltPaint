import base64
import os
import uuid
from pathlib import Path
from urllib.parse import urlparse
from app.config import settings


def get_active_dir(subdir: str) -> str:
    """
    返回 OBJECT_STORAGE_DIR 下的子目录绝对路径（uploads / generated / custom）。
    与 settings.uploads_dir 等同关系：get_active_dir('uploads') == settings.uploads_dir
    """
    return os.path.join(settings.object_storage_dir, subdir)


def resolve_storage_file(subdir: str, rel_path: str) -> str | None:
    """在 object_storage_dir 下解析相对路径，返回存在的文件绝对路径。"""
    if not rel_path or ".." in rel_path.split(os.sep):
        return None
    root = os.path.abspath(os.path.join(settings.object_storage_dir, subdir))
    full = os.path.abspath(os.path.join(root, rel_path))
    if not full.startswith(root + os.sep) and full != root:
        return None
    if os.path.isfile(full):
        return full
    return None


def delete_file_for_public_url(url: str) -> None:
    """
    根据对外 URL（/static|/generated|/custom 或绝对 URL）删除 OBJECT_STORAGE_DIR 下对应文件。
    缺失或非文件 URL 时忽略；删除失败仅打印日志，不抛异常。
    """
    if not url or not isinstance(url, str):
        return
    u = url.strip()
    if not u or u.startswith("data:"):
        return
    if u.startswith(("http://", "https://")):
        path = urlparse(u).path or ""
    else:
        path = u.split("?")[0].split("#")[0]
    if not path.startswith("/"):
        return

    prefix_subdir = (
        ("/boltPaint/static/", "uploads"),
        ("/boltPaint/generated/", "generated"),
        ("/boltPaint/custom/", "custom"),
    )
    for prefix, subdir in prefix_subdir:
        if not path.startswith(prefix):
            continue
        rel = path[len(prefix) :].lstrip("/")
        if not rel or ".." in rel.split("/"):
            return
        resolved = resolve_storage_file(subdir, rel)
        if not resolved:
            return
        try:
            os.remove(resolved)
            print(f"[STORAGE] Removed file: {resolved}")
        except OSError as e:
            print(f"[STORAGE] WARN: failed to remove {resolved}: {e}")
        return
    # 非受控前缀，忽略


def cleanup_task_image_files(task: dict, *, artwork_deleted: bool) -> None:
    """
    任务软删后按条件删除磁盘上的生成图、缩略图与参考图。
    - saved_as_template: 不删（模板仍引用 cover / 参考图）
    - 非删作品路径且 saved_as_artwork: 不删（作品仍引用生成图）
    """
    if task.get("saved_as_template"):
        return
    if not artwork_deleted and task.get("saved_as_artwork"):
        return

    urls: list[str] = []
    for key in ("image_url", "thumbnail_url"):
        v = task.get(key)
        if v:
            urls.append(v)
    refs = task.get("reference_images") or []
    if isinstance(refs, list):
        urls.extend(str(x) for x in refs if x)

    seen: set[str] = set()
    for raw in urls:
        if raw in seen:
            continue
        seen.add(raw)
        delete_file_for_public_url(raw)


async def save_reference_image(base64_data: str) -> str:
    """
    Saves a base64 encoded image to the custom storage directory under OBJECT_STORAGE_DIR.

    Args:
        base64_data: Base64 string of the image (with or without data prefix).

    Returns:
        The accessible URL path (e.g., /custom/filename.png).
    """
    storage_dir = Path(get_active_dir("custom"))
    storage_dir.mkdir(parents=True, exist_ok=True)

    mime_type = "image/png"
    if "," in base64_data:
        header, base64_data = base64_data.split(",", 1)
        if "image/jpeg" in header:
            mime_type = "image/jpeg"
        elif "image/webp" in header:
            mime_type = "image/webp"

    image_bytes = base64.b64decode(base64_data)

    ext = "png"
    if mime_type == "image/jpeg":
        ext = "jpg"
    elif mime_type == "image/webp":
        ext = "webp"

    filename = f"ref_{uuid.uuid4().hex}.{ext}"
    filepath = storage_dir / filename

    with open(filepath, "wb") as f:
        f.write(image_bytes)

    return f"/boltPaint/custom/{filename}"
