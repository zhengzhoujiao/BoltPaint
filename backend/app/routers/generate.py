from fastapi import APIRouter, HTTPException, Depends
from app.dependencies import get_current_user_id
from app.models import Artwork, ArtworkCreate, GenerationStatus, Task, TaskStatus, TaskType, ComicCreateRequest, ComicRedrawRequest, DEFAULT_ADVANCED_MODEL, GEMINI_IMAGE_MODELS, EVOLINK_IMAGE_MODELS, ALL_IMAGE_MODELS
from app.database import get_database
import json
from app.config import settings
from app.services.storage import resolve_storage_file
from app.routers.settings import get_dynamic_setting
from datetime import datetime
import httpx
import base64
import os
import uuid
from pathlib import Path
import asyncio
from typing import List, Optional

router = APIRouter(prefix="/generate", tags=["generate"])

# 漫画大师仅允许 Banana2 / BananaPro 计价策略（排除基础 Banana）
COMIC_ALLOWED_PRICING_STRATEGY_IDS = frozenset(("Banana2", "BananaPro"))

# 为模板生图解析计价策略
async def resolve_billing_strategy_for_template(
    db,
    template: dict,
    template_strategy: Optional[dict],
    eff_model_id: str,
    request: ArtworkCreate,
) -> tuple[dict, str]:
    """
    模板生图扣费策略：优先使用请求中的 pricing_strategy_id（须与 eff_model_id 一致），
    否则按 model_id 查找第一条计价策略，再回退到模板绑定策略（仅当其余模型一致时）。
    """
    tpl_ps_id = template.get("pricing_strategy_id", "BananaPro")

    if request.pricing_strategy_id:
        billing = await db.pricing_strategies.find_one({"id": request.pricing_strategy_id})
        if not billing:
            raise HTTPException(status_code=400, detail="计价策略不存在")
        if billing.get("model_id") != eff_model_id:
            raise HTTPException(status_code=400, detail="计价策略与所选生图模型不一致")
        return billing, billing["id"]

    cursor = db.pricing_strategies.find({"model_id": eff_model_id}).sort("id", 1)
    matches = await cursor.to_list(length=1)
    if matches:
        b = matches[0]
        return b, b["id"]

    if template_strategy and template_strategy.get("model_id") == eff_model_id:
        sid = template_strategy.get("id") or tpl_ps_id
        return template_strategy, sid

    raise HTTPException(
        status_code=400,
        detail=f"未找到模型 {eff_model_id} 对应的计价策略，请在管理后台配置定价策略",
    )

# 解析实际调用 Gemini 的 model_id
def resolve_generation_model_id(
    request: ArtworkCreate,
    template: Optional[dict],
    strategy: Optional[dict],
) -> str:
    """
    解析实际调用的 model_id。
    模板生图时：默认定价策略上的 model_id；若请求携带合法 model_id 则允许用户切换模型。
    """
    strat = strategy or {}
    strat_model = strat.get("model_id") or DEFAULT_ADVANCED_MODEL
    if strat_model not in ALL_IMAGE_MODELS:
        strat_model = DEFAULT_ADVANCED_MODEL

    if template:
        if request.model_id and request.model_id in ALL_IMAGE_MODELS:
            return request.model_id
        return strat_model

    rid = request.model_id if request.model_id in ALL_IMAGE_MODELS else None
    if rid:
        return rid
    return strat_model

# 保存图片到本地文件系统，并生成 WebP 缩略图
async def save_image_locally(base64_data: str, artwork_id: str) -> dict:
    """
    Save image under OBJECT_STORAGE_DIR and generate thumbnail (env, restart to apply).
    
    Args:
        base64_data: Base64 encoded image data (without prefix)
        artwork_id: Artwork ID
    
    Returns:
        Dict with 'image_url' and 'thumbnail_url'
    """
    try:
        from PIL import Image
        import io
        from app.services.storage import get_active_dir
        
        # Determine storage directory based on current settings
        storage_dir = Path(get_active_dir("generated"))
        storage_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        timestamp = int(datetime.utcnow().timestamp() * 1000)
        filename = f"{artwork_id}_{timestamp}.png"
        filepath = storage_dir / filename
        
        # Decode image
        image_bytes = base64.b64decode(base64_data)
        
        # Save original image
        with open(filepath, 'wb') as f:
            f.write(image_bytes)
        
        # Generate thumbnail (800px width, WebP, 85% quality)
        thumbnail_url = None
        try:
            # Open image with Pillow
            img = Image.open(io.BytesIO(image_bytes))
            
            # Calculate thumbnail size (max width 800px, maintain aspect ratio)
            max_width = 800
            if img.width > max_width:
                ratio = max_width / img.width
                new_height = int(img.height * ratio)
                img_resized = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            else:
                img_resized = img
            
            # Save as WebP
            thumb_filename = f"{artwork_id}_{timestamp}_thumb.webp"
            thumb_filepath = storage_dir / thumb_filename
            img_resized.save(thumb_filepath, 'WEBP', quality=85, method=6)
            
            thumbnail_url = f"/boltPaint/generated/{thumb_filename}"
            print(f"[THUMBNAIL] Generated: {thumb_filepath} ({thumb_filepath.stat().st_size // 1024}KB)")
        except Exception as e:
            print(f"[WARN] Failed to generate thumbnail: {e}")
        
        # Return accessible URLs
        image_url = f"/boltPaint/generated/{filename}"
        print(f"[SAVE] Image saved: {filepath}")
        
        return {
            "image_url": image_url,
            "thumbnail_url": thumbnail_url
        }
        
    except Exception as e:
        print(f"[ERROR] Failed to save image: {repr(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")

