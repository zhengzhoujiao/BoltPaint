import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { nanoBananaService, appCache } from '../services/nanoBananaService';
import { Template, Tag } from '../types';
import TemplateCard from '../components/TemplateCard';
import { useAppContext } from '../contexts/AppContext';

const Templates: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 检查是否从创作界面跳转过来
  const fromCreation = (location.state as { fromCreation?: boolean })?.fromCreation || false;

  // State
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // 标签过滤
  const tagScrollRef = useRef<HTMLDivElement>(null);
  const { globalTags } = useAppContext();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [displayTags, setDisplayTags] = useState<Tag[]>([]);

  // Pull to Refresh State and Refs
  // Removed: const [pullY, setPullY] = useState(0); 
  // Optimized for mobile performance
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const currentPullY = useRef(0);
  const isDragging = useRef(false);

  // Refs for direct DOM manipulation
  const refreshIndicatorRef = useRef<HTMLDivElement>(null);
  const refreshIconRef = useRef<HTMLDivElement>(null);
  const refreshTextRef = useRef<HTMLSpanElement>(null);

  const PAGE_SIZE = 8;
  const PULL_THRESHOLD = 80;
  const MAX_PULL = 200;

  // 1. 初始化显示标签列表（全局标签的拷贝）
  useEffect(() => {
    if (globalTags.length > 0) {
      setDisplayTags([...globalTags]);
    }
  }, [globalTags]);

  // 2. 标签点击（支持多选）
  const handleTagClick = (tagId: string) => {
    setSelectedTagIds(prev => {
      if (prev.includes(tagId)) {
        return prev.filter(id => id !== tagId);
      } else {
        return [...prev, tagId];
      }
    });
  };

  // 3. 监听标签选择变化，自动重新加载
  useEffect(() => {
    if (displayTags.length > 0) {
      loadData(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTagIds]);

  // 4. Initial Load (Cache vs Network)
  useEffect(() => {
    if (appCache.templates.data.length > 0) {
      setTemplates(appCache.templates.data);
      setHasMore(appCache.templates.hasMore);
      if (scrollContainerRef.current) {
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = appCache.templates.scrollTop;
          }
        });
      }
    } else {
      loadData(1, true);
    }
  }, []);

  // 5. Data Fetching
  const loadData = async (page: number, isRefresh: boolean = false) => {
    if (isRefresh) setLoading(true);
    else setLoadingMore(true);

    try {
      const { data, hasMore: more } = await nanoBananaService.getTemplates(
        page,
        PAGE_SIZE,
        selectedTagIds.length > 0 ? selectedTagIds : undefined
      );

      if (isRefresh) {
        setTemplates(data);
        appCache.templates.data = data;
        appCache.templates.page = page;
        appCache.templates.hasMore = more;
        appCache.templates.scrollTop = 0;
      } else {
        setTemplates(prev => {
          const newData = [...prev, ...data];
          appCache.templates.data = newData;
          return newData;
        });
        appCache.templates.page = page;
      }

      setHasMore(more);
      appCache.templates.hasMore = more;

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsRefreshing(false);
    }
  };

  const handleTemplateClick = (template: Template) => {
    if (fromCreation) {
      // 从创作界面跳转过来，直接返回创作界面并传递选中的模版
      navigate('/create', {
        state: {
          preSelectedTemplate: template
        }
      });
    } else {
      // 正常浏览，跳转到模版详情页
      navigate(`/template/${template.id}`);
    }
  };

  // 3. Infinite Scroll
  const handleScroll = (e?: any) => {
    const target = e?.target || scrollContainerRef.current;
    if (!target) return;
    const { scrollTop, scrollHeight, clientHeight } = target;

    appCache.templates.scrollTop = scrollTop;

    if (scrollHeight - scrollTop - clientHeight < 50 && !loading && !loadingMore && hasMore) {
      loadData(appCache.templates.page + 1, false);
    }
  };


  const updatePullAnimation = (pullDistance: number) => {
    if (!scrollContainerRef.current) return;

    // 1. Move the content container
    scrollContainerRef.current.style.transform = `translate3d(0, ${pullDistance}px, 0)`;

    // 2. Update indicator
    if (refreshIndicatorRef.current) {
      const opacity = Math.min(pullDistance / 40, 1);
      refreshIndicatorRef.current.style.opacity = opacity.toString();
      refreshIndicatorRef.current.style.transform = `scale(${0.8 + (Math.min(pullDistance, PULL_THRESHOLD) / PULL_THRESHOLD) * 0.2})`;
    }

    // 3. Rotate arrow if threshold reached
    if (refreshIconRef.current && refreshTextRef.current) {
      if (pullDistance > PULL_THRESHOLD) {
        refreshIconRef.current.style.transform = 'rotate(180deg)';
        refreshTextRef.current.innerText = t('common.release_to_refresh');
      } else {
        refreshIconRef.current.style.transform = 'rotate(0deg)';
        refreshTextRef.current.innerText = t('common.pull_to_refresh');
      }
    }
  };

  // 4. Native Event Handlers (Performance Optimized)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const getClientY = (e: TouchEvent | MouseEvent) => {
      return 'touches' in (e as any) ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    };

    const handleStart = (e: TouchEvent | MouseEvent) => {
      if (container.scrollTop === 0) {
        startY.current = getClientY(e);
        isDragging.current = true;
        container.style.transition = 'none';
        container.style.willChange = 'transform';
      }
    };

    const handleMove = (e: TouchEvent | MouseEvent) => {
      if (!isDragging.current || loading || isRefreshing) return;

      const currentY = getClientY(e);
      const diff = currentY - startY.current;

      if (diff > 0 && container.scrollTop <= 0) {
        if (e.cancelable) e.preventDefault();

        const dampedDiff = Math.min(diff * 0.5, MAX_PULL);
        currentPullY.current = dampedDiff;

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => updatePullAnimation(dampedDiff));
      } else if (diff < 0 && isDragging.current) {
        isDragging.current = false;
        container.style.willChange = 'auto';
        updatePullAnimation(0);
      }
    };

    const handleEnd = async () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      container.style.willChange = 'auto';

      container.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

      if (currentPullY.current > PULL_THRESHOLD) {
        setIsRefreshing(true);
        currentPullY.current = 80;
        updatePullAnimation(80);

        await loadData(1, true);

        currentPullY.current = 0;
        updatePullAnimation(0);
        setTimeout(() => {
          if (refreshIndicatorRef.current) refreshIndicatorRef.current.style.opacity = '0';
        }, 300);
      } else {
        currentPullY.current = 0;
        updatePullAnimation(0);
      }
    };

    container.addEventListener('touchstart', handleStart as any, { passive: true });
    container.addEventListener('touchmove', handleMove as any, { passive: false });
    container.addEventListener('touchend', handleEnd as any, { passive: true });

    container.addEventListener('mousedown', handleStart as any);
    window.addEventListener('mousemove', handleMove as any);
    window.addEventListener('mouseup', handleEnd as any);

    return () => {
      container.removeEventListener('touchstart', handleStart as any);
      container.removeEventListener('touchmove', handleMove as any);
      container.removeEventListener('touchend', handleEnd as any);
      container.removeEventListener('mousedown', handleStart as any);
      window.removeEventListener('mousemove', handleMove as any);
      window.removeEventListener('mouseup', handleEnd as any);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [loading, isRefreshing, templates]);

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Helmet>
        <title>风格模板 | BoltPaint</title>
        <meta name="description" content="浏览 BoltPaint 提供的海量 AI 绘画风格模板，一键应用，开启你的艺术创作之旅。" />
        <meta name="keywords" content="AI绘画模板, 风格模型, 艺术创作, BoltPaint" />
      </Helmet>
      {/* Header - Fixed - Highest Z-Index */}
      <div className="flex-none bg-white/95 backdrop-blur-md z-30">
        {/* Title Row */}
        <div className="h-[50px] px-4 flex items-center border-b border-slate-100">
          <h1 className="text-lg font-bold text-slate-900">{t('templates.title')}</h1>
        </div>

        {/* Tags Row - 独立分隔 */}
        <div className="px-4 py-1.5 border-b border-slate-200">
          <div
            ref={tagScrollRef}
            className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {displayTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleTagClick(tag.id)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${selectedTagIds.includes(tag.id)
                  ? 'bg-indigo-50 text-indigo-600 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.08),inset_-2px_-2px_4px_rgba(255,255,255,0.7)]'
                  : 'bg-slate-50 text-slate-600 shadow-[2px_2px_5px_rgba(0,0,0,0.07),-2px_-2px_5px_rgba(255,255,255,0.9)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.08),inset_-2px_-2px_4px_rgba(255,255,255,0.7)]'
                  }`}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pull to Refresh Indicator - Bottom Z-Index (Z-10) to stay behind Content (Z-20) */}
      <div
        ref={refreshIndicatorRef}
        className="fixed top-[82px] left-0 right-0 flex flex-col items-center justify-center z-10 pointer-events-none"
        style={{
          height: '80px', // Matches threshold area
          opacity: 0,
          transform: 'scale(0.8)',
          transition: 'opacity 0.2s'
        }}
      >
        <div className="flex flex-col items-center gap-1.5">
          <div className="bg-white rounded-full p-2 shadow-lg border border-slate-200">
            {isRefreshing ? (
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <div
                ref={refreshIconRef}
                className="text-slate-400 text-xs font-bold transition-transform duration-200"
              >
                ↓
              </div>
            )}
          </div>
          <span className="text-xs font-medium text-slate-500">
            {isRefreshing
              ? t('common.loading')
              : <span ref={refreshTextRef}>{t('common.pull_to_refresh')}</span>
            }
          </span>
        </div>
      </div>

      {/* Content - Scrollable - Higher Z-Index */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto no-scrollbar p-4 pb-24 relative z-20 bg-slate-50 select-none"
        style={{
          overscrollBehaviorY: 'contain', // Critical Fix
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
          transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
          transform: 'translateY(0px)'
        }}
      >
        {loading && !isRefreshing ? (
          <div className="text-center text-slate-400 mt-10">{t('templates.loading')}</div>
        ) : (
          <>
            <div className="flex gap-2 items-start">
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {templates.filter((_, i) => i % 2 === 0).map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onClick={handleTemplateClick}
                  />
                ))}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {templates.filter((_, i) => i % 2 === 1).map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onClick={handleTemplateClick}
                  />
                ))}
              </div>
            </div>

            {/* Load More Spinner */}
            {loadingMore && (
              <div className="py-4 flex justify-center">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            {!hasMore && templates.length > 0 && (
              <div className="py-6 text-center text-xs text-slate-400">
                - {t('common.end_of_list')} -
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Templates;