export enum AspectRatio {
  SQUARE = "1:1",
  PORTRAIT = "9:16",
  LANDSCAPE = "16:9",
  THREE_FOUR = "3:4",
  FOUR_THREE = "4:3"
}

export enum GenerationStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed"
}

export enum TaskStatus {
  GENERATING = "generating",  // 生成中
  COMPLETED = "completed",    // 已完成（任务列表 Tab 文案为「待保存」= 未保存为作品）
  FAILED = "failed"           // 生成失败
}

export interface User {
  id: string;
  username: string;
  avatar: string;
  phone?: string;
  balance_beans: number;
  is_new_user: boolean;
  invite_code?: string;
  /** 会员编号 (No.xxx) */
  member_number?: number;
  /** 是否今日可领取每日免费豆子（由后端计算） */
  can_claim_daily_today?: boolean;
}

export interface RegisterRequest {
  phone: string;
  code?: string;
  username: string;
  password: string;
  avatar?: string;
  referrer_code?: string;
  activation_code?: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  user?: User;
  token?: string;
}

export interface SendCodeRequest {
  phone: string;
}

export interface SendCodeResponse {
  success: boolean;
  message: string;
  expires_in: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  user?: User;
  token?: string;
}

export interface GeminiModelInfo {
  /** 模型展示名（也用作计价策略简写） */
  name: string;
  /** true = Flash 模型，固定约 1024px 输出，不支持 imageSize 参数，计费按 price_2k */
  is_flash: boolean;
  /** 支持 512 超低分辨率档位 */
  supports_512?: boolean;
  /** 模型简介 */
  description: string;
}

/** 生图模型配置（来自 /models 接口，包含关联的定价信息） */
export interface ImageModel {
  /** Gemini API model ID，如 "gemini-3-pro-image-preview" */
  id: string;
  /** 展示名称，如 "香蕉Pro" */
  name: string;
  is_flash: boolean;
  supports_512: boolean;
  description: string;
  /** 关联定价策略 ID */
  pricing_strategy_id: string;
  enabled: boolean;
  sort_order: number;
  /** 冗余价格字段（从关联策略 join 而来） */
  price_1k?: number;
  price_2k?: number;
  price_4k?: number;
}

export interface PricingStrategy {
  id: string;
  name: string;
  model_id?: string;
  price_1k: number;
  price_2k: number;
  price_4k: number;
}

export interface Template {
  id: string;
  name: string;
  cover_image: string;
  system_instruction: string;
  preset_prompt: string;
  description: string;
  pricing_strategy_id: string;
  pricing_strategy?: PricingStrategy; // Optional joined data
  tags: string[];
  reference_images: string[];  // 参考图URL列表
  use_count: number;
  is_featured: boolean;
  is_collected?: boolean;
  // 高阶生图相关
  status?: string;  // approved/pending/rejected
  is_custom?: boolean;  // 是否为用户提交的自定义模板
  creator_id?: string;
  model_id?: string;  // 高阶生图使用的模型
  reject_reason?: string;  // 驳回原因
  creator_name?: string;  // 管理端展示用
  creator_avatar?: string;
  /** 进入创作页时的默认宽高比（如 1:1），未配置则由客户端使用全局默认 */
  default_aspect_ratio?: string | null;
  /** 进入创作页时的默认分辨率（1K / 2K / 4K） */
  default_resolution?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Artwork {
  id: string;
  user_id: string;
  user_avatar: string; // Added for UI convenience
  user_name: string;   // Added for UI convenience
  template_id?: string;
  image_url: string;
  thumbnail_url?: string;  // 缩略图URL（用于列表展示）
  artwork_name?: string; // 作品名称
  user_input_prompt: string;
  aspect_ratio: AspectRatio;
  resolution?: string; // 分辨率：1K、2K、4K
  is_release?: boolean; // 是否发布
  likes_count: number;
  status: GenerationStatus;
  tags: string[]; // 标签ID列表（继承自模板）
  is_advanced?: boolean;
  model_id?: string;
  system_instruction?: string;
  reference_images?: string[];
  pricing_strategy_id?: string;
  created_at: string;
  updated_at?: string;
  is_liked?: boolean; // New field for UI state
  source_task_id?: string; // 来自任务保存时记录，删作品可同步任务
  task_type?: string;
  comic_data?: any;
}

// 工单相关类型
export enum TicketStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  UNREAD = "unread",
  RESOLVED = "resolved",
  CLOSED = "closed"
}

