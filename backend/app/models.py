from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, Any, Dict, Literal
from datetime import datetime, timezone
from enum import Enum


def datetime_to_isoformat_with_z(dt: Optional[datetime]) -> Optional[str]:
    """
    将 datetime 对象转换为 ISO 8601 格式字符串，确保包含 'Z' 后缀（UTC时区标识）
    如果 datetime 是 naive（没有时区信息），假设它是 UTC 时间并添加 'Z'
    """
    if dt is None:
        return None
    
    # 如果是 naive datetime（没有时区信息），假设它是 UTC 并添加 'Z'
    if dt.tzinfo is None:
        # 使用 isoformat() 并手动添加 'Z'
        iso_str = dt.isoformat()
        # 检查是否已经有时区标识（'Z' 或 '+/-HH:MM'）
        if not iso_str.endswith('Z') and ('+' not in iso_str[-6:] and '-' not in iso_str[-6:]):
            return iso_str + 'Z'
        return iso_str
    else:
        # 如果有时区信息，转换为 UTC 并添加 'Z'
        utc_dt = dt.astimezone(timezone.utc)
        iso_str = utc_dt.isoformat()
        # 将 +00:00 替换为 Z
        if iso_str.endswith('+00:00'):
            return iso_str[:-6] + 'Z'
        elif iso_str.endswith('-00:00'):
            return iso_str[:-6] + 'Z'
        return iso_str


class AspectRatio(str, Enum):
    SQUARE = "1:1"
    PORTRAIT = "9:16"
    LANDSCAPE = "16:9"
    THREE_FOUR = "3:4"
    FOUR_THREE = "4:3"


class GenerationStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskStatus(str, Enum):
    GENERATING = "generating"  # 生成中
    COMPLETED = "completed"     # 已生成
    FAILED = "failed"           # 生成失败

class TaskType(str, Enum):
    IMAGE = "image"             # 单图/普通任务
    COMIC = "comic"             # 漫画任务


# User Models
class User(BaseModel):
    id: str
    username: str
    avatar: Optional[str] = None  # 头像 URL（库内仅存此字段）
    phone: Optional[str] = None  # 绑定手机号（MongoDB 仅存此字段）
    password_hash: Optional[str] = None  # 密码哈希（唯一字段）
    is_admin: bool = False  # 是否为管理员
    is_disabled: bool = False  # 是否禁用
    plain_password: Optional[str] = None  # 明文密码（仅供管理员在后台查看，通过动态加解密）
    balance_beans: int = 0
    is_new_user: bool = True
    invite_code: Optional[str] = None  # 用户的邀请码
    wx_unionid: Optional[str] = None  # 微信 unionid
    like_ids: List[str] = Field(default_factory=list)  # 喜欢作品的 id 列表
    collection_ids: List[str] = Field(default_factory=list)  # 收藏模板的 id 列表
    member_number: Optional[int] = None  # 会员编号 (No.xxx)
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    can_claim_daily_today: Optional[bool] = None  # 是否今日可领取每日免费豆子（由接口计算，不存库）


class UserCreate(BaseModel):
    username: str
    avatar: Optional[str] = "https://picsum.photos/id/64/200/200"


# Registration Models
class SendCodeRequest(BaseModel):
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$", description="手机号（11位数字，以1开头）")


class SendCodeResponse(BaseModel):
    success: bool
    message: str
    expires_in: int = 300  # 验证码有效期（秒）


class VerifyCodeRequest(BaseModel):
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$", description="手机号")
    code: str = Field(..., min_length=4, max_length=6, description="验证码")


class RegisterRequest(BaseModel):
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$", description="手机号")
    code: Optional[str] = Field(None, description="验证码，暂未对接短信服务时可省略")
    username: str = Field(..., min_length=2, max_length=20, description="用户名")
    password: str = Field(..., min_length=6, max_length=20, description="密码（至少包含数字和字母）")
    avatar: Optional[str] = Field(None, description="头像 URL（可选，不传则使用系统默认）")
    referrer_code: Optional[str] = Field(None, description="邀请人的邀请码（可选）")
    activation_code: Optional[str] = Field(None, description="激活码（当系统开启「注册需激活码」时必填）")

    @field_validator("password")
    @classmethod
    def password_contains_letter_and_digit(cls, v: str) -> str:
        if not any(c.isalpha() for c in v):
            raise ValueError("密码至少包含一个字母")
        if not any(c.isdigit() for c in v):
            raise ValueError("密码至少包含一个数字")
        return v


class RegisterResponse(BaseModel):
    success: bool
    message: str
    user: Optional[User] = None
    token: Optional[str] = None  # 可以用于后续的 JWT 认证


