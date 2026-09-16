import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL, authenticatedFetch, nanoBananaService } from '../services/nanoBananaService';
import { clearSessionAndRedirectToLogin } from '../utils/auth';
import { ImageModel, PricingStrategy, Task } from '../types';
import { Icons, filterComicMasterImageModels } from '../constants';
import ImagePreview from '../components/ImagePreview';
import Toast from '../components/Toast';

interface ComicPage {
  page_number: number;
  is_cover?: boolean;
  theater_name?: string;
  image_url: string;
  thumbnail_url?: string;
  prompt: string;
  is_redrawing?: boolean;
  redraw_error?: string;
}

const ComicDetail: React.FC = () => {
  const navigate = useNavigate();
  const { taskId } = useParams<{ taskId: string }>();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 图片预览
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // 重绘抽屉
  const [redrawDrawerOpen, setRedrawDrawerOpen] = useState(false);
  const [selectedPage, setSelectedPage] = useState<ComicPage | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [isSubmittingRedraw, setIsSubmittingRedraw] = useState(false);
  const [redrawError, setRedrawError] = useState<string | null>(null);

  // 用于展示任务所用模型名称（重绘与创建任务时一致，不可改）
  const [imageModels, setImageModels] = useState<ImageModel[]>([]);
  const [pricingStrategies, setPricingStrategies] = useState<PricingStrategy[]>([]);

  // Toast
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // 保存为作品
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [artworkName, setArtworkName] = useState('');
  const [isRelease, setIsRelease] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 批量下载状态
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  useEffect(() => {
    nanoBananaService
      .getImageModels()
      .then(models => setImageModels(filterComicMasterImageModels(models)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    nanoBananaService.getPricingStrategies().then(setPricingStrategies).catch(() => {});
  }, []);

  /** 与任务创建时一致的分辨率档位（用于展示与预估扣费） */
  const lockedRedrawResolution = useMemo((): '2K' | '4K' => {
    const r = (task?.resolution ?? '2K').toString().trim().toUpperCase();
    return r === '4K' ? '4K' : '2K';
  }, [task?.resolution]);

  const lockedRedrawModel = useMemo(() => {
    if (!task?.model_id) return null;
    return imageModels.find(m => m.id === task.model_id) ?? null;
  }, [task?.model_id, imageModels]);

  /** 与后端一致：优先任务上的 pricing_strategy_id，否则回退到当前模型关联价格 */
  const redrawCost = useMemo(() => {
    if (!task) return 10;
    const stratId = task.pricing_strategy_id;
    const strat = stratId ? pricingStrategies.find(s => s.id === stratId) : undefined;
    if (strat) {
      return lockedRedrawResolution === '4K' ? (strat.price_4k ?? 40) : (strat.price_2k ?? 10);
    }
    if (lockedRedrawModel) {
      return lockedRedrawResolution === '4K'
        ? (lockedRedrawModel.price_4k ?? 40)
        : (lockedRedrawModel.price_2k ?? 10);
    }
    return lockedRedrawResolution === '4K' ? 40 : 10;
  }, [task, pricingStrategies, lockedRedrawResolution, lockedRedrawModel]);

  // 提示微信外部浏览器打开的遮罩
  const [showWechatMask, setShowWechatMask] = useState(false);

  const isWechat = () => {
    return /MicroMessenger/i.test(navigator.userAgent);
  };

  const loadTask = async (silent = false) => {
    if (!taskId) return;
    if (!silent) setLoading(true);
    try {
      const t = await nanoBananaService.getTaskById(taskId);
      setTask(t);
    } catch (e: any) {
      if (!silent) setError(e.message || '加载任务失败');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadTask();
  }, [taskId]);

  // 当有页面正在重绘时持续轮询
  useEffect(() => {
    if (!task?.comic_data?.pages) return;
    const hasRedrawing = (task.comic_data.pages as ComicPage[]).some(p => p.is_redrawing);
    if (!hasRedrawing) return;
    const interval = setInterval(() => loadTask(true), 2500);
    return () => clearInterval(interval);
  }, [task]);

  const pages: ComicPage[] = task?.comic_data?.pages
    ? [...(task.comic_data.pages as ComicPage[])].sort((a, b) => a.page_number - b.page_number)
    : [];

  const showSuccessToast = (msg: string) => {
    setToastMessage(msg);
    setToastType('success');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  const showErrorToast = (msg: string) => {
    setToastMessage(msg);
    setToastType('error');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3500);
  };

  // 批量下载（须带 JWT，不能用 location 跳转）
  const handleBatchDownload = async () => {
    if (isWechat()) {
      setShowWechatMask(true);
      return;
    }
    if (!taskId) return;
    if (!localStorage.getItem('auth_token')) {
      clearSessionAndRedirectToLogin();
      return;
    }
    setIsDownloadingAll(true);
    try {
      const base = API_BASE_URL.replace(/\/$/, '');
      const res = await authenticatedFetch(`${base}/tasks/${taskId}/download_zip`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { detail?: string }).detail || `下载失败 (${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      let filename = `${(task?.task_name || 'comic').replace(/[/\\?%*:|"<>]/g, '_')}.zip`;
      if (cd) {
        const utf8Match = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
        const asciiMatch = cd.match(/filename="([^"]+)"/i) || cd.match(/filename=([^;\s]+)/i);
        const raw = utf8Match?.[1] || asciiMatch?.[1];
        if (raw) {
          try {
            filename = decodeURIComponent(raw.replace(/^"|"$/g, ''));
          } catch {
            filename = raw.replace(/^"|"$/g, '');
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showSuccessToast('已开始下载');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '下载失败';
      showErrorToast(msg);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  // 打开重绘抽屉
  const openRedrawDrawer = (page: ComicPage) => {
    setSelectedPage(page);
    setEditedPrompt(page.prompt || '');
    setRedrawError(null);
    setRedrawDrawerOpen(true);
  };

  // 执行重绘
  const handleRedraw = async () => {
    if (!selectedPage || !taskId || !editedPrompt.trim()) return;
    setIsSubmittingRedraw(true);
    setRedrawError(null);
    try {
      await nanoBananaService.redrawComicPage(taskId, selectedPage.page_number, editedPrompt.trim());
      setRedrawDrawerOpen(false);
      setSelectedPage(null);
      await loadTask(true);
      showSuccessToast('重绘任务已启动，完成后将自动更新');
    } catch (e: any) {
      setRedrawError(e.message || '重绘失败，请重试');
    } finally {
      setIsSubmittingRedraw(false);
    }
  };

  // 保存为作品相关逻辑
  const handleSaveClick = () => {
    if (!task) return;
    if (task.saved_as_artwork) {
      setToastType('error');
      setToastMessage('该任务已保存为作品');
      setShowToast(true);
      return;
    }
    setArtworkName('');
    setIsRelease(false);
    setDialogError(null);
    setShowSaveDialog(true);
  };

  const handleSaveSubmit = async () => {
    if (!task || !artworkName.trim()) {
      setDialogError('作品名称不能为空');
      return;
    }

    setDialogError(null);
    setIsSaving(true);
    try {
      await nanoBananaService.taskToArtwork(task.id);
      await nanoBananaService.saveArtwork(task.id, artworkName, isRelease);
      
      setTask({ ...task, saved_as_artwork: true });
      setShowSaveDialog(false);
      showSuccessToast('保存成功');
    } catch (err: any) {
      setDialogError(err.message || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const getPageLabel = (page: ComicPage) => {
    if (page.is_cover) return '封面';
    return `第 ${page.page_number} 页`;
  };

  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-slate-50 items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-500 mb-3"></div>
        <p className="text-slate-500 text-sm">加载中...</p>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex flex-col h-screen bg-slate-50 items-center justify-center p-6 text-center">
        <Icons.X className="w-12 h-12 text-red-400 mb-3" />
        <p className="text-slate-700 font-medium">{error || '任务不存在'}</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 px-5 py-2 bg-slate-200 rounded-xl text-sm font-medium text-slate-700"
        >
          返回
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="flex-none bg-white/95 backdrop-blur-md h-[50px] px-3 border-b border-slate-200 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-slate-600 hover:text-slate-900 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">{task.task_name || '漫画详情'}</h1>
            <p className="text-xs text-slate-400">{pages.length} 张图</p>
          </div>
        </div>

        {/* 批量下载按钮 */}
        <button
          onClick={handleBatchDownload}
          disabled={isDownloadingAll || pages.length === 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isDownloadingAll
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-pink-50 text-pink-600 hover:bg-pink-100 border border-pink-200'
          }`}
        >
          {isDownloadingAll ? (
            <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
          全部下载
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-[90px]">
        {pages.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Icons.Image className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>暂无漫画图片</p>
          </div>
        ) : (
          pages.map((page) => {
            const isRedrawing = !!page.is_redrawing;
            const hasError = !!page.redraw_error;
            const displayUrl = page.thumbnail_url || page.image_url || '';

            return (
              <div key={page.page_number} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* 页码标题行 */}
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {page.is_cover ? (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">封面</span>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                        第 {page.page_number} 页
                      </span>
                    )}
                    {isRedrawing ? (
                      <span className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
                        重绘中
                      </span>
                    ) : hasError ? (
                      <span className="text-xs text-red-500 font-medium">重绘失败</span>
                    ) : (
                      <span className="text-xs text-emerald-600 font-medium">已生成</span>
                    )}
                  </div>
                  {page.is_cover && page.theater_name && (
                    <span className="text-xs text-slate-400 truncate max-w-[120px]">《{page.theater_name}》</span>
                  )}
                </div>

                {/* 缩略图 */}
                <div
                  className="relative w-full bg-slate-100 cursor-pointer overflow-hidden"
                  style={{ minHeight: '220px' }}
                  onClick={() => {
                    if (!isRedrawing && page.image_url) {
                      setPreviewImageUrl(page.image_url);
                    }
                  }}
                >
                  {displayUrl ? (
                    <img
                      src={displayUrl}
                      alt={getPageLabel(page)}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Icons.Image className="w-10 h-10 text-slate-300" />
                    </div>
                  )}

                  {/* 重绘中：毛玻璃遮罩 */}
                  {isRedrawing && (
                    <div className="absolute inset-0 backdrop-blur-sm bg-white/40 flex flex-col items-center justify-center gap-3">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                      <span className="text-sm font-medium text-indigo-700 bg-white/80 px-3 py-1 rounded-full">重绘中...</span>
                      {/* 不定宽进度条 */}
                      <div className="w-40 h-1.5 bg-white/60 rounded-full overflow-hidden relative">
                        <div className="absolute top-0 bottom-0 left-0 bg-indigo-500 rounded-full w-[40%] animate-[progressIndeterminate_1.5s_ease-in-out_infinite]"
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* 重绘失败遮罩 */}
                  {hasError && !isRedrawing && (
                    <div className="absolute bottom-0 left-0 right-0 bg-red-500/80 text-white text-xs px-3 py-1.5 text-center">
                      重绘失败，豆子已退还
                    </div>
                  )}
                </div>

                {/* 操作按钮区 */}
                <div className="px-4 py-3 flex gap-2">
                  <button
                    onClick={() => openRedrawDrawer(page)}
                    disabled={isRedrawing || task?.saved_as_artwork}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                      isRedrawing || task?.task_type !== 'comic' || task?.saved_as_artwork
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-pink-500 to-orange-400 text-white hover:from-pink-400 hover:to-orange-300 shadow-sm'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    重新生成
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 重绘抽屉 */}
      {redrawDrawerOpen && selectedPage && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => {
              if (!isSubmittingRedraw) {
                setRedrawDrawerOpen(false);
                setSelectedPage(null);
              }
            }}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-w-lg mx-auto"
            style={{ animation: 'sheetSlideUp 0.25s ease-out' }}
          >
            {/* 把手 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>

            <div className="px-5 pt-2 pb-6 space-y-4">
              {/* 标题 */}
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  重绘{getPageLabel(selectedPage)}
                </h3>
                <button
                  onClick={() => {
                    if (!isSubmittingRedraw) {
                      setRedrawDrawerOpen(false);
                      setSelectedPage(null);
                    }
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              {/* 与创建任务时一致，不可修改 */}
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 space-y-1.5">
                <div>
                  <span className="text-slate-500">模型</span>
                  <span className="ml-2 font-medium text-slate-800">
                    {lockedRedrawModel?.name || task?.model_id || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">分辨率</span>
                  <span className="ml-2 font-medium text-slate-800">{lockedRedrawResolution}</span>
                </div>
              </div>

              {/* 提示词编辑区 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  编辑提示词 <span className="text-xs text-slate-400 font-normal">（可修改后重绘）</span>
                </label>
                <textarea
                  value={editedPrompt}
                  onChange={e => setEditedPrompt(e.target.value)}
                  rows={6}
                  className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 resize-none leading-relaxed"
                  placeholder="输入重绘提示词..."
                  disabled={isSubmittingRedraw}
                />
              </div>

              {/* 消耗提示 */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0">豆</span>
                每次重绘消耗 <span className="font-semibold text-amber-700 mx-0.5">{redrawCost}</span> 豆
              </div>

              {/* 错误提示 */}
              {redrawError && (
                <Toast message={redrawError} type="error" onClose={() => setRedrawError(null)} />
              )}

              {/* 按钮 */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => {
                    setRedrawDrawerOpen(false);
                    setSelectedPage(null);
                  }}
                  disabled={isSubmittingRedraw}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleRedraw}
                  disabled={isSubmittingRedraw || !editedPrompt.trim()}
                  className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                    isSubmittingRedraw || !editedPrompt.trim()
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-pink-500 to-orange-400 text-white hover:from-pink-400 hover:to-orange-300'
                  }`}
                >
                  {isSubmittingRedraw ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      提交中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      开始重绘
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 图片大图预览 */}
      {previewImageUrl && (
        <ImagePreview imageUrl={previewImageUrl} onClose={() => setPreviewImageUrl(null)} />
      )}

      {/* 固定在底部的保存按钮 */}
      {!task?.saved_as_artwork && (
        <div className="fixed bottom-0 left-0 right-0 bg-white px-4 py-3 max-w-lg mx-auto z-30 border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <button
            onClick={handleSaveClick}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 px-6 rounded-xl text-base font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 active:scale-[0.98] transition-all"
          >
            保存为作品
          </button>
        </div>
      )}

      {/* 保存为作品对话框 */}
      {showSaveDialog && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 transition-opacity" onClick={() => !isSaving && setShowSaveDialog(false)} />
          <div className="fixed inset-x-4 top-[50%] -translate-y-[50%] bg-white rounded-2xl shadow-2xl z-50 p-6 space-y-5 max-w-sm mx-auto w-[calc(100%-2rem)]">
            <h3 className="text-base font-bold text-slate-900 text-center">保存漫画作品</h3>
            
            {dialogError && (
              <Toast message={dialogError} type="error" onClose={() => setDialogError(null)} />
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-slate-700 text-sm font-medium">作品名称 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={artworkName}
                  onChange={(e) => setArtworkName(e.target.value)}
                  placeholder="给这本漫画起个名字吧"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors bg-slate-50 focus:bg-white"
                  maxLength={50}
                />
              </div>

              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={isRelease}
                  onChange={(e) => setIsRelease(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                />
                <span className="text-slate-700 font-medium">同时发布到广场</span>
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                disabled={isSaving}
                className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveSubmit}
                disabled={isSaving}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    保存中...
                  </>
                ) : (
                  '确认保存'
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast 提示 */}
      {showToast && (
        <Toast message={toastMessage} type={toastType} onClose={() => setShowToast(false)} />
      )}

      {/* 微信下载提示蒙层 */}
      {showWechatMask && (
        <div 
          className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center pt-10 px-6"
          onClick={() => setShowWechatMask(false)}
        >
          <div className="w-full flex justify-end mb-4">
            <svg className="w-16 h-16 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </div>
          <div className="bg-white/10 backdrop-blur border border-white/20 p-6 rounded-2xl text-white text-center">
            <h3 className="text-xl font-bold mb-3">微信环境限制下载</h3>
            <p className="text-white/90 leading-relaxed mb-1">
              请点击右上角 <span className="inline-block mx-1">···</span> 按钮
            </p>
            <p className="text-white/90 leading-relaxed">
              选择 <span className="font-bold text-white bg-white/20 px-2 py-0.5 rounded">在浏览器中打开</span> 进行下载
            </p>
          </div>
          <button 
            className="mt-8 px-8 py-3 bg-white text-slate-900 rounded-full font-bold shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
              setShowWechatMask(false);
            }}
          >
            我知道了
          </button>
        </div>
      )}
    </div>
  );
};

export default ComicDetail;
