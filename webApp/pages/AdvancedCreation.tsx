import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { nanoBananaService } from '../services/nanoBananaService';
import { AspectRatio, ImageModel, User, TaskStatus } from '../types';
import BottomSheet from '../components/BottomSheet';
import { Icons } from '../constants';
import ImagePreview from '../components/ImagePreview';
import { compressImage } from '../utils/image';
import Toast from '../components/Toast';

import RechargeModal from '../components/RechargeModal';

/** 高阶生图「模版库」按钮跳转地址（可改为完整外链 URL，并改用 <a target="_blank">） */
const TEMPLATE_LIBRARY_HREF = 'https://bolt-series.cn/prompt/';

/**
 * 从 URL 读取 prompt 查询参数。支持：
 * - `http://host/?prompt=xxx#/tools/advanced-creation`（参数在 hash 之前）
 * - `#/tools/advanced-creation?prompt=xxx`
 * - React Router location.search（Hash 路由内带 query 时）
 */
function getQueryParamPrompt(routerSearch: string): string {
    if (typeof window === 'undefined') return '';

    try {
        const fromBeforeHash = new URLSearchParams(window.location.search || '').get('prompt');
        if (fromBeforeHash != null && fromBeforeHash !== '') return fromBeforeHash;
    } catch {
        /* ignore */
    }

    const hash = window.location.hash || '';
    const qi = hash.indexOf('?');
    if (qi !== -1) {
        try {
            const fromHash = new URLSearchParams(hash.slice(qi)).get('prompt');
            if (fromHash != null && fromHash !== '') return fromHash;
        } catch {
            /* ignore */
        }
    }

    if (routerSearch) {
        try {
            const fromRouter = new URLSearchParams(
                routerSearch.startsWith('?') ? routerSearch.slice(1) : routerSearch
            ).get('prompt');
            if (fromRouter != null && fromRouter !== '') return fromRouter;
        } catch {
            /* ignore */
        }
    }

    return '';
}

