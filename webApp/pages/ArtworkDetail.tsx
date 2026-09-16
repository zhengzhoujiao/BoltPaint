import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { nanoBananaService, appCache } from '../services/nanoBananaService';
import { Artwork } from '../types';
import { formatDate } from '../utils/time';
import ImagePreview from '../components/ImagePreview';
import Toast from '../components/Toast';

/**
 * 作品详情组件
 * 按照文档全局组件标准设计四层结构：
 * - 导航层：返回按钮 + 作者信息（左）+ 分享按钮（右）
 * - 第一层：作品图片
 * - 第二层：作品名称
 * - 第三层：作品提示词
 * - 第四层：做同款按钮和爱心按钮
 */
const ArtworkDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [artwork, setArtwork] = useState<Artwork | null>(null);
    const [loading, setLoading] = useState(true);
    const [showPublishDialog, setShowPublishDialog] = useState(false);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [showShareToast, setShowShareToast] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editName, setEditName] = useState('');
    const [editError, setEditError] = useState<string | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
    const [showActionToast, setShowActionToast] = useState(false);
    const [actionToastMessage, setActionToastMessage] = useState('');
    const [actionToastSuccess, setActionToastSuccess] = useState(true);
    const menuRef = useRef<HTMLDivElement>(null);
    const currentUserId = localStorage.getItem('user_id') || '';

    useEffect(() => {
        if (id) {
            nanoBananaService.getArtworkById(id).then(data => {
                setArtwork(data || null);
                setLoading(false);
            });
        }
    }, [id]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        if (showMenu) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [showMenu]);

    const handleToggleLike = async () => {
        if (!artwork) return;

        try {
            const newStatus = await nanoBananaService.toggleLike(artwork.id);
            const newLikesCount = newStatus ? artwork.likes_count + 1 : artwork.likes_count - 1;

            console.log('ArtworkDetail: 点赞状态已更新', {
                artworkId: artwork.id,
                isLiked: newStatus,
                likesCount: newLikesCount
            });

            setArtwork(prev => prev ? {
                ...prev,
                is_liked: newStatus,
                likes_count: newLikesCount
            } : null);

            // 【新增】直接更新广场缓存，防止缓存失效
            if (appCache.square.data.length > 0) {
                appCache.square.data = appCache.square.data.map(art =>
                    art.id === artwork.id
                        ? { ...art, is_liked: newStatus, likes_count: newLikesCount }
                        : art
                );
            }

            // 触发事件，通知其他页面更新
            window.dispatchEvent(new CustomEvent('artwork-like-changed', {
                detail: {
                    artworkId: artwork.id,
                    isLiked: newStatus,
                    likesCount: newLikesCount
                }
            }));

            console.log('ArtworkDetail: 已触发 artwork-like-changed 事件');
        } catch (error) {
            console.error('ArtworkDetail: 点赞失败', error);
        }
    };

    const handleRemix = async () => {
        if (!artwork) return;

        try {
            if (artwork.is_advanced) {
                // 高阶生图同款
                navigate('/tools/advanced-creation', {
                    state: {
                        model_id: artwork.model_id,
                        system_instruction: artwork.system_instruction,
                        preFilledPrompt: artwork.user_input_prompt,
                        aspectRatio: artwork.aspect_ratio,
                        resolution: artwork.resolution,
                        referenceImages: artwork.reference_images,
                        artworkImage: artwork.image_url
                    }
                });
            } else if (artwork.template_id) {
                // 普通生图同款
                const template = await nanoBananaService.getTemplateById(artwork.template_id);
                navigate('/create', {
                    state: {
                        preSelectedTemplate: template,
                        preFilledPrompt: artwork.user_input_prompt,
                        aspectRatio: artwork.aspect_ratio,
                        resolution: artwork.resolution,
                        referenceImages: artwork.reference_images,
                        artworkImage: artwork.image_url
                    }
                });
            }
        } catch (error) {
            console.error('做同款重定向失败:', error);
            alert('获取作品详情失败，请稍后重试');
        }
    };

    const handleShare = async () => {
        if (!artwork) return;

        try {
            // 生成分享链接（使用当前页面的完整 URL）
            const shareUrl = window.location.href;

            // 优先使用 Web Share API（移动端原生分享）
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: artwork.artwork_name || '作品分享',
                        text: artwork.user_input_prompt,
                        url: shareUrl,
                    });
                    return; // 如果原生分享成功，就不需要复制链接了
                } catch (err) {
                    // 用户取消分享，不处理错误
                    if ((err as Error).name === 'AbortError') {
                        return;
                    }
                    // 其他错误继续执行复制链接的逻辑
                }
            }

            // 使用 Clipboard API 复制链接
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                setShowShareToast(true);
                setTimeout(() => setShowShareToast(false), 2000);
            } else {
                // 降级方案：使用传统的复制方法
                const textArea = document.createElement('textarea');
                textArea.value = shareUrl;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                setShowShareToast(true);
                setTimeout(() => setShowShareToast(false), 2000);
            }
        } catch (error) {
            console.error('分享失败:', error);
            alert('分享失败，请稍后重试');
        }
    };

    const handlePublish = async () => {
        if (!artwork) return;

        try {
            await nanoBananaService.publishArtwork(artwork.id, true);

            // 更新本地状态
            setArtwork(prev => prev ? {
                ...prev,
                is_release: true
            } : null);

            // 【新增】直接更新广场缓存，同步发布状态
            if (appCache.square.data.length > 0) {
                const exists = appCache.square.data.some(art => art.id === artwork.id);
                if (!exists) {
                    // 如果不在列表中且已发布，则插入并重新按时间排序
                    const updatedArt = { ...artwork, is_release: true };
                    appCache.square.data = [updatedArt, ...appCache.square.data].sort((a, b) =>
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    );
                } else {
                    // 如果已在列表中，更新状态
                    appCache.square.data = appCache.square.data.map(art =>
                        art.id === artwork.id ? { ...art, is_release: true } : art
                    );
                }
            }

            // 关闭对话框
            setShowPublishDialog(false);

            // 触发事件，通知其他页面更新
            window.dispatchEvent(new CustomEvent('artwork-published', {
                detail: {
                    artworkId: artwork.id,
                    isRelease: true
                }
            }));

            showToast('发布成功', true);
        } catch (error) {
            console.error('发布作品失败:', error);
            showToast('发布失败', false);
        }
    };

    const handleUnpublish = async () => {
        if (!artwork) return;

        try {
            await nanoBananaService.publishArtwork(artwork.id, false);

            // 更新本地状态
            setArtwork(prev => prev ? {
                ...prev,
                is_release: false
            } : null);

            // 【新增】直接更新广场缓存，移除该作品
            if (appCache.square.data.length > 0) {
                appCache.square.data = appCache.square.data.filter(art => art.id !== artwork.id);
            }

            // 关闭对话框
            setShowUnpublishDialog(false);

            // 触发事件，通知其他页面更新 (广场页面会监听此事件从列表中移除)
            window.dispatchEvent(new CustomEvent('artwork-published', {
                detail: {
                    artworkId: artwork.id,
                    isRelease: false
                }
            }));

            showToast('已取消发布', true);
        } catch (error) {
            console.error('取消发布作品失败:', error);
            showToast('操作失败', false);
        }
    };

    const showToast = (message: string, success: boolean) => {
        setActionToastMessage(message);
        setActionToastSuccess(success);
        setShowActionToast(true);
        setTimeout(() => setShowActionToast(false), 2000);
    };

    const handleEditOpen = () => {
        setShowMenu(false);
        setEditName(artwork?.artwork_name || artwork?.user_input_prompt || '');
        setEditError(null);
        setShowEditDialog(true);
    };

    const handleEditSubmit = async () => {
        const name = editName.trim();
        if (!name) {
            setEditError('作品名称不能为空');
            return;
        }
        if (!artwork) return;
        setEditError(null);
        try {
            await nanoBananaService.updateArtwork(artwork.id, name);
            setArtwork(prev => prev ? { ...prev, artwork_name: name } : null);

            // 【新增】直接更新广场缓存，同步名称修改
            if (appCache.square.data.length > 0) {
                appCache.square.data = appCache.square.data.map(art =>
                    art.id === artwork.id ? { ...art, artwork_name: name } : art
                );
            }

            setShowEditDialog(false);
            showToast('修改成功', true);
        } catch (err: any) {
            showToast(err.message || '修改失败', false);
        }
    };

    const handleDeleteOpen = () => {
        setShowMenu(false);
        setShowDeleteDialog(true);
    };

    const handleDeleteConfirm = async () => {
        if (!artwork) return;
        try {
            await nanoBananaService.deleteArtwork(artwork.id);

            // 【新增】直接更新广场缓存，移除被删除的作品
            if (appCache.square.data.length > 0) {
                appCache.square.data = appCache.square.data.filter(art => art.id !== artwork.id);
            }

            setShowDeleteDialog(false);
            showToast('删除成功', true);
            window.dispatchEvent(new CustomEvent('artwork-deleted', { detail: { artworkId: artwork.id } }));
            setTimeout(() => navigate(-1), 300);
        } catch (err: any) {
            showToast(err.message || '删除失败', false);
        }
    };

    if (loading) return <div className="p-10 text-center text-slate-500">{t('artwork.loading')}</div>;
    if (!artwork) return <div className="p-10 text-center text-slate-500">{t('artwork.not_found')}</div>;

    return (
        <div className="flex flex-col h-screen bg-white z-50 fixed inset-0">
            {/* Header */}
            <div className="flex-none bg-white/95 backdrop-blur-md border-b border-slate-200 z-10 h-[50px]">
                <div className="flex items-center justify-between h-full px-3">
                    <div className="flex items-center gap-3 flex-1">
                        <button
                            onClick={() => navigate(-1)}
                            className="text-slate-600 hover:text-slate-900 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        {/* 作者信息 */}
                        {artwork && (
                            <div className="flex items-center gap-3">
                                <img
                                    src={artwork.user_avatar}
                                    alt={artwork.user_name}
                                    className="w-8 h-8 rounded-full border border-slate-200"
                                />
                                <div className="flex flex-col">
                                    <span className="text-slate-900 font-medium text-sm">{artwork.user_name}</span>
                                    <span className="text-slate-500 text-xs">{formatDate(artwork.created_at)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    {/* 本人作品：三个点菜单；非本人作品：分享按钮 */}
                    {artwork && (
                        artwork.user_id === currentUserId ? (
                            <div className="relative" ref={menuRef}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v); }}
                                    className="w-9 h-9 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors"
                                    aria-label="更多操作"
                                >
                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                        <circle cx="5" cy="12" r="1.5" />
                                        <circle cx="12" cy="12" r="1.5" />
                                        <circle cx="19" cy="12" r="1.5" />
                                    </svg>
                                </button>
                                {showMenu && (
                                    <div className="absolute right-0 top-full mt-1 py-1 min-w-[140px] bg-white rounded-lg shadow-lg border border-slate-200 z-50">
                                        <button
                                            onClick={() => { setShowMenu(false); handleShare(); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <img src="/boltPaint/images/share.png" alt="" className="w-5 h-5 object-contain" />
                                            <span className="text-sm font-medium">分享</span>
                                        </button>
                                        <button
                                            onClick={handleEditOpen}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            <span className="text-sm font-medium">修改</span>
                                        </button>
                                        {artwork.is_release && (
                                            <button
                                                onClick={() => { setShowMenu(false); setShowUnpublishDialog(true); }}
                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50 transition-colors"
                                            >
                                                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                                </svg>
                                                <span className="text-sm font-medium">取消发布</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={handleDeleteOpen}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            <span className="text-sm font-medium text-red-600">删除</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button onClick={handleShare} className="w-9 h-9 hover:opacity-80 transition-opacity" aria-label="分享">
                                <img src="/boltPaint/images/share.png" alt="分享" className="w-full h-full object-contain" />
                            </button>
                        )
                    )}
                </div>
            </div>

            {/* Content - 滚动区域 */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-14">
                <div className="bg-white">
                    {/* 第一层：作品图片 - 预览传原始 URL，由 ImagePreview 内部统一 resolve，避免重复拼接 */}
                    {artwork.comic_data && artwork.comic_data.pages && artwork.comic_data.pages.length > 1 ? (
                        <div className="w-full bg-slate-50 relative">
                            <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full">
                                {artwork.comic_data.pages.map((page: any, index: number) => (
                                    <div 
                                        key={index}
                                        className="flex-none w-full snap-center cursor-pointer relative"
                                        onClick={() => setPreviewImageUrl(page.image_url || '')}
                                    >
                                        <img
                                            src={page.thumbnail_url || page.image_url || ''}
                                            alt={artwork.artwork_name || artwork.user_input_prompt}
                                            className="w-full h-auto object-contain max-h-[60vh] mx-auto"
                                        />
                                        <div className="absolute bottom-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded-full pointer-events-none">
                                            {index + 1} / {artwork.comic_data.pages.length}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div
                            className="w-full bg-white cursor-pointer"
                            onClick={() => setPreviewImageUrl(artwork.image_url || '')}
                        >
                            <img
                                src={artwork.thumbnail_url || artwork.image_url || ''}
                                alt={artwork.artwork_name || artwork.user_input_prompt}
                                className="w-full h-auto object-contain max-h-[60vh] mx-auto"
                            />
                        </div>
                    )}

                    {/* 第二层：作品名称 */}
                    <div className="px-4 pt-3 pb-1">
                        <h1 className="text-lg font-bold text-slate-900">
                            {artwork.artwork_name || artwork.user_input_prompt}
                        </h1>
                    </div>

                    {/* 第三层：作品提示词 */}
                    <div className="px-4 pb-4">
                        <div className="bg-white rounded-lg mb-2">
                            <p className="text-slate-700 text-sm leading-relaxed">
                                {artwork.user_input_prompt}
                            </p>
                            {artwork.resolution && (
                                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                                    <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{artwork.aspect_ratio}</span>
                                    <span className="px-2 py-0.5 bg-slate-200 rounded text-xs">{artwork.resolution}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 第四层：做同款按钮和爱心按钮 - 固定在底部 */}
            <div className="fixed bottom-0 left-0 right-0 bg-white px-4 h-14 flex items-center max-w-lg mx-auto z-30 border-t border-slate-200">
                <div className="flex items-center gap-3 w-full">
                    {/* 做同款按钮 */}
                    <button
                        onClick={handleRemix}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 active:scale-[0.98] transition-all"
                    >
                        <img
                            src="/boltPaint/images/magic.png"
                            alt="magic"
                            className="w-5 h-5 object-contain"
                        />
                        {t('square.remix') || '做同款'}
                    </button>

                    {/* 发布按钮 - 仅在未发布时显示 */}
                    {!artwork.is_release && (
                        <button
                            onClick={() => setShowPublishDialog(true)}
                            className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-2 px-5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-slate-500/30 active:scale-[0.98] transition-all"
                        >
                            发布
                        </button>
                    )}

                    {/* 爱心按钮 */}
                    <button
                        onClick={handleToggleLike}
                        className="flex-shrink-0 w-8 h-8 hover:opacity-80 transition-opacity"
                    >
                        <img
                            src={artwork.is_liked ? "/boltPaint/images/like-active.png" : "/boltPaint/images/like.png"}
                            alt={artwork.is_liked ? "已喜欢" : "喜欢"}
                            className="w-full h-full object-contain"
                        />
                    </button>
                </div>
            </div>

            {/* 发布确认对话框 */}
            {showPublishDialog && (
                <>
                    {/* 背景遮罩 */}
                    <div
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={() => setShowPublishDialog(false)}
                    />

                    {/* 对话框 */}
                    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 max-w-sm mx-auto">
                        <div className="p-6 space-y-4">
                            <h3 className="text-lg font-bold text-slate-900">发布作品</h3>
                            <p className="text-slate-600 text-sm">
                                是否将作品发布到广场？
                            </p>

                            {/* 按钮组 */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowPublishDialog(false)}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handlePublish}
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors"
                                >
                                    确认
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* 图片预览组件 */}
            {previewImageUrl && (
                <ImagePreview
                    imageUrl={previewImageUrl}
                    onClose={() => setPreviewImageUrl(null)}
                />
            )}

            {/* 分享成功提示 */}
            {showShareToast && (
                <Toast
                    message="分享链接已复制"
                    onClose={() => setShowShareToast(false)}
                />
            )}

            {/* 编辑作品名称弹窗 */}
            {showEditDialog && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-40" onClick={() => { setShowEditDialog(false); setEditError(null); }} />
                    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 max-w-sm mx-auto p-6">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">修改作品名称</h3>
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => { setEditName(e.target.value); setEditError(null); }}
                            placeholder="请输入作品名称"
                            className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-1 ${editError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-500'}`}
                        />
                        {editError && <p className="text-red-600 text-sm mt-1">{editError}</p>}
                        <div className="flex gap-3 mt-4">
                            <button onClick={() => { setShowEditDialog(false); setEditError(null); }} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium">取消</button>
                            <button onClick={handleEditSubmit} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium">确定</button>
                        </div>
                    </div>
                </>
            )}

            {/* 删除确认弹窗 */}
            {showDeleteDialog && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowDeleteDialog(false)} />
                    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 max-w-sm mx-auto p-6">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">确认删除</h3>
                        <p className="text-slate-600 text-sm mb-6">确定要删除该作品吗？此操作无法撤销。</p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowDeleteDialog(false)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium">取消</button>
                            <button onClick={handleDeleteConfirm} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium">确认删除</button>
                        </div>
                    </div>
                </>
            )}

            {/* 取消发布确认弹窗 */}
            {showUnpublishDialog && (
                <>
                    <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowUnpublishDialog(false)} />
                    <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 max-w-sm mx-auto p-6">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">确认取消发布</h3>
                        <p className="text-slate-600 text-sm mb-6">取消发布后，该作品将不再显示在广场上。您可以在以后重新发布。</p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowUnpublishDialog(false)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium">取消</button>
                            <button onClick={handleUnpublish} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium">确认</button>
                        </div>
                    </div>
                </>
            )}

            {/* 操作结果提示 */}
            {showActionToast && (
                <Toast
                    message={actionToastMessage}
                    type={actionToastSuccess ? 'success' : 'error'}
                    onClose={() => setShowActionToast(false)}
                />
            )}
        </div>
    );
};

export default ArtworkDetail;