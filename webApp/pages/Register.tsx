import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { nanoBananaService } from '../services/nanoBananaService';
import { Icons } from '../constants';
import { useAppContext } from '../contexts/AppContext';
import Toast from '../components/Toast';

// 四个系统默认头像（public/images/avatar；URL 须带 /boltPaint/ 与 vite base 一致）
const SYSTEM_AVATARS = [
  '/boltPaint/images/avatar/astronaut.jpeg',
  '/boltPaint/images/avatar/cat.jpeg',
  '/boltPaint/images/avatar/fox.jpeg',
  '/boltPaint/images/avatar/monster.jpeg',
];

const AVATAR_SIZE = 56;

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { systemSettings } = useAppContext();
  /** 与后台「注册需手机验证码」一致；未拉到配置前默认需要验证码 */
  const registrationSmsRequired = systemSettings?.registration_sms_code_required !== false;
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referrerCode, setReferrerCode] = useState(() => localStorage.getItem('referrer_code') || '');
  const [activationCode, setActivationCode] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(SYSTEM_AVATARS[0]);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const validatePhone = (phone: string): boolean => {
    return /^1[3-9]\d{9}$/.test(phone);
  };

  // 密码至少包含数字和字母，6-20位
  const validatePassword = (p: string): boolean => {
    return /^(?=.*[A-Za-z])(?=.*\d).{6,20}$/.test(p);
  };

  const handleSendCode = async () => {
    if (!phone) {
      setError(t('register.error_phone_required'));
      return;
    }
    if (!validatePhone(phone)) {
      setError(t('register.error_phone_invalid'));
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setCodeSent(false);
      await nanoBananaService.sendVerificationCode({ phone });
      setCodeSent(true);
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('register.error_code_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarSelect = (url: string) => {
    setSelectedAvatar(url);
    setError(null);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('common.image_too_large'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('图片大小不能超过 5MB');
      return;
    }
    try {
      setAvatarUploading(true);
      setError(null);
      const { url } = await nanoBananaService.uploadImage(file);
      setSelectedAvatar(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !password || !confirmPassword) {
      setError(t('register.error_info_incomplete'));
      return;
    }
    if (username.length < 2 || username.length > 20) {
      setError(t('register.error_username_length'));
      return;
    }
    if (!validatePassword(password)) {
      setError(t('register.error_password_format'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('register.error_password_mismatch'));
      return;
    }
    if (systemSettings?.activation_code_required && !activationCode.trim()) {
      setError('请填写激活码');
      return;
    }
    if (!phone) {
      setError(t('register.error_phone_required'));
      return;
    }
    if (!validatePhone(phone)) {
      setError(t('register.error_phone_invalid'));
      return;
    }
    if (registrationSmsRequired) {
      if (!code || code.length < 4) {
        setError(t('register.error_code_required') || '请填写短信验证码');
        return;
      }
    }

    try {
      setLoading(true);
      const response = await nanoBananaService.register({
        phone: phone.trim(),
        ...(registrationSmsRequired ? { code: code.trim() } : {}),
        username,
        password,
        avatar: selectedAvatar || undefined,
        referrer_code: referrerCode || undefined,
        activation_code: systemSettings?.activation_code_required ? activationCode.trim() : undefined,
      });

      if (response.success && response.user) {
        // 注册成功后清除推荐码
        localStorage.removeItem('referrer_code');
        setShowSuccessToast(true);
        setTimeout(() => {
          setShowSuccessToast(false);
          navigate('/');
        }, 2000);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('register.error_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <div className="flex-none bg-white/95 backdrop-blur-md p-4 border-b border-slate-200 z-10">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mr-4 p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Icons.ArrowLeft className="w-6 h-6 text-slate-700" />
          </button>
          <h1 className="text-lg font-bold text-slate-900">{t('register.title')}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-6">
        <form onSubmit={handleRegister} className="space-y-6">
          {/* 头像选择 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              {t('register.avatar_label')}
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              {SYSTEM_AVATARS.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => handleAvatarSelect(url)}
                  className={`flex-shrink-0 rounded-full overflow-hidden border-2 transition-all ${selectedAvatar === url
                    ? 'border-indigo-500 ring-2 ring-indigo-200'
                    : 'border-slate-200 hover:border-slate-300'
                    }`}
                  style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={avatarUploading}
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="flex-shrink-0 rounded-full border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 flex items-center justify-center transition-all"
                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
              >
                {avatarUploading ? (
                  <span className="text-slate-400 text-xs">...</span>
                ) : (
                  <Icons.Plus className="w-6 h-6 text-slate-500" />
                )}
              </button>
              {selectedAvatar && !SYSTEM_AVATARS.includes(selectedAvatar) && (
                <div
                  className="flex-shrink-0 rounded-full overflow-hidden border-2 border-indigo-500 ring-2 ring-indigo-200"
                  style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                >
                  <img src={selectedAvatar} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          {/* 用户名 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('register.username_label')}
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
              placeholder={t('register.username_placeholder')}
              maxLength={20}
              className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* 密码 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('register.password_label')}
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder={t('register.password_placeholder')}
              className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* 确认密码 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('register.confirm_password_label')}
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
              placeholder={t('register.confirm_password_placeholder')}
              className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* 激活码（当系统开启「注册需激活码」时显示且必填） */}
          {systemSettings?.activation_code_required && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                激活码
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={activationCode}
                onChange={(e) => {
                  setActivationCode(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder="请输入激活码"
                maxLength={32}
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          )}

          {/* 手机号 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('register.phone_label')}
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError(null);
                  setCodeSent(false);
                }}
                placeholder={t('register.phone_placeholder')}
                maxLength={11}
                className={`${registrationSmsRequired ? 'flex-1' : 'w-full'} px-4 py-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
                disabled={loading}
              />
              {registrationSmsRequired && (
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading || countdown > 0 || !validatePhone(phone)}
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap text-sm"
                >
                  {countdown > 0 ? `${countdown}s` : t('register.send_code')}
                </button>
              )}
            </div>
            {registrationSmsRequired && codeSent && (
              <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {t('register.code_sent') || '验证码已发送，请查收短信'}
              </p>
            )}
          </div>

          {/* 验证码（后台关闭「注册需手机验证码」时不展示） */}
          {registrationSmsRequired && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('register.code_label')}
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setError(null);
                }}
                placeholder={t('register.code_placeholder') || '请输入6位验证码'}
                maxLength={6}
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <Toast message={error} type="error" onClose={() => setError(null)} />
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors touch-manipulation"
          >
            {loading ? t('register.submitting') : t('register.submit')}
          </button>

          <div className="text-center text-sm text-slate-600 pt-2">
            <span>{t('register.have_account')}</span>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-indigo-600 hover:text-indigo-700 font-medium ml-1 py-2 px-3 -my-2 -mx-1 rounded cursor-pointer touch-manipulation"
            >
              {t('register.login_now')}
            </button>
          </div>
        </form>
      </div>

      {/* 注册成功 - 移动端 Toast */}
      {showSuccessToast && (
        <Toast message={t('register.success')} type="success" onClose={() => setShowSuccessToast(false)} />
      )}
    </div>
  );
};

export default Register;