# 批量创建生图任务
@router.post("", response_model=List[Task])
async def generate_image(
    request: ArtworkCreate,
    user_id: str = Depends(get_current_user_id)
):
    """Generate image (creates a task and returns immediately)"""
    try:
        print(f"\n{'='*60}")
        print("[GENERATE] Starting image generation")
        print(f"[GENERATE] User ID: {user_id}")
        print(f"[GENERATE] Template ID: {request.template_id}")
        print(f"[GENERATE] Advanced: {request.model_id is not None and request.template_id is None}")
        prompt_preview = request.user_input_prompt[:50] if len(request.user_input_prompt) > 50 else request.user_input_prompt
        print(f"[GENERATE] Prompt: {prompt_preview}...")
        print(f"[GENERATE] Resolution: {request.resolution}")
        print(f"{'='*60}\n")
    except Exception as e:
        print(f"[ERROR] Error in logging: {repr(e)}")
    
    db = get_database()
    
    # 0. 维护模式检查
    maintenance_mode = await get_dynamic_setting("maintenance_mode", False)
    if maintenance_mode:
        raise HTTPException(
            status_code=503, 
            detail="System is currently under maintenance. Please try again later."
        )

    # 1. Check user balance
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # 1.5 单日限量检查（批量时整体检查）
    count = max(1, min(request.count, 10))
    limit_enabled = await get_dynamic_setting("daily_generation_limit_enabled", True)
    if limit_enabled:
        daily_limit = await get_dynamic_setting("daily_generation_limit", 100)
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_count = await db.tasks.count_documents({
            "user_id": user_id,
            "created_at": {"$gte": today_start}
        })
        if today_count + count > daily_limit:
            raise HTTPException(
                status_code=400,
                detail=f"本次批量生成（{count} 次）会超出今日配额（已用 {today_count}/{daily_limit}）。"
            )
    
    # 判断是否为高阶生图模式
    is_advanced = request.template_id is None or (request.model_id is not None and request.template_id is None)
    
    # 2. Get template configuration (or use advanced generation defaults)
    template = None
    if request.template_id:
        template = await db.templates.find_one({"id": request.template_id})
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
    elif not request.model_id:
        raise HTTPException(status_code=400, detail="Either template_id or model_id must be provided")
        
    # 3. Get pricing strategy and calculate cost
    template_strategy: Optional[dict] = None
    if template:
        tpl_ps_id = template.get("pricing_strategy_id", "BananaPro")
        template_strategy = await db.pricing_strategies.find_one({"id": tpl_ps_id})
        if not template_strategy:
            template_strategy = await db.pricing_strategies.find_one({"id": "BananaPro"})
        eff_model_id = resolve_generation_model_id(request, template, template_strategy)
        strategy, pricing_strategy_id = await resolve_billing_strategy_for_template(
            db, template, template_strategy, eff_model_id, request
        )
    else:
        # 高阶生图：优先从模型表查关联策略，其次使用请求中指定的 pricing_strategy_id，最后回退 BananaPro
        eff_model_id = resolve_generation_model_id(request, template, None)
        image_model_doc = await db.image_models.find_one({"id": eff_model_id}) if eff_model_id else None
        if image_model_doc:
            pricing_strategy_id = image_model_doc.get("pricing_strategy_id", "BananaPro")
        else:
            pricing_strategy_id = getattr(request, 'pricing_strategy_id', None) or "BananaPro"
        strategy = await db.pricing_strategies.find_one({"id": pricing_strategy_id})
        if not strategy:
            strategy_cursor = db.pricing_strategies.find().limit(1)
            strategies_list = await strategy_cursor.to_list(length=1)
            strategy = strategies_list[0] if strategies_list else None
            pricing_strategy_id = strategy["id"] if strategy else "BananaPro"

    # 3.5 模型可用性检查 (针对已下线模型拦截)
    # 如果是内置模型（DB 中没有记录），则默认视为启用
    check_model_doc = await db.image_models.find_one({"id": eff_model_id})
    if check_model_doc and not check_model_doc.get("enabled", True):
        raise HTTPException(
            status_code=400,
            detail="当前所选生图模型已下线，请在配置中更换模型后重试"
        )

    # Calculate cost based on resolution
    raw_res = (request.resolution or "2K").strip()
    if raw_res == "512":
        raise HTTPException(
            status_code=400,
            detail="分辨率 512 已停用，请使用 1K、2K 或 4K",
        )
    res = raw_res.upper()
    if res == "1K":
        cost = strategy.get("price_1k", 5) if strategy else 5
    elif res == "4K":
        cost = strategy.get("price_4k", 40) if strategy else 40
    else:  # Default to 2K
        cost = strategy.get("price_2k", 10) if strategy else 10
        
    total_cost = cost * count
    
    # 计算最终要保存的参考图（如果是模板生图，过滤掉模板自带的图，只存用户传的）
    all_ref_images = request.base64_images or ([request.base64_image] if request.base64_image else [])
    if template:
        template_ref_images = template.get("reference_images", [])
        final_ref_images = [img for img in all_ref_images if img not in template_ref_images]
    else:
        final_ref_images = all_ref_images

    # 4. 原子扣费：条件更新确保余额充足，防止并发穿透
    deducted_user = await db.users.find_one_and_update(
        {"id": user_id, "balance_beans": {"$gte": total_cost}},
        {
            "$inc": {"balance_beans": -total_cost},
            "$set": {"updated_at": datetime.utcnow()}
        },
        return_document=True
    )
    if not deducted_user:
        raise HTTPException(
            status_code=400,
            detail=f"余额不足。本次生成共需 {total_cost} 豆（{count} 次 × {cost} 豆），当前余额 {user['balance_beans']} 豆。"
        )
    print(f"[OK] Deducted {total_cost} beans from user (count={count})")

    # 5. 批量创建任务记录并启动后台生图
    resolve_strategy = template_strategy if template else (strategy or {})
    created_tasks: List[Task] = []
    now = datetime.utcnow()
    for _ in range(count):
        task_id = f"task_{int(datetime.utcnow().timestamp() * 1000)}_{uuid.uuid4().hex[:6]}"
        task_data = {
            "id": task_id,
            "user_id": user_id,
            "template_id": request.template_id,
            "image_url": None,
            "thumbnail_url": None,
            "user_input_prompt": request.user_input_prompt,
            "aspect_ratio": request.aspect_ratio,
            "resolution": request.resolution,
            "is_release": False,
            "likes_count": 0,
            "tags": template.get("tags", []) if template else [],
            "status": TaskStatus.GENERATING,
            "progress": 0,
            "error_message": None,
            "is_advanced": is_advanced,
            "model_id": eff_model_id,
            "system_instruction": request.system_instruction,
            "reference_images": [],
            "saved_as_template": False,
            "saved_as_artwork": False,
            "pricing_strategy_id": pricing_strategy_id,
            "created_at": now,
            "updated_at": now,
        }
        await db.tasks.insert_one(task_data)
        print(f"[OK] Task created: {task_id}")
        asyncio.create_task(process_generation_task(task_id, request, template, resolve_strategy or {}, user_id, cost, final_ref_images))
        task_data["_id"] = str(task_data.get("_id", ""))
        created_tasks.append(Task(**task_data))

    # 6. 返回所有创建的任务
    return created_tasks

# 更新任务进度
async def update_task_progress(task_id: str, progress: int):
    """Update task progress in database"""
    db = get_database()
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"progress": progress, "updated_at": datetime.utcnow()}}
    )

# 根据 model_id 构建 Gemini 生图 API 完整 URL
# Gemini 模型 API 端点 base（不含 key）
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# 根据 model_id 构建 Gemini 生图 API 完整 URL
def _get_gemini_api_url(model_id: str, api_key: str) -> str:
    """根据 model_id 构建 Gemini 生图 API 完整 URL"""
    m = model_id if model_id in GEMINI_IMAGE_MODELS else DEFAULT_ADVANCED_MODEL
    return f"{GEMINI_API_BASE}/{m}:generateContent?key={api_key}"

# ─── URL 规范化工具 ──────────────────────────────────────────────────

def _normalize_image_url(url: str) -> str:
    """将内部相对路径转为外部可访问的完整 URL，Evolink 要求 http(s) 开头"""
    if not url:
        return url
    u = url.strip()
    if u.startswith("http://") or u.startswith("https://"):
        return u
    if u.startswith("/"):
        base = settings.public_base_url.rstrip("/")
        return f"{base}{u}"
    # 裸相对路径（无前导 /），按 custom 目录处理
    base = settings.public_base_url.rstrip("/")
    return f"{base}/boltPaint/custom/{u.lstrip('/')}"


# ─── Evolink 中转站 API ───────────────────────────────────────────────

EVOLINK_API_BASE = "https://api.evolink.ai"


def _is_evolink_model(model_id: str) -> bool:
    return model_id in EVOLINK_IMAGE_MODELS


def _evolink_auth_headers(api_key: str) -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


async def _create_evolink_image_task(
    model_id: str,
    prompt: str,
    size: str,
    api_key: str,
    quality_param: Optional[str] = None,
    quality_value: Optional[str] = None,
    image_urls: Optional[List[str]] = None,
) -> str:
    """创建 Evolink 异步生图任务，返回 task_id"""
    base_url = settings.evolink_api_base_url.rstrip("/")
    url = f"{base_url}/v1/images/generations"

    body: dict = {
        "model": model_id,
        "prompt": prompt,
        "size": size,
    }
    if quality_param and quality_value:
        body[quality_param] = quality_value
    if image_urls:
        body["image_urls"] = image_urls

    print(f"[EVOLINK] Creating task: model={model_id}, size={size}" +
          (f", {quality_param}={quality_value}" if quality_param else "") +
          (f", image_urls={len(image_urls)}" if image_urls else ""))
    print(f"[EVOLINK] Prompt preview: {prompt[:100]}...")

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=body, headers=_evolink_auth_headers(api_key))

    if resp.status_code != 200:
        error_detail = f"HTTP {resp.status_code}"
        try:
            err_body = resp.json()
            error_detail = err_body.get("error", {}).get("message", error_detail)
        except Exception:
            error_detail = resp.text[:300] or error_detail
        raise Exception(f"Evolink 创建任务失败: {error_detail}")

    data = resp.json()
    evolink_task_id = data.get("id")
    if not evolink_task_id:
        raise Exception(f"Evolink 响应缺少 task id: {data}")

    print(f"[EVOLINK] Task created: {evolink_task_id}, status={data.get('status')}")
    return evolink_task_id


async def _poll_evolink_task(
    evolink_task_id: str,
    api_key: str,
    local_task_id: str,
    poll_interval: float = 3.0,
    max_wait: float = 300.0,
) -> list[str]:
    """轮询 Evolink 任务直到完成，返回 results URL 列表"""
    base_url = settings.evolink_api_base_url.rstrip("/")
    url = f"{base_url}/v1/tasks/{evolink_task_id}"

    elapsed = 0.0
    while elapsed < max_wait:
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=_evolink_auth_headers(api_key))

        if resp.status_code != 200:
            print(f"[EVOLINK] Poll error HTTP {resp.status_code}: {resp.text[:200]}")
            continue

        data = resp.json()
        status = data.get("status", "")
        progress = data.get("progress", 0)

        # 更新本地任务进度 (映射 20→85 区间)
        local_progress = 20 + int(progress * 0.65)
        await update_task_progress(local_task_id, local_progress)

        print(f"[EVOLINK] Poll: status={status}, progress={progress}%, elapsed={elapsed:.0f}s")

        if status == "completed":
            results = data.get("results", [])
            if not results:
                raise Exception("Evolink 任务完成但无结果")
            print(f"[EVOLINK] Task completed, {len(results)} result(s)")
            return results

        if status == "failed":
            error_msg = data.get("error", {}).get("message", "未知错误")
            raise Exception(f"Evolink 任务失败: {error_msg}")

        if status == "cancelled":
            raise Exception("Evolink 任务被取消")

    raise Exception(f"Evolink 任务超时（>{max_wait}s）")


async def _download_image_to_base64(image_url: str) -> str:
    """从 URL 下载图片并转为 base64 字符串（不含 data: 前缀）"""
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(image_url, follow_redirects=True)
        if resp.status_code != 200:
            raise Exception(f"下载图片失败: HTTP {resp.status_code}")
        return base64.b64encode(resp.content).decode()

async def _process_evolink_generation_task(
    task_id: str,
    model_id: str,
    final_prompt: str,
    aspect_ratio: str,
    resolution: str,
    ref_image_urls: list[str],
    user_id: str,
    cost: int,
    db,
):
    """Evolink 中转站异步生图流程：创建任务 → 轮询 → 下载 → 保存"""
    api_key = await get_dynamic_setting("evolink_api_key", settings.evolink_api_key)
    api_key = (api_key or "").strip()
    if not api_key:
        raise Exception("Evolink API key 未配置，请在 .env 中设置 EVOLINK_API_KEY 或在管理后台配置")

    model_info = EVOLINK_IMAGE_MODELS.get(model_id, {})
    quality_param = model_info.get("quality_param")
    supports_ref = model_info.get("supports_image_urls", False)

    # 构建 Evolink API 参数
    quality_value = None
    if quality_param and resolution:
        ru = resolution.strip().upper()
        if ru in ("1K", "2K", "4K"):
            quality_value = ru

    image_urls = None
    if supports_ref and ref_image_urls:
        # 将内部相对路径转为完整 URL，Evolink 要求 http(s) 开头
        image_urls = [_normalize_image_url(u) for u in ref_image_urls]

    print(f"[EVOLINK] Starting: model={model_id}, size={aspect_ratio}" +
          (f", {quality_param}={quality_value}" if quality_value else "") +
          (f", refs={len(image_urls)}" if image_urls else ""))

    # 1. 创建 Evolink 异步任务
    await update_task_progress(task_id, 15)
    evolink_task_id = await _create_evolink_image_task(
        model_id, final_prompt, aspect_ratio, api_key,
        quality_param=quality_param,
        quality_value=quality_value,
        image_urls=image_urls,
    )

    # 2. 轮询直到完成
    await update_task_progress(task_id, 20)
    result_urls = await _poll_evolink_task(evolink_task_id, api_key, task_id)

    # 3. 下载结果图片
    await update_task_progress(task_id, 85)
    if not result_urls:
        raise Exception("Evolink 未返回任何结果图片")

    result_url = result_urls[0]
    print(f"[EVOLINK] Downloading result: {result_url}")
    image_base64 = await _download_image_to_base64(result_url)

    # 4. 保存到本地
    await update_task_progress(task_id, 90)
    result = await save_image_locally(image_base64, task_id)
    image_url = result["image_url"]
    thumbnail_url = result["thumbnail_url"]

    # 5. 更新任务为完成
    await db.tasks.update_one(
        {"id": task_id},
        {
            "$set": {
                "image_url": image_url,
                "thumbnail_url": thumbnail_url,
                "status": TaskStatus.COMPLETED,
                "progress": 100,
                "updated_at": datetime.utcnow(),
            }
        },
    )
    print(f"[EVOLINK] Task completed: {task_id}")

    return image_url, thumbnail_url


# 后台生图
async def process_generation_task(task_id: str, request: ArtworkCreate, template: Optional[dict], strategy: dict, user_id: str, cost: int, raw_images: list[str]):
    """后台生图。template 存在时 strategy 为模板绑定策略（用于解析默认 model）；扣费已在主流程按所选模型映射策略完成。"""
    db = get_database()

    try:
        # 1. Start preparation (10%)
        await update_task_progress(task_id, 10)

        # 1.5 处理并保存参考图（在后台执行，不阻塞 API 响应）
        from app.services.storage import save_reference_image
        final_ref_image_urls = []
        for img_raw in raw_images:
            if img_raw.startswith("data:image") or (len(img_raw) > 100 and "," not in img_raw and not img_raw.startswith("/")):
                try:
                    # 只有在模板生图时，才需要检查是否为模板自带图（已经在 generate_image 中过滤过了，这里直接存）
                    url = await save_reference_image(img_raw)
                    final_ref_image_urls.append(url)
                    print(f"[BG-IMAGE] Saved base64 to custom: {url}")
                except Exception as e:
                    print(f"[BG-ERROR] Failed to save reference image: {e}")
                    final_ref_image_urls.append(img_raw)
            else:
                final_ref_image_urls.append(img_raw)
        
        # 更新任务中的参考图链接
        if final_ref_image_urls:
            await db.tasks.update_one(
                {"id": task_id},
                {"$set": {"reference_images": final_ref_image_urls, "updated_at": datetime.utcnow()}}
            )
        
        model_id = resolve_generation_model_id(request, template, strategy or {})

        if request.model_id and not request.template_id:
            system_instr = request.system_instruction or ""
            preset_prompt = ""
        elif template:
            system_instr = template.get('system_instruction', '')
            preset_prompt = template.get('preset_prompt', '')
        else:
            system_instr = ""
            preset_prompt = ""
        
        # Build final prompt
        final_prompt = f"{system_instr}\n{preset_prompt}\n{request.user_input_prompt}".strip()

        # ── Evolink 中转站生图（统一异步协议）──
        # 安全转换 aspect_ratio 为字符串（兼容 str Enum 和纯字符串）
        eff_aspect = getattr(request.aspect_ratio, 'value', None) or str(request.aspect_ratio)
        print(f"--- Calling Evolink API (model: {model_id}) ---")
        print(f"Prompt: {final_prompt[:100]}...")
        print(f"Aspect Ratio: {eff_aspect}, Resolution: {request.resolution}")
        await _process_evolink_generation_task(
            task_id, model_id, final_prompt,
            eff_aspect, request.resolution,
            final_ref_image_urls, user_id, cost, db,
        )

        # 更新模板使用量（生图成功后 +1）——高阶生图无模板，不计入
        if template:
            await db.templates.update_one(
                {"id": template["id"]},
                {"$inc": {"use_count": 1}, "$set": {"updated_at": datetime.utcnow()}},
            )
            print(f"[OK] Template use_count incremented: {template['id']}")

    except Exception as e:
        # Update task status to failed and refund beans
        error_msg = str(e) if str(e) else f"{type(e).__name__}"
        print(f"[ERROR] Task failed: {task_id}, Error: {error_msg}")
        
        # 1. Update task status
        await db.tasks.update_one(
            {"id": task_id},
            {
                "$set": {
                    "status": TaskStatus.FAILED,
                    "error_message": error_msg,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # 2. Refund beans to user
        try:
            await db.users.update_one(
                {"id": user_id},
                {
                    "$inc": {"balance_beans": cost},
                    "$set": {"updated_at": datetime.utcnow()}
                }
            )
            print(f"[REFUND] Refunded {cost} beans to user {user_id} due to generation failure")
        except Exception as refund_error:
            print(f"[CRITICAL] Failed to refund beans to user {user_id}: {repr(refund_error)}")

# 将完成任务转换为作品
@router.post("/{task_id}/to-artwork", response_model=Artwork)
async def task_to_artwork(task_id: str, user_id: str = Depends(get_current_user_id)):
    """Convert completed task to artwork (for saving/publishing)"""
    db = get_database()
    
    # Get task
    task = await db.tasks.find_one({"id": task_id, "user_id": user_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or unauthorized")
    
    if task["status"] != TaskStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Task is not completed yet")

    if task.get("saved_as_artwork"):
        raise HTTPException(status_code=400, detail="该任务已保存为作品，不能重复保存")

    dup = await db.artworks.find_one({"source_task_id": task_id})
    if dup:
        raise HTTPException(status_code=400, detail="该任务已对应作品记录，不能重复保存")

    # Get user and template info
    user = await db.users.find_one({"id": user_id})
    template = await db.templates.find_one({"id": task["template_id"]}) if task.get("template_id") else None
    
    # 提取多类型任务特有数据
    task_type = task.get("task_type", "image")
    comic_data_for_artwork = None
    image_url = task.get("image_url", "")
    thumbnail_url = task.get("thumbnail_url", "")
    
    if task_type == "comic":
        comic_data = task.get("comic_data", {})
        pages = comic_data.get("pages", [])
        
        if pages:
            cover_page = next((p for p in pages if p.get("is_cover")), pages[0])
            image_url = cover_page.get("image_url", "")
            thumbnail_url = cover_page.get("thumbnail_url", "")
            
        comic_data_for_artwork = {
            "pages": pages
        }
    
    # Create artwork from task
    artwork_id = f"art_{int(datetime.utcnow().timestamp() * 1000)}"
    artwork_data = {
        "id": artwork_id,
        "user_id": user_id,
        "user_avatar": (user.get("avatar") or user.get("user_image") or ""),
        "user_name": user.get("username", ""),
        "artwork_name": task.get("task_name", f"AI_Generated_{int(datetime.utcnow().timestamp())}"),
        "template_id": task.get("template_id"),
        "image_url": image_url,
        "thumbnail_url": thumbnail_url,
        "user_input_prompt": task.get("user_input_prompt", ""),
        "aspect_ratio": task.get("aspect_ratio", "1:1"),
        "resolution": task.get("resolution", "2K"),
        "is_release": task.get("is_release", False),
        "likes_count": 0,
        "status": GenerationStatus.COMPLETED,
        "tags": task.get("tags", []),
        "is_advanced": task.get("is_advanced", False),
        "model_id": task.get("model_id"),
        "system_instruction": task.get("system_instruction"),
        "reference_images": task.get("reference_images", []) if task.get("is_advanced") else [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "is_liked": False,
        "source_task_id": task_id,
        "task_type": task_type,
        "comic_data": comic_data_for_artwork,
    }

    result = await db.artworks.insert_one(artwork_data)
    artwork_data["_id"] = str(result.inserted_id)

    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"saved_as_artwork": True, "updated_at": datetime.utcnow()}},
    )

    print(f"[OK] Artwork created from task: {artwork_id}")
    
    return Artwork(**artwork_data)

# 模拟任务进度
async def simulate_progress(task_id: str, start: int, end: int, duration_sec: float):
    """Simulate progress increment while waiting for API"""
    try:
        current = float(start)
        num_updates = int(duration_sec)
        if num_updates <= 0: return
        
        increment = (end - start) / num_updates
        
        for _ in range(num_updates):
            await asyncio.sleep(1.0)
            current += increment
            await update_task_progress(task_id, int(current))
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"[WARN] Error in simulate_progress: {e}")


# 使用 gemini-3-flash-preview 对提示词进行 AI 润色，消耗 1 豆
@router.post("/polish-prompt")
async def polish_prompt(
    prompt: str,
    user_id: str = Depends(get_current_user_id),
):
    """使用 gemini-3-flash-preview 对提示词进行 AI 润色，消耗 1 豆"""
    db = get_database()

    # 1. 校验用户存在且余额充足
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.get("balance_beans", 0) < 1:
        raise HTTPException(status_code=400, detail="豆子余额不足，润色需要 1 豆")

    # 2. 调用 Gemini 文本 API 润色
    text_api_url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-3-flash-preview:generateContent"
    )
    api_key = settings.nano_banana_api_key
    polish_prompt_text = f"{prompt}；润色上面提示词，只需要返回一个具体的中文提示词；"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{text_api_url}?key={api_key}",
                json={
                    "contents": [{"parts": [{"text": polish_prompt_text}]}],
                    "generationConfig": {"thinkingConfig": {"thinkingLevel": "minimal"}},
                },
                headers={"Content-Type": "application/json"},
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Gemini API 调用失败: {resp.text}")
        data = resp.json()
        polished = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
            .strip()
        )
        if not polished:
            raise HTTPException(status_code=502, detail="Gemini 返回内容为空")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"润色请求失败: {str(e)}")

    # 3. 扣除 1 豆
    updated = await db.users.find_one_and_update(
        {"id": user_id, "balance_beans": {"$gte": 1}},
        {"$inc": {"balance_beans": -1}},
        return_document=True,
    )
    if not updated:
        raise HTTPException(status_code=400, detail="扣费失败，请刷新后重试")

    return {"polished_prompt": polished, "balance_beans": updated["balance_beans"]}

# 构建漫画脚本提示词
def build_comic_script_prompt(req: ComicCreateRequest) -> str:
    cover_schema = ""
    if req.generate_cover:
        if req.cover_title_mode == "custom" and req.custom_cover_title:
            theater_name_desc = f"必须固定使用名称：{req.custom_cover_title}（绝对不要修改这个名称）"
        else:
            theater_name_desc = "AI根据剧情生成的吸引人的中文剧场名称（作为封面标题）"
            
        cover_schema = f"""
  "theater_name": "{theater_name_desc}",
  "cover": {{
    "image_prompt": "根据全局剧情和主角设定，设计一张精美的单幅漫画封面。包含背景氛围、主角双人的核心互动姿势。要求带有海报/封面感。"
  }},"""

    return f"""你是一个专业的漫画分镜脚本编剧。请根据我的要求设计短篇漫画分镜脚本。
【基础信息】
- 漫画名称：{req.comic_title}
- 页数：{req.pages}页（每页固定4格分镜）
- 主角：{req.characters}
- 剧情风格：{req.plot}
- 核心约束：
  1. 绝对不要OOC；关于脸红的描述统一使用“微红”，耳根等身体其他部位不要有任何红色的描述。
  2. 角色一致性：必须在每一格的角色描述中，包含始终固定且极其详细的外貌、发型和服装设定（如：发色、瞳色、具体穿着的衣服款式和颜色），确保整部漫画所有分镜里的角色描述绝对一致。
  3. 场景一致性：在同一场景内，背景描述必须包含具体的环境细节、光影和色彩倾向，且在不同格之间保持高度统一，直到剧情发生场景转换。

【输出格式要求】
你必须且只能输出一个合法的 JSON 对象，不要输出任何其他的解释文字，不要使用 Markdown 的 ```json 代码块包裹。
JSON的结构必须严格遵守以下格式：
{{
  "comic_title": "{req.comic_title}",
  "total_pages": {req.pages},{cover_schema}
  "pages": [
    {{
      "page_number": 1,
      "panels": [
        {{
          "panel_number": 1,
          "background": "具体、详细的背景环境与光影描述（同一场景必须保持前后绝对一致）",
          "characters": "包含发型、瞳色、服装款式等具体细节的人物外貌及服装设定描述（所有分镜中同一角色的特征描述必须绝对一致）",
          "layout_position": "人物在画面中的具体位置说明，必须明确指明每个角色在画面的左边还是右边（如：XXX在画面左边，YYY在画面右边）",
          "camera": "镜头设计（如：中景 Medium Shot，双人镜头...）",
          "expression_action": "表情与动作的详细描述",
          "dialogues": [
            {{
              "speaker": "角色名",
              "text": "对话内容（注意：只需输出角色的原话，严禁包含角色姓名、冒号或任何旁白说明）"
            }}
          ]
        }}
      ]
    }}
  ]
}}
请开始生成符合上述要求的 JSON 数据："""

