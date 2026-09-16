import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { nanoBananaService } from '../services/nanoBananaService';
import { Template } from '../types';
import { MOCK_TEMPLATES } from '../constants';
import ImagePreview from '../components/ImagePreview';
import { useAppContext } from '../contexts/AppContext';
import Toast from '../components/Toast';

/**
 * 模板详情组件 - 独立页面
 * 按照文档全局组件标准设计四层结构：
 * - 第一层：模板图片
 * - 第二层：模板名称
 * - 第三层：模板标签
 * - 第四层：创作按钮和收藏按钮（固定在底部）
 */
const TemplateDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { globalTags } = useAppContext();
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCollected, setIsCollected] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showShareToast, setShowShareToast] = useState(false);

  useEffect(() => {
    const fetchTemplate = async () => {
      if (!id) return;

      setLoading(true);
      try {
        const [data, user] = await Promise.all([
          nanoBananaService.getTemplateById(id),
          nanoBananaService.getUserProfile().catch(() => null)
        ]);
        setTemplate(data);

        // 检查用户是否已收藏该模板
        if (user && user.collection_ids) {
          setIsCollected(user.collection_ids.includes(id));
        }
      } catch (error) {
        console.error('获取模板详情失败:', error);
        setTemplate(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, [id]);

  const handleCreate = () => {
    if (!template) return;

    // preset_prompt 仅在后台拼接，不预填到提示词输入区
    navigate('/create', {
      state: {
        preSelectedTemplate: template
      }
    });
  };

  const handleToggleCollection = async () => {
    if (!template || !id) return;

    try {
      const newStatus = await nanoBananaService.toggleCollectTemplate(id);
      setIsCollected(newStatus);

      console.log('模板收藏状态已更新', {
        templateId: id,
        isCollected: newStatus
      });

      // 触发事件，通知作品页面更新收藏列表
      window.dispatchEvent(new CustomEvent('template-collection-changed', {
        detail: {
          templateId: id,
          isCollected: newStatus
        }
      }));
    } catch (error) {
      console.error('切换收藏状态失败:', error);
      alert('操作失败，请稍后重试');
    }
  };

  const handleShare = async () => {
    if (!template) return;

    try {
      // 生成分享链接（使用当前页面的完整 URL）
      const shareUrl = window.location.href;

      // 优先使用 Web Share API（移动端原生分享）
      if (navigator.share) {
        try {
          await navigator.share({
            title: template.name || '模板分享',
            text: template.description,
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

  if (loading) return <div className="p-10 text-center text-slate-500">{t('templates.loading')}</div>;
  if (!template) return <div className="p-10 text-center text-slate-500">{t('common.not_found')}</div>;

  // 第一层：作品图片 - 预览传原始 URL，由 ImagePreview 内部统一 resolve，避免重复拼接
  const handlePreview = () => {
    if (!template) return;
    // 如果是 webp 缩略图，尝试替换为原图
    let url = template.cover_image;
    if (url && url.includes('_thumb.webp')) {
      url = url.replace('_thumb.webp', '.png');
    }
    setPreviewImageUrl(url);
  };

  return (
    <div className="flex flex-col h-screen bg-white z-50 fixed inset-0">
      {/* Header */}
      <div className="flex-none bg-white/95 backdrop-blur-md border-b border-slate-200 z-10 h-[50px]">
        <div className="flex items-center justify-between gap-3 h-full px-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-slate-900">模板详情</h1>
          </div>
          {/* 分享按钮 */}
          <button
            onClick={handleShare}
            className="w-9 h-9 hover:opacity-80 transition-opacity"
          >
            <img
              src="/boltPaint/images/share.png"
              alt="分享"
              className="w-full h-full object-contain"
            />
          </button>
        </div>
      </div>

      {/* Content - 滚动区域 */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-14">
        <div className="bg-white">
          {/* 第一层：模板图片 */}
          <div
            className="w-full bg-white cursor-pointer"
            onClick={handlePreview}
          >
            <img
              src={template.cover_image}
              alt={template.name}
              className="w-full h-auto object-contain max-h-[60vh] mx-auto"
            />
          </div>

          {/* 第二层：模板名称 */}
          <div className="px-4 pt-3 pb-1">
            <h1 className="text-lg font-bold text-slate-900">
              {template.name}
            </h1>
          </div>

          {/* 第三层：模板描述和标签 */}
          <div className="px-4 pb-4">
            {/* 模板描述 */}
            {template.description && (
              <div className="bg-white rounded-lg mb-2">
                <p className="text-slate-700 text-sm leading-relaxed">
                  {template.description}
                </p>
              </div>
            )}

            {/* 标签（展示模板关联的标签） */}
            {template.tags && template.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {template.tags.map((tagId) => {
                  const tag = globalTags.find((t) => t.id === tagId);
                  return (
                    <span key={tagId} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                      {tag ? tag.label : tagId}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 第四层：创作按钮和收藏按钮 - 固定在底部导航上方 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white px-4 h-14 flex items-center max-w-lg mx-auto z-30 border-t border-slate-200">
        <div className="flex items-center gap-3 w-full">
          {/* 创作按钮 */}
          <button
            onClick={handleCreate}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 active:scale-[0.98] transition-all"
          >
            <img
              src="/boltPaint/images/magic.png"
              alt="magic"
              className="w-5 h-5 object-contain"
            />
            {t('templates.create_now')}
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
    </div>
  );
};

export default TemplateDetail;