# Login Models
class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    message: str
    user: Optional[User] = None
    token: Optional[str] = None


# Password Reset Models
class SendResetCodeRequest(BaseModel):
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$", description="手机号（11位数字，以1开头）")


class ResetPasswordRequest(BaseModel):
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$", description="手机号")
    code: str = Field(..., min_length=4, max_length=6, description="验证码")
    new_password: str = Field(..., min_length=6, max_length=20, description="新密码（至少包含数字和字母）")

    @field_validator("new_password")
    @classmethod
    def password_contains_letter_and_digit(cls, v: str) -> str:
        if not any(c.isalpha() for c in v):
            raise ValueError("密码至少包含一个字母")
        if not any(c.isdigit() for c in v):
            raise ValueError("密码至少包含一个数字")
        return v


# ── 已废弃：Gemini 官方 API 模型（已迁移至 Evolink 中转站）──
# 保留定义供历史数据兼容，不再出现在可用模型列表中
GEMINI_IMAGE_MODELS: dict[str, dict] = {
    "gemini-3-pro-image-preview": {
        "name": "香蕉Pro",
        "provider": "gemini",
        "is_flash": False,
        "description": "最强生图模型。（已迁移至 Evolink NanoBanana Pro）",
    },
    "gemini-3.1-flash-image-preview": {
        "name": "香蕉2",
        "provider": "gemini",
        "is_flash": False,
        "description": "快速生图模型。（已迁移至 Evolink NanoBanana 2）",
    },
    "gemini-2.5-flash-image": {
        "name": "香蕉",
        "provider": "gemini",
        "is_flash": True,
        "description": "轻量高速模型。（已下线）",
    },
}

# Evolink 中转站生图模型（统一异步协议：POST /v1/images/generations → GET /v1/tasks/{id}）
# quality_param: API 请求中分辨率的参数名（None=不支持分辨率选择）
# supports_image_urls: 是否支持参考图
EVOLINK_IMAGE_MODELS: dict[str, dict] = {
    "z-image-turbo": {
        "name": "Z Image Turbo",
        "provider": "evolink",
        "quality_param": None,
        "supports_image_urls": False,
        "description": "超快生图，适合快速预览。",
    },
    "nano-banana-2-beta": {
        "name": "NanoBanana 2",
        "provider": "evolink",
        "quality_param": "quality",
        "supports_image_urls": True,
        "description": "快速生图模型，支持参考图，适合快速预览和低成本出图。",
    },
    "nano-banana-pro-beta": {
        "name": "NanoBanana Pro",
        "provider": "evolink",
        "quality_param": "quality",
        "supports_image_urls": True,
        "description": "最强生图模型，支持参考图，适合追求高质量的创作。",
    },
    "gpt-image-2-beta": {
        "name": "GPT Image 2",
        "provider": "evolink",
        "quality_param": "resolution",
        "supports_image_urls": True,
        "description": "OpenAI GPT 生图模型，支持参考图与高清输出。",
    },
}

# 可用生图模型（仅 Evolink 中转站）
ALL_IMAGE_MODELS: dict[str, dict] = {**EVOLINK_IMAGE_MODELS}

DEFAULT_ADVANCED_MODEL = "nano-banana-pro-beta"


# Template Status
class TemplateStatus(str, Enum):
    PENDING = "pending"      # 待审核（用户提交）
    APPROVED = "approved"    # 已通过（管理员审核通过，可公开使用）
    REJECTED = "rejected"    # 已驳回（管理员驳回）


# Image Model (生图模型配置表，替代写死的 GEMINI_IMAGE_MODELS)
class ImageModel(BaseModel):
    id: str                          # Gemini API model ID，如 "gemini-3-pro-image-preview"
    name: str                        # 展示名称，如 "香蕉Pro"
    is_flash: bool = False           # True → 固定约 1024px，不支持 imageSize 参数
    supports_512: bool = False       # True → 支持 512 超低分辨率档位
    supported_resolutions: List[str] = Field(default_factory=lambda: ["1K", "2K", "4K"])  # 从关联定价策略读取
    description: str = ""
    pricing_strategy_id: str = "BananaPro"  # 关联的定价策略
    enabled: bool = True             # 是否在前端展示
    sort_order: int = 0              # 展示排序（越小越靠前）
    # 冗余价格字段（从关联策略 join 过来，方便前端直接使用，不强制存储）
    price_1k: Optional[int] = None
    price_2k: Optional[int] = None
    price_4k: Optional[int] = None
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