const AdvancedCreation: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial state from location (remix feature)
    const { model_id, system_instruction: preSystemInstruction, preFilledPrompt, aspectRatio, resolution, referenceImages, artworkImage } = location.state as {
        model_id?: string;
        system_instruction?: string;
        preFilledPrompt?: string;
        aspectRatio?: AspectRatio;
        resolution?: string;
        referenceImages?: string[];
        artworkImage?: string;
    } || {};

    const [user, setUser] = useState<User | null>(null);

    // Generation fields
    const [imageModels, setImageModels] = useState<ImageModel[]>([]);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [selectedModel, setSelectedModel] = useState<ImageModel | null>(null);
    const [systemInstruction, setSystemInstruction] = useState(preSystemInstruction || '');
    const [prompt, setPrompt] = useState(
        () => getQueryParamPrompt('') || preFilledPrompt || ''
    );
    const ratios = Object.values(AspectRatio);
    const [ratio, setRatio] = useState<AspectRatio>(aspectRatio || ratios[0]);
    const [selectedResolution, setSelectedResolution] = useState(resolution || '2K');

    // 底部弹层
    const [activeSheet, setActiveSheet] = useState<'ratio' | 'resolution' | 'model' | 'count' | null>(null);
    const [generationCount, setGenerationCount] = useState(1);

    // Images
    const [uploadedImages, setUploadedImages] = useState<string[]>(referenceImages || []);
    const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [initialArtworkImage] = useState<string | null>(artworkImage || null);

    // Generation state
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPolishing, setIsPolishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);
    const [showRechargeModal, setShowRechargeModal] = useState(false);

    const isFlashImageModel = selectedModel?.is_flash ?? false;

    const resolutionOptions = useMemo(() => ['1K', '2K', '4K'] as const, []);

    // Save state before payment
    const saveStateToLocal = () => {
        const stateToSave = {
            systemInstruction,
            prompt,
            ratio,
            selectedModelId: selectedModel?.id,
            selectedResolution,
            generationCount,
            uploadedImages: uploadedImages.map(img => ({ ...img, file: undefined })),
        };
        localStorage.setItem('advanced_creation_state', JSON.stringify(stateToSave));
    };

    // Load state on mount
    useEffect(() => {
        const savedStateStr = localStorage.getItem('advanced_creation_state');
        if (savedStateStr) {
            try {
                const savedState = JSON.parse(savedStateStr);
                if (savedState.systemInstruction) setSystemInstruction(savedState.systemInstruction);
                if (savedState.prompt) setPrompt(savedState.prompt);
                if (savedState.ratio) setRatio(savedState.ratio);
                // selectedModel recovery is handled in fetchInitialData or separately
                if (savedState.selectedResolution) setSelectedResolution(savedState.selectedResolution);
                if (savedState.generationCount) setGenerationCount(savedState.generationCount);
                if (savedState.uploadedImages) setUploadedImages(savedState.uploadedImages);
                localStorage.removeItem('advanced_creation_state');
            } catch (e) {
                console.error("Failed to parse saved advanced creation state", e);
            }
        }
    }, []);

    useEffect(() => {
        if (isFlashImageModel || !selectedModel) return;
        const opts = resolutionOptions as readonly string[];
        if (!opts.includes(selectedResolution)) {
            setSelectedResolution('2K');
        }
    }, [selectedModel?.id, isFlashImageModel, resolutionOptions, selectedResolution]);

    /** URL 带 prompt 时写入输入框（含 hash 前 ?prompt= 与 #/path?prompt=） */
    useEffect(() => {
        const fromUrl = getQueryParamPrompt(location.search);
        if (fromUrl) setPrompt(fromUrl);
    }, [location.pathname, location.search, location.hash]);

    // Cost (uses pricing from selected model)
    const getCost = () => {
        if (!selectedModel) return 10;
        // Flash 固定约 1024 输出，不按 1K/2K/4K 计价，与后端扣费统一走 price_2k
        if (isFlashImageModel) return selectedModel.price_2k ?? 10;
        if (selectedResolution === '1K') return selectedModel.price_1k ?? 10;
        if (selectedResolution === '4K') return selectedModel.price_4k ?? 40;
        return selectedModel.price_2k ?? 10;
    };

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [profile, models] = await Promise.all([
                    nanoBananaService.getUserProfile(),
                    nanoBananaService.getImageModels(),
                ]);
                setUser(profile);
                setImageModels(models);
                setModelsLoaded(true);

                if (model_id && models.length > 0) {
                    const matched = models.find(m => m.id === model_id);
                    if (matched) {
                        setSelectedModel(matched);
                    } else {
                        setSelectedModel(models[0]);
                        setInfoMessage("原作品使用的生图模型已下线，已为您自动切换到推荐模型");
                    }
                } else if (models.length > 0) {
                    setSelectedModel(models[0]);
                }
            } catch (err) {
                console.error('Failed to fetch initial data:', err);
                setModelsLoaded(true);
            }
        };

        fetchInitialData();
    }, [model_id]);

    // 处理图片上传
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList) return;
        const files = Array.from(fileList);

        if (uploadedImages.length >= 3) {
            setError(t('advanced_create.error_max_images'));
            return;
        }

        files.slice(0, 3 - uploadedImages.length).forEach(async (file: File, fileIndex: number) => {
            if (file.size > 20 * 1024 * 1024) {
                setError(t('advanced_create.error_image_20mb'));
                return;
            }
            const currentIndex = uploadedImages.length + fileIndex;

            try {
                // 显示初始进度
                setUploadProgress(prev => ({ ...prev, [currentIndex]: 0 }));

                // 执行客户端压缩
                const compressedBase64 = await compressImage(file);

                // 添加图片到列表
                setUploadedImages(prev => [...prev, compressedBase64]);

                // 模拟剩余上传进度
                let progress = 30;
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
                setError(t('advanced_create.error_upload_process'));
                setUploadProgress(prev => {
                    const newProgress = { ...prev };
                    delete newProgress[currentIndex];
                    return newProgress;
                });
            }
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeImage = (index: number) => {
        setUploadedImages(prev => {
            const newImages = prev.filter((_, i) => i !== index);
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

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setError(t('create.error_prompt'));
            return;
        }
        if (!selectedModel) {
            setError(t('advanced_create.error_select_strategy'));
            return;
        }
        const cost = getCost();
        if (!user || user.balance_beans < cost * generationCount) {
            saveStateToLocal();
            setShowRechargeModal(true);
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            const resolutionForApi = isFlashImageModel ? '2K' : selectedResolution;
            await nanoBananaService.generateAdvancedImage(
                selectedModel.id,
                systemInstruction,
                prompt,
                ratio,
                resolutionForApi,
                uploadedImages.length > 0 ? uploadedImages : undefined,
                selectedModel.pricing_strategy_id,
                generationCount
            );
            sessionStorage.setItem('tasks_activeTab', TaskStatus.GENERATING);
            navigate('/tasks');
        } catch (err: any) {
            setError(err.message || t('advanced_create.error_generate_retry'));
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            {/* Header */}
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
                    <h1 className="text-lg font-bold text-slate-900">{t('advanced_create.title')}</h1>
                </div>
                <div className="flex items-center gap-1 bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                    <span className="text-sm font-bold text-amber-700">{user?.balance_beans || 0}</span>
                </div>
            </div>

            {/* Scroll Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-[72px]">
                <div className="p-4 space-y-4">

                    {/* Model Selection */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-2">
                        <div className="flex items-center">
                            <h3 className="text-sm font-semibold text-slate-800">{t('advanced_create.select_model_section')}</h3>
                        </div>

                        <button
                            type="button"
                            onClick={() => setActiveSheet('model')}
                            className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
                        >
                            <span className="font-medium">{selectedModel?.name || t('advanced_create.select_model_placeholder')}</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {modelsLoaded && imageModels.length === 0 && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
                                {t('advanced_create.no_strategies_hint')}
                            </p>
                        )}
                    </div>

                    {/* System Instruction */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-2">
                        <div className="flex items-center">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-800">{t('advanced_create.system_instruction_title')}</h3>
                                <p className="text-xs text-slate-400">{t('advanced_create.system_instruction_subtitle')}</p>
                            </div>
                        </div>
                        <textarea
                            value={systemInstruction}
                            onChange={(e) => setSystemInstruction(e.target.value)}
                            placeholder={t('advanced_create.system_instruction_placeholder')}
                            className="w-full h-28 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400 resize-none leading-relaxed placeholder:text-slate-400"
                        />
                    </div>

                    {/* Prompt and Images Input */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-2">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-slate-800 shrink-0">{t('create.label_prompt')}</h3>
                            <Link
                                to={TEMPLATE_LIBRARY_HREF}
                                className="flex shrink-0 items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-[#0079ff] border border-[#0079ff] rounded-md shadow-sm shadow-[#0079ff]/20 hover:bg-[#0068e6] hover:border-[#0068e6] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0079ff] focus-visible:ring-offset-1 transition-colors"
                            >
                                <Icons.Grid className="w-3 h-3" />
                                {t('advanced_create.btn_template_library')}
                            </Link>
                        </div>

                        {/* Image upload row */}
                        <div className="flex flex-wrap items-start gap-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="image/*"
                                multiple
                                className="hidden"
                            />

                            {uploadedImages.length > 0 ? (
                                <>
                                    {uploadedImages.map((img, index) => {
                                        const progress = uploadProgress[index];
                                        const isUploading = progress !== undefined;
                                        return (
                                            <div key={`img-${index}`} className="relative w-20 h-20 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 flex-shrink-0">
                                                <img src={img || ''} alt={t('advanced_create.ref_preview_alt', { n: index + 1 })} className="w-full h-full object-cover cursor-pointer" onClick={() => !isUploading && setPreviewImageUrl(img)} />
                                                {isUploading && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                        <div className="relative w-10 h-10">
                                                            <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 40 40">
                                                                <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                                                                <circle cx="20" cy="20" r="16" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"
                                                                    strokeDasharray={`${2 * Math.PI * 16}`}
                                                                    strokeDashoffset={`${2 * Math.PI * 16 * (1 - (progress || 0) / 100)}`}
                                                                    className="transition-all duration-100"
                                                                />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeImage(index); }}
                                                    className="absolute top-1 right-1 bg-slate-700 hover:bg-slate-800 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs shadow-md transition-colors"
                                                >
                                                    <Icons.X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        );
                                    })}
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
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex flex-col items-center justify-center w-20 h-20 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all active:scale-95 flex-shrink-0"
                                >
                                    <div className="relative flex items-center justify-center">
                                        <Icons.Image className="w-6 h-6" />
                                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-blue-600 rounded-full flex items-center justify-center">
                                            <Icons.Plus className="w-2.5 h-2.5 text-white" />
                                        </div>
                                    </div>
                                    <span className="text-xs mt-1.5 font-medium">{t('advanced_create.reference_image_btn')}</span>
                                </button>
                            )}
                        </div>

                        {/* 参考图下方配置区：上下细分割线、单行横向滚动、隐藏滚动条（与创作页一致；p-4 对应 -mx-4 px-4） */}
                        <div className="border-t border-b border-slate-100 -mx-4 px-4">
                            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar py-2.5">
                                <button
                                    type="button"
                                    onClick={() => setActiveSheet('ratio')}
                                    className="flex flex-shrink-0 items-center gap-1 px-3 py-1.5 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                                >
                                    {t('advanced_create.short_ratio')} {ratio}
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
                                        {t('advanced_create.short_resolution')} {selectedResolution}
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

                        {/* Prompt textarea */}
                        <div className="relative">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={t('create.placeholder_prompt')}
                                className="w-full h-40 bg-transparent text-slate-900 py-1 pl-0 border-0 focus:outline-none resize-none text-sm leading-relaxed placeholder:text-slate-400"
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

                    {/* Error message */}
                    {error && (
                        <Toast message={error} type="error" onClose={() => setError(null)} />
                    )}

                    {/* Info message */}
                    {infoMessage && (
                        <Toast message={infoMessage} type="info" onClose={() => setInfoMessage(null)} />
                    )}

                    {/* Tips */}
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-xs text-purple-700 space-y-1.5">
                        <div className="font-semibold text-purple-800 mb-2 flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {t('advanced_create.tips_title')}
                        </div>
                        <p>{t('advanced_create.tips_system')}</p>
                        <p>{t('advanced_create.tips_prompt')}</p>
                        <p>{t('advanced_create.tips_tasks')}</p>
                    </div>
                </div>
            </div>

            {/* Fixed Bottom Action */}
            <div className="fixed bottom-0 left-0 right-0 bg-white px-4 py-3 max-w-lg mx-auto z-30 border-t border-slate-200">
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className={`w-full py-3 px-6 rounded-xl text-base font-semibold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${isGenerating
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/30'
                        }`}
                >
                    {isGenerating ? (
                        <>
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('create.btn_generating')}
                        </>
                    ) : (
                        <>
                            <Icons.Zap className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                            {t('advanced_create.btn_advanced_cost', { cost: getCost() * generationCount })}
                        </>
                    )}
                </button>
            </div>

            {/* Image Preview */}
            {previewImageUrl && (
                <ImagePreview imageUrl={previewImageUrl} onClose={() => setPreviewImageUrl(null)} />
            )}

            {/* 充值弹框 */}
            <RechargeModal
                isOpen={showRechargeModal}
                onClose={() => setShowRechargeModal(false)}
                user={user}
                returnUrl="/tools/advanced-creation"
            />

            {/* 底部选择弹层 */}
            <BottomSheet
                open={activeSheet === 'ratio'}
                title={t('advanced_create.sheet_ratio_title')}
                options={ratios.map(r => ({ value: r, label: r }))}
                selected={ratio}
                onSelect={v => setRatio(v as AspectRatio)}
                onClose={() => setActiveSheet(null)}
            />
            <BottomSheet
                open={activeSheet === 'resolution'}
                title={t('advanced_create.sheet_resolution_title')}
                options={(resolutionOptions as readonly string[]).map(r => ({ value: r, label: r }))}
                selected={selectedResolution}
                onSelect={setSelectedResolution}
                onClose={() => setActiveSheet(null)}
            />
            <BottomSheet
                open={activeSheet === 'model'}
                title={t('advanced_create.sheet_model_title')}
                options={imageModels.map(m => ({
                    value: m.id,
                    label: m.name,
                    description: [
                        m.description,
                        m.is_flash
                            ? t('advanced_create.price_per_gen', { price: m.price_2k ?? '-' })
                            : t('advanced_create.price_per_2k', { price: m.price_2k ?? '-' }),
                    ].filter(Boolean).join(' · '),
                }))}
                selected={selectedModel?.id ?? ''}
                onSelect={modelId => {
                    const m = imageModels.find(x => x.id === modelId);
                    setSelectedModel(m ?? null);
                }}
                onClose={() => setActiveSheet(null)}
            />
            <BottomSheet
                open={activeSheet === 'count'}
                title="选择生成次数"
                options={[1, 2, 3].map(n => ({
                    value: String(n),
                    label: `${n}次`,
                    detailRight: `${getCost() * n}豆`,
                }))}
                selected={String(generationCount)}
                onSelect={v => setGenerationCount(Number(v))}
                onClose={() => setActiveSheet(null)}
                footerTip="有时候出图效果不好，我们可以生成多次，然后选择最好的一张，这样比较节省时间"
            />
        </div>
    );
};

export default AdvancedCreation;
