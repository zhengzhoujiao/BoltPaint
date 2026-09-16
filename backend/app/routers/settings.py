from fastapi import APIRouter, HTTPException, Depends
from app.dependencies import get_admin_user_id
from app.database import get_database
from app.config import settings
from pydantic import BaseModel
from typing import Dict, Any, Optional
from datetime import datetime

router = APIRouter(prefix="/settings", tags=["settings"])

class SystemSettings(BaseModel):
    gemini_api_key: Optional[str] = None
    evolink_api_key: Optional[str] = None
    referral_reward_amount: Optional[int] = None
    new_user_reward_amount: Optional[int] = None
    daily_generation_limit: Optional[int] = None
    maintenance_mode: Optional[bool] = None
    announcement_text: Optional[str] = None
    announcement_enabled: Optional[bool] = None
    customer_service_wechat: Optional[str] = None
    customer_service_qr: Optional[str] = None
    # 每日免费豆子：开关与数量
    daily_free_beans_enabled: Optional[bool] = None
    daily_free_beans_amount: Optional[int] = None
    # 注册是否需要激活码
    daily_generation_limit_enabled: Optional[bool] = None
    activation_code_required: Optional[bool] = None
    # 注册是否必须校验手机验证码（关闭后仅需手机号+密码等；未入库时后端默认跟随环境变量 sms_enabled）
    registration_sms_code_required: Optional[bool] = None
    # 充值功能开关
    recharge_enabled: Optional[bool] = None

@router.get("", response_model=Dict[str, Any])
async def get_system_settings(admin_id: str = Depends(get_admin_user_id)):
    """获取系统动态配置参数"""
    db = get_database()
    
    # 查找所有配置项
    cursor = db.system_settings.find({})
    db_configs = await cursor.to_list(length=100)
    
    # 将数据库记录转换为字典
    config_map = {item["key"]: item["value"] for item in db_configs}
    
    # 返回合并后的配置（数据库优先，环境变量作为默认值）
    return {
        "gemini_api_key": config_map.get("gemini_api_key", settings.nano_banana_api_key),
        "evolink_api_key": config_map.get("evolink_api_key", settings.evolink_api_key),
        "referral_reward_amount": config_map.get("referral_reward_amount", 50),
        "new_user_reward_amount": config_map.get("new_user_reward_amount", 100),
        "daily_generation_limit": config_map.get("daily_generation_limit", 100),
        "daily_generation_limit_enabled": config_map.get("daily_generation_limit_enabled", True),
        "maintenance_mode": config_map.get("maintenance_mode", False),
        "announcement_text": config_map.get("announcement_text", ""),
        "announcement_enabled": config_map.get("announcement_enabled", False),
        "customer_service_wechat": config_map.get("customer_service_wechat", ""),
        "customer_service_qr": config_map.get("customer_service_qr", ""),
        "daily_free_beans_enabled": config_map.get("daily_free_beans_enabled", False),
        "daily_free_beans_amount": config_map.get("daily_free_beans_amount", 10),
        "activation_code_required": config_map.get("activation_code_required", False),
        "registration_sms_code_required": config_map.get(
            "registration_sms_code_required", settings.sms_enabled
        ),
        "recharge_enabled": config_map.get("recharge_enabled", True),
    }

@router.get("/public", response_model=Dict[str, Any])
async def get_public_settings():
    """获取公开的系统配置（过滤掉敏感信息，供 WebApp 使用）"""
    db = get_database()
    cursor = db.system_settings.find({
        "key": {"$in": [
            "maintenance_mode", 
            "announcement_text", 
            "announcement_enabled",
            "customer_service_wechat",
            "customer_service_qr",
            "daily_free_beans_enabled",
            "daily_free_beans_amount",
            "activation_code_required",
            "registration_sms_code_required",
            "recharge_enabled",
        ]}
    })
    db_configs = await cursor.to_list(length=20)
    config_map = {item["key"]: item["value"] for item in db_configs}
    
    return {
        "maintenance_mode": config_map.get("maintenance_mode", False),
        "announcement_text": config_map.get("announcement_text", ""),
        "announcement_enabled": config_map.get("announcement_enabled", False),
        "customer_service_wechat": config_map.get("customer_service_wechat", ""),
        "customer_service_qr": config_map.get("customer_service_qr", ""),
        "daily_free_beans_enabled": config_map.get("daily_free_beans_enabled", False),
        "daily_free_beans_amount": config_map.get("daily_free_beans_amount", 10),
        "activation_code_required": config_map.get("activation_code_required", False),
        "registration_sms_code_required": config_map.get(
            "registration_sms_code_required", settings.sms_enabled
        ),
        "recharge_enabled": config_map.get("recharge_enabled", True),
    }

@router.put("")
async def update_system_settings(new_settings: SystemSettings, admin_id: str = Depends(get_admin_user_id)):
    """更新系统动态配置参数"""
    db = get_database()
    updated_count = 0
    
    # 将模型转为字典并过滤空值
    settings_dict = new_settings.dict(exclude_unset=True)
    
    for key, value in settings_dict.items():
        if value is not None:
            await db.system_settings.update_one(
                {"key": key},
                {"$set": {
                    "key": key,
                    "value": value,
                    "updated_at": datetime.utcnow()
                }},
                upsert=True
            )
            updated_count += 1
            
    return {"message": f"Successfully updated {updated_count} settings", "status": "success"}

# 内部辅助函数：获取单个配置项
async def get_dynamic_setting(key: str, default_value: Any):
    try:
        db = get_database()
        config = await db.system_settings.find_one({"key": key})
        if config:
            return config["value"]
    except Exception as e:
        print(f"[WARN] Error fetching dynamic setting {key}: {e}")
    return default_value