class ImageModelCreate(BaseModel):
    id: str
    name: str
    is_flash: bool = False
    supports_512: bool = False
    description: str = ""
    pricing_strategy_id: str = "BananaPro"
    enabled: bool = True
    sort_order: int = 0


class ImageModelUpdate(BaseModel):
    name: Optional[str] = None
    is_flash: Optional[bool] = None
    supports_512: Optional[bool] = None
    description: Optional[str] = None
    pricing_strategy_id: Optional[str] = None
    enabled: Optional[bool] = None
    sort_order: Optional[int] = None


# Pricing Strategy Models
def get_strategy_resolutions(strategy: Optional[dict]) -> List[str]:
    """显式策略配置优先；旧 GPT beta 策略默认 1K，其余旧策略保留全部档位。"""
    strategy = strategy or {}
    configured = strategy.get("supported_resolutions")
    if configured is not None:
        return configured
    return ["1K"] if strategy.get("model_id") == "gpt-image-2-beta" else ["1K", "2K", "4K"]


class PricingStrategy(BaseModel):
    id: str
    name: str
    model_id: str = "gemini-3-pro-image-preview"  # 关联的 Gemini 生图模型
    price_1k: int = 10
    price_2k: int = 20
    price_4k: int = 40
    supported_resolutions: List[Literal["1K", "2K", "4K"]] = Field(default_factory=lambda: ["1K", "2K", "4K"], min_length=1)
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


class PricingStrategyCreate(BaseModel):
    name: str
    model_id: str = "gemini-3-pro-image-preview"
    price_1k: int = 10
    price_2k: int = 20
    price_4k: int = 40
    supported_resolutions: List[Literal["1K", "2K", "4K"]] = Field(default_factory=lambda: ["1K", "2K", "4K"], min_length=1)


class PricingStrategyUpdate(BaseModel):
    name: Optional[str] = None
    model_id: Optional[str] = None
    price_1k: Optional[int] = None
    price_2k: Optional[int] = None
    price_4k: Optional[int] = None
    supported_resolutions: Optional[List[Literal["1K", "2K", "4K"]]] = Field(default=None, min_length=1)


# Template Models
class Template(BaseModel):
    id: str
    name: str
    cover_image: Optional[str] = None  # 模板封面图
    system_instruction: str
    preset_prompt: str
    description: str = ""  # 模板描述，设为可选并提供默认值
    pricing_strategy_id: str = "BananaPro"  # 关联计价策略 ID
    tags: List[str] = Field(default_factory=list)  # 标签ID列表
    reference_images: List[str] = Field(default_factory=list)  # 参考图URL列表
    use_count: int = 0  # 使用次数
    is_featured: bool = False  # 是否推荐
    # 高阶生图相关
    status: str = TemplateStatus.APPROVED  # 模板状态: pending/approved/rejected
    is_custom: bool = False  # 是否为用户提交的自定义模板
    creator_id: Optional[str] = None  # 创建者用户ID（用于追溯来源）
    model_id: Optional[str] = None  # 高阶生图使用的模型ID
    reject_reason: Optional[str] = None  # 驳回原因
    default_aspect_ratio: Optional[str] = None  # 创作页默认宽高比，如 1:1、9:16
    default_resolution: Optional[str] = None  # 创作页默认分辨率：1K、2K、4K
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


class TemplateCreate(BaseModel):
    name: str
    cover_image: Optional[str] = None
    pricing_strategy_id: str = "BananaPro"
    description: str = ""
    system_instruction: str = ""
    preset_prompt: str = ""
    tags: List[str] = Field(default_factory=list)  # 标签ID列表
    reference_images: List[str] = Field(default_factory=list)  # 参考图URL列表
    use_count: int = 0
    is_featured: bool = False
    status: str = TemplateStatus.APPROVED
    is_custom: bool = False
    creator_id: Optional[str] = None
    model_id: Optional[str] = None
    reject_reason: Optional[str] = None
    default_aspect_ratio: Optional[str] = None
    default_resolution: Optional[str] = None


class TemplateSubmitRequest(BaseModel):
    """用户将高阶生图任务保存为模板时的请求体"""
    task_id: str
    name: str
    description: str = ""
    tags: List[str] = Field(default_factory=list)


class TemplateReviewRequest(BaseModel):
    """管理员审核模板时的请求体"""
    action: str  # "approve" or "reject"
    reject_reason: Optional[str] = None  # 驳回时的原因


