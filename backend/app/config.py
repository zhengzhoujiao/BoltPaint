from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import os

# backend/ 目录，用于默认图片存储根（未设置 OBJECT_STORAGE_DIR 时为 backend/data）
_BACKEND_ROOT = os.path.dirname(os.path.dirname(__file__))
_DEFAULT_OBJECT_STORAGE_DIR = os.path.abspath(os.path.join(_BACKEND_ROOT, "data"))

_ENV_DIR = os.path.dirname(os.path.dirname(__file__))


class Settings(BaseSettings):
    # 忽略 .env 中已废弃或未声明的键（如历史 BEAN_EXCHANGE_RATE），避免启动失败
    model_config = SettingsConfigDict(
        env_file=(
            os.path.join(_ENV_DIR, ".env"),
            os.path.join(_ENV_DIR, ".env.local"),
        ),
        case_sensitive=False,
        extra="ignore",
    )

    # 环境配置
    app_env: str = "dev"  # 可选: dev, test, prod
    
    @property
    def is_development(self) -> bool:
        return self.app_env == "dev"
        
    @property
    def is_production(self) -> bool:
        return self.app_env == "prod"

    # MongoDB 配置
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "bolt_painting"
    
    # API 配置
    # 0.0.0.0 = 监听所有网络接口（可通过 localhost、127.0.0.1、本机IP 访问）
    # 127.0.0.1 = 仅本地访问（更安全，但局域网其他设备无法访问）
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    
    # CORS 配置（从环境变量读取时自动转换为列表）
    # 支持常见的开发端口和 IP 地址访问
    # 开发环境：允许所有来源（生产环境应限制为具体域名）
    # 注意：如果设置了环境变量 CORS_ORIGINS，会覆盖此默认值
    # 默认使用通配符允许所有来源（开发环境）
    cors_origins: str = "*"  # 开发环境允许所有来源
    
    # Google Gemini API 配置（文本生成、漫画脚本等辅助功能）
    nano_banana_api_key: str = ""  # Google Gemini API Key

    # 站点公开访问地址（用于将内部相对路径转为外部可访问的完整 URL）
    public_base_url: str = "https://bolt-series.com"

    # Evolink 中转站 API 配置（生图主力）
    evolink_api_key: str = ""  # Evolink API Key
    evolink_api_base_url: str = "https://api.evolink.ai"  # Evolink API 基础地址
    
    # 业务配置（.env 中可为 COST_PER_GENERATION）
    cost_per_generation: int = 10
    
    # 身份认证与密码加密。开源部署不提供共享默认密钥或默认密码。
    password_encryption_key: str = ""
    initial_admin_username: str = "admin"
    initial_admin_password: str = ""
    initial_test_user_password: str = ""

    # 阿里云短信服务配置
    sms_enabled: bool = False                   # False 时仅打印到控制台（开发/调试模式）
    aliyun_access_key_id: str = ""              # 阿里云 AccessKey ID
    aliyun_access_key_secret: str = ""          # 阿里云 AccessKey Secret
    aliyun_sms_sign_name: str = ""              # 短信签名名称
    aliyun_sms_template_code: str = ""          # 短信模板 Code（注册验证码，模板变量为 ${code}）
    aliyun_sms_reset_template_code: str = ""    # 短信模板 Code（密码重置验证码，模板变量为 ${code}）
    
    # 支付宝直连配置（BoltPaint 国内部署后不再经过 cutout 中转）
    alipay_app_id: str = ""
    alipay_private_key: str = ""
    alipay_public_key: str = ""
    alipay_gateway: str = "https://openapi.alipay.com/gateway.do"
    alipay_notify_url: str = ""  # 支付宝服务器异步通知地址（BoltPaint 后端公网地址）
    alipay_return_url: str = ""  # 支付完成后的后端同步回跳地址
    payment_result_url: str = ""  # 后端验签后跳转的 BoltPaint 前端结果页
    
    @property
    def cors_origins_list(self) -> List[str]:
        """将 CORS origins 字符串转换为列表"""
        if self.cors_origins.strip() == "*":
            return ["*"]
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        # 如果列表中包含 "*"，返回 ["*"]
        if "*" in origins:
            return ["*"]
        return origins
    
    # 图片存储根目录（部署级，改后需重启进程）
    # 生产常见：OBJECT_STORAGE_DIR=/lhcos-data；本地可设为绝对路径或依赖默认 backend/data
    object_storage_dir: str = _DEFAULT_OBJECT_STORAGE_DIR

    @field_validator("object_storage_dir", mode="after")
    @classmethod
    def _normalize_object_storage_dir(cls, v: str) -> str:
        return os.path.abspath(os.path.expanduser(v))

    @property
    def uploads_dir(self) -> str:
        return os.path.join(self.object_storage_dir, "uploads")

    @property
    def generated_dir(self) -> str:
        return os.path.join(self.object_storage_dir, "generated")

    @property
    def custom_dir(self) -> str:
        return os.path.join(self.object_storage_dir, "custom")


settings = Settings()

