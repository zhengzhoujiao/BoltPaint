import { MOCK_TEMPLATES, MOCK_ARTWORKS, INITIAL_USER, DEFAULT_GENERATION_COST } from '../constants';
import { Artwork, GenerationStatus, GeminiModelInfo, Template, User, AspectRatio, RegisterRequest, RegisterResponse, SendCodeRequest, SendCodeResponse, LoginRequest, LoginResponse, Ticket, TicketCreateRequest, TicketStatus, Order, CreateOrderRequest, PaymentPlatform, OrderStatus, Task, TaskStatus, Tag, PricingStrategy, RechargePackage } from '../types';
import { clearSessionAndRedirectToLogin, logout } from '../utils/auth';

// API 基础 URL：开发时走 Vite 代理（/boltPaint/api），生产时由 Nginx 路由
export const API_BASE_URL = import.meta.env.VITE_API_BASE ?? '/boltPaint/api';

/**
 * 带有认证信息的 fetch 包装器；401 时清会话并跳转登录页
 */
export const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    clearSessionAndRedirectToLogin();
    throw new Error('登录已过期');
  }

  return response;
};

export type FetchTasksPageOptions = {
  /** 仅当 status=completed 时传给后端：false=未保存为作品（待保存 Tab） */
  savedAsArtwork?: boolean;
};