# Artwork Models
class Artwork(BaseModel):
    id: str
    user_id: str
    user_avatar: str
    user_name: str
    template_id: Optional[str] = None
    image_url: str
    thumbnail_url: Optional[str] = None  # 缩略图URL（用于列表展示）
    artwork_name: Optional[str] = None  # 作品名称
    user_input_prompt: str
    aspect_ratio: AspectRatio
    resolution: Optional[str] = "2K"  # 分辨率：1K、2K、4K
    is_release: bool = False  # 是否发布
    likes_count: int = 0
    status: GenerationStatus
    tags: List[str] = Field(default_factory=list)  # 标签ID列表（继承自模板）
    is_advanced: bool = False  # 是否为高阶生图任务
    model_id: Optional[str] = None  # 使用的模型ID
    system_instruction: Optional[str] = None  # 使用的系统指令
    reference_images: List[str] = Field(default_factory=list)  # 参考图列表
    created_at: datetime
    updated_at: Optional[datetime] = None  # 更新时间
    is_liked: Optional[bool] = False
    source_task_id: Optional[str] = None  # 由任务保存为作品时记录，用于删作品时同步任务
    task_type: str = "image"  # 任务类型："image" 或 "comic"
    comic_data: Optional[dict] = None  # 漫画数据，不包含脚本数据，只包含pages等


class ArtworkCreate(BaseModel):
    template_id: Optional[str] = None  # 高阶生图时可为空
    user_input_prompt: str
    aspect_ratio: AspectRatio
    resolution: str = "2K"  # 分辨率: "1K"、"2K"、"4K"
    base64_image: Optional[str] = None  # 兼容旧版单图
    base64_images: Optional[List[str]] = None  # 参考图列表，支持多张
    count: int = Field(default=1, ge=1, le=10)  # 批量生成数量（1-10），后端统一原子扣费
    # 高阶生图专属字段
    model_id: Optional[str] = None  # 生图模型（高阶必填；模板生图时可覆盖定价策略默认模型）
    system_instruction: Optional[str] = None  # 系统指令（高阶生图）
    pricing_strategy_id: Optional[str] = None  # 定价策略 ID（高阶生图；模板生图时指定与 model_id 一致的策略用于扣费）



class ArtworkResponse(BaseModel):
    data: list[Artwork]
    hasMore: bool


# Like Models (已废弃，使用 User.like_ids 代替)
# class Like(BaseModel):
#     user_id: str
#     artwork_id: str
#     created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


# Order Models (充值订单)
class OrderStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


class PaymentPlatform(str, Enum):
    ALIPAY = "alipay"
    WECHAT = "wechat"


class Order(BaseModel):
    id: str
    user_id: str
    amount_cny: float  # 充值金额（人民币）
    beans_amount: int  # 获得的豆子数
    package_id: Optional[str] = None  # 充值档位 ID（服务端解析）
    status: OrderStatus  # pending/paid/failed/refunded
    platform: PaymentPlatform  # alipay/wechat
    transaction_id: Optional[str] = None  # 第三方交易ID
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        json_encoders = {
            datetime: datetime_to_isoformat_with_z
        }


class OrderCreate(BaseModel):
    user_id: str
    amount_cny: float
    beans_amount: int
    platform: PaymentPlatform


# 充值档位（人民币 ↔ 豆子，由后台维护）
class RechargePackage(BaseModel):
    id: str
    amount_cny: float = Field(gt=0)
    beans_amount: int = Field(gt=0)
    label: str = ""
    sort_order: int = 0
    enabled: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        json_encoders = {
            datetime: datetime_to_isoformat_with_z
        }


class RechargePackageCreate(BaseModel):
    amount_cny: float = Field(gt=0)
    beans_amount: int = Field(gt=0)
    label: str = ""
    sort_order: int = 0
    enabled: bool = True


class RechargePackageUpdate(BaseModel):
    amount_cny: Optional[float] = Field(default=None, gt=0)
    beans_amount: Optional[int] = Field(default=None, gt=0)
    label: Optional[str] = None
    sort_order: Optional[int] = None
    enabled: Optional[bool] = None


# Ticket Models (工单)
class TicketStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"  # 处理中
    UNREAD = "unread"            # 待阅读 (客服已回复)
    RESOLVED = "resolved"
    CLOSED = "closed"


# 对话消息模型
class Message(BaseModel):
    content: str  # 消息内容
    timestamp: datetime  # 消息时间
    
    class Config:
        json_encoders = {
            datetime: datetime_to_isoformat_with_z
        }


class Ticket(BaseModel):
    id: str
    user_id: str
    support_id: Optional[str] = None  # 客服ID
    theme: Optional[str] = None  # 工单主题
    content: List[Message] = Field(default_factory=list)  # 用户消息列表
    reply_content: List[Message] = Field(default_factory=list)  # 客服回复列表
    status: TicketStatus  # pending/in_progress/resolved/closed
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: datetime_to_isoformat_with_z
        }


