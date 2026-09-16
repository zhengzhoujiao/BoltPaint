import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { nanoBananaService, appCache } from '../services/nanoBananaService';
import { Artwork, Tag } from '../types';
import { Icons } from '../constants';
import ArtworkCard from '../components/ArtworkCard';
import { useAppContext } from '../contexts/AppContext';

const Square: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tagScrollRef = useRef<HTMLDivElement>(null);
  const { globalTags } = useAppContext();

  // State
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(false); // Initial load
  const [loadingMore, setLoadingMore] = useState(false); // Infinite scroll load
  const [search, setSearch] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]); // 改为数组支持多选
  const [displayTags, setDisplayTags] = useState<Tag[]>([]); // 渲染列表（全局标签的拷贝）

  // Pull to Refresh State and Refs
  // Removed: const [pullY, setPullY] = useState(0); 
  // We use refs for direct DOM manipulation to avoid re-renders during drag
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const currentPullY = useRef(0);
  const isDragging = useRef(false);

  // Refs for direct DOM manipulation
  const refreshIndicatorRef = useRef<HTMLDivElement>(null);
  const refreshIconRef = useRef<HTMLDivElement>(null);
  const refreshTextRef = useRef<HTMLSpanElement>(null);

  // Constants
  const PAGE_SIZE = 8;
  const PULL_THRESHOLD = 80;
  const MAX_PULL = 200;

  // 处理标签点击（支持多选）
  const handleTagClick = (tagId: string) => {
    setSelectedTagIds(prev => {
      // 如果已选中，则取消选中
      if (prev.includes(tagId)) {
        return prev.filter(id => id !== tagId);
      } else {
        // 否则添加到选中列表
        return [...prev, tagId];
      }
    });
  };

  // 监听标签选择变化，自动触发搜索
  useEffect(() => {
    console.log('标签选择变化，当前选中:', selectedTagIds);
    // 标签变化时重新加载第一页
    if (displayTags.length > 0) { // 确保标签已加载
      loadArtworks(undefined, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTagIds]);

  // 1. Initial Load (Cache or Network)
  useEffect(() => {
    // If we have cached data and no active search, use cache
    if (appCache.square.data.length > 0 && !search) {
      setArtworks(appCache.square.data);
      setHasMore(appCache.square.hasMore);
      // Restore scroll position
      if (scrollContainerRef.current) {
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = appCache.square.scrollTop;
          }
        });
      }
    } else {
      loadArtworks(undefined, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // 2. 监听点赞/取消点赞事件，更新缓存和显示
  useEffect(() => {
    const handleArtworkLikeChange = (event: CustomEvent) => {
      const { artworkId, isLiked, likesCount } = event.detail;

      console.log('Square: 收到点赞事件', { artworkId, isLiked, likesCount });

      // 更新状态中的作品
      setArtworks(prev => prev.map(art =>
        art.id === artworkId
          ? { ...art, is_liked: isLiked, likes_count: likesCount }
          : art
      ));

      // 更新缓存中的作品
      appCache.square.data = appCache.square.data.map(art =>
        art.id === artworkId
          ? { ...art, is_liked: isLiked, likes_count: likesCount }
          : art
      );
    };

    window.addEventListener('artwork-like-changed', handleArtworkLikeChange as EventListener);

    return () => {
      window.removeEventListener('artwork-like-changed', handleArtworkLikeChange as EventListener);
    };
  }, []);

  // 3. 监听作品发布/取消发布事件
  useEffect(() => {
    const handleArtworkPublished = (event: CustomEvent) => {
      const { artworkId, isRelease } = event.detail;

      console.log('Square: 收到作品发布状态变化事件', { artworkId, isRelease });

      if (!isRelease) {
        // 如果是取消发布，则从列表中移除
        setArtworks(prev => {
          const newData = prev.filter(art => art.id !== artworkId);
          // 如果没有搜索，同时更新缓存
          if (!search) {
            appCache.square.data = appCache.square.data.filter(art => art.id !== artworkId);
          }
          return newData;
        });
      }
    };

    window.addEventListener('artwork-published', handleArtworkPublished as EventListener);

    return () => {
      window.removeEventListener('artwork-published', handleArtworkPublished as EventListener);
    };
  }, [search]); // 依赖 search 确保能够正确决定是否更新缓存

  // 4. 初始化显示标签列表（全局标签的拷贝）
  useEffect(() => {
    if (globalTags.length > 0) {
      setDisplayTags([...globalTags]); // 创建全局标签的拷贝
    }
  }, [globalTags]);


  // 2. Data Fetching
  const loadArtworks = async (cursor?: string, isRefresh: boolean = false) => {
    if (isRefresh) setLoading(true);
    else setLoadingMore(true);

    try {
      console.log('📊 加载作品 - 游标:', cursor, '搜索词:', search, '选中标签:', selectedTagIds);

      // 只获取已发布的作品 (is_release = true)，并按选中的标签筛选
      const { data, hasMore: more } = await nanoBananaService.getArtworks(
        cursor,
        PAGE_SIZE,
        search,
        true,
        selectedTagIds.length > 0 ? selectedTagIds : undefined
      );

      console.log('✅ 获取到作品数量:', data.length);

      if (isRefresh) {
        setArtworks(data);
        if (!search) {
          // Update Cache only for main list (not search results)
          appCache.square.data = data;
          appCache.square.cursor = data.length > 0 ? data[data.length - 1].created_at : null;
          appCache.square.hasMore = more;
          appCache.square.scrollTop = 0;
        }
      } else {
        setArtworks(prev => {
          const newData = [...prev, ...data];
          if (!search) {
            appCache.square.data = newData;
            appCache.square.cursor = newData.length > 0 ? newData[newData.length - 1].created_at : null;
          }
          return newData;
        });
      }

      setHasMore(more);
      if (!search) appCache.square.hasMore = more;

    } catch (error) {
      console.error("Failed to load artworks", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsRefreshing(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadArtworks(undefined, true);
  };

  // 3. Infinite Scroll Handler
  const handleScroll = (e?: any) => {
    const target = e?.target || scrollContainerRef.current;
    if (!target) return;
    const { scrollTop, scrollHeight, clientHeight } = target;

    // Save scroll position to cache
    if (!search) {
      appCache.square.scrollTop = scrollTop;
    }

    // Check if near bottom
    if (scrollHeight - scrollTop - clientHeight < 100 && !loading && !loadingMore && hasMore) {
      const lastCursor = artworks.length > 0 ? artworks[artworks.length - 1].created_at : undefined;
      loadArtworks(lastCursor, false);
    }
  };


  const updatePullAnimation = (pullDistance: number) => {
    if (!scrollContainerRef.current) return;

    // 1. Move the content container using 3D transform for GPU acceleration
    scrollContainerRef.current.style.transform = `translate3d(0, ${pullDistance}px, 0)`;

    // 2. Update indicator opacity and rotation
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

  // 4. Native Event Handlers for Pull-to-Refresh (Performance Optimized)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const getClientY = (e: TouchEvent | MouseEvent) => {
      return 'touches' in (e as any) ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    };

    const handleStart = (e: TouchEvent | MouseEvent) => {
      if (container.scrollTop === 0) {
        // For mouse, we might want to prevent selection
        if (!('touches' in e)) {
          // e.preventDefault(); // This might block button clicks, so be careful
        }
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

      // Only allow pull down if we are at the top
      if (diff > 0 && container.scrollTop <= 0) {
        // Critical: Prevent native pull-to-refresh / rubber-banding
        if (e.cancelable) e.preventDefault();

        // Resistance effect
        const dampedDiff = Math.min(diff * 0.5, MAX_PULL);
        currentPullY.current = dampedDiff;

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => updatePullAnimation(dampedDiff));
      } else if (diff < 0 && isDragging.current) {
        // If user pulls up while dragging
        isDragging.current = false;
        container.style.willChange = 'auto';
        updatePullAnimation(0);
      }
    };

    const handleEnd = async () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      container.style.willChange = 'auto';

      // Restore transition for smooth snap back
      container.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

      if (currentPullY.current > PULL_THRESHOLD) {
        setIsRefreshing(true);
        currentPullY.current = 80;
        updatePullAnimation(80); // Snap to loading position

        await loadArtworks(undefined, true);

        // Reset after loading
        currentPullY.current = 0;
        updatePullAnimation(0);
        setTimeout(() => {
          if (refreshIndicatorRef.current) refreshIndicatorRef.current.style.opacity = '0';
        }, 300);
      } else {
        // Snap back
        currentPullY.current = 0;
        updatePullAnimation(0);
      }
    };

    // Passive: false is crucial for e.preventDefault() to work
    container.addEventListener('touchstart', handleStart as any, { passive: true });
    container.addEventListener('touchmove', handleMove as any, { passive: false });
    container.addEventListener('touchend', handleEnd as any, { passive: true });

    // Mouse events for dev
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
  }, [loading, isRefreshing, artworks, search]);


  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Helmet>
        <title>发现无限创意 | BoltPaint</title>
        <meta name="description" content="在 BoltPaint 广场发现全球创作者分享的精彩 AI 绘画作品。支持按标签筛选、关键词搜索，寻找你的创作灵感。" />
        <meta name="keywords" content={`AI绘画广场, 艺术作品展示, BoltPaint`} />
      </Helmet>
      {/* Header - Fixed - Highest Z-Index */}
      <div className="bg-white/95 backdrop-blur-md z-30">
        {/* Navigation Row */}
        <div className="h-[50px] px-4 flex items-center border-b border-slate-100">
          <div className="flex items-center justify-between gap-3 w-full">
            <h1 className="text-lg font-bold text-slate-900 flex-shrink-0">{t('square.title')}</h1>

            {/* 搜索栏和搜索按钮 */}
            <form onSubmit={handleSearch} className="relative flex-1 flex gap-1.5">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder={t('square.search_placeholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-200 text-slate-900 pl-7 pr-2.5 py-1.5 rounded-full border border-transparent focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs transition-colors"
                />
                <Icons.Search className="absolute left-2 top-2 w-3 h-3 text-slate-400" />
              </div>
              <button
                type="submit"
                className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-medium transition-colors flex items-center justify-center flex-shrink-0"
              >
                <Icons.Search className="w-3 h-3" />
              </button>
            </form>
          </div>
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
        className="fixed top-[85px] left-0 right-0 flex flex-col items-center justify-center z-10 pointer-events-none"
        style={{
          height: '80px',
          opacity: 0, // Initial opacity
          transform: 'scale(0.8)', // Initial scale
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

      {/* Waterfall Grid - Scrollable area - Higher Z-Index to cover spinner */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto no-scrollbar p-2 pb-24 relative z-20 bg-slate-50 select-none"
        style={{
          // Critical: Prevent browser native pull-to-refresh
          overscrollBehaviorY: 'contain',
          touchAction: 'pan-y', // Explicitly allow vertical panning but handled by us when at top
          WebkitOverflowScrolling: 'touch', // Smooth inertial scrolling for iOS
          transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
          transform: 'translateY(0px)' // Initial transform
        }}
      >
        {loading && !isRefreshing ? (
          <div className="p-10 text-center text-slate-400">{t('square.loading')}</div>
        ) : (
          <>
            <div className="flex gap-2 items-start">
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {artworks.filter((_, i) => i % 2 === 0).map(art => (
                  <ArtworkCard key={art.id} artwork={art} />
                ))}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {artworks.filter((_, i) => i % 2 === 1).map(art => (
                  <ArtworkCard key={art.id} artwork={art} />
                ))}
              </div>
            </div>

            {/* Load More Spinner */}
            {loadingMore && (
              <div className="py-4 flex justify-center">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            {!hasMore && artworks.length > 0 && (
              <div className="py-6 text-center text-slate-400 text-xs">
                - {t('common.end_of_list')} -
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Square;