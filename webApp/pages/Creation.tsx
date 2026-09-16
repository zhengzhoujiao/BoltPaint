import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { nanoBananaService } from '../services/nanoBananaService';
import { Template, AspectRatio, GeminiModelInfo, User, PricingStrategy, TaskStatus } from '../types';
import { DEFAULT_GENERATION_COST, Icons } from '../constants';
import ImagePreview from '../components/ImagePreview';
import TemplateCard from '../components/TemplateCard';
import BottomSheet from '../components/BottomSheet';
import { compressImage } from '../utils/image';
import Toast from '../components/Toast';

const CREATION_RESOLUTIONS = ['1K', '2K', '4K'] as const;

function coerceAspectRatio(value: string | null | undefined): AspectRatio | undefined {
    if (!value) return undefined;
    return (Object.values(AspectRatio) as string[]).includes(value) ? (value as AspectRatio) : undefined;
}

function coerceCreationResolution(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    return (CREATION_RESOLUTIONS as readonly string[]).includes(value) ? value : undefined;
}

/**
 * 作品创作组件
 * 按照文档设计包含：
 * - 模板切换区域
 * - 结果展示区
 * - 提示词输入区（三层结构）
 * - 参数配置区
 * - 功能按钮区
 */
import RechargeModal from '../components/RechargeModal';

