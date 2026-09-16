import React from 'react';

export interface BottomSheetOption {
  value: string;
  label: string;
  description?: string;
  /** 右侧展示（如消耗豆子） */
  detailRight?: string;
}

interface BottomSheetProps {
  open: boolean;
  title: string;
  options: BottomSheetOption[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  /** 列表与取消按钮之间的提示区（浅蓝底 + 信息图标） */
  footerTip?: string;
}

const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  title,
  options,
  selected,
  onSelect,
  onClose,
  footerTip,
}) => {
  if (!open) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* 弹层主体 */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 bg-[whitesmoke] rounded-t-2xl shadow-2xl max-w-lg mx-auto"
        style={{ animation: 'sheetSlideUp 0.25s ease-out' }}
      >
        {/* 把手 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* 标题 */}
        <div className="px-5 pt-2 pb-3">
          <h3 className="text-base font-bold text-slate-900 text-center">{title}</h3>
        </div>

        {/* 选项列表 */}
        <div className="px-4 pb-3 space-y-2 max-h-[60vh] overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onSelect(opt.value);
                onClose();
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors active:scale-[0.99] ${
                selected === opt.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-sm font-semibold ${
                      selected === opt.value ? 'text-blue-600' : 'text-slate-800'
                    }`}
                  >
                    {opt.label}
                  </div>
                  {opt.description && (
                    <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      {opt.description}
                    </div>
                  )}
                </div>
                {opt.detailRight && (
                  <span
                    className={`text-sm font-medium flex-shrink-0 tabular-nums ${
                      selected === opt.value ? 'text-blue-600' : 'text-slate-500'
                    }`}
                  >
                    {opt.detailRight}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {footerTip && (
          <div className="px-4 pb-3">
            <div className="flex gap-3 items-start rounded-xl bg-[#f0f5ff] px-3.5 py-3">
              <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 border-[#2f54eb] text-[#2f54eb] flex items-center justify-center text-xs font-bold leading-none">
                i
              </span>
              <p className="text-sm leading-relaxed text-[#2f54eb] flex-1 min-w-0">{footerTip}</p>
            </div>
          </div>
        )}

        {/* 取消按钮 */}
        <div className="px-4 pb-8 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium transition-colors active:scale-[0.98]"
          >
            取消
          </button>
        </div>
      </div>
    </>
  );
};

export default BottomSheet;
