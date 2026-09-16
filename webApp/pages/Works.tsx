import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { nanoBananaService, appCache } from '../services/nanoBananaService';
import { Artwork, Template, User } from '../types';
import { Icons } from '../constants';
import ArtworkCard from '../components/ArtworkCard';
import TemplateCard from '../components/TemplateCard';

type TabType = 'my-works' | 'my-collections' | 'my-likes';

/**
 * 作品页面
 * 按照文档设计：
 * - 第一层：固定布局，tab切换区域（我的作品、我的收藏、我的喜欢）
 * - 第二层：瀑布流布局，展示当前选择的tab内容
 */
const Works: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<TabType>('my-works');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // 三个tab的数据 - 从缓存初始化
  const [myArtworks, setMyArtworks] = useState<Artwork[]>(appCache.works.myArtworks);
  const [myCollections, setMyCollections] = useState<Template[]>(appCache.works.myCollections);
  const [myLikes, setMyLikes] = useState<Artwork[]>(appCache.works.myLikes);

  // Pull to Refresh State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const currentPullY = useRef(0);
  const isDragging = useRef(false);

  // Refs for direct DOM manipulation
  const refreshIndicatorRef = useRef<HTMLDivElement>(null);
  const refreshIconRef = useRef<HTMLDivElement>(null);
  const refreshTextRef = useRef<HTMLSpanElement>(null);

  const PULL_THRESHOLD = 80;
  const MAX_PULL = 200;

  // 加载数据
  const fetchData = async (isRefresh: boolean = false, isSilent: boolean = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else if (!isSilent) {
        setLoading(true);
      }

      const u = await nanoBananaService.getUserProfile();
      setUser(u);

      // 并行加载三个tab的数据
      const [works, collections, likes] = await Promise.all([
        nanoBananaService.getUserWorks(u.id),
        nanoBananaService.getCollectedTemplates(),
        nanoBananaService.getLikedArtworks()
      ]);

      setMyArtworks(works);
      setMyCollections(collections);
      setMyLikes(likes);

      // 更新缓存
      appCache.works.myArtworks = works;
      appCache.works.myCollections = collections;
      appCache.works.myLikes = likes;
      appCache.works.lastUpdated = Date.now();
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // 如果有缓存数据，直接使用；否则加载数据
    const hasCache = appCache.works.myArtworks.length > 0 ||
      appCache.works.myCollections.length > 0 ||
      appCache.works.myLikes.length > 0;

    if (hasCache) {
      // 恢复滚动位置
      if (scrollContainerRef.current) {
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = appCache.works.scrollTop;
          }
        });
      }
    }

    // 无论是否有缓存，进页面都静默刷新（如果有缓存则静默，无缓存则显示loading）
    fetchData(false, hasCache);

    // 监听自定义事件
    const handleArtworkGenerated = () => {
      fetchData(false);
    };

    const handleArtworkLikeChange = (event: CustomEvent) => {
      const { artworkId, isLiked, likesCount } = event.detail;

      // 更新我的喜欢列表
      if (isLiked) {
        // 添加到喜欢列表（需要重新加载以获取完整数据）
        nanoBananaService.getLikedArtworks().then(likes => {
          setMyLikes(likes);
          appCache.works.myLikes = likes;
        });
      } else {
        // 从喜欢列表移除
        setMyLikes(prev => {
          const updated = prev.filter(art => art.id !== artworkId);
          appCache.works.myLikes = updated;
          return updated;
        });
      }

      // 更新我的作品列表中的点赞状态
      setMyArtworks(prev => {
        const updated = prev.map(art =>
          art.id === artworkId
            ? { ...art, is_liked: isLiked, likes_count: likesCount }
            : art
        );
        appCache.works.myArtworks = updated;
        return updated;
      });
    };

    const handleTemplateCollectionChange = (event: CustomEvent) => {
      const { templateId, isCollected } = event.detail;

      // 更新我的收藏列表
      if (isCollected) {
        // 添加到收藏列表（需要重新加载以获取完整数据）
        nanoBananaService.getCollectedTemplates().then(collections => {
          setMyCollections(collections);
          appCache.works.myCollections = collections;
        });
      } else {
        // 从收藏列表移除
        setMyCollections(prev => {
          const updated = prev.filter(t => t.id !== templateId);
          appCache.works.myCollections = updated;
          return updated;
        });
      }
    };

    window.addEventListener('artwork-generated', handleArtworkGenerated);
    window.addEventListener('artwork-like-changed', handleArtworkLikeChange as EventListener);
    window.addEventListener('template-collection-changed', handleTemplateCollectionChange as EventListener);

    return () => {
      window.removeEventListener('artwork-generated', handleArtworkGenerated);
      window.removeEventListener('artwork-like-changed', handleArtworkLikeChange as EventListener);
      window.removeEventListener('template-collection-changed', handleTemplateCollectionChange as EventListener);
    };
  }, []);

  // Save scroll position
  const handleScroll = (e?: any) => {
    const target = e?.target || scrollContainerRef.current;
    if (!target) return;
    appCache.works.scrollTop = target.scrollTop;
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

  // Pull to Refresh Event Handlers
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
        currentPullY.current = 80;
        updatePullAnimation(80);

        await fetchData(true);

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
  }, [loading, isRefreshing]);

  // Tab 配置
  const tabs = [
    { id: 'my-works' as TabType, label: t('works.tab_my_works') || '我的作品', icon: Icons.Image },
    { id: 'my-collections' as TabType, label: t('works.tab_my_collections') || '模板收藏', icon: Icons.Grid },
    { id: 'my-likes' as TabType, label: t('works.tab_my_likes') || '我的喜欢', icon: Icons.Heart },
  ];

  // 获取当前tab的数据
  const getCurrentData = () => {
    switch (activeTab) {
      case 'my-works':
        return myArtworks;
      case 'my-collections':
        return myCollections;
      case 'my-likes':
        return myLikes;
      default:
        return [];
    }
  };

  const currentData = getCurrentData();

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Helmet>
        <title>我的作品 | BoltPaint</title>
        <meta name="description" content="查看和管理你在 BoltPaint 创作的 AI 作品、收藏的风格模板以及喜欢的画作。" />
      </Helmet>
      {/* Header - 标题和说明 */}
      <div className="flex-none bg-white/95 backdrop-blur-md h-[50px] px-4 border-b border-slate-200 z-30 flex items-center">
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t('works.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'my-works' && (
              <button
                onClick={() => navigate('/tasks')}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-medium text-xs shadow shadow-indigo-500/20"
                aria-label="任务列表"
              >
                任务列表
              </button>
            )}
            {activeTab === 'my-collections' && (
              <button
                onClick={() => navigate('/my-templates')}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-medium text-xs shadow shadow-indigo-500/20"
                aria-label="我的模板"
              >
                我的模板
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 第一层：Tab切换区域 - Fixed */}
      <div className="flex-none bg-white border-b border-slate-200 z-20">
        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors relative ${activeTab === tab.id
                ? 'text-indigo-600'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <div className="flex items-center justify-center gap-2">
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </div>
              {/* 选中指示器 */}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Pull to Refresh Indicator */}
      <div
        ref={refreshIndicatorRef}
        className="fixed top-[82px] left-0 right-0 flex flex-col items-center justify-center z-10 pointer-events-none"
        style={{
          height: '80px',
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

      {/* 第二层：内容区域 - Scrollable 瀑布流布局 */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto no-scrollbar p-2 pb-24 relative z-20 bg-slate-50 select-none"
        style={{
          overscrollBehaviorY: 'contain',
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
          transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
          transform: 'translateY(0px)'
        }}
      >
        {loading && !isRefreshing ? (
          <div className="p-10 text-center text-slate-400">{t('works.loading')}</div>
        ) : currentData.length === 0 ? (
          <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-4">
            {activeTab === 'my-works' && (
              <>
                <Icons.Image className="w-12 h-12 text-slate-300" />
                <p>{t('works.empty_my_works') || '暂无作品'}</p>
              </>
            )}
            {activeTab === 'my-collections' && (
              <>
                <Icons.Grid className="w-12 h-12 text-slate-300" />
                <p>{t('works.empty_my_collections') || '暂无收藏'}</p>
              </>
            )}
            {activeTab === 'my-likes' && (
              <>
                <Icons.Heart className="w-12 h-12 text-slate-300" />
                <p>{t('works.empty_my_likes') || '暂无喜欢'}</p>
              </>
            )}
          </div>
        ) : (
          <div className="flex gap-2 items-start">
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              {currentData.filter((_, i) => i % 2 === 0).map((item) => (
                activeTab === 'my-collections' ? (
                  <TemplateCard
                    key={item.id}
                    template={item as Template}
                    onClick={(template) => navigate(`/template/${template.id}`)}
                  />
                ) : (
                  <ArtworkCard
                    key={item.id}
                    artwork={item as Artwork}
                    showStatus={activeTab === 'my-works'}
                  />
                )
              ))}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              {currentData.filter((_, i) => i % 2 === 1).map((item) => (
                activeTab === 'my-collections' ? (
                  <TemplateCard
                    key={item.id}
                    template={item as Template}
                    onClick={(template) => navigate(`/template/${template.id}`)}
                  />
                ) : (
                  <ArtworkCard
                    key={item.id}
                    artwork={item as Artwork}
                    showStatus={activeTab === 'my-works'}
                  />
                )
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default Works;