export interface Message {
  content: string;
  timestamp: string;
}

export interface Ticket {
  id: string;
  user_id: string;
  support_id?: string;
  theme?: string; // 工单主题
  subject?: string; // 工单主题（前端兼容字段，已废弃，使用theme）
  content: Message[]; // 用户消息列表
  reply_content: Message[]; // 客服回复列表
  status: TicketStatus;
  created_at: string;
  updated_at: string;
}

export interface TicketCreateRequest {
  user_id: string;
  theme?: string; // 工单主题
  subject?: string; // 工单主题（前端兼容字段，已废弃，使用theme）
  content: string; // 初始消息内容
}

// 订单相关类型
export enum OrderStatus {
  PENDING = "pending",
  PAID = "paid",
  CANCELLED = "cancelled",
  REFUNDED = "refunded"
}

export enum PaymentPlatform {
  ALIPAY = "alipay",
  WECHAT = "wechat"
}

export interface Order {
  id: string;
  user_id: string;
  amount_cny: number; // 人民币金额
  beans_amount: number; // 豆子数量
  package_id?: string;
  status: OrderStatus;
  platform: PaymentPlatform;
  transaction_id?: string;
  created_at: string;
  updated_at: string;
}

/** 充值档位（与后端 /recharge-packages 一致） */
export interface RechargePackage {
  id: string;
  amount_cny: number;
  beans_amount: number;
  label: string;
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CreateOrderRequest {
  user_id: string;
  amount_cny: number;
  beans_amount: number;
  platform: PaymentPlatform;
}

// 标签相关类型
export interface Tag {
  id: string;
  label: string; // 标签中文名称
  value: string; // 标签英文名称
  order: number; // 排序权重，数值越小越靠前
  created_at: string;
  updated_at: string;
}

export interface TagCreateRequest {
  label: string;
  value: string;
  order?: number;
}

export interface TagUpdateRequest {
  label?: string;
  value?: string;
  order?: number;
}

// 任务相关类型
export interface Task {
  id: string;
  user_id: string;
  template_id?: string;  // 高阶生图任务可无模板
  image_url?: string;  // 生成完成后才有
  thumbnail_url?: string;  // 缩略图URL
  user_input_prompt: string;
  aspect_ratio: AspectRatio;
  resolution: string;
  is_release: boolean;
  likes_count: number;
  tags: string[];  // 标签ID列表（继承自模板）
  status: TaskStatus;  // generating/completed/failed
  progress: number;  // 生成进度 0-100
  error_message?: string;  // 失败原因
  // 高阶生图元数据
  is_advanced?: boolean;  // 是否为高阶生图任务
  model_id?: string;  // 使用的模型ID
  system_instruction?: string;  // 使用的系统指令
  reference_images?: string[]; // 参考图列表
  saved_as_template?: boolean;  // 是否已保存为模板
  saved_as_artwork?: boolean;  // 是否已保存为作品（仅允许一次）
  /** 创建任务时的计价策略（漫画重绘扣费与此一致） */
  pricing_strategy_id?: string;

  // 漫画功能相关
  task_type?: string; // "image" | "comic"
  task_name?: string; // 漫画名称等
  progress_phase?: string; // 进度阶段文本
  comic_data?: any; // 漫画数据
  /** 创建漫画任务时的用户输入快照（用于失败后在漫画大师页还原） */
  comic_input?: {
    comic_title: string;
    characters: string;
    plot: string;
    pages: number;
    generate_cover: boolean;
    cover_title_mode?: 'ai' | 'custom';
    custom_cover_title?: string;
  };
  
  created_at: string;
  updated_at?: string;
}