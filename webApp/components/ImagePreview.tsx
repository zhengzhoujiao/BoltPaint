import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
interface ImagePreviewProps {
  imageUrl: string;
  onClose: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ imageUrl, onClose }) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 双指缩放相关
  const [touchDistance, setTouchDistance] = useState(0);
  const [initialScale, setInitialScale] = useState(1);

  // 重置状态
  const resetTransform = () => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  // 放大
  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 5));
  };

  // 缩小
  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  // 左旋转
  const handleRotateLeft = () => {
    setRotation(prev => prev - 90);
  };

  // 右旋转
  const handleRotateRight = () => {
    setRotation(prev => prev + 90);
  };

  // 双指缩放
  const getTouchDistance = (touches: TouchList): number => {
    const touch1 = touches[0];
    const touch2 = touches[1];
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = getTouchDistance(e.touches);
      setTouchDistance(distance);
      setInitialScale(scale);
    } else if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const distance = getTouchDistance(e.touches);
      const newScale = (distance / touchDistance) * initialScale;
      setScale(Math.max(0.5, Math.min(5, newScale)));
    } else if (e.touches.length === 1 && isDragging) {
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setTouchDistance(0);
  };

  // 鼠标拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 键盘ESC关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 阻止背景滚动
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // 鼠标滚轮缩放（使用原生事件监听器，设置 passive: false）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.max(0.5, Math.min(5, prev + delta)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const previewContent = (
    <div
      className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center z-[101] transition-colors"
        aria-label="关闭"
      >
        <svg
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* 图片容器 */}
      <div
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt="预览"
          className="max-w-full max-h-full select-none object-contain"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          draggable={false}
        />
      </div>

      {/* 底部控制栏 */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/80 rounded-full px-6 py-1.5 flex items-center justify-center gap-3 z-[101]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 缩小 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleZoomOut();
          }}
          className="w-10 h-10 flex items-center justify-center transition-opacity hover:opacity-70"
          aria-label="缩小"
        >
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
            />
          </svg>
        </button>

        {/* 放大 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleZoomIn();
          }}
          className="w-10 h-10 flex items-center justify-center transition-opacity hover:opacity-70"
          aria-label="放大"
        >
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
            />
          </svg>
        </button>

        {/* 长按提示 */}
        <span className="text-white text-sm whitespace-nowrap mx-2">长按图片下载</span>

        {/* 左旋转 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRotateLeft();
          }}
          className="w-10 h-10 flex items-center justify-center transition-opacity hover:opacity-70"
          aria-label="左旋转"
        >
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>

        {/* 右旋转 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRotateRight();
          }}
          className="w-10 h-10 flex items-center justify-center transition-opacity hover:opacity-70"
          aria-label="右旋转"
        >
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ transform: 'scaleX(-1)' }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
    </div>
  );

  // 使用 Portal 将预览组件渲染到 body，确保不受页面层叠上下文限制
  return createPortal(previewContent, document.body);
};

export default ImagePreview;