const Creation: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // State from Router (Remix functionality)
    const { preSelectedTemplate, preFilledPrompt, aspectRatio, resolution, referenceImages, artworkImage } = location.state as {
        preSelectedTemplate?: Template;
        preFilledPrompt?: string;
        aspectRatio?: AspectRatio;
        resolution?: string;
        referenceImages?: string[];
        artworkImage?: string;
    } || {};

    const [user, setUser] = useState<User | null>(null);
    const [prompt, setPrompt] = useState(preFilledPrompt || '');
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(preSelectedTemplate || null);

    // 比例和分辨率列表
    const ratios = Object.values(AspectRatio);
    const templateDefaultRatio = coerceAspectRatio(preSelectedTemplate?.default_aspect_ratio ?? undefined);
    const templateDefaultRes = coerceCreationResolution(preSelectedTemplate?.default_resolution ?? undefined);

    const [ratio, setRatio] = useState<AspectRatio>(aspectRatio || templateDefaultRatio || ratios[0]);
    const [selectedResolution, setSelectedResolution] = useState<string>(resolution || templateDefaultRes || '1K');

    // 从模板广场返回时 location.state 会更新，但组件可能不卸载，需同步模板与默认比例/分辨率
    useEffect(() => {
        const st = (location.state || {}) as {
            preSelectedTemplate?: Template;
            aspectRatio?: AspectRatio;
            resolution?: string;
        };
        const tpl = st.preSelectedTemplate;
        if (!tpl?.id) return;
        setSelectedTemplate(tpl);
        if (!st.aspectRatio) {
            const tr = coerceAspectRatio(tpl.default_aspect_ratio ?? undefined);
            if (tr) setRatio(tr);
        }
        if (!st.resolution) {
            const tres = coerceCreationResolution(tpl.default_resolution ?? undefined);
            if (tres) setSelectedResolution(tres);
        }
    }, [location.key]);

    // 底部弹层
    const [activeSheet, setActiveSheet] = useState<'ratio' | 'resolution' | 'model' | 'count' | null>(null);
    const [generationCount, setGenerationCount] = useState(1);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPolishing, setIsPolishing] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [initialArtworkImage] = useState<string | null>(artworkImage || null);
    const [error, setError] = useState<string | null>(null);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);
    const [showRechargeModal, setShowRechargeModal] = useState(false);

    // Save state before payment
    const saveStateToLocal = () => {
        const stateToSave = {
            templateId: selectedTemplate?.id,
            prompt,
            ratio,
            selectedModelId,
            selectedPricingStrategyId,
            selectedResolution,
            generationCount,
            uploadedImages: uploadedImages.map(img => ({ ...img, file: undefined })), // 无法保存 File 对象
        };
        localStorage.setItem('creation_state', JSON.stringify(stateToSave));
    };

    // Load state on mount
    useEffect(() => {
        const savedStateStr = localStorage.getItem('creation_state');
        if (savedStateStr) {
            try {
                const savedState = JSON.parse(savedStateStr);
                if (savedState.prompt) setPrompt(savedState.prompt);
                if (savedState.ratio) setRatio(savedState.ratio);
                if (savedState.selectedModelId) setSelectedModelId(savedState.selectedModelId);
                if (savedState.selectedPricingStrategyId) setSelectedPricingStrategyId(savedState.selectedPricingStrategyId);
                if (savedState.selectedResolution) setSelectedResolution(savedState.selectedResolution);
                if (savedState.generationCount) setGenerationCount(savedState.generationCount);
                if (savedState.uploadedImages) setUploadedImages(savedState.uploadedImages);
                // 这里模板的恢复需要在 templates 加载后，所以暂时忽略或通过 API 获取
                localStorage.removeItem('creation_state'); // 清除已恢复的状态
            } catch (e) {
                console.error("Failed to parse saved creation state", e);
            }
        }
    }, []);

    // 图片上传状态（最多3张）
    const [uploadedImages, setUploadedImages] = useState<string[]>(referenceImages || []);
    // 图片上传进度（索引 -> 进度百分比 0-100，undefined表示上传完成）
    const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});

    // 保存对话框状态
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [artworkName, setArtworkName] = useState('');
    const [isRelease, setIsRelease] = useState(false);

    // 图片预览状态
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [isCollected, setIsCollected] = useState(false);
    const [showShareToast, setShowShareToast] = useState(false);

    const [pricingStrategies, setPricingStrategies] = useState<PricingStrategy[]>([]);
    const [currentCost, setCurrentCost] = useState<number>(DEFAULT_GENERATION_COST);
    const [selectedModelId, setSelectedModelId] = useState('gemini-3-pro-image-preview');
    const [selectedPricingStrategyId, setSelectedPricingStrategyId] = useState<string | null>(null);
    const [geminiModelMap, setGeminiModelMap] = useState<Record<string, GeminiModelInfo>>({});

    /** 模型下拉选项：直接从 GEMINI_IMAGE_MODELS 元数据派生，保持固定顺序 */
    const modelSelectOptions = useMemo(
        () => Object.entries(geminiModelMap) as [string, GeminiModelInfo][],
        [geminiModelMap]
    );

    const billingStrategy = useMemo(
        () => (selectedPricingStrategyId ? pricingStrategies.find(s => s.id === selectedPricingStrategyId) ?? null : null),
        [pricingStrategies, selectedPricingStrategyId]
    );

    const currentModelInfo = geminiModelMap[selectedModelId] ?? null;
    const isFlashImageModel = currentModelInfo?.is_flash ?? (selectedModelId === 'gemini-2.5-flash-image');
    const resolutionOptions = useMemo((): readonly string[] => ['1K', '2K', '4K'], []);

    // 相关风格状态
    const [relatedTemplates, setRelatedTemplates] = useState<Template[]>([]);
    const [loadingRelated, setLoadingRelated] = useState(false);
    const [hasMoreRelated, setHasMoreRelated] = useState(true);
    const [relatedPage, setRelatedPage] = useState(1);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Load user and pricing strategies
    useEffect(() => {
        nanoBananaService.getUserProfile().then(setUser).catch(() => {});

        // Fetch pricing strategies + model metadata in parallel
        Promise.all([
            nanoBananaService.getPricingStrategies(),
            nanoBananaService.getGeminiImageModels(),
        ]).then(([strategies, models]) => {
            setPricingStrategies(strategies);
            setGeminiModelMap(models);
        }).catch(console.error);
    }, []);

    useEffect(() => {
        if (!selectedTemplate) {
            setSelectedPricingStrategyId(null);
            return;
        }
        const st = pricingStrategies.find(s => s.id === selectedTemplate.pricing_strategy_id);
        const mid = st?.model_id || selectedTemplate.model_id || 'gemini-3-pro-image-preview';
        setSelectedModelId(mid);
        setSelectedPricingStrategyId(selectedTemplate.pricing_strategy_id);
    }, [selectedTemplate?.id, selectedTemplate?.pricing_strategy_id, selectedTemplate?.model_id, pricingStrategies]);

    // 模型可用性校验与自动降级
    useEffect(() => {
        const availableModelIds = Object.keys(geminiModelMap);
        if (availableModelIds.length === 0 || !selectedModelId) return;

        // 如果当前选中的模型不在可用模型列表中（说明已下线）
        if (!geminiModelMap[selectedModelId]) {
            const fallbackModelId = availableModelIds[0]; // 降级到第一个可用模型
            setSelectedModelId(fallbackModelId);

            // 同步更新计价策略
            const matchStrategy = pricingStrategies.find(s => s.model_id === fallbackModelId);
            setSelectedPricingStrategyId(matchStrategy?.id ?? null);

            setInfoMessage("原作品使用的生图模型已下线，已为您自动切换到推荐模型");
        }
    }, [geminiModelMap, selectedModelId, pricingStrategies]);

    useEffect(() => {
        if (!resolutionOptions.includes(selectedResolution)) {
            setSelectedResolution('2K');
        }
    }, [selectedModelId, resolutionOptions, selectedResolution]);

    // 消耗豆子：按当前选中的计价策略（与模型映射一致），Flash 固定按 2K 档计费
    useEffect(() => {
        if (!selectedTemplate) {
            setCurrentCost(DEFAULT_GENERATION_COST);
            return;
        }

        const strategy = billingStrategy;

        if (!strategy) {
            setCurrentCost(DEFAULT_GENERATION_COST);
            return;
        }

        const billRes = isFlashImageModel ? '2K' : selectedResolution;

        if (billRes === '1K') {
            setCurrentCost(strategy.price_1k);
        } else if (billRes === '4K') {
            setCurrentCost(strategy.price_4k);
        } else {
            setCurrentCost(strategy.price_2k);
        }
    }, [selectedTemplate, selectedResolution, billingStrategy, isFlashImageModel]);

    // 用户收藏状态同步
    useEffect(() => {
        if (user && selectedTemplate) {
            setIsCollected(user.collection_ids?.includes(selectedTemplate.id) || false);
        } else {
            setIsCollected(false);
        }
    }, [user, selectedTemplate]);

    // 初始加载相关风格
    useEffect(() => {
        if (selectedTemplate) {
            setRelatedTemplates([]);
            setRelatedPage(1);
            setHasMoreRelated(true);
            loadRelatedTemplates(1, true);
        }
    }, [selectedTemplate]);

    const loadRelatedTemplates = async (page: number, isInitial: boolean = false) => {
        if (!selectedTemplate || (!isInitial && (loadingRelated || !hasMoreRelated))) return;

        setLoadingRelated(true);
        try {
            const result = await nanoBananaService.getTemplates(
                page,
                8,
                selectedTemplate.tags,
                selectedTemplate.id
            );

            if (isInitial) {
                setRelatedTemplates(result.data);
            } else {
                setRelatedTemplates(prev => [...prev, ...result.data]);
            }
            setHasMoreRelated(result.hasMore);
            setRelatedPage(page);
        } catch (error) {
            console.error('加载相关风格失败:', error);
        } finally {
            setLoadingRelated(false);
        }
    };

    // 监听滚动触发加载更多
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const { scrollTop, scrollHeight, clientHeight } = target;

        if (scrollHeight - scrollTop - clientHeight < 100 && !loadingRelated && hasMoreRelated) {
            loadRelatedTemplates(relatedPage + 1);
        }
    };


    // 处理图片上传（支持多图，用户可上传3张，不受模板参考图影响）
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList) return;

        const files = Array.from(fileList);

        if (uploadedImages.length >= 3) {
            setError('最多上传3张图片');
            return;
        }

        files.slice(0, 3 - uploadedImages.length).forEach(async (file: File, fileIndex: number) => {
            if (file.size > 20 * 1024 * 1024) {
                setError(t('common.image_too_large') || '图片大小不能超过 20MB');
                return;
            }

            // 获取当前图片索引
            const currentIndex = uploadedImages.length + fileIndex;

            try {
                // 显示初始进度
                setUploadProgress(prev => ({ ...prev, [currentIndex]: 0 }));

                // 执行客户端压缩 (最大宽度 1024px, 质量 0.8)
                const compressedBase64 = await compressImage(file);

                // 添加图片到列表
                setUploadedImages(prev => [...prev, compressedBase64]);

                // 模拟剩余上传进度
                let progress = 30; // 压缩完成后起始进度
                const interval = setInterval(() => {
                    progress += Math.random() * 15 + 10;
                    if (progress >= 100) {
                        progress = 100;
                        clearInterval(interval);
                        setTimeout(() => {
                            setUploadProgress(prev => {
                                const newProgress = { ...prev };
                                delete newProgress[currentIndex];
                                return newProgress;
                            });
                        }, 300);
                    } else {
                        setUploadProgress(prev => ({ ...prev, [currentIndex]: Math.round(progress) }));
                    }
                }, 100);
            } catch (err) {
                console.error('图片压缩失败:', err);
                setError('图片上传处理失败');
                setUploadProgress(prev => {
                    const newProgress = { ...prev };
                    delete newProgress[currentIndex];
                    return newProgress;
                });
            }
        });

        // 清空输入框，允许重复选择同一文件
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // 删除指定索引的图片
    const removeImage = (index: number) => {
        setUploadedImages(prev => {
            const newImages = prev.filter((_, i) => i !== index);
            // 重新索引进度（因为删除了一个元素）
            setUploadProgress(prev => {
                const newProgress: Record<number, number> = {};
                Object.keys(prev).forEach(key => {
                    const oldIndex = parseInt(key);
                    if (oldIndex > index) {
                        newProgress[oldIndex - 1] = prev[oldIndex];
                    } else if (oldIndex < index) {
                        newProgress[oldIndex] = prev[oldIndex];
                    }
                });
                return newProgress;
            });
            return newImages;
        });
    };

    // 预览图片
    const previewImage = (imageUrl: string) => {
        setPreviewImageUrl(imageUrl);
    };

    const handleGenerate = async () => {
        if (!selectedTemplate) {
            setError(t('create.error_template'));
            return;
        }
        if (!prompt.trim()) {
            setError(t('create.error_prompt'));
            return;
        }
        if (!billingStrategy || !selectedPricingStrategyId) {
            setError('当前模型没有可用的计价策略，请在管理后台为该模型配置定价策略');
            return;
        }
        if (billingStrategy.model_id !== selectedModelId) {
            setError('计价策略与所选模型不一致，请重新选择模型');
            return;
        }
        if (!user || user.balance_beans < currentCost * generationCount) {
            saveStateToLocal();
            setShowRechargeModal(true);
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            // 合并模板参考图和用户上传的图片
            const templateImages = selectedTemplate.reference_images || [];
            const allImages = [...templateImages, ...uploadedImages];

            const resolutionForApi = isFlashImageModel ? '2K' : selectedResolution;

            await nanoBananaService.generateImage(
                selectedTemplate.id,
                prompt,
                ratio,
                resolutionForApi,
                allImages.length > 0 ? allImages : undefined,
                selectedModelId,
                selectedPricingStrategyId,
                generationCount
            );

            sessionStorage.setItem('tasks_activeTab', TaskStatus.GENERATING);
            navigate('/tasks');
        } catch (err: any) {
            setError(err.message || "生成失败");
            setIsGenerating(false);
        }
    };

    const handlePolishPrompt = async () => {
        if (!prompt.trim()) {
            setError('请先输入提示词再润色');
            return;
        }
        setIsPolishing(true);
        setError(null);
        try {
            const result = await nanoBananaService.polishPrompt(prompt);
            setPrompt(result.polished_prompt);
            if (user) setUser({ ...user, balance_beans: result.balance_beans });
        } catch (err: any) {
            setError(err.message || 'AI 润色失败');
        } finally {
            setIsPolishing(false);
        }
    };

    // 下载图片
    const handleDownload = () => {
        if (!generatedImage) return;

        const link = document.createElement('a');
        link.href = generatedImage || '';
        link.download = `artwork_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // 保存作品
    const handleSave = async () => {
        if (!artworkName.trim()) {
            setError('作品名称不能为空');
            return;
        }

        // TODO: 调用后端API保存作品
        console.log('保存作品:', { artworkName, isRelease });
        setShowSaveDialog(false);
        setArtworkName('');
        setIsRelease(false);
    };

    const handleToggleCollection = async () => {
        if (!selectedTemplate) return;

        try {
            const newStatus = await nanoBananaService.toggleCollectTemplate(selectedTemplate.id);
            setIsCollected(newStatus);

            // 更新用户本地缓存状态
            if (user) {
                const newCollectionIds = newStatus
                    ? [...(user.collection_ids || []), selectedTemplate.id]
                    : (user.collection_ids || []).filter(id => id !== selectedTemplate.id);
                setUser({ ...user, collection_ids: newCollectionIds });
            }

            // 触发事件
            window.dispatchEvent(new CustomEvent('template-collection-changed', {
                detail: {
                    templateId: selectedTemplate.id,
                    isCollected: newStatus
                }
            }));
        } catch (error) {
            console.error('切换收藏状态失败:', error);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            <Helmet>
                <title>AI 绘画创作 - BoltPaint</title>
                <meta name="description" content={"BoltPaint 是一款强大的 AI 绘画工具，提供多种风格模板，支持高阶生图、润色、多比例输出。"} />
                <meta name="keywords" content={`AI绘画, AI创作, 绘画模版 ,BoltPaint`} />
            </Helmet>
            {/* Header - 固定顶部 */}
            <div className="flex-none bg-white/95 backdrop-blur-md h-[50px] px-3 border-b border-slate-200 z-20 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="text-slate-600 hover:text-slate-900 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h1 className="text-lg font-bold text-slate-900">{t('create.title')}</h1>
                </div>
                <div className="flex items-center gap-1 bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                    <span className="text-sm font-bold text-amber-700">{user?.balance_beans || 0}</span>
                </div>
            </div>

            {/* 滚动内容区 */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto no-scrollbar pb-14"
            >
                <div className="p-4 space-y-4">

                    {/* 模板切换区域 */}
                    <div className="space-y-2">
                        {selectedTemplate ? (
                            <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 relative shadow-sm">
                                <img src={selectedTemplate.cover_image || ''} alt="" className="w-12 h-12 rounded object-cover" />
                                <div className="flex-1">
                                    <h3 className="text-slate-900 font-bold text-sm">{selectedTemplate.name}</h3>
                                    {selectedTemplate.description ? (
                                        <p className="text-slate-500 text-xs line-clamp-1">{selectedTemplate.description}</p>
                                    ) : null}
                                </div>
                                <button
                                    onClick={() => navigate('/templates', { state: { fromCreation: true } })}
                                    className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                                >
                                    {t('create.btn_change') || '更换'}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => navigate('/templates', { state: { fromCreation: true } })}
                                className="w-full py-4 border-2 border-dashed border-slate-300 rounded-lg text-slate-400 hover:border-indigo-500 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
                            >
                                <Icons.Grid className="w-5 h-5" />
                                {t('create.btn_select_template') || '选择模板'}
                            </button>
                        )}
                    </div>

                    {/* 结果展示区 - 占据主要空间 */}
                    <div
                        className="relative w-full bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center"
                        style={{ minHeight: '250px' }}
                    >
                        {generatedImage || initialArtworkImage || selectedTemplate?.cover_image ? (
                            <img
                                src={generatedImage || initialArtworkImage || selectedTemplate?.cover_image || ''}
                                alt="预览"
                                className="w-full h-full object-contain cursor-pointer"
                                onClick={() => (generatedImage || initialArtworkImage) && previewImage(generatedImage || initialArtworkImage || '')}
                            />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 select-none">
                                <div className="w-16 h-16 rounded-full bg-white/70 border border-slate-200 flex items-center justify-center">
                                    <Icons.Image className="w-7 h-7" />
                                </div>
                                <div className="text-sm">暂无图片</div>
                            </div>
                        )}
                        {generatedImage && generatedImage !== initialArtworkImage && (
                            <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                                ✓ 已生成
                            </div>
                        )}
                    </div>

                    {/* 提示词输入区：参考图 → 配置条（横向滚动）→ 提示词 */}
                    <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2">
                        {/* 第一层：上传图片区域（在输入框内部上方） */}
                        <div className="flex flex-wrap items-start gap-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="image/*"
                                multiple
                                className="hidden"
                            />

                            {/* 模板参考图（如果有） */}
                            {selectedTemplate?.reference_images && selectedTemplate.reference_images.length > 0 && (
                                <>
                                    {selectedTemplate.reference_images.map((img, index) => (
                                        <div key={`template-${index}`} className="relative w-20 h-20 rounded-lg border border-slate-200 overflow-hidden bg-white flex-shrink-0">
                                            <img
                                                src={img || ''}
                                                alt={`参考图 ${index + 1}`}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    ))}
                                </>
                            )}

                            {uploadedImages.length > 0 ? (
                                <>
                                    {uploadedImages.map((img, index) => {
                                        const progress = uploadProgress[index];
                                        const isUploading = progress !== undefined;

                                        return (
                                            <div key={`user-${index}`} className="relative w-20 h-20 rounded-lg border border-slate-200 overflow-hidden bg-white flex-shrink-0">
                                                <img
                                                    src={img || ''}
                                                    alt={`上传图片 ${index + 1}`}
                                                    className="w-full h-full object-cover cursor-pointer"
                                                    onClick={() => !isUploading && previewImage(img)}
                                                />

                                                {/* 上传进度圆形指示器 */}
                                                {isUploading && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                        <div className="relative w-10 h-10">
                                                            <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 40 40">
                                                                <circle
                                                                    cx="20"
                                                                    cy="20"
                                                                    r="16"
                                                                    fill="none"
                                                                    stroke="rgba(255, 255, 255, 0.3)"
                                                                    strokeWidth="3"
                                                                />
                                                                <circle
                                                                    cx="20"
                                                                    cy="20"
                                                                    r="16"
                                                                    fill="none"
                                                                    stroke="white"
                                                                    strokeWidth="3"
                                                                    strokeLinecap="round"
                                                                    strokeDasharray={`${2 * Math.PI * 16}`}
                                                                    strokeDashoffset={`${2 * Math.PI * 16 * (1 - (progress || 0) / 100)}`}
                                                                    className="transition-all duration-100"
                                                                />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* 删除按钮 */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeImage(index);
                                                    }}
                                                    className="absolute top-1 right-1 bg-slate-700 hover:bg-slate-800 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs shadow-md transition-colors"
                                                >
                                                    <Icons.X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        );
                                    })}

                                    {/* 添加图片按钮（如果少于3张） */}
                                    {uploadedImages.length < 3 && (
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="flex items-center justify-center w-20 h-20 rounded-lg border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors flex-shrink-0"
                                        >
                                            <Icons.Plus className="w-8 h-8" />
                                        </button>
                                    )}
                                </>
                            ) : (
                                /* 如果没有上传图片，显示参考图按钮 */
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`flex flex-col items-center justify-center w-20 h-20 rounded-lg transition-all ${'bg-blue-50 hover:bg-blue-100 text-blue-600 active:scale-95'
                                        }`}
                                >
                                    <div className="relative flex items-center justify-center">
                                        <Icons.Image className="w-6 h-6" />
                                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-blue-600 rounded-full flex items-center justify-center">
                                            <Icons.Plus className="w-2.5 h-2.5 text-white" />
                                        </div>
                                    </div>
                                    <span className="text-xs mt-1.5 font-medium">参考图</span>
                                </button>
                            )}
                        </div>

                        {/* 参考图下方配置区：上下细分割线、单行横向滚动、隐藏滚动条 */}
                        <div className="border-t border-b border-slate-100 -mx-3 px-3">
                            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar py-2.5">
                                <button
                                    type="button"
                                    onClick={() => setActiveSheet('ratio')}
                                    className="flex flex-shrink-0 items-center gap-1 px-3 py-1.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                                >
                                    比例 {ratio}
                                    <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {!isFlashImageModel && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveSheet('resolution')}
                                        className="flex flex-shrink-0 items-center gap-1 px-3 py-1.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                                    >
                                        分辨率 {selectedResolution}
                                        <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                )}

                                {selectedTemplate && (
                                    <button
                                        type="button"
                                        disabled={modelSelectOptions.length === 0}
                                        onClick={() => setActiveSheet('model')}
                                        className="flex flex-shrink-0 items-center gap-1 px-3 py-1.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
                                    >
                                        模型 {modelSelectOptions.length === 0 ? '…' : (currentModelInfo?.name ?? '')}
                                        <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setActiveSheet('count')}
                                    className="flex flex-shrink-0 items-center gap-1 px-3 py-1.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                                >
                                    次数 {generationCount}
                                    <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* 文本输入区域：加高；下方独立按钮区 */}
                        <div className="relative">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={t('create.placeholder_prompt')}
                                className="w-full h-28 bg-transparent text-slate-900 py-1 pl-0 border-0 focus:outline-none resize-none text-sm leading-relaxed placeholder:text-slate-400"
                            />
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-1">
                            <button
                                type="button"
                                onClick={handlePolishPrompt}
                                disabled={isPolishing || !prompt.trim()}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-indigo-600 rounded-lg hover:bg-indigo-500 hover:border-indigo-500 shadow-sm shadow-indigo-500/20 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                            >
                                {isPolishing ? (
                                    <>
                                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        润色中...
                                    </>
                                ) : 'AI润色(1豆)'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setPrompt('')}
                                disabled={!prompt.trim()}
                                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                            >
                                {t('create.btn_clear_prompt')}
                            </button>
                        </div>
                    </div>

                    {/* 相关风格区域 */}
                    <div className="space-y-4 pt-4">
                        <div className="flex items-center justify-center">
                            <h2 className="text-sm font-bold text-slate-900 text-center">相关风格</h2>
                        </div>

                        {relatedTemplates.length > 0 ? (
                            <div className="flex gap-2 items-start">
                                <div className="flex-1 min-w-0 flex flex-col gap-2">
                                    {relatedTemplates.filter((_, i) => i % 2 === 0).map((template) => (
                                        <TemplateCard
                                            key={template.id}
                                            template={template}
                                            onClick={(t) => {
                                                setSelectedTemplate(t);
                                                const tr = coerceAspectRatio(t.default_aspect_ratio ?? undefined);
                                                const tres = coerceCreationResolution(t.default_resolution ?? undefined);
                                                if (tr) setRatio(tr);
                                                if (tres) setSelectedResolution(tres);
                                                setPrompt('');
                                                setGeneratedImage(null);
                                                // 滚动到顶部
                                                if (scrollContainerRef.current) {
                                                    scrollContainerRef.current.scrollTop = 0;
                                                }
                                            }}
                                        />
                                    ))}
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col gap-2">
                                    {relatedTemplates.filter((_, i) => i % 2 === 1).map((template) => (
                                        <TemplateCard
                                            key={template.id}
                                            template={template}
                                            onClick={(t) => {
                                                setSelectedTemplate(t);
                                                const tr = coerceAspectRatio(t.default_aspect_ratio ?? undefined);
                                                const tres = coerceCreationResolution(t.default_resolution ?? undefined);
                                                if (tr) setRatio(tr);
                                                if (tres) setSelectedResolution(tres);
                                                setPrompt('');
                                                setGeneratedImage(null);
                                                // 滚动到顶部
                                                if (scrollContainerRef.current) {
                                                    scrollContainerRef.current.scrollTop = 0;
                                                }
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : !loadingRelated ? (
                            <div className="py-10 text-center text-slate-400 text-sm">
                                暂无相关风格
                            </div>
                        ) : null}

                        {/* 加载状态 */}
                        {loadingRelated && (
                            <div className="py-4 flex justify-center">
                                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}

                        {!hasMoreRelated && relatedTemplates.length > 0 && (
                            <div className="py-6 text-center text-xs text-slate-400">
                                - 已到底部 -
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 第四层：动作按钮区域 - 固定在底部 */}
            <div className="fixed bottom-0 left-0 right-0 bg-white px-4 h-14 flex items-center max-w-lg mx-auto z-30 border-t border-slate-200">
                <div className="flex items-center gap-3 w-full">
                    {/* 生成按钮 */}
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className={`flex-1 py-2 px-5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${isGenerating
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/30'
                            }`}
                    >
                        {isGenerating ? (
                            <>
                                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                {t('create.btn_generating') || '生成中...'}
                            </>
                        ) : (
                            <>
                                <Icons.Zap className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                                {t('create.btn_generate') || '生成'} ({currentCost * generationCount}豆)
                            </>
                        )}
                    </button>

                    {/* 收藏按钮 */}
                    <button
                        onClick={handleToggleCollection}
                        className="flex-shrink-0 w-8 h-8 hover:opacity-80 transition-opacity"
                        title={isCollected ? t('templates.collected') : t('templates.collect')}
                    >
                        <img
                            src={isCollected ? "/boltPaint/images/collect-active.png" : "/boltPaint/images/collect.png"}
                            alt={isCollected ? "已收藏" : "收藏"}
                            className="w-full h-full object-contain"
                        />
                    </button>
                </div>
            </div>

            {/* 保存作品对话框 */}
            {
                showSaveDialog && (
                    <>
                        {/* 背景遮罩 */}
                        <div
                            className="fixed inset-0 bg-black/50 z-40"
                            onClick={() => setShowSaveDialog(false)}
                        />

                        {/* 对话框 */}
                        <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 max-w-sm mx-auto">
                            <div className="p-6 space-y-4">
                                <h3 className="text-lg font-bold text-slate-900">保存作品</h3>

                                {/* 作品名称输入框 */}
                                <div className="space-y-2">
                                    <label className="text-slate-600 text-sm font-medium">作品名称 *</label>
                                    <input
                                        type="text"
                                        value={artworkName}
                                        onChange={(e) => setArtworkName(e.target.value)}
                                        placeholder="请输入作品名称"
                                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>

                                {/* 是否发布下拉框 */}
                                <div className="space-y-2">
                                    <label className="text-slate-600 text-sm font-medium">是否发布</label>
                                    <select
                                        value={isRelease ? 'true' : 'false'}
                                        onChange={(e) => setIsRelease(e.target.value === 'true')}
                                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white"
                                    >
                                        <option value="false">不发布</option>
                                        <option value="true">发布到广场</option>
                                    </select>
                                </div>

                                {/* 按钮组 */}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={() => setShowSaveDialog(false)}
                                        className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors"
                                    >
                                        确认
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )
            }

            {/* 图片预览组件 */}
            {
                previewImageUrl && (
                    <ImagePreview
                        imageUrl={previewImageUrl}
                        onClose={() => setPreviewImageUrl(null)}
                    />
                )
            }

            {/* 底部选择弹层 */}
            <BottomSheet
                open={activeSheet === 'ratio'}
                title="选择图片比例"
                options={ratios.map(r => ({ value: r, label: r }))}
                selected={ratio}
                onSelect={v => setRatio(v as AspectRatio)}
                onClose={() => setActiveSheet(null)}
            />
            <BottomSheet
                open={activeSheet === 'resolution'}
                title="选择图片分辨率"
                options={(resolutionOptions as readonly string[]).map(r => ({ value: r, label: r }))}
                selected={selectedResolution}
                onSelect={setSelectedResolution}
                onClose={() => setActiveSheet(null)}
            />
            <BottomSheet
                open={activeSheet === 'model'}
                title="选择图片生成模型"
                options={modelSelectOptions.map(([modelId, info]) => ({
                    value: modelId,
                    label: info.name,
                    description: info.description,
                }))}
                selected={selectedModelId}
                onSelect={modelId => {
                    const matchStrategy = pricingStrategies.find(s => s.model_id === modelId);
                    setSelectedModelId(modelId);
                    setSelectedPricingStrategyId(matchStrategy?.id ?? null);
                }}
                onClose={() => setActiveSheet(null)}
            />
            <BottomSheet
                open={activeSheet === 'count'}
                title="选择生成次数"
                options={[1, 2, 3].map(n => ({
                    value: String(n),
                    label: `${n}次`,
                    detailRight: `${currentCost * n}豆`,
                }))}
                selected={String(generationCount)}
                onSelect={v => setGenerationCount(Number(v))}
                onClose={() => setActiveSheet(null)}
                footerTip="有时候出图效果不好，我们可以生成多次，然后选择最好的一张，这样比较节省时间"
            />

            {/* 充值弹框 */}
            <RechargeModal
                isOpen={showRechargeModal}
                onClose={() => setShowRechargeModal(false)}
                user={user}
                returnUrl="/create"
            />

            {/* Error Message Toast */}
            {
                error && (
                    <Toast
                        message={error}
                        type="error"
                        onClose={() => setError(null)}
                    />
                )
            }

            {/* Info Message Toast */}
            {
                infoMessage && (
                    <Toast
                        message={infoMessage}
                        type="info"
                        onClose={() => setInfoMessage(null)}
                    />
                )
            }
        </div >
    );
};

export default Creation;