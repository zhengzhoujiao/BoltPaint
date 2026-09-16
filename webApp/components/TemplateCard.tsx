import React from 'react';
import { Template } from '../types';

interface TemplateCardProps {
  template: Template;
  onClick: (template: Template) => void;
}

/**
 * 模板卡片组件
 * 按照文档全局组件标准设计：
 * - 第一层：模板图片（主体区域）
 * - 第二层：模板名称（居左）+ 使用次数（居左，名称下方）
 */
const TemplateCard: React.FC<TemplateCardProps> = ({ template, onClick }) => {
  // 格式化使用次数
  const formatUseCount = (count: number): string => {
    if (count < 10000) {
      return `${count}人使用`;
    } else if (count < 100000) {
      return '1万+人使用';
    } else {
      return '10万+人使用';
    }
  };

  return (
    <div
      onClick={() => onClick(template)}
      className="bg-white rounded-lg overflow-hidden shadow-sm border border-slate-200 cursor-pointer active:opacity-90 transition-opacity w-full"
    >
      {/* 第一层：模板图片（主体区域） */}
      <div className="relative w-full bg-slate-200">
        <img
          src={template.cover_image}
          alt={template.name}
          loading="lazy"
          className="w-full h-auto block"
        />
      </div>

      {/* 第二层：模板名称 + 使用次数 + 推荐标签 */}
      <div className="px-3 py-2">
        <h3 className="text-slate-800 text-sm font-medium break-words text-left whitespace-normal">
          {template.name}
        </h3>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-slate-500">
            {formatUseCount(template.use_count || 0)}
          </p>
          {template.is_featured && (
            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
              推荐
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateCard;