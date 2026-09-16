from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.dependencies import get_current_user_id
from app.database import get_database
from app.config import settings
from app.services.storage import get_active_dir
from app.routers.settings import get_dynamic_setting
from datetime import datetime
import httpx
import base64
import os
from pathlib import Path
from typing import Optional

router = APIRouter(prefix="/expansion", tags=["expansion"])


class ExpansionRequest(BaseModel):
    base64_image: str  # Pre-processed image with gray/color mask (with data URL prefix)
    prompt: str  # User prompt for AI expansion
    aspect_ratio: str  # e.g., "1:1", "3:4", "16:9"
    mode: Optional[str] = "ai"  # "ai", "prompt", or "color" (frontend filters "color")


class ExpansionResponse(BaseModel):
    image_url: str  # URL to the expanded image
    cost: int  # Beans deducted


async def save_expansion_image(base64_data: str) -> str:
    """
    Save expanded image under OBJECT_STORAGE_DIR (generated/)
    
    Args:
        base64_data: Base64 encoded image data (without prefix)
    
    Returns:
        Image URL
    """
    try:
        # Create storage directory
        storage_dir = Path(get_active_dir("generated"))
        storage_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        timestamp = int(datetime.utcnow().timestamp() * 1000)
        filename = f"expansion_{timestamp}.png"
        filepath = storage_dir / filename
        
        # Decode and save image
        image_bytes = base64.b64decode(base64_data)
        with open(filepath, 'wb') as f:
            f.write(image_bytes)
        
        # Return accessible URL
        image_url = f"/boltPaint/generated/{filename}"
        print(f"[EXPANSION] Image saved: {filepath}")
        
        return image_url
        
    except Exception as e:
        print(f"[ERROR] Failed to save expansion image: {repr(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")


@router.post("/generate", response_model=ExpansionResponse)
async def generate_expansion(
    request: ExpansionRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Generate image expansion using Gemini AI"""
    try:
        print(f"\n{'='*60}")
        print("[EXPANSION] Starting image expansion")
        print(f"[EXPANSION] User ID: {user_id}")
        print(f"[EXPANSION] Aspect Ratio: {request.aspect_ratio}")
        prompt_preview = request.prompt[:50] if len(request.prompt) > 50 else request.prompt
        print(f"[EXPANSION] Prompt: {prompt_preview}...")
        print(f"{'='*60}\n")
    except Exception as e:
        print(f"[ERROR] Error in logging: {repr(e)}")
    
    db = get_database()
    
    # 1. Check maintenance mode
    maintenance_mode = await get_dynamic_setting("maintenance_mode", False)
    if maintenance_mode:
        raise HTTPException(
            status_code=503, 
            detail="System is currently under maintenance. Please try again later."
        )

    # 2. Check user balance
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # 3. Get Banana pricing strategy (for gemini-2.5-flash-image)
    strategy = await db.pricing_strategies.find_one({"id": "Banana"})
    
    # Fallback if Banana not found - use default cost
    if not strategy:
        print("[WARN] Banana pricing strategy not found, using default cost")
        cost = 5  # Default cost for 1K resolution
    else:
        # Expansion always uses 1K resolution (gemini-2.5-flash-image fixed resolution)
        cost = strategy.get("price_1k", 5)
        
    if user["balance_beans"] < cost:
        raise HTTPException(
            status_code=400, 
            detail=f"Insufficient balance. This expansion requires {cost} beans, but you only have {user['balance_beans']}."
        )
    
    # 4. Deduct cost from user balance
    await db.users.update_one(
        {"id": user_id},
        {
            "$inc": {"balance_beans": -cost},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    print(f"[OK] Deducted {cost} beans from user")
    
    try:
        # 5. Process base64 image
        base64_data = request.base64_image
        mime_type = "image/png"
        if "," in base64_data:
            mime_part, base64_data = base64_data.split(",", 1)
            if "image/png" in mime_part:
                mime_type = "image/png"
            elif "image/jpeg" in mime_part:
                mime_type = "image/jpeg"
            elif "image/webp" in mime_part:
                mime_type = "image/webp"
        
        # 6. Build prompt for AI
        if request.mode == "color":
            final_prompt = f"""Task: Background Replacement.
Input: An image with a central photo surrounded by a solid MAGENTA (#FF00FF) border.

Instructions:
1. Identify the central subject.
2. REMOVE the Magenta mask AND the original background.
3. REPLACE with a solid background color: {request.prompt}.
4. Output image must contain ONLY the subject and the solid color."""
        elif request.mode == "prompt":
            final_prompt = f"""Task: Outpainting and Background Replacement.
Input: An image with a central photo surrounded by a solid MAGENTA (#FF00FF) border.

Instructions:
1. The Magenta (#FF00FF) area is a mask.
2. FILL the mask and REPLACE the original background.
3. New Background Description: "{request.prompt}".
4. Ensure the new background covers the entire canvas seamlessly."""
        else:
            final_prompt = f"""Task: Image Outpainting.
Input: An image with a central photo surrounded by a solid MAGENTA (#FF00FF) border.

Instructions:
1. The MAGENTA (#FF00FF) area represents MISSING content.
2. You MUST generate realistic content to fill the Magenta area entirely.
3. The new content must be a seamless continuation of the central photo (matching perspective, lighting, and texture).
4. DO NOT change the central original photo.
5. The final output must be a complete, rectangular image with NO MAGENTA pixels remaining.
6. This is a creative completion task, not a description task.

User guidance for the expanded area: {request.prompt}"""

        # 7. Call Gemini API
        api_key = await get_dynamic_setting("gemini_api_key", settings.nano_banana_api_key)
        api_key = (api_key or "").strip()
        if not api_key:
            raise Exception("Gemini API key not configured. Please configure it in system settings.")
        
        model_id = "gemini-2.5-flash-image"
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={api_key}"
        
        print(f"[API] Calling Gemini API ({model_id})...")
        
        async with httpx.AsyncClient() as client:
            request_body = {
                "contents": [{
                    "role": "user",
                    "parts": [
                        {"text": final_prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": base64_data
                            }
                        }
                    ]
                }],
                "generationConfig": {
                    "responseModalities": ["TEXT", "IMAGE"],
                    "temperature": 0.7,
                    "topK": 40,
                    "topP": 0.95,
                    "maxOutputTokens": 8192,
                    "imageConfig": {
                        "aspectRatio": request.aspect_ratio
                    }
                }
            }
            
            response = await client.post(api_url, json=request_body, timeout=300.0)
            
            if response.status_code == 200:
                result = response.json()
                print(f"[OK] Gemini API ({model_id}) call successful")
                
                if "candidates" in result and len(result["candidates"]) > 0:
                    candidate = result["candidates"][0]
                    if "content" in candidate and "parts" in candidate["content"]:
                        parts_response = candidate["content"]["parts"]
                        
                        # Find the image in response
                        image_data = None
                        for part in parts_response:
                            if "inline_data" in part or "inlineData" in part:
                                inline_data = part.get("inline_data") or part.get("inlineData")
                                if inline_data and "data" in inline_data:
                                    image_data = inline_data["data"]
                                    break
                        
                        if image_data:
                            # Save the expanded image
                            image_url = await save_expansion_image(image_data)
                            print(f"[OK] Expansion image saved: {image_url}")
                            
                            return ExpansionResponse(
                                image_url=image_url,
                                cost=cost
                            )
                        else:
                            raise Exception("No image data found in API response")
                
                raise Exception("Invalid API response structure")
            else:
                error_detail = f"API Error {response.status_code}: {response.text[:200]}"
                print(f"[ERROR] API call failed: {error_detail}")
                raise Exception(error_detail)
                
    except Exception as e:
        # Refund beans on failure
        error_msg = str(e)
        print(f"[ERROR] Expansion failed: {error_msg}")
        
        try:
            await db.users.update_one(
                {"id": user_id},
                {
                    "$inc": {"balance_beans": cost},
                    "$set": {"updated_at": datetime.utcnow()}
                }
            )
            print(f"[REFUND] Refunded {cost} beans to user {user_id} due to expansion failure")
        except Exception as refund_error:
            print(f"[CRITICAL] Failed to refund beans to user {user_id}: {repr(refund_error)}")
        
        raise HTTPException(status_code=500, detail=f"Image expansion failed: {error_msg}")