class TicketCreate(BaseModel):
    user_id: str
    theme: Optional[str] = None  # 工单主题
    content: str  # 初始消息内容


class TicketUpdate(BaseModel):
    content: Optional[str] = None  # 用户追加消息
    reply_content: Optional[str] = None  # 客服追加回复
    support_id: Optional[str] = None  # 分配客服
    status: Optional[TicketStatus] = None  # 更新状态


class TicketReply(BaseModel):
    reply_content: str  # 客服回复内容
    support_id: str  # 客服ID


# Tag Models (标签)
class Tag(BaseModel):
    id: str
    label: str  # 标签中文名称
    value: str  # 标签英文名称
    order: int = 0  # 排序权重，数值越小越靠前
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)


class TagCreate(BaseModel):
    label: str
    value: str
    order: int = 0


class TagUpdate(BaseModel):
    label: Optional[str] = None
    value: Optional[str] = None
    order: Optional[int] = None


# Task Models (生图任务)
class Task(BaseModel):
    id: str
    user_id: str
    template_id: Optional[str] = None  # 高阶生图任务可无模板
    image_url: Optional[str] = None  # 生成完成后才有
    thumbnail_url: Optional[str] = None  # 缩略图URL（用于列表展示）
    user_input_prompt: str
    aspect_ratio: AspectRatio
    resolution: str = "2K"
    is_release: bool = False
    likes_count: int = 0
    tags: List[str] = Field(default_factory=list)  # 标签ID列表（继承自模板）
    status: TaskStatus  # generating/completed/failed
    progress: int = 0  # 生成进度 0-100
    error_message: Optional[str] = None  # 失败原因
    is_deleted: bool = False  # 是否已删除（假删除）
    
    # === 任务分类信息 ===
    task_type: TaskType = TaskType.IMAGE
    task_name: Optional[str] = None  # 任务名称（如漫画名）
    progress_phase: Optional[str] = None  # 进度阶段（如“脚本生成阶段”）
    comic_data: Optional[dict] = None  # 漫画数据，包含页数、每页脚本和生成结果
    # 创建漫画任务时的用户输入快照（失败重试时用于还原表单；脚本阶段失败时 comic_data 可能仍为空）
    comic_input: Optional[Dict[str, Any]] = None
    
    # 高阶生图元数据
    is_advanced: bool = False  # 是否为高阶生图任务
    model_id: Optional[str] = None  # 使用的模型ID
    system_instruction: Optional[str] = None  # 使用的系统指令
    reference_images: List[str] = Field(default_factory=list)  # 参考图列表
    saved_as_template: bool = False  # 是否已保存为模板
    saved_as_artwork: bool = False  # 是否已从任务保存为作品（仅允许保存一次）
    pricing_strategy_id: Optional[str] = "BananaPro"  # 计价策略 ID
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        json_encoders = {
            datetime: datetime_to_isoformat_with_z
        }


class TaskCreate(BaseModel):
    template_id: Optional[str] = None  # 高阶生图时可为空
    user_input_prompt: str
    aspect_ratio: AspectRatio
    resolution: str = "2K"
    base64_image: Optional[str] = None  # 参考图片（可选）
    # 高阶生图专属字段
    model_id: Optional[str] = None  # 指定生图模型（高阶生图）
    system_instruction: Optional[str] = None  # 系统指令（高阶生图）
    is_advanced: bool = False  # 是否为高阶生图任务


class ComicCreateRequest(BaseModel):
    comic_title: str = Field(..., description="漫画名称")
    characters: str = Field(..., description="主角设定")
    plot: str = Field(..., description="剧情概要")
    pages: int = Field(default=6, ge=1, le=10, description="页数")
    aspect_ratio: AspectRatio = AspectRatio.THREE_FOUR  # 漫画默认 3:4 竖版比例
    generate_cover: bool = Field(default=False, description="是否生成封面图")
    cover_title_mode: str = Field(default="ai", description="封面名称模式: ai/custom")
    custom_cover_title: Optional[str] = Field(default=None, description="自定义封面名称")
    model_id: str = Field(default="gemini-3-pro-image-preview", description="生图模型ID（来自模型表）")
    resolution: str = Field(default="2K", description="分辨率（2K/4K）")


class ComicRedrawRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    page_number: int = Field(..., description="要重绘的页码（0=封面）")
    prompt: str = Field(..., description="重绘提示词")
    # 模型、分辨率与计价以任务创建时为准；旧客户端若仍传 model_id/resolution 会被忽略