# 组装图片提示词
def assemble_image_prompt(page: dict) -> str:
    prompt = ""
    for panel in page.get("panels", []):
        prompt += f"第{panel.get('panel_number')}格：\n"
        prompt += f"背景：{panel.get('background', '')}\n"
        prompt += f"人物角色：{panel.get('characters', '')}\n"
        prompt += f"人物位置：{panel.get('layout_position', '')}\n"
        prompt += f"镜头：{panel.get('camera', '')}\n"
        prompt += f"表情与动作：{panel.get('expression_action', '')}\n"
        
        dialogues = panel.get('dialogues', [])
        if dialogues:
            prompt += "人物对话：\n" 
            for d in dialogues:
                dialogue_text = d.get('text', '').strip()
                speaker_name = d.get('speaker', '')
                if "：" in dialogue_text:
                    dialogue_text = dialogue_text.split("：")[-1].strip()
                elif ":" in dialogue_text:
                    dialogue_text = dialogue_text.split(":")[-1].strip()
                prompt += f"- {speaker_name}的气泡内容：{dialogue_text}\n"
        prompt += "\n"
    return prompt.strip()

# 漫画系统提示词
COMIC_SYSTEM_INSTRUCTION = """
## Role (角色设定)
你是一位世界顶级的全彩独立漫画家（Independent Comic Artist）。你的专长是精准解析结构化脚本，绘制出构图电影感强、角色画风统一、背景细节丰富的高质量垂直四格漫画原画（Original Clean Art）。画风为高质量的现代动漫风格，色彩明亮清晰。

## Objective (目标)
生成一张包含四个宽屏面板的垂直长图。

## Critical Guidelines (核心准则 - 必须严格执行)
1. **绝对无水印**：画面的任何角落绝对禁止出现任何中英文Logo、签名、网址或平台水印。
2. **肢体数量锁定**：时刻检查人物的人体结构。每个角色只有两条胳膊、两只手、十根手指。绝对禁止多余手臂、悬浮手或变异手指。

## 🔥 Text & Bubble Strict Rules (文字与气泡绝对法则 - 解决排版痛点)
为确保文字渲染完美，必须严格遵守以下4条法则：
1. **强制纯白气泡 (Mandatory Speech Bubbles)**：所有对话绝对不能以“字幕”形式悬浮在画面底部！必须绘制出带有黑色描边、内部填充纯白色的【漫画对话气泡】，将文字完全包裹在白色气泡内部。气泡必须带有指向说话者的“尾巴”。
2. **强制简体中文 (Chinese Language Lock)**：气泡内的文字必须100%是标准、清晰的【简体中文】。绝对禁止出现英文（English）、日文（Japanese）或无法辨认的乱码。
3. **剔除角色名 (Text Extraction - Content ONLY)**：渲染文字时，【绝对禁止】将角色的名字写在气泡里！如果输入是“炭治郎: 别放弃”，你只能在气泡内写“别放弃”三个字。忽略冒号及其前面的所有名字。
4. **防遮挡与排版**：左侧人物气泡在左，右侧人物气泡在右。文字在气泡内居中排版，严禁文字粘连、重复（防口吃），且气泡绝对不能遮挡角色的脸部五官。

## Structured Script Parsing (结构化脚本解析)
- **【背景】**：提取场景物件应用到所有四格，利用景深调整清晰度，绝对不留白。
- **【人物角色】**：锁定角色特征，四格内保持100%视觉一致性。
- **【人物位置】**：严格遵循“左/中/右”站位放置人物，绝不能颠倒。

## Visual Structure: Vertical Cinematic Strip (视觉结构)
- **布局**：单列四行（1 Column x 4 Rows）的垂直堆叠布局。
- **格式**：每个格子为宽屏长方形（16:9），格子间必须有干净的纯白间隙（White Gutter），禁止画面上下粘连。
"""

# 更新任务进度和阶段
async def update_task_progress_and_phase(task_id: str, progress: int, phase: str):
    db = get_database()
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {
            "progress": progress, 
            "progress_phase": phase, 
            "updated_at": datetime.utcnow()
        }}
    )

