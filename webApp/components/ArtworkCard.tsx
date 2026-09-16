import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Artwork } from '../types';
import { Icons } from '../constants';
interface ArtworkCardProps {
  artwork: Artwork;
  showStatus?: boolean;
}

/**
 * 作品卡片组件
 * 按照文档全局组件标准设计：
 * - 第一层：作品图片（主体区域）
 * - 第二层：作品名称
 * - 第三层：作者头像、作者名称（左侧）+ 点赞数目（红色爱心图标+数字）（右侧）
 */
const ArtworkCard: React.FC<ArtworkCardProps> = ({ artwork, showStatus }) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/artwork/${artwork.id}`)}
      className="bg-white rounded-lg overflow-hidden shadow-sm border border-slate-200 cursor-pointer active:opacity-90 transition-opacity w-full"
    >
      {/* 第一层：作品图片（主体区域） */}
      <div
        className="w-full relative bg-slate-200"
        style={{
          aspectRatio: artwork.aspect_ratio === '9:16' ? '9/16' :
            artwork.aspect_ratio === '16:9' ? '16/9' :
              artwork.aspect_ratio === '3:4' ? '3/4' :
                artwork.aspect_ratio === '4:3' ? '4/3' :
                  artwork.aspect_ratio === '3:2' ? '3/2' :
                    artwork.aspect_ratio === '2:3' ? '2/3' :
                      artwork.aspect_ratio === '5:4' ? '5/4' :
                        artwork.aspect_ratio === '4:5' ? '4/5' :
                          artwork.aspect_ratio === '21:9' ? '21/9' :
                            '1/1'
        }}
      >
        <img
          src={artwork.thumbnail_url || artwork.image_url || ''}
          alt={artwork.artwork_name || artwork.user_input_prompt}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>

      {/* 第二层：作品名称 */}
      <div className="px-3 pt-2 pb-1 flex items-center justify-between gap-2">
        <h3 className="text-slate-800 text-sm font-medium break-words flex-1 whitespace-normal">
          {artwork.artwork_name || artwork.user_input_prompt}
        </h3>
        {showStatus && (
          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex-shrink-0 ${artwork.is_release ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'
            }`}>
            {artwork.is_release ? '已发布' : '未发布'}
          </span>
        )}
      </div>

      {/* 第三层：作者信息（左）+ 点赞数目（右） */}
      <div className="px-3 pb-2 flex items-center justify-between">
        {/* 左侧：作者头像和名称 */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <img
            src={artwork.user_avatar}
            alt={artwork.user_name}
            className="w-5 h-5 rounded-full border border-slate-200 flex-shrink-0"
          />
          <span className="text-xs text-slate-600 truncate">{artwork.user_name}</span>
        </div>

        {/* 右侧：点赞信息（红色爱心图标+数字） */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Icons.Heart className="w-4 h-4 text-red-500 fill-red-500" />
          <span className="text-xs text-slate-600 font-medium">{artwork.likes_count}</span>
        </div>
      </div>
    </div>
  );
};

export default ArtworkCard;