/** 分页请求任务列表（供 getTasks / getTasksAllPages 共用） */
async function fetchTasksPageApi(
  status: TaskStatus | undefined,
  page: number,
  pageSize: number,
  options?: FetchTasksPageOptions
): Promise<Task[]> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString()
  });
  if (status) {
    params.append('status', status);
  }
  if (status === TaskStatus.COMPLETED && options?.savedAsArtwork !== undefined) {
    params.append('saved_as_artwork', String(options.savedAsArtwork));
  }
  const response = await authenticatedFetch(`${API_BASE_URL}/tasks?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '获取任务列表失败' }));
    throw new Error(error.detail || '获取任务列表失败');
  }
  return response.json();
}

// Simulate Backend DB State
let mockUserStore: User = { ...INITIAL_USER };
let mockArtworksStore: Artwork[] = [...MOCK_ARTWORKS];
// Simulate a Like table: Set of Artwork IDs liked by current user
let mockLikedArtworks = new Set<string>(mockArtworksStore.filter(a => a.is_liked).map(a => a.id));

// --- Frontend Memory Cache ---
interface CacheState<T> {
  data: T[];
  cursor: string | null;
  page: number; // Restore for backward compatibility
  hasMore: boolean;
  scrollTop: number;
  lastUpdated: number;
}

export const appCache = {
  square: {
    data: [] as Artwork[],
    cursor: null,
    page: 1,
    hasMore: true,
    scrollTop: 0,
    lastUpdated: 0
  } as CacheState<Artwork>,
  templates: {
    data: [] as Template[],
    cursor: null,
    page: 1,
    hasMore: true,
    scrollTop: 0,
    lastUpdated: 0
  } as CacheState<Template>,
  works: {
    myArtworks: [] as Artwork[],
    myCollections: [] as Template[],
    myLikes: [] as Artwork[],
    scrollTop: 0,
    lastUpdated: 0
  }
};

export const nanoBananaService = {
  // GET /settings/public - 获取公开系统配置
  getPublicSettings: async (): Promise<any> => {
    try {
      const response = await fetch(`${API_BASE_URL}/settings/public`);
      if (!response.ok) throw new Error('获取系统配置失败');
      return await response.json();
    } catch (error) {
      console.error('获取系统设置失败:', error);
      return {
        maintenance_mode: false,
        announcement_text: '',
        announcement_enabled: false
      };
    }
  },

  // GET /user/me - 获取当前用户信息
  getUserProfile: async (): Promise<User> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/user/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          logout();
          throw new Error('用户不存在');
        }
        const error = await response.json();
        throw new Error(error.detail || '获取用户信息失败');
      }

      return await response.json();
    } catch (error: any) {
      // 如果失败，返回模拟数据（向后兼容）
      console.warn('获取用户信息失败:', error);
      throw error;
    }
  },

  // POST /user/claim-daily-beans - 领取每日免费豆子
  claimDailyFreeBeans: async (): Promise<{ balance_beans: number; claimed: number }> => {
    const response = await authenticatedFetch(`${API_BASE_URL}/user/claim-daily-beans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '领取失败' }));
      throw new Error(error.detail || '领取失败');
    }
    return response.json();
  },

  // Simulate GET /templates with Pagination
  getTemplates: async (
    page: number = 1,
    pageSize: number = 10,
    tagIds?: string[],
    excludeId?: string
  ): Promise<{ data: Template[], hasMore: boolean }> => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });

      if (tagIds && tagIds.length > 0) {
        params.append('tags', tagIds.join(','));
      }

      if (excludeId) {
        params.append('exclude_id', excludeId);
      }

      const response = await authenticatedFetch(`${API_BASE_URL}/templates?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`获取模板列表失败: ${response.statusText}`);
      }

      const result = await response.json();

      console.log('📦 模板列表响应:', result);

      return {
        data: result.data || [],
        hasMore: result.hasMore || false
      };
    } catch (error) {
      console.error('获取模板列表失败:', error);
      throw error;
    }
  },

  // GET /templates/{template_id} - 获取模板详情
  getTemplateById: async (templateId: string): Promise<Template> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/templates/${templateId}`);

      if (!response.ok) {
        throw new Error(`获取模板详情失败: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('获取模板详情失败:', error);
      throw error;
    }
  },

  // GET /templates/user/collections - 获取用户收藏的模板列表
  getCollectedTemplates: async (): Promise<Template[]> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/templates/user/collections`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '获取收藏模板失败');
      }

      const result = await response.json();
      console.log(`✅ 获取收藏模板成功: ${result.length}条`);

      return result;
    } catch (error: any) {
      console.warn('获取收藏模板失败，返回空列表:', error);
      // 失败时返回空数组
      return [];
    }
  },

  // GET /templates - 获取当前用户自己的模板（支持状态过滤）
  getUserTemplates: async (status?: string): Promise<Template[]> => {
    try {
      const params = new URLSearchParams({
        page_size: '100', // 用户自己的模版通常不会太多，全取
      });

      if (status) {
        params.append('status', status);
      }

      const response = await authenticatedFetch(`${API_BASE_URL}/templates?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '获取个人模板失败');
      }

      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('获取个人模板失败:', error);
      return [];
    }
  },

  // POST /templates/{template_id}/collect - 切换模板收藏状态
  toggleCollectTemplate: async (templateId: string): Promise<boolean> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/templates/${templateId}/collect`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '收藏/取消收藏失败');
      }

      const result = await response.json();
      console.log(`✅ 模板收藏状态已更新: ${result.is_collected ? '已收藏' : '已取消收藏'}`);

      return result.is_collected;
    } catch (error: any) {
      console.error('切换模板收藏状态失败:', error);
      throw error;
    }
  },

  /** GET /recharge-packages — 充值档位（客户端应仅展示 enabled=true） */
  getRechargePackages: async (): Promise<RechargePackage[]> => {
    const response = await fetch(`${API_BASE_URL}/recharge-packages`, { cache: 'no-store' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || '获取充值档位失败');
    }
    return response.json();
  },

  // GET /pricing - 获取所有计价策略（勿静默回退假数据，否则新增策略看起来像「没生效」）
  getPricingStrategies: async (): Promise<PricingStrategy[]> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/pricing`, { cache: 'no-store' });
      if (!response.ok) {
        console.error('获取定价策略失败 HTTP', response.status, await response.text().catch(() => ''));
        return [];
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('获取定价策略失败:', error);
      return [];
    }
  },

  /** GET /pricing/models — Gemini 生图模型 id -> 结构化元数据（name / is_flash / description），兼容旧接口 */
  getGeminiImageModels: async (): Promise<Record<string, GeminiModelInfo>> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/pricing/models`, { cache: 'no-store' });
      if (!response.ok) return {};
      const data = await response.json();
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  },

  /** GET /models — 获取生图模型配置列表（包含关联定价信息，用于前端模型选择） */
  getImageModels: async (): Promise<import('../types').ImageModel[]> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/models`, { cache: 'no-store' });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  // GET /artworks - 获取作品列表（分页、搜索、筛选）
  getArtworks: async (
    cursor?: string, // 游标: 传递最后一条作品的时间戳
    pageSize: number = 10,
    search?: string,
    isRelease?: boolean,
    tagIds?: string[]
  ): Promise<{ data: Artwork[], hasMore: boolean }> => {
    try {
      // 构建查询参数
      const params = new URLSearchParams({
        page_size: pageSize.toString(),
      });

      if (cursor) {
        params.append('before_time', cursor);
      }

      if (search && search.trim()) {
        params.append('search', search.trim());
      }

      if (isRelease !== undefined) {
        params.append('isRelease', isRelease.toString());
      }

      // 添加标签参数（多个标签用逗号分隔）
      if (tagIds && tagIds.length > 0) {
        params.append('tags', tagIds.join(','));
      }

      const response = await authenticatedFetch(`${API_BASE_URL}/artworks?${params.toString()}`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '获取作品列表失败');
      }

      const result = await response.json();
      console.log(`✅ 获取作品列表成功: ${result.data.length}条, 还有更多: ${result.hasMore}`);

      return {
        data: result.data,
        hasMore: result.hasMore
      };
    } catch (error: any) {
      console.warn('获取作品列表失败:', error);
      throw error;
    }
  },

  // GET /artworks/{artwork_id} - 获取单个作品
  getArtworkById: async (id: string): Promise<Artwork | undefined> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/artworks/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return undefined;
        }
        const error = await response.json();
        throw new Error(error.detail || '获取作品失败');
      }

      return await response.json();
    } catch (error: any) {
      console.warn('获取作品详情失败:', error);
      throw error;
    }
  },

  // GET /artworks/user/{user_id}/works - 获取用户作品
  getUserWorks: async (userId: string): Promise<Artwork[]> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/artworks/user/${userId}/works`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '获取用户作品失败');
      }

      return await response.json();
    } catch (error: any) {
      console.warn('获取用户作品失败:', error);
      throw error;
    }
  },

  // GET /artworks/user/likes - 获取用户点赞的作品列表
  getLikedArtworks: async (): Promise<Artwork[]> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/artworks/user/likes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '获取点赞作品失败');
      }

      return await response.json();
    } catch (error: any) {
      console.warn('获取点赞作品失败:', error);
      throw error;
    }
  },

  // POST /artworks/{artwork_id}/like - 切换点赞状态
  toggleLike: async (id: string): Promise<boolean> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/artworks/${id}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '点赞操作失败');
      }

      const result = await response.json();
      return result.is_liked;
    } catch (error: any) {
      console.warn('点赞操作失败:', error);
      throw error;
    }
  },

  // POST /generate - 生成图片（支持多张参考图）
  generateImage: async (
    templateId: string,
    userPrompt: string,
    aspectRatio: AspectRatio,
    resolution: string = '2K',
    base64Images?: string[],
    modelId?: string,
    pricingStrategyId?: string,
    count: number = 1
  ): Promise<Task[]> => {
    try {
      const refImages = base64Images && base64Images.length > 0 ? base64Images : undefined;
      console.log("--- 调用 Gemini 3 Pro Image API ---");
      console.log("模板ID:", templateId);
      console.log("提示词:", userPrompt);
      console.log("宽高比:", aspectRatio);
      console.log("分辨率:", resolution);
      console.log("参考图片数量:", refImages ? refImages.length : 0);

      const response = await authenticatedFetch(`${API_BASE_URL}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_id: templateId,
          user_input_prompt: userPrompt,
          aspect_ratio: aspectRatio,
          resolution: resolution,
          base64_images: refImages || null,
          count,
          ...(modelId ? { model_id: modelId } : {}),
          ...(pricingStrategyId ? { pricing_strategy_id: pricingStrategyId } : {})
        }),
      });

      if (!response.ok) {
        let errorMessage = '生成图片失败';
        try {
          const responseText = await response.text();
          try {
            const error = JSON.parse(responseText);
            errorMessage = error.detail || errorMessage;
          } catch (e) {
            errorMessage = `${response.status}: ${responseText}`;
          }
        } catch (e) {
          errorMessage = `${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const tasks = await response.json();
      console.log(`✅ 创建生成任务成功（${Array.isArray(tasks) ? tasks.length : 1} 个）:`, tasks);

      // 清空缓存，确保新作品能显示
      appCache.square = { ...appCache.square, data: [], cursor: null, hasMore: true, scrollTop: 0 };

      return Array.isArray(tasks) ? tasks : [tasks];
    } catch (error: any) {
      console.error('❌ 生成图片失败:', error);
      throw error;
    }
  },

  // POST /generate - 高阶生图（无模板，使用自定义模型和系统指令）
  generateAdvancedImage: async (
    modelId: string,
    systemInstruction: string,
    userPrompt: string,
    aspectRatio: AspectRatio,
    resolution: string = '2K',
    base64Images?: string[],
    pricingStrategyId?: string,
    count: number = 1
  ): Promise<Task> => {
    try {
      const refImages = base64Images && base64Images.length > 0 ? base64Images : undefined;
      console.log("--- 调用高阶生图 API ---");
      console.log("模型:", modelId);
      console.log("策略ID:", pricingStrategyId);
      console.log("系统指令:", systemInstruction);
      console.log("提示词:", userPrompt);

      const response = await authenticatedFetch(`${API_BASE_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: modelId,
          system_instruction: systemInstruction,
          user_input_prompt: userPrompt,
          aspect_ratio: aspectRatio,
          resolution: resolution,
          base64_images: refImages || null,
          pricing_strategy_id: pricingStrategyId,
          count,
        }),
      });

      if (!response.ok) {
        let errorMessage = '高阶生图失败';
        try {
          const responseText = await response.text();
          try {
            const error = JSON.parse(responseText);
            errorMessage = error.detail || errorMessage;
          } catch (e) {
            errorMessage = `${response.status}: ${responseText}`;
          }
        } catch (e) {
          errorMessage = `${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const task = await response.json();
      console.log("✅ 高阶生图任务已创建:", task.id);
      return task;
    } catch (error: any) {
      console.error('❌ 高阶生图失败:', error);
      throw error;
    }
  },

  // POST /generate/comic - 生成漫画
  generateComic: async (request: {
    comic_title: string;
    characters: string;
    plot: string;
    pages: number;
    aspect_ratio: AspectRatio;
    generate_cover: boolean;
    cover_title_mode?: string;
    custom_cover_title?: string;
    model_id?: string;
    resolution?: string;
  }): Promise<Task> => {
    try {
      console.log("--- 调用生成漫画 API ---");
      console.log("请求数据:", request);

      const response = await authenticatedFetch(`${API_BASE_URL}/generate/comic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        let errorMessage = '生成漫画失败';
        try {
          const responseText = await response.text();
          try {
            const error = JSON.parse(responseText);
            errorMessage = error.detail || errorMessage;
          } catch (e) {
            errorMessage = `${response.status}: ${responseText}`;
          }
        } catch (e) {
          errorMessage = `${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const task = await response.json();
      console.log("✅ 漫画生成任务已创建:", task.id);
      return task;
    } catch (error: any) {
      console.error('❌ 生成漫画失败:', error);
      throw error;
    }
  },

  // POST /generate/comic/{task_id}/redraw-page - 重绘漫画某一页
  redrawComicPage: async (taskId: string, pageNumber: number, prompt: string): Promise<{ success: boolean; message: string }> => {
    const response = await authenticatedFetch(`${API_BASE_URL}/generate/comic/${taskId}/redraw-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_number: pageNumber, prompt }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '重绘失败' }));
      throw new Error(error.detail || '重绘失败');
    }
    return response.json();
  },

  // POST /templates/submit - 用户将高阶生图任务保存为模板（提交审核）
  submitTaskAsTemplate: async (
    taskId: string,
    name: string,
    description: string = '',
    tags: string[] = []
  ): Promise<{ success: boolean; message: string; template_id: string }> => {
    const response = await authenticatedFetch(`${API_BASE_URL}/templates/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, name, description, tags }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '提交失败' }));
      throw new Error(error.detail || '提交失败');
    }

    return response.json();
  },

  // ========== 订单相关 API ==========

  // POST /orders - 创建充值订单
  createOrder: async (request: CreateOrderRequest): Promise<Order> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '创建订单失败');
      }

      return await response.json();
    } catch (error: any) {
      console.error('❌ 创建订单失败:', error);
      throw error;
    }
  },

  // POST /orders/{order_id}/pay - 支付订单（模拟支付，仅限管理员测试）
  payOrder: async (orderId: string): Promise<Order> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/orders/${orderId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '支付失败');
      }

      return await response.json();
    } catch (error: any) {
      console.error('❌ 支付失败:', error);
      throw error;
    }
  },

  // GET /orders - 获取用户订单列表
  getOrders: async (): Promise<Order[]> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/orders`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '获取订单列表失败');
      }

      const orders = await response.json();
      console.log(`✅ 获取订单列表成功: ${orders.length}条`);
      return orders;
    } catch (error: any) {
      console.error('❌ 获取订单列表失败:', error);
      throw error;
    }
  },

  // POST /uploads/image - 上传图片（如头像）
  uploadImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await authenticatedFetch(`${API_BASE_URL}/uploads/image`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || '上传失败');
    }
    const data = await response.json();
    return { url: data.url };
  },

  // POST /user/send-code - 发送验证码
  sendVerificationCode: async (request: SendCodeRequest): Promise<SendCodeResponse> => {
    try {
      const response = await fetch(`${API_BASE_URL}/user/send-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '发送验证码失败');
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  },

  // POST /user/send-reset-code - 发送密码重置验证码
  sendResetCode: async (request: { phone: string }): Promise<{ success: boolean; message: string; expires_in: number }> => {
    const response = await fetch(`${API_BASE_URL}/user/send-reset-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '发送失败' }));
      throw new Error(error.detail || '发送失败');
    }
    return response.json();
  },

  // POST /user/reset-password - 重置密码
  resetPassword: async (request: { phone: string; code: string; new_password: string }): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_BASE_URL}/user/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '重置失败' }));
      throw new Error(error.detail || '重置失败');
    }
    return response.json();
  },

  // POST /user/register - 注册
  register: async (request: RegisterRequest): Promise<RegisterResponse> => {
    try {
      const response = await fetch(`${API_BASE_URL}/user/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '注册失败');
      }

      const data = await response.json();

      // 保存 token 到 localStorage（如果存在）
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_id', data.user?.id || '');
      }

      return data;
    } catch (error) {
      throw error;
    }
  },

  // POST /user/login - 登录
  login: async (request: LoginRequest): Promise<LoginResponse> => {
    try {
      console.log('🔐 发送登录请求:', request.username);
      const response = await fetch(`${API_BASE_URL}/user/login`, {
        method: 'POST',
        mode: 'cors',  // 明确指定 CORS 模式
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(request),
      });

      console.log('📡 登录响应状态:', response.status);

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ 登录失败:', error);
        throw new Error(error.detail || '登录失败');
      }

      const data = await response.json();
      console.log('✅ 登录成功:', data);
      
      // 保存 token 到 localStorage（如果存在）
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_id', data.user?.id || '');
      }

      return data;
    } catch (error: any) {
      console.error('❌ 登录请求异常:', error);
      if (error.message) {
        throw error;
      }
      throw new Error('网络错误，请检查后端服务是否运行');
    }
  },

  // ========== 工单相关 API ==========

  // POST /tickets - 创建工单
  createTicket: async (subject: string, content: string): Promise<Ticket> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          theme: subject,  // 发送主题到后端
          content: content
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '创建工单失败');
      }

      const ticket = await response.json();
      // 兼容前端使用subject字段
      return { ...ticket, subject: ticket.theme || subject };
    } catch (error: any) {
      console.error('❌ 创建工单失败:', error);
      throw error;
    }
  },

  // GET /tickets - 获取工单列表
  getTickets: async (page: number = 1, pageSize: number = 20): Promise<Ticket[]> => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString()
      });

      const response = await authenticatedFetch(`${API_BASE_URL}/tickets?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '获取工单列表失败');
      }

      const tickets = await response.json();
      // 兼容前端使用subject字段，优先使用theme
      return tickets.map((ticket: Ticket) => ({
        ...ticket,
        subject: ticket.theme || ticket.content[0]?.content.substring(0, 50) || '无主题'
      }));
    } catch (error: any) {
      console.error('❌ 获取工单列表失败:', error);
      throw error;
    }
  },

  // GET /tickets/{ticket_id} - 获取工单详情
  getTicketById: async (ticketId: string): Promise<Ticket> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/tickets/${ticketId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '获取工单详情失败');
      }

      const ticket = await response.json();
      // 兼容前端使用subject字段，优先使用theme
      return {
        ...ticket,
        subject: ticket.theme || ticket.content[0]?.content.substring(0, 50) || '无主题'
      };
    } catch (error: any) {
      console.error('❌ 获取工单详情失败:', error);
      throw error;
    }
  },

  // POST /tickets/{ticket_id}/message - 用户追加消息
  addTicketMessage: async (ticketId: string, content: string): Promise<Ticket> => {
    try {
      const params = new URLSearchParams({
        content: content
      });

      const response = await authenticatedFetch(`${API_BASE_URL}/tickets/${ticketId}/message?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '发送消息失败');
      }

      const ticket = await response.json();
      // 兼容前端使用subject字段，优先使用theme
      return {
        ...ticket,
        subject: ticket.theme || ticket.content[0]?.content.substring(0, 50) || '无主题'
      };
    } catch (error: any) {
      console.error('❌ 发送消息失败:', error);
      throw error;
    }
  },

  // ========== 标签相关 API ==========

  // GET /tags - 获取标签列表
  getTags: async (isFeatured?: boolean): Promise<Tag[]> => {
    try {
      const params = new URLSearchParams();
      if (isFeatured !== undefined) {
        params.append('is_featured', isFeatured.toString());
      }

      const response = await fetch(`${API_BASE_URL}/tags?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '获取标签列表失败');
      }

      const tags = await response.json();
      console.log(`✅ 获取标签列表成功: ${tags.length}个`);
      return tags;
    } catch (error: any) {
      console.error('❌ 获取标签列表失败:', error);
      throw error;
    }
  },

  // GET /tasks - 获取任务列表（单页，默认 20 条）
  getTasks: async (
    status?: TaskStatus,
    page: number = 1,
    pageSize: number = 20,
    options?: FetchTasksPageOptions
  ): Promise<Task[]> => {
    try {
      const tasks = await fetchTasksPageApi(status, page, pageSize, options);
      console.log(`✅ 获取任务列表成功: ${tasks.length}个`);
      return tasks;
    } catch (error: any) {
      console.error('❌ 获取任务列表失败:', error);
      throw error;
    }
  },

  /**
   * 按状态拉取该状态下全部任务（循环分页，单页最大 100 与后端一致，最多约 5000 条）
   */
  getTasksAllPages: async (
    status: TaskStatus,
    pageSize: number = 100,
    options?: FetchTasksPageOptions
  ): Promise<Task[]> => {
    try {
      const all: Task[] = [];
      const maxPages = 50;
      for (let page = 1; page <= maxPages; page++) {
        const batch = await fetchTasksPageApi(status, page, pageSize, options);
        all.push(...batch);
        if (batch.length < pageSize) break;
      }
      console.log(`✅ 获取任务列表(全部分页): ${all.length} 条 status=${status}`);
      return all;
    } catch (error: any) {
      console.error('❌ 获取任务列表(分页)失败:', error);
      throw error;
    }
  },

  // GET /tasks/{task_id} - 获取任务详情
  getTaskById: async (taskId: string): Promise<Task> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/tasks/${taskId}`);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '获取任务详情失败' }));
        throw new Error(error.detail || '获取任务详情失败');
      }

      const task = await response.json();
      console.log(`✅ 获取任务详情成功: ${task.id}`);
      return task;
    } catch (error: any) {
      console.error('❌ 获取任务详情失败:', error);
      throw error;
    }
  },

  // DELETE /tasks/{task_id} - 删除任务
  deleteTask: async (taskId: string): Promise<void> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/tasks/${taskId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '删除任务失败' }));
        throw new Error(error.detail || '删除任务失败');
      }

      console.log(`✅ 删除任务成功: ${taskId}`);
    } catch (error: any) {
      console.error('❌ 删除任务失败:', error);
      throw error;
    }
  },

  // POST /generate/{task_id}/to-artwork - 将任务转换为作品
  taskToArtwork: async (taskId: string): Promise<Artwork> => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/generate/${taskId}/to-artwork`, {
        method: 'POST'
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '转换任务失败' }));
        throw new Error(error.detail || '转换任务失败');
      }

      const artwork = await response.json();
      console.log(`✅ 任务转换为作品成功: ${artwork.id}`);
      return artwork;
    } catch (error: any) {
      console.error('❌ 转换任务失败:', error);
      throw error;
    }
  },

  // POST /artworks - 保存作品（设置名称和发布状态）
  saveArtwork: async (
    artworkId: string,
    artworkName: string,
    isRelease: boolean = false
  ): Promise<void> => {
    try {
      const params = new URLSearchParams({
        artwork_id: artworkId,
        artwork_name: artworkName,
        isRelease: isRelease.toString()
      });

      const response = await authenticatedFetch(`${API_BASE_URL}/artworks?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '保存作品失败' }));
        throw new Error(error.detail || '保存作品失败');
      }

      console.log(`✅ 保存作品成功: ${artworkId}`);
    } catch (error: any) {
      console.error('❌ 保存作品失败:', error);
      throw error;
    }
  },

  // PUT /artworks/{artwork_id}/publish - 发布/取消发布作品
  publishArtwork: async (
    artworkId: string,
    isRelease: boolean
  ): Promise<void> => {
    try {
      const params = new URLSearchParams({
        isRelease: isRelease.toString()
      });

      const response = await authenticatedFetch(`${API_BASE_URL}/artworks/${artworkId}/publish?${params.toString()}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '发布作品失败' }));
        throw new Error(error.detail || '发布作品失败');
      }

      console.log(`✅ 发布作品成功: ${artworkId}, isRelease: ${isRelease}`);
    } catch (error: any) {
      console.error('❌ 发布作品失败:', error);
      throw error;
    }
  },

  // PUT /artworks/{artwork_id} - 更新作品（作品名称等）
  updateArtwork: async (artworkId: string, artworkName: string): Promise<Artwork> => {
    const params = new URLSearchParams({ artwork_name: artworkName });
    const response = await authenticatedFetch(`${API_BASE_URL}/artworks/${artworkId}?${params.toString()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '修改作品失败' }));
      throw new Error(error.detail || '修改作品失败');
    }
    return response.json();
  },

  // DELETE /artworks/{artwork_id} - 删除作品
  deleteArtwork: async (artworkId: string): Promise<void> => {
    const response = await authenticatedFetch(`${API_BASE_URL}/artworks/${artworkId}`, { method: 'DELETE' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '删除作品失败' }));
      throw new Error(error.detail || '删除作品失败');
    }
  },

  // POST /generate/polish-prompt - AI 润色提示词（消耗 1 豆）
  polishPrompt: async (prompt: string): Promise<{ polished_prompt: string; balance_beans: number }> => {
    const params = new URLSearchParams({ prompt });
    const response = await authenticatedFetch(`${API_BASE_URL}/generate/polish-prompt?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '润色失败' }));
      throw new Error(error.detail || '润色失败');
    }

    return response.json();
  },
};