# 处理漫画生成任务
async def process_comic_generation_task(task_id: str, request: ComicCreateRequest, user_id: str, cost: int, model_id: str = "gemini-3-pro-image-preview"):
    db = get_database()
    try:
        await update_task_progress_and_phase(task_id, 5, "脚本生成阶段")
        
        api_key = await get_dynamic_setting("gemini_api_key", settings.nano_banana_api_key)
        if not api_key:
            raise Exception("系统未配置 Gemini API Key")
            
        # 1. 调用 Gemini Flash 生成漫画脚本 (增加重试机制与超时控制)
        text_api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key={api_key}"
        script_prompt = build_comic_script_prompt(request)
        
        max_retries = 3
        comic_script = None
        last_error = None
        
        print(f"\n[COMIC] >>> 开始漫画剧本生成任务: {task_id}")
        for attempt in range(max_retries):
            try:
                phase_msg = f"脚本生成中..."
                if attempt > 0:
                    print(f"[COMIC] 脚本生成重试第 {attempt} 次...")
                    await asyncio.sleep(2)  # 重试前等待2秒
                
                # 实时更新数据库状态，防止界面看起来像卡死
                await update_task_progress_and_phase(task_id, 5, phase_msg)
                
                print(f"[COMIC] {datetime.utcnow().strftime('%H:%M:%S')} 正式向 Gemini 发起请求 (Timeout=300s)...")
                import time
                start_time = time.time()
                
                async with httpx.AsyncClient(timeout=300) as client:
                    resp = await client.post(
                        text_api_url,
                        json={
                            "contents": [{"parts": [{"text": script_prompt}]}],
                            "generationConfig": {"temperature": 0.7}
                        }
                    )
                
                duration = time.time() - start_time
                print(f"[COMIC] {datetime.utcnow().strftime('%H:%M:%S')} 接口返回，耗时 {duration:.2f}s，状态码: {resp.status_code}")
                
                if resp.status_code != 200:
                    raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")
                    
                data = resp.json()
                
                # Check for standard prompt feedback / safety block
                if "promptFeedback" in data and data["promptFeedback"].get("blockReason"):
                    block_reason = data["promptFeedback"]["blockReason"]
                    raise Exception(f"提示词被 API 安全策略拦截: {block_reason}")
                
                candidates = data.get("candidates", [])
                if not candidates:
                    raise Exception(f"未返回生成结果 (可能被安全策略静默拦截)，原始响应: {json.dumps(data, ensure_ascii=False)}")
                
                candidate = candidates[0]
                if candidate.get("finishReason") == "SAFETY":
                    raise Exception(f"生成内容因安全审核被拦截 (SAFETY)。")
                
                raw_text = candidate.get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                if not raw_text:
                    raise Exception("返回的正文内容为空")
                    
                # 提取 JSON（防止含有 markdown 代码块）
                if "```json" in raw_text:
                    raw_text = raw_text.split("```json")[1].split("```")[0].strip()
                elif "```" in raw_text:
                    raw_text = raw_text.split("```")[1].split("```")[0].strip()
                    
                try:
                    comic_script = json.loads(raw_text)
                    print(f"[COMIC] 脚本解析成功！准备进入画图阶段。")
                    break  # 成功，跳出循环
                except Exception as e:
                    print(f"[ERROR] 无法解析 JSON 内容: {raw_text[:200]}...")
                    raise Exception(f"脚本 JSON 格式错误: {e}")
                    
            except Exception as ex:
                last_error = ex
                # 记录更详细的异常信息，防止 str(ex) 为空
                err_msg = str(ex) if str(ex) else f"{type(ex).__name__}"
                if isinstance(ex, httpx.TimeoutException):
                    err_msg = "请求 Gemini API 超时，请检查网络或重试"
                elif isinstance(ex, httpx.ConnectError):
                    err_msg = "网络连接异常 (ConnectError)，请检查代理或 API 地址"
                
                print(f"[WARN] 脚本生成阶段异常 (第 {attempt + 1} 次): {err_msg}")
                
        if not comic_script:
            # 最终失败才抛出异常，触发全局退费逻辑
            raise Exception(f"脚本生成阶段经过 {max_retries} 次重试仍未成功。错误详情: {str(last_error)}")
            
        await update_task_progress_and_phase(task_id, 20, "图形绘制阶段")
        
        comic_data = {
            "script": comic_script,
            "pages": []
        }
        
        # 2. 遍历页数，调用生图模型生成图片
        total_pages = min(len(comic_script.get("pages", [])), request.pages)
        image_model = model_id
        
        # 组装共用的 imageConfig (处理分辨率)
        _minfo = GEMINI_IMAGE_MODELS.get(image_model, {})
        image_config = {
            "aspectRatio": request.aspect_ratio.value if hasattr(request.aspect_ratio, 'value') else request.aspect_ratio
        }
        if not _minfo.get("is_flash") and getattr(request, "resolution", None):
            ru = request.resolution.strip().upper()
            if ru in ["1K", "2K", "4K"]:
                image_config["imageSize"] = ru
        
        # 2.1 检查是否需要生成封面图
        if request.generate_cover and comic_script.get("cover") and comic_script["cover"].get("image_prompt"):
            await update_task_progress_and_phase(task_id, 20, "生成封面图中...")
            
            theater_name = comic_script.get("theater_name", request.comic_title)
            cover_prompt = comic_script["cover"]["image_prompt"]
            print(f"[COMIC] Generating cover: {theater_name}")
            
            # 封面专用的系统指令
            cover_system_instruction = """Role (角色设定)
你是一位世界顶级的全彩独立漫画海报画师。你的专长是根据剧情要求绘制一张精美的单幅漫画封面海报。
Objective (目标)
生成一张高水准的单幅漫画封面插图。
核心要求：
1. 画面必须包含“中文剧名文字”：请将剧名以精美的艺术字形式渲染在画面的显著位置（通常是顶部或底部）。
2. 画面必须是纯净原画，绝对禁止任何平台水印和奇怪的中英文字符。
3. 画面只有一整幅，严禁进行分镜切割，严禁出现四格漫画排版。
4. 确保角色画风和特征准确，构图具有海报感和视觉张力。"""

            # 组装请求
            api_url = _get_gemini_api_url(image_model, api_key)
            req_body = {
                "contents": [{"role": "user", "parts": [
                    {"text": f"{cover_system_instruction}\n\n剧名文字：《{theater_name}》\n画面描述要求：{cover_prompt}\n\n请严格在画面中渲染出剧名文字《{theater_name}》。"}
                ]}],
                "generationConfig": {
                    "responseModalities": ["IMAGE"],
                    "imageConfig": image_config
                }
            }
            
            async with httpx.AsyncClient(timeout=300) as img_client:
                img_resp = await img_client.post(api_url, json=req_body)
                
            if img_resp.status_code == 200:
                img_data = img_resp.json()
                candidates = img_data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    last_image_data = None
                    for p in parts:
                        inline = p.get("inlineData") or p.get("inline_data")
                        if inline and "data" in inline:
                            last_image_data = inline["data"]
                    
                    if last_image_data:
                        saved_info = await save_image_locally(last_image_data, f"{task_id}_cover")
                        comic_data["pages"].append({
                            "page_number": 0,
                            "is_cover": True,
                            "theater_name": theater_name,
                            "image_url": saved_info["image_url"],
                            "thumbnail_url": saved_info["thumbnail_url"],
                            "prompt": cover_prompt
                        })
                        print(f"[OK] 封面图生成成功")
                    else:
                        print(f"[WARN] 封面图未提取到图像数据")
                else:
                    print(f"[WARN] 封面图返回结果为空")
            else:
                print(f"[WARN] 封面图生成失败: HTTP {img_resp.status_code}")
                
        # 2.2 两页一组并行生成正式页
        async with httpx.AsyncClient(timeout=300) as img_client:
            async def generate_individual_page(i: int, page: dict):
                page_number = page.get("page_number", i + 1)
                image_prompt = assemble_image_prompt(page)
                print(f"[COMIC] Page {page_number} prompt:\n{image_prompt}")
                
                api_url = _get_gemini_api_url(image_model, api_key)
                req_body = {
                    "contents": [{"role": "user", "parts": [
                        {"text": f"{COMIC_SYSTEM_INSTRUCTION}\n\n{image_prompt}"}
                    ]}],
                    "generationConfig": {
                        "responseModalities": ["IMAGE"],
                        "imageConfig": image_config
                    }
                }
                
                try:
                    img_resp = await img_client.post(api_url, json=req_body)
                    if img_resp.status_code != 200:
                        raise Exception(f"HTTP {img_resp.status_code}: {img_resp.text[:200]}")
                    
                    img_data = img_resp.json()
                    candidates = img_data.get("candidates", [])
                    if not candidates:
                        raise Exception("返回结果为空")
                    
                    parts = candidates[0].get("content", {}).get("parts", [])
                    last_image_data = None
                    for p in parts:
                        inline = p.get("inlineData") or p.get("inline_data")
                        if inline and "data" in inline:
                            last_image_data = inline["data"]
                            
                    if not last_image_data:
                        raise Exception("未提取到图像数据")
                    
                    saved_info = await save_image_locally(last_image_data, f"{task_id}_page_{page_number}")
                    
                    return {
                        "page_number": page_number,
                        "image_url": saved_info["image_url"],
                        "thumbnail_url": saved_info["thumbnail_url"],
                        "prompt": image_prompt,
                        "success": True
                    }
                except Exception as ex:
                    # 这里的错误信息如果为空，也要补齐
                    err_msg = str(ex) if str(ex) else f"{type(ex).__name__}"
                    print(f"[ERROR] 漫画第 {page_number} 页生成失败: {err_msg}")
                    return {
                        "page_number": page_number,
                        "prompt": image_prompt,
                        "success": False,
                        "error": err_msg
                    }

            formal_pages = comic_script.get("pages", [])[:total_pages]
            failed_pages_count = 0
            
            for batch_start in range(0, len(formal_pages), 2):
                batch = formal_pages[batch_start:batch_start+2]
                await update_task_progress_and_phase(
                    task_id, 
                    20 + int(80 * (batch_start / total_pages)), 
                    f"图形绘制阶段"
                )
                
                tasks = [generate_individual_page(batch_start + j, page) for j, page in enumerate(batch)]
                results = await asyncio.gather(*tasks)
                
                for res in results:
                    if res.get("success"):
                        comic_data["pages"].append({
                            "page_number": res["page_number"],
                            "image_url": res["image_url"],
                            "thumbnail_url": res["thumbnail_url"],
                            "prompt": res["prompt"]
                        })
                    else:
                        failed_pages_count += 1
                        comic_data["pages"].append({
                            "page_number": res["page_number"],
                            "prompt": res["prompt"],
                            "redraw_error": res.get("error", "未知错误")
                        })
            
        # 取第一张成功的图作为任务封面（如果在0页没被设置的话，虽然对于漫画列表展示通常取 pages 里第一张有图的）
        cover_url = next((p.get("image_url") for p in comic_data["pages"] if p.get("image_url")), None)
        cover_thumb = next((p.get("thumbnail_url") for p in comic_data["pages"] if p.get("thumbnail_url")), None)
            
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {
                "comic_data": comic_data,
                "image_url": cover_url,
                "thumbnail_url": cover_thumb,
                "status": TaskStatus.COMPLETED,
                "progress": 100,
                "progress_phase": "生成完成",
                "updated_at": datetime.utcnow()
            }}
        )
        print(f"[OK] 漫画任务完成: {task_id}")

        if failed_pages_count > 0:
            price_per_page = 10
            if cost > 0:
                is_cover = request.generate_cover
                total_cost_pages = total_pages + (1 if is_cover else 0)
                if total_cost_pages > 0:
                    price_per_page = cost // total_cost_pages
            
            refund_amount = failed_pages_count * price_per_page
            if refund_amount > 0:
                await db.users.update_one(
                    {"id": user_id},
                    {"$inc": {"balance_beans": refund_amount}}
                )
                print(f"[REFUND] 漫画部分失败，已退还 {refund_amount} 豆 (失败页数: {failed_pages_count})")
            
    except Exception as e:
        # 记录更详细的失败详情，防止 str(e) 为空导致不知道为什么报错
        err_detail = str(e) if str(e) else f"{type(e).__name__}"
        print(f"[ERROR] 漫画任务失败 {task_id}: {err_detail}")
        
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {
                "status": TaskStatus.FAILED,
                "error_message": err_detail,
                "progress_phase": "生成失败",
                "updated_at": datetime.utcnow()
            }}
        )
        # 退回豆子
        await db.users.update_one(
            {"id": user_id},
            {"$inc": {"balance_beans": cost}}
        )

