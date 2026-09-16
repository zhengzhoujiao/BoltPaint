import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoBananaService } from '../services/nanoBananaService';
import { Icons } from '../constants';
import Toast from '../components/Toast';



const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const validatePhone = (p: string) => /^1[3-9]\d{9}$/.test(p);
  const validatePassword = (p: string) => /^(?=.*[A-Za-z])(?=.*\d).{6,20}$/.test(p);

  const startCountdown = () => {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    if (!validatePhone(phone)) {
      setError('请输入正确的手机号');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await nanoBananaService.sendResetCode({ phone });
      startCountdown();
    } catch (err: any) {
      setError(err.message || '发送失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!validatePhone(phone)) {
      setError('请输入正确的手机号');
      return;
    }
    if (!code || code.length < 4) {
      setError('请输入验证码');
      return;
    }
    if (!newPassword) {
      setError('请输入新密码');
      return;
    }
    if (!validatePassword(newPassword)) {
      setError('密码为6-20位，需包含字母和数字');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await nanoBananaService.resetPassword({ phone, code, new_password: newPassword });
      setShowSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.message || '重置失败，请核对信息');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="flex-none bg-white/95 backdrop-blur-md p-4 border-b border-slate-200 z-10">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mr-4 p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Icons.ArrowLeft className="w-6 h-6 text-slate-700" />
          </button>
          <h1 className="text-lg font-bold text-slate-900">找回密码</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-8 pb-6">
        <div className="max-w-sm mx-auto space-y-6">
          <div className="text-center mb-2">
            <h2 className="text-lg font-bold text-slate-800">重置您的登录密码</h2>
            <p className="text-sm text-slate-500">验证码将发送至您的手机，验证通过后即可设置新密码</p>
          </div>

          <div className="space-y-4">
            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">注册手机号</label>
              <div className="relative">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 11));
                    setError(null);
                  }}
                  placeholder="请输入手机号"
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading || countdown > 0 || !validatePhone(phone)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-md text-xs font-semibold hover:bg-indigo-100 disabled:bg-slate-100 disabled:text-slate-400 transition-colors"
                >
                  {countdown > 0 ? `${countdown}s` : '发送验证码'}
                </button>
              </div>
            </div>

            {/* Code */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">验证码</label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setError(null);
                }}
                placeholder="请输入6位验证码"
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent tracking-widest"
                disabled={loading}
              />
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError(null);
                }}
                placeholder="6-20位字母和数字结合"
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={loading}
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                placeholder="请再次输入新密码"
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <Toast message={error} type="error" onClose={() => setError(null)} />
          )}

          <button
            type="button"
            onClick={handleResetPassword}
            disabled={loading || !phone || !code || !newPassword || !confirmPassword}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-base hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-lg active:scale-95"
          >
            {loading ? '正在处理...' : '确认重置'}
          </button>
        </div>
      </div>

          {/* Success Toast */}
      {showSuccess && (
        <Toast message="密码已重置成功" type="success" onClose={() => setShowSuccess(false)} />
      )}
    </div>
  );
};
export default ForgotPassword;
