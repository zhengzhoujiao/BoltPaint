import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { nanoBananaService } from '../services/nanoBananaService';
import { User, PaymentPlatform, RechargePackage } from '../types';
import { useAppContext } from '../contexts/AppContext';
import RechargeModal from '../components/RechargeModal';

const Me: React.FC = () => {
  const navigate = useNavigate();
  const { systemSettings } = useAppContext();
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('user_profile');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  // ... existing state ...
  const [showTopUp, setShowTopUp] = useState(false);
  const [showRechargeDisabledModal, setShowRechargeDisabledModal] = useState(false);
  const [checkingRecharge, setCheckingRecharge] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [copyToastMessage, setCopyToastMessage] = useState('');
  const [showDailyToast, setShowDailyToast] = useState(false);
  const [dailyToastMessage, setDailyToastMessage] = useState('');
  const { t } = useTranslation();

  useEffect(() => {
    nanoBananaService.getUserProfile().then(userData => {
      setUser(userData);
      localStorage.setItem('user_profile', JSON.stringify(userData));
    }).catch(() => {
      localStorage.removeItem('user_profile');
    });
  }, []);

  const handleCopyLink = async () => {
    if (!user?.invite_code) {
      setCopyToastMessage('暂无邀请码，请稍后再试');
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 2000);
      return;
    }
    const base = `${window.location.origin}${window.location.pathname || '/'}`.replace(/\/$/, '') || window.location.origin;
    const shareUrl = `${base}#/register?ref=${user.invite_code}`;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopyToastMessage('邀请链接已复制到剪贴板！');
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
      setCopyToastMessage(`复制失败，请手动复制链接`);
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 3000);
    }
  };

  const handleClaimDaily = async () => {
    if (!user || claiming) return;
    setClaiming(true);
    try {
      const res = await nanoBananaService.claimDailyFreeBeans();
      setUser(prev => prev ? { ...prev, balance_beans: res.balance_beans, can_claim_daily_today: false } : null);
      setDailyToastMessage(`领取成功，获得 ${res.claimed} 豆子`);
      setShowDailyToast(true);
      setTimeout(() => setShowDailyToast(false), 2000);
    } catch (err: any) {
      setDailyToastMessage(err.message || '领取失败');
      setShowDailyToast(true);
      setTimeout(() => setShowDailyToast(false), 2000);
    } finally {
      setClaiming(false);
    }
  };

  if (!user) return <div className="p-10 text-center text-slate-500">{t('me.loading')}</div>;

  // 获取头像URL，优先使用avatar，如果没有则使用默认头像
  const avatarUrl = user.avatar || 'https://picsum.photos/id/64/200/200';

  return (
    <div className="min-h-screen pb-24 bg-slate-50">
      {/* User Info Card */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-5 pt-6 pb-12 relative">
        <div className="flex justify-between items-start relative z-10">
          <div className="flex items-center gap-4">
            <img
              src={avatarUrl}
              alt="Avatar"
              className="w-16 h-16 rounded-full border-2 border-white/30 object-cover"
              onError={(e) => {
                // 如果图片加载失败，使用默认头像
                e.currentTarget.src = 'https://picsum.photos/id/64/200/200';
              }}
            />
            <div>
              <div className="flex items-center">
                <h2 className="text-xl font-bold text-white">{user.username}</h2>
                {user.member_number && (
                  <span className={`ml-3 px-2 py-0.5 backdrop-blur-md border rounded-full text-[10px] font-bold tracking-wider flex items-center gap-1 animate-shimmer ${
                    user.member_number <= 1000 
                      ? "bg-purple-500/30 border-purple-400/50 text-purple-100 animate-shimmer-purple shadow-[0_0_10px_rgba(168,85,247,0.3)]" 
                      : "bg-white/10 border-white/20 text-slate-300"
                  }`}>
                    <span>
                      {user.member_number <= 100 ? '创始元老' : user.member_number <= 1000 ? '先驱者' : '共建者'}
                    </span>
                    <span className="opacity-40">•</span>
                    <span>NO.{String(user.member_number)}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-8 relative z-20">
        {/* Wallet Card */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-5 mb-6">
          <div className="flex justify-between items-center mb-4">
            <span className="text-slate-500 text-sm font-medium uppercase">{t('me.balance_title')}</span>
            <button
              onClick={() => navigate('/orders')}
              className="text-indigo-600 text-xs font-bold hover:underline"
            >
              {t('me.orders_link')}
            </button>
          </div>

          {/* 剩余豆子 + 充值按钮 */}
          <div className="flex justify-between items-end mb-6">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-yellow-500">{user.balance_beans}</span>
              <span className="text-slate-500 text-sm">{t('me.beans_unit')}</span>
            </div>
            <button
              onClick={async () => {
                if (checkingRecharge) return;
                setCheckingRecharge(true);
                try {
                  const latest = await nanoBananaService.getPublicSettings();
                  if (latest?.recharge_enabled === false) {
                    setShowRechargeDisabledModal(true);
                  } else {
                    setShowTopUp(true);
                  }
                } catch {
                  setShowTopUp(true);
                } finally {
                  setCheckingRecharge(false);
                }
              }}
              disabled={checkingRecharge}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-5 py-2 rounded-full font-semibold text-sm shadow-lg shadow-indigo-500/20 transition-opacity"
            >
              {checkingRecharge ? '...' : t('me.btn_topup')}
            </button>
          </div>

          {/* 每日免费豆子（后台开启时显示） */}
          {systemSettings?.daily_free_beans_enabled && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-center justify-between mb-6">
              <div>
                <div className="text-sm font-bold text-slate-800">每日免费豆子</div>
                <div className="text-xs text-slate-500">
                  每天可领取 {systemSettings?.daily_free_beans_amount ?? 10} 豆子
                </div>
              </div>
              {user?.can_claim_daily_today ? (
                <button
                  onClick={handleClaimDaily}
                  disabled={claiming}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold disabled:opacity-60 transition-colors"
                >
                  {claiming ? '领取中...' : '领取'}
                </button>
              ) : (
                <span className="text-slate-400 text-sm font-medium">今日已领取</span>
              )}
            </div>
          )}

          {/* 邀请新用户 */}
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-sm font-bold text-slate-800">邀请新用户</div>
                <div className="text-xs text-slate-500">分享链接赚取豆子奖励</div>
              </div>
            </div>
            <button
              onClick={handleCopyLink}
              className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-md shadow-indigo-200 active:scale-95 transition-all"
            >
              复制链接
            </button>
          </div>
        </div>

        {/* Menu List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <MenuItem
            label={t('me.menu_tickets')}
            onClick={() => navigate('/tickets')}
            showDivider={true}
          />
          <MenuItem
            label={t('me.menu_about')}
            onClick={() => navigate('/about')}
            showDivider={true}
          />
          <MenuItem
            label={t('me.menu_settings')}
            onClick={() => navigate('/settings')}
          />
        </div>
      </div>

      <RechargeModal
        isOpen={showTopUp}
        onClose={() => setShowTopUp(false)}
        user={user}
        returnUrl="/me"
      />

      {/* 充值功能未开放提示弹框 */}
      {showRechargeDisabledModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6"
          onClick={() => setShowRechargeDisabledModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-xs flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-800 mb-1">充值功能暂未开放</h3>
              <p className="text-sm text-slate-500">敬请期待</p>
            </div>
            <button
              onClick={() => setShowRechargeDisabledModal(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      {/* 复制结果提示 - 移动端顶部轻提示 */}
      {showCopyToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-lg z-[70] animate-in fade-in slide-in-from-top-4 duration-200 max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">{copyToastMessage}</span>
          </div>
        </div>
      )}

      {/* 每日领取结果提示 */}
      {showDailyToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-lg z-[70] animate-in fade-in slide-in-from-top-4 duration-200 max-w-[calc(100vw-2rem)]">
          <span className="text-sm font-medium">{dailyToastMessage}</span>
        </div>
      )}

    </div>
  );
};

const MenuItem = ({ label, icon, onClick, showDivider }: { label: string, icon?: React.ReactNode, onClick?: () => void, showDivider?: boolean }) => (
  <div>
    <button onClick={onClick} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors text-left group min-h-[50px]">
      {icon && <div className="text-slate-400 group-hover:text-indigo-500 transition-colors flex items-center justify-center w-6">{icon}</div>}
      <span className="text-slate-700 font-medium group-hover:text-slate-900 transition-colors flex-1">{label}</span>
      <span className="ml-auto text-slate-300 text-xl">›</span>
    </button>
    {showDivider && <div className="mx-4 border-b border-slate-200"></div>}
  </div>
);

export default Me;