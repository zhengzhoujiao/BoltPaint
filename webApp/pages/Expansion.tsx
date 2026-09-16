import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icons } from '../constants';
import { AspectRatio, ZoomLevel, ProcessMode, createPaddedImage } from '../utils/expansionUtils';
import { API_BASE_URL, authenticatedFetch, nanoBananaService } from '../services/nanoBananaService';
import { User, PricingStrategy } from '../types';
import RechargeModal from '../components/RechargeModal';
import Toast from '../components/Toast';

const Expansion: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [originalFile, setOriginalFile] = useState<File | null>(null);
    const [originalPreview, setOriginalPreview] = useState<string | null>(null);
    const [paddedPreview, setPaddedPreview] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);

    const [ratio, setRatio] = useState<AspectRatio>(AspectRatio.Square);
    const [zoom, setZoom] = useState<ZoomLevel>(ZoomLevel.Small);
    const [mode, setMode] = useState<ProcessMode>(ProcessMode.AI);
    const [prompt, setPrompt] = useState<string>('');
    const [color, setColor] = useState<string>('#000000');

    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cost, setCost] = useState<number | null>(null);

    // User and pricing state
    const [user, setUser] = useState<User | null>(null);
    const [expectedCost, setExpectedCost] = useState<number>(5);
    const [showRechargeModal, setShowRechargeModal] = useState(false);

    // Save state before payment
    const saveStateToLocal = () => {
        const stateToSave = {
            ratio,
            zoom,
            mode,
            prompt,
            color,
            // 原始图片文件因为安全限制无法序列化，但我们可以保存其base64预览，如果存在的话
            // 注意：存储太大的base64可能会超出localStorage限制（一般5MB），如果是长图慎用
            originalPreview: originalPreview?.length && originalPreview.length < 2 * 1024 * 1024 ? originalPreview : null
        };
        try {
            localStorage.setItem('expansion_creation_state', JSON.stringify(stateToSave));
        } catch (e) {
            console.warn("Could not save full image state due to size limits");
            // 退化只存参数
            localStorage.setItem('expansion_creation_state', JSON.stringify({...stateToSave, originalPreview: null}));
        }
    };

    // Initialize user, pricing and load saved state
    React.useEffect(() => {
        nanoBananaService.getUserProfile().then(setUser).catch(() => {});
        nanoBananaService.getPricingStrategies().then(strategies => {
            const bananaStrategy = strategies.find(s => s.id === 'Banana');
            if (bananaStrategy) {
                setExpectedCost(bananaStrategy.price_1k ?? 5);
            }
        }).catch(console.error);

        // Restore state
        const savedStateStr = localStorage.getItem('expansion_creation_state');
        if (savedStateStr) {
            try {
                const savedState = JSON.parse(savedStateStr);
                if (savedState.ratio) setRatio(savedState.ratio);
                if (savedState.zoom) setZoom(savedState.zoom);
                if (savedState.mode) setMode(savedState.mode);
                if (savedState.prompt) setPrompt(savedState.prompt);
                if (savedState.color) setColor(savedState.color);
                
                // 如果保存了预览图（Base64形式）
                if (savedState.originalPreview && savedState.originalPreview.startsWith('data:image')) {
                    // 我们将它设回 preview。但是注意此时 originalFile 是 null。
                    // 只有在调用 createPaddedImage 时，如果是 string 类型的 base64 也应该能兼容，
                    // 但 utils/expansionUtils.ts 里面的 createPaddedImage 只接受 File。
                    // 为了兼容，我们把 base64 转换回 File 对象。
                    fetch(savedState.originalPreview)
                        .then(res => res.blob())
                        .then(blob => {
                            const file = new File([blob], "restored_image.png", { type: "image/png" });
                            setOriginalFile(file);
                            setOriginalPreview(savedState.originalPreview);
                        })
                        .catch(e => console.error("Failed to restore image file", e));
                }
                
                localStorage.removeItem('expansion_creation_state');
            } catch (e) {
                console.error("Failed to parse saved expansion state", e);
            }
        }
    }, []);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('请选择图片文件');
            return;
        }

        setOriginalFile(file);
        setOriginalPreview(URL.createObjectURL(file));
        setResultImage(null);
        setError(null);

        // Generate padded preview
        try {
            const padded = await createPaddedImage(file, ratio, zoom, mode, color);
            setPaddedPreview(padded);
        } catch (err) {
            console.error('Failed to create padded preview:', err);
            setError('图片处理失败');
        }
    };

    const handleSettingsChange = async () => {
        if (!originalFile) return;

        try {
            const padded = await createPaddedImage(originalFile, ratio, zoom, mode, color);
            setPaddedPreview(padded);
        } catch (err) {
            console.error('Failed to update padded preview:', err);
        }
    };

    React.useEffect(() => {
        handleSettingsChange();
    }, [ratio, zoom, mode, color]);

    const handleGenerate = async () => {
        if (!paddedPreview) return;

        setIsProcessing(true);
        setError(null);

        try {
            if (!user || user.balance_beans < expectedCost) {
                saveStateToLocal();
                setShowRechargeModal(true);
                setIsProcessing(false);
                return;
            }

            const response = await authenticatedFetch(`${API_BASE_URL}/expansion/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    base64_image: paddedPreview,
                    prompt: mode === ProcessMode.Prompt ? prompt : (mode === ProcessMode.Color ? color : (prompt || '自然延伸图片内容')),
                    aspect_ratio: ratio,
                    mode: mode,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || '生成失败');
            }

            const data = await response.json();
            setResultImage(`${API_BASE_URL}${data.image_url}`);
            setCost(data.cost);

        } catch (err: any) {
            console.error('Generation failed:', err);
            setError(err.message || '生成失败，请重试');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            {/* 充值弹框 */}
            <RechargeModal
                isOpen={showRechargeModal}
                onClose={() => setShowRechargeModal(false)}
                user={user}
                returnUrl="/tools/expansion"
            />

            {/* Header */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md h-[50px] px-4 border-b border-slate-200 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-lg font-bold text-slate-900">AI 扩图</h1>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Main Form Card */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 min-h-full flex flex-col">
                    {/* Upload Section */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">上传图片</label>
                        {!originalFile ? (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all"
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Icons.Upload className="w-6 h-6 text-indigo-600" />
                                </div>
                                <p className="text-sm text-slate-600 mb-1">点击选择图片文件</p>
                                <p className="text-xs text-slate-400">支持 JPG、PNG 等格式</p>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="rounded-lg overflow-hidden border border-slate-200 mb-2">
                                    <img src={originalPreview!} alt="Original" className="w-full h-auto" />
                                </div>
                                <button
                                    onClick={() => {
                                        setOriginalFile(null);
                                        setOriginalPreview(null);
                                        setPaddedPreview(null);
                                        setResultImage(null);
                                        setError(null);
                                    }}
                                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                                >
                                    重新选择图片
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Aspect Ratio */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">画面比例</label>
                        <div className="grid grid-cols-3 gap-2">
                            {Object.entries({
                                [AspectRatio.Square]: '1:1',
                                [AspectRatio.Portrait]: '3:4',
                                [AspectRatio.Landscape]: '4:3',
                                [AspectRatio.Tall]: '9:16',
                                [AspectRatio.Wide]: '16:9',
                            }).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => setRatio(key as AspectRatio)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${ratio === key
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Zoom Level */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">扩展幅度</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { value: ZoomLevel.One, label: '1.0x' },
                                { value: ZoomLevel.Small, label: '1.2x' },
                                { value: ZoomLevel.Medium, label: '1.5x' },
                            ].map(({ value, label }) => (
                                <button
                                    key={value}
                                    onClick={() => setZoom(value)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${zoom === value
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Processing Mode */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">处理模式</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                onClick={() => setMode(ProcessMode.AI)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === ProcessMode.AI
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    }`}
                            >
                                智能填充
                            </button>
                            <button
                                onClick={() => setMode(ProcessMode.Prompt)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === ProcessMode.Prompt
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    }`}
                            >
                                提示词模式
                            </button>
                            <button
                                onClick={() => setMode(ProcessMode.Color)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === ProcessMode.Color
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    }`}
                            >
                                纯色模式
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            {mode === ProcessMode.AI && '智能填充：AI 自动扩展画面内容'}
                            {mode === ProcessMode.Prompt && '提示词模式：使用自定义提示词指导 AI 扩展'}
                            {mode === ProcessMode.Color && '纯色模式：AI 将去除原图背景并替换为你指定的纯色'}
                        </p>
                    </div>

                    {/* Color Picker - Only show in Color mode */}
                    {mode === ProcessMode.Color && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-700 mb-2">填充颜色</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    className="w-12 h-12 rounded-lg border border-slate-200 cursor-pointer"
                                />
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        value={color}
                                        onChange={(e) => setColor(e.target.value)}
                                        placeholder="#000000"
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Prompt - Only show in Prompt mode */}
                    {mode === ProcessMode.Prompt && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-700 mb-2">扩展提示词</label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="描述你希望扩展区域呈现的内容"
                                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                rows={3}
                            />
                        </div>
                    )}

                    {/* Preview */}
                    {paddedPreview && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                预览（洋红色区域将由 AI 处理并填充）
                            </label>
                            <div className="relative rounded-lg overflow-hidden border border-slate-200">
                                <img src={paddedPreview} alt="Preview" className="w-full h-auto" />
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <Toast message={error} type="error" onClose={() => setError(null)} />
                    )}

                    <div className="mt-auto pt-4">
                        {/* Generate Button */}
                        <button
                            onClick={handleGenerate}
                            disabled={!originalFile || isProcessing}
                            className="w-full px-4 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-[0.98]"
                        >
                            {isProcessing ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    生成中...
                                </>
                            ) : (
                                <>
                                    <Icons.Zap className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                                    生成 ({expectedCost}豆)
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Result */}
                {resultImage && (
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                <Icons.Check className="w-5 h-5 text-green-600" />
                                扩图完成
                            </h3>
                            {cost !== null && (
                                <span className="text-sm text-slate-600">消耗 {cost} 豆子</span>
                            )}
                        </div>

                        <div className="relative rounded-lg overflow-hidden border border-slate-200 mb-4">
                            <img src={resultImage} alt="Result" className="w-full h-auto" />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setOriginalFile(null);
                                    setOriginalPreview(null);
                                    setPaddedPreview(null);
                                    setResultImage(null);
                                    setCost(null);
                                    setError(null);
                                }}
                                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                            >
                                继续扩图
                            </button>
                            <a
                                href={resultImage}
                                download={`expansion_${Date.now()}.png`}
                                className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors text-center"
                            >
                                下载图片
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Expansion;