# 处理漫画单页重绘任务
async def process_comic_page_redraw(task_id: str, user_id: str, page_index: int, page_number: int, prompt: str, is_cover: bool, aspect_ratio: str, cost: int, model_id: str = "gemini-3-pro-image-preview", resolution: str = "2K"):
    """后台单页重绘任务"""
    db = get_database()
    try:
        api_key = await get_dynamic_setting("gemini_api_key", settings.nano_banana_api_key)
        if not api_key:
            raise Exception("系统未配置 Gemini API Key")

        image_model = model_id
        api_url = _get_gemini_api_url(image_model, api_key)

        _minfo = GEMINI_IMAGE_MODELS.get(image_model, {})
        image_config = {"aspectRatio": aspect_ratio}
        if not _minfo.get("is_flash") and resolution:
            ru = resolution.strip().upper()
            if ru in ["1K", "2K", "4K"]:
                image_config["imageSize"] = ru

        if is_cover:
            # 封面重绘：尝试从任务中找回剧名，确保重绘出的封面依然包含指定的名称
            theater_name = ""
            task = await db.tasks.find_one({"id": task_id})
            if task:
                # 优先从用户最初输入找（最准）
                comic_input = task.get("comic_input", {})
                if comic_input.get("cover_title_mode") == "custom":
                    theater_name = comic_input.get("custom_cover_title") or ""
                
                # 其次从已生成的脚本中找
                if not theater_name:
                    comic_data_db = task.get("comic_data", {})
                    theater_name = (comic_data_db.get("script") or {}).get("theater_name") or ""
            
            # 如果依然没找到剧名，回退到任务名称
            if not theater_name and task:
                theater_name = task.get("task_name") or ""

            system_instruction = """Role (角色设定)
你是一位世界顶级的全彩独立漫画海报画师。你的专长是根据剧情要求绘制一张精美的单幅漫画封面海报。
Objective (目标)
生成一张高水准的单幅漫画封面插图。
核心要求：
1. 画面必须包含"中文剧名文字"：请将剧名以精美的艺术字形式渲染在画面的显著位置（通常是顶部或底部）。
2. 画面必须是纯净原画，绝对禁止任何平台水印和奇怪的中英文字符。
3. 画面只有一整幅，严禁进行分镜切割，严禁出现四格漫画排版。
4. 确保角色画风和特征准确，构图具有海报感和视觉张力。"""
            
            full_prompt = f"{system_instruction}\n\n剧名文字：《{theater_name}》\n画面描述要求：{prompt}\n\n请严格在画面中渲染出剧名文字《{theater_name}》。" if theater_name else f"{system_instruction}\n\n{prompt}"
        else:
            system_instruction = COMIC_SYSTEM_INSTRUCTION
            full_prompt = f"{system_instruction}\n\n{prompt}"

        req_body = {
            "contents": [{"role": "user", "parts": [
                {"text": full_prompt}
            ]}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": image_config
            }
        }

        async with httpx.AsyncClient(timeout=300) as img_client:
            img_resp = await img_client.post(api_url, json=req_body)

        if img_resp.status_code != 200:
            raise Exception(f"生图失败: HTTP {img_resp.status_code}")

        img_data = img_resp.json()
        candidates = img_data.get("candidates", [])
        if not candidates:
            raise Exception("生图返回结果为空")

        parts = candidates[0].get("content", {}).get("parts", [])
        last_image_data = None
        for p in parts:
            inline = p.get("inlineData") or p.get("inline_data")
            if inline and "data" in inline:
                last_image_data = inline["data"]

        if not last_image_data:
            raise Exception("未提取到图像数据")

        suffix = "cover" if is_cover else f"page_{page_number}"
        saved_info = await save_image_locally(last_image_data, f"{task_id}_{suffix}_redraw_{int(datetime.utcnow().timestamp())}")

        # 重新读取任务以获得最新的 comic_data（防止并发覆盖）
        task = await db.tasks.find_one({"id": task_id})
        if not task:
            raise Exception("Task not found after redraw")

        old_image_url = None
        old_thumbnail_url = None
        
        comic_data = task["comic_data"]
        if page_index < len(comic_data["pages"]):
            old_image_url = comic_data["pages"][page_index].get("image_url")
            old_thumbnail_url = comic_data["pages"][page_index].get("thumbnail_url")
            
            comic_data["pages"][page_index]["image_url"] = saved_info["image_url"]
            comic_data["pages"][page_index]["thumbnail_url"] = saved_info["thumbnail_url"]
            comic_data["pages"][page_index]["prompt"] = prompt
            comic_data["pages"][page_index]["is_redrawing"] = False
            comic_data["pages"][page_index].pop("redraw_error", None)

        update_fields: dict = {"comic_data": comic_data, "updated_at": datetime.utcnow()}
        # 任务列表缩略图使用根级 image_url/thumbnail_url，需与 comic_data 中「按数组顺序第一张有图」一致
        #（与漫画完成时的 cover_url 逻辑一致）。仅依赖 page_number==0 会在封面页码非 0 或 is_cover 与页码不一致时漏更新，
        # 旧 URL 随后被 delete_file_for_public_url 删除后列表会裂图。
        pages_list = comic_data.get("pages") or []
        list_thumb_url = next((p.get("image_url") for p in pages_list if p.get("image_url")), None)
        list_thumb = next((p.get("thumbnail_url") for p in pages_list if p.get("thumbnail_url")), None)
        if list_thumb_url:
            update_fields["image_url"] = list_thumb_url
            update_fields["thumbnail_url"] = list_thumb or list_thumb_url

        await db.tasks.update_one({"id": task_id}, {"$set": update_fields})
        from app.services.storage import delete_file_for_public_url
        if old_image_url:
            delete_file_for_public_url(old_image_url)
        if old_thumbnail_url:
            delete_file_for_public_url(old_thumbnail_url)
            
        print(f"[OK] 页面重绘完成: task={task_id}, page={page_number}")

    except Exception as e:
        err_msg = str(e) if str(e) else f"{type(e).__name__}"
        print(f"[ERROR] 页面重绘失败 task={task_id} page={page_number}: {err_msg}")
        await db.users.update_one({"id": user_id}, {"$inc": {"balance_beans": cost}})
        task = await db.tasks.find_one({"id": task_id})
        if task:
            comic_data = task.get("comic_data", {})
            pages = comic_data.get("pages", [])
            if page_index < len(pages):
                pages[page_index]["is_redrawing"] = False
                pages[page_index]["redraw_error"] = err_msg
                await db.tasks.update_one(
                    {"id": task_id},
                    {"$set": {"comic_data": comic_data, "updated_at": datetime.utcnow()}}
                )

