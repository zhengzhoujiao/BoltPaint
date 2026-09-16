import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { nanoBananaService } from '../services/nanoBananaService';
import { AspectRatio, ImageModel, User, TaskStatus } from '../types';
import BottomSheet from '../components/BottomSheet';
import { Icons, filterComicMasterImageModels } from '../constants';
import Toast from '../components/Toast';

import RechargeModal from '../components/RechargeModal';

    /** 从失败任务「重新生成」跳转时携带的路由 state */
    type ComicRegenerateLocationState = {
        regenerateFromTask?: boolean;
        comicTitle?: string;
        characters?: string;
        plot?: string;
        pages?: number;
        generateCover?: boolean;
        coverTitleMode?: 'ai' | 'custom';
        customCoverTitle?: string;
        aspectRatio?: AspectRatio;
        modelId?: string;
        resolution?: '2K' | '4K';
    };

const ComicGeneration: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const locStateOnMountRef = useRef(location.state);
    const regenAppliedRef = useRef(false);
    const pendingComicModelIdRef = useRef<string | null>(null);

    const [user, setUser] = useState<User | null>(null);

    // Form fields
    const [comicTitle, setComicTitle] = useState('');
    const [characters, setCharacters] = useState('');
    const [plot, setPlot] = useState('');
    const [pages, setPages] = useState(6);
    const [ratio, setRatio] = useState<AspectRatio>(AspectRatio.THREE_FOUR);
    const [generateCover, setGenerateCover] = useState(true);
    const [coverTitleMode, setCoverTitleMode] = useState<'ai' | 'custom'>('ai');
    const [customCoverTitle, setCustomCoverTitle] = useState('');

    // Model & pricing
    const [imageModels, setImageModels] = useState<ImageModel[]>([]);
    const [selectedModel, setSelectedModel] = useState<ImageModel | null>(null);
    const [selectedResolution, setSelectedResolution] = useState<'2K' | '4K'>('2K');

    // Bottom sheet
    const [activeSheet, setActiveSheet] = useState<'ratio' | 'pages' | 'model' | 'resolution' | null>(null);

    // State
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showRechargeModal, setShowRechargeModal] = useState(false);

    // Save state before payment
    const saveStateToLocal = () => {
        const stateToSave = {
            comicTitle,
            characters,
            plot,
            pages,
            ratio,
            generateCover,
            coverTitleMode,
            customCoverTitle,
            selectedModelId: selectedModel?.id,
            selectedResolution
        };
        localStorage.setItem('comic_creation_state', JSON.stringify(stateToSave));
    };

    // 从失败任务还原：优先于 localStorage（支付回流等）
    useEffect(() => {
        const st = locStateOnMountRef.current as ComicRegenerateLocationState | undefined;
        if (!st?.regenerateFromTask || regenAppliedRef.current) return;
        regenAppliedRef.current = true;
        if (st.comicTitle != null) setComicTitle(st.comicTitle);
        if (st.characters != null) setCharacters(st.characters);
        if (st.plot != null) setPlot(st.plot);
        if (typeof st.pages === 'number' && st.pages >= 1 && st.pages <= 10) setPages(st.pages);
        if (typeof st.generateCover === 'boolean') setGenerateCover(st.generateCover);
        if (st.coverTitleMode === 'ai' || st.coverTitleMode === 'custom') setCoverTitleMode(st.coverTitleMode);
        if (st.customCoverTitle != null) setCustomCoverTitle(st.customCoverTitle);
        if (st.aspectRatio && (Object.values(AspectRatio) as string[]).includes(st.aspectRatio)) {
            setRatio(st.aspectRatio);
        }
        if (st.resolution === '2K' || st.resolution === '4K') setSelectedResolution(st.resolution);
        if (st.modelId) pendingComicModelIdRef.current = st.modelId;
        navigate(location.pathname, { replace: true, state: {} });
    }, [navigate, location.pathname]);

    // Load state on mount（支付回流等；若本次进入为「失败重试」则跳过）
    useEffect(() => {
        if ((locStateOnMountRef.current as ComicRegenerateLocationState | undefined)?.regenerateFromTask) return;
        const savedStateStr = localStorage.getItem('comic_creation_state');
        if (savedStateStr) {
            try {
                const savedState = JSON.parse(savedStateStr);
                if (savedState.comicTitle) setComicTitle(savedState.comicTitle);
                if (savedState.characters) setCharacters(savedState.characters);
                if (savedState.plot) setPlot(savedState.plot);
                if (savedState.pages) setPages(savedState.pages);
                if (savedState.ratio) setRatio(savedState.ratio);
                if (savedState.generateCover !== undefined) setGenerateCover(savedState.generateCover);
                if (savedState.coverTitleMode) setCoverTitleMode(savedState.coverTitleMode);
                if (savedState.customCoverTitle) setCustomCoverTitle(savedState.customCoverTitle);
                if (savedState.selectedResolution) setSelectedResolution(savedState.selectedResolution);
                // selectedModel recovery is handled in fetchInitialData
                localStorage.removeItem('comic_creation_state');
            } catch (e) {
                console.error("Failed to parse saved comic creation state", e);
            }
        }
    }, []);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [profile, models] = await Promise.all([
                    nanoBananaService.getUserProfile(),
                    nanoBananaService.getImageModels(),
                ]);
                setUser(profile);
                const comicModels = filterComicMasterImageModels(models);
                setImageModels(comicModels);

                const pendingRegenId = pendingComicModelIdRef.current;
                const savedStateStr = localStorage.getItem('comic_creation_state');
                let savedModelId = null;
                if (savedStateStr) {
                    try {
                        const savedState = JSON.parse(savedStateStr);
                        savedModelId = savedState.selectedModelId;
                    } catch (e) { /* ignore */ }
                }

                if (pendingRegenId && comicModels.length > 0) {
                    const matched = comicModels.find(m => m.id === pendingRegenId) || comicModels[0];
                    setSelectedModel(matched);
                    pendingComicModelIdRef.current = null;
                } else if (savedModelId && comicModels.length > 0) {
                    const matched = comicModels.find(m => m.id === savedModelId) || comicModels[0];
                    setSelectedModel(matched);
                } else if (comicModels.length > 0) {
                    setSelectedModel(comicModels[0]);
                }
            } catch (err) {
                console.error('Failed to fetch comic generation data:', err);
            }
        };

        fetchInitialData();
    }, []);

    // 若模型列表晚于「重试还原」写入 pending id，再补选一次
    useEffect(() => {
        const mid = pendingComicModelIdRef.current;
        if (!mid || imageModels.length === 0) return;
        const m = imageModels.find(x => x.id === mid);
        if (m) {
            setSelectedModel(m);
            pendingComicModelIdRef.current = null;
        }
    }, [imageModels]);

    const pricePerPage = useMemo(() => {
        if (!selectedModel) return 10;
        return selectedResolution === '4K' ? (selectedModel.price_4k ?? 40) : (selectedModel.price_2k ?? 10);
    }, [selectedModel, selectedResolution]);

    const getCost = () => {
        let total = pricePerPage * pages;
        if (generateCover) {
            total += pricePerPage;
        }
        return total;
    };

    const handleGenerate = async () => {
        if (!comicTitle.trim()) {
            setError('请输入漫画名称');
            return;
        }
        if (!characters.trim()) {
            setError('请输入主角设定');
            return;
        }
        if (!plot.trim()) {
            setError('请输入剧情概要');
            return;
        }

        const cost = getCost();
        if (!user || user.balance_beans < cost) {
            saveStateToLocal();
            setShowRechargeModal(true);
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            await nanoBananaService.generateComic({
                comic_title: comicTitle,
                characters,
                plot,
                pages,
                aspect_ratio: ratio,
                generate_cover: generateCover,
                cover_title_mode: coverTitleMode,
                custom_cover_title: coverTitleMode === 'custom' ? customCoverTitle : undefined,
                model_id: selectedModel?.id || 'gemini-3-pro-image-preview',
                resolution: selectedResolution,
            });
            sessionStorage.setItem('tasks_activeTab', TaskStatus.GENERATING);
            navigate('/tasks');
        } catch (err: any) {
            setError(err.message || '生成漫画任务创建失败，请重试');
            setIsGenerating(false);
        }
    };

    const modelOptions = imageModels.map(m => ({
        value: m.id,
        label: m.name,
        detailRight: `${m.price_2k ?? '-'}豆/页(2K)`,
    }));

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
                    <h1 className="text-lg font-bold text-slate-900">漫画大师</h1>
                </div>
                <div className="flex items-center gap-1 bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                    <span className="text-sm font-bold text-amber-700">{user?.balance_beans || 0}</span>
                </div>
            </div>

            {/* Scroll Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-[72px]">
                <div className="p-4 space-y-4">

                    {/* Form Inputs */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-800 mb-1">漫画名称</label>
                            <input
                                type="text"
                                value={comicTitle}
                                onChange={(e) => setComicTitle(e.target.value)}
                                placeholder="输入你要二创漫画的名称，例如：鬼灭之刃"
                                className="w-full text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 placeholder:text-slate-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-800 mb-1">主角设定</label>
                            <textarea
                                value={characters}
                                onChange={(e) => setCharacters(e.target.value)}
                                placeholder="例如：甘露寺蜜璃和伊黑小芭内（支持指定服饰、发型等）"
                                className="w-full h-20 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 resize-none leading-relaxed placeholder:text-slate-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-800 mb-1">剧情概要</label>
                            <textarea
                                value={plot}
                                onChange={(e) => setPlot(e.target.value)}
                                placeholder="例如：甜剧，情侣，讲述两人在现代校园的日常拌嘴"
                                className="w-full h-24 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 resize-none leading-relaxed placeholder:text-slate-400"
                            />
                        </div>
                    </div>

                    {/* Configuration Options */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-2">
                        <div className="flex items-center">
                            <h3 className="text-sm font-semibold text-slate-800">生成配置</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {/* 页数 */}
                            <button
                                type="button"
                                onClick={() => setActiveSheet('pages')}
                                className="flex items-center gap-1 px-4 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
                            >
                                页数：{pages}页
                                <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {/* 宽高比 */}
                            <button
                                type="button"
                                onClick={() => setActiveSheet('ratio')}
                                className="flex items-center gap-1 px-4 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
                            >
                                比例：{ratio}
                                <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {/* 模型选择 */}
                            <button
                                type="button"
                                onClick={() => setActiveSheet('model')}
                                className="flex items-center gap-1 px-4 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
                            >
                                模型：{selectedModel?.name || '加载中...'}
                                <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {/* 分辨率选择 */}
                            <button
                                type="button"
                                onClick={() => setActiveSheet('resolution')}
                                className="flex items-center gap-1 px-4 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
                            >
                                分辨率：{selectedResolution}
                                <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                        </div>

                        {/* 封面选项 */}
                        <div className="pt-2 border-t border-slate-100">
                            <label className="flex items-center gap-3 cursor-pointer py-1 group">
                                <div className="relative flex items-center justify-center">
                                    <input
                                        type="checkbox"
                                        checked={generateCover}
                                        onChange={(e) => setGenerateCover(e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <div className="w-5 h-5 border-2 border-slate-300 rounded bg-white peer-checked:bg-pink-500 peer-checked:border-pink-500 transition-colors"></div>
                                    <Icons.Check className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                                </div>
                                <div className="flex-1">
                                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                                        生成封面图（需{pricePerPage}豆）
                                    </span>
                                </div>
                            </label>

                            {/* 封面名称自定义选项 */}
                            {generateCover && (
                                <div className="space-y-1 pt-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight ml-1">封面标题</label>
                                    <div className="relative group/input flex items-center">
                                        <input
                                            type="text"
                                                value={coverTitleMode === 'ai' ? '' : customCoverTitle}
                                                onChange={(e) => setCustomCoverTitle(e.target.value)}
                                                disabled={coverTitleMode === 'ai'}
                                                placeholder={coverTitleMode === 'ai' ? "系统根据剧情自动生成" : "请输入封面标题"}
                                                className={`w-full text-xs text-slate-900 bg-white border border-slate-200 rounded-lg py-2.5 pl-3 pr-[130px] focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 transition-all ${coverTitleMode === 'ai' ? 'bg-slate-100/50 cursor-not-allowed border-slate-100 text-slate-400' : 'placeholder:text-slate-300'}`}
                                            maxLength={20}
                                        />
                                        <div className="absolute right-1 flex bg-slate-50 border border-slate-100 rounded-md p-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setCoverTitleMode('ai')}
                                                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${coverTitleMode === 'ai'
                                                        ? 'bg-white text-pink-500 shadow-sm border border-slate-100'
                                                        : 'text-slate-500 hover:text-slate-700'
                                                        }`}
                                                >
                                                    AI生成
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setCoverTitleMode('custom')}
                                                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${coverTitleMode === 'custom'
                                                        ? 'bg-white text-pink-500 shadow-sm border border-slate-100'
                                                        : 'text-slate-500 hover:text-slate-700'
                                                        }`}
                                                >
                                                    自定义
                                                </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Error message */}
                    {error && (
                        <Toast message={error} type="error" onClose={() => setError(null)} />
                    )}
                </div>
            </div>

            {/* Fixed Bottom Action */}
            <div className="fixed bottom-0 left-0 right-0 bg-white px-4 py-3 max-w-lg mx-auto z-30 border-t border-slate-200">
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className={`w-full py-3 px-6 rounded-xl text-base font-semibold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${isGenerating
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-pink-500 to-orange-400 hover:from-pink-400 hover:to-orange-300 text-white shadow-pink-500/30'
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
                            生成漫画 ({getCost()}豆)
                        </>
                    )}
                </button>
            </div>

            {/* 充值弹框 */}
            <RechargeModal
                isOpen={showRechargeModal}
                onClose={() => setShowRechargeModal(false)}
                user={user}
                returnUrl="/tools/comic-generation"
            />

            <BottomSheet
                open={activeSheet === 'ratio'}
                title={t('advanced_create.sheet_ratio_title')}
                options={Object.values(AspectRatio).map(r => ({ value: r, label: r }))}
                selected={ratio}
                onSelect={v => setRatio(v as AspectRatio)}
                onClose={() => setActiveSheet(null)}
            />

            <BottomSheet
                open={activeSheet === 'pages'}
                title="选择生成页数"
                options={Array.from({ length: 10 }, (_, i) => i + 1).map(n => ({
                    value: String(n),
                    label: `${n}页`,
                    detailRight: `${n * pricePerPage}豆`,
                }))}
                selected={String(pages)}
                onSelect={v => setPages(Number(v))}
                onClose={() => setActiveSheet(null)}
            />

            <BottomSheet
                open={activeSheet === 'model'}
                title="选择生图模型"
                options={modelOptions}
                selected={selectedModel?.id || ''}
                onSelect={v => {
                    const m = imageModels.find(m => m.id === v);
                    if (m) setSelectedModel(m);
                }}
                onClose={() => setActiveSheet(null)}
            />

            <BottomSheet
                open={activeSheet === 'resolution'}
                title="选择分辨率"
                options={[
                    {
                        value: '2K',
                        label: '2K',
                        detailRight: selectedModel ? `${selectedModel.price_2k ?? '-'}豆/页` : '',
                    },
                    {
                        value: '4K',
                        label: '4K（高清）',
                        detailRight: selectedModel ? `${selectedModel.price_4k ?? '-'}豆/页` : '',
                    },
                ]}
                selected={selectedResolution}
                onSelect={v => setSelectedResolution(v as '2K' | '4K')}
                onClose={() => setActiveSheet(null)}
            />
        </div>
    );
};

export default ComicGeneration;