# 重绘漫画中的某一页（或封面），按定价策略和分辨率计算豆子消耗
@router.post("/comic/{task_id}/redraw-page")
async def redraw_comic_page(task_id: str, request: ComicRedrawRequest, user_id: str = Depends(get_current_user_id)):
    """重绘漫画中的某一页（或封面），按定价策略和分辨率计算豆子消耗"""
    db = get_database()

    task = await db.tasks.find_one({"id": task_id, "user_id": user_id})
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.get("task_type") != "comic":
        raise HTTPException(status_code=400, detail="不是漫画任务")
    if task.get("status") != TaskStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="任务尚未完成，无法重绘")

    comic_data = task.get("comic_data")
    if not comic_data or not comic_data.get("pages"):
        raise HTTPException(status_code=400, detail="没有漫画数据")

    page_index = next(
        (i for i, p in enumerate(comic_data["pages"]) if p.get("page_number") == request.page_number),
        None
    )
    if page_index is None:
        raise HTTPException(status_code=404, detail=f"第 {request.page_number} 页不存在")

    if comic_data["pages"][page_index].get("is_redrawing"):
        raise HTTPException(status_code=400, detail="该页正在重绘中，请稍后再试")

    # 重绘固定沿用任务创建时的模型、分辨率与计价策略（不信任请求体覆盖）
    model_id = task.get("model_id") or "gemini-3-pro-image-preview"
    raw_res = task.get("resolution", "2K")
    if hasattr(raw_res, "value"):
        raw_res = raw_res.value
    res = str(raw_res or "2K").strip().upper()
    if res not in ("1K", "2K", "4K"):
        res = "2K"

    pricing_strategy_id = task.get("pricing_strategy_id")
    if not pricing_strategy_id:
        image_model_doc = await db.image_models.find_one({"id": model_id})
        pricing_strategy_id = (image_model_doc or {}).get("pricing_strategy_id", "BananaPro")

    strategy = await db.pricing_strategies.find_one({"id": pricing_strategy_id})
    if not strategy:
        raise HTTPException(status_code=400, detail=f"定价策略 '{pricing_strategy_id}' 不存在")
    if pricing_strategy_id not in COMIC_ALLOWED_PRICING_STRATEGY_IDS:
        raise HTTPException(
            status_code=400,
            detail="漫画大师仅支持 Banana2 与 BananaPro 模型，请更换模型后重试",
        )
    if res == "4K":
        cost = strategy.get("price_4k", 40)
    else:
        cost = strategy.get("price_2k", 10)

    deducted_user = await db.users.find_one_and_update(
        {"id": user_id, "balance_beans": {"$gte": cost}},
        {"$inc": {"balance_beans": -cost}, "$set": {"updated_at": datetime.utcnow()}},
        return_document=True
    )
    if not deducted_user:
        raise HTTPException(status_code=400, detail=f"余额不足，重绘需要 {cost} 豆")

    comic_data["pages"][page_index]["is_redrawing"] = True
    comic_data["pages"][page_index].pop("redraw_error", None)
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"comic_data": comic_data, "updated_at": datetime.utcnow()}}
    )

    is_cover = comic_data["pages"][page_index].get("is_cover", False)
    aspect_ratio = task.get("aspect_ratio", "9:16")
    if hasattr(aspect_ratio, "value"):
        aspect_ratio = aspect_ratio.value

    asyncio.create_task(process_comic_page_redraw(
        task_id, user_id, page_index, request.page_number, request.prompt, is_cover, aspect_ratio, cost, model_id, res
    ))

    return {"success": True, "message": "重绘任务已启动"}

# 生成漫画
@router.post("/comic", response_model=Task)
async def generate_comic(request: ComicCreateRequest, user_id: str = Depends(get_current_user_id)):
    db = get_database()

    # 从模型表查找模型配置，获取关联的定价策略
    image_model_doc = await db.image_models.find_one({"id": request.model_id})
    if image_model_doc:
        pricing_strategy_id = image_model_doc.get("pricing_strategy_id", "BananaPro")
        model_id = image_model_doc.get("id", "gemini-3-pro-image-preview")
    else:
        # 兼容旧环境：模型表尚未初始化，从 GEMINI_IMAGE_MODELS 取信息
        pricing_strategy_id = "BananaPro"
        model_id = request.model_id or "gemini-3-pro-image-preview"

    strategy = await db.pricing_strategies.find_one({"id": pricing_strategy_id})
    if not strategy:
        raise HTTPException(status_code=400, detail=f"定价策略 '{pricing_strategy_id}' 不存在")
    if pricing_strategy_id not in COMIC_ALLOWED_PRICING_STRATEGY_IDS:
        raise HTTPException(
            status_code=400,
            detail="漫画大师仅支持 Banana2 与 BananaPro 模型，请更换模型后重试",
        )

    # 按分辨率取单页价格
    res = (request.resolution or "2K").upper()
    if res == "4K":
        price_per_page = strategy.get("price_4k", 40)
    else:
        price_per_page = strategy.get("price_2k", 10)

    cost = price_per_page * request.pages
    if request.generate_cover:
        cost += price_per_page

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.get("balance_beans", 0) < cost:
        raise HTTPException(
            status_code=400,
            detail=f"余额不足。本次生成共需 {cost} 豆（{request.pages} 页 × {price_per_page} 豆/页），当前余额 {user['balance_beans']} 豆。"
        )

    deducted_user = await db.users.find_one_and_update(
        {"id": user_id, "balance_beans": {"$gte": cost}},
        {"$inc": {"balance_beans": -cost}, "$set": {"updated_at": datetime.utcnow()}},
        return_document=True
    )
    if not deducted_user:
        raise HTTPException(status_code=400, detail="扣费失败，请重试")

    # Create task
    task_id = f"task_{int(datetime.utcnow().timestamp() * 1000)}_{uuid.uuid4().hex[:6]}"
    now = datetime.utcnow()

    task_data = {
        "id": task_id,
        "user_id": user_id,
        "template_id": None,
        "image_url": None,
        "thumbnail_url": None,
        "user_input_prompt": f"【自动漫画生成】{request.comic_title} ({request.pages}页)",
        "aspect_ratio": request.aspect_ratio,
        "resolution": res,
        "is_release": False,
        "likes_count": 0,
        "tags": [],
        "status": TaskStatus.GENERATING,
        "progress": 0,
        "progress_phase": "准备中",
        "error_message": None,
        "is_advanced": True,
        "model_id": model_id,
        "system_instruction": None,
        "reference_images": [],
        "saved_as_template": False,
        "saved_as_artwork": False,
        "pricing_strategy_id": pricing_strategy_id,
        "created_at": now,
        "updated_at": now,
        "task_type": TaskType.COMIC,
        "task_name": request.comic_title,
        "comic_data": None,
        "comic_input": {
            "comic_title": request.comic_title,
            "characters": request.characters,
            "plot": request.plot,
            "pages": request.pages,
            "generate_cover": request.generate_cover,
            "cover_title_mode": request.cover_title_mode,
            "custom_cover_title": request.custom_cover_title,
        },
    }

    await db.tasks.insert_one(task_data)

    asyncio.create_task(process_comic_generation_task(task_id, request, user_id, cost, model_id))

    task_data["_id"] = str(task_data.get("_id", ""))
    return Task(**task_data)
