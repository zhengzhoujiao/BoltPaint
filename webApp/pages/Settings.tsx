import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icons } from '../constants';
import i18nInstance from '../i18n';
import { isLoggedIn, logout } from '../utils/auth';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
  }, []);

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = () => {
    logout();
    setLoggedIn(false);
    setShowLogoutConfirm(false);
    setShowSuccessMessage(true);
    setTimeout(() => {
      setShowSuccessMessage(false);
      navigate('/login');
    }, 1500);
  };

  const handleLanguageChange = (lang: 'zh' | 'en') => {
    if (i18nInstance.language !== lang) {
      // 保存语言设置到 localStorage
      localStorage.setItem('i18n_language', lang);
      // 切换语言
      i18nInstance.changeLanguage(lang);
      // 延迟刷新，确保语言已切换
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="flex-none bg-white/95 backdrop-blur-md border-b border-slate-200 z-10 h-[50px]">
        <div className="flex items-center gap-3 h-full px-3">
          <button
            onClick={() => navigate(-1)}
            className="text-slate-600 hover:text-slate-900 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-slate-900">{t('me.settings_title')}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4">
        <div className="space-y-4">
          {/* Language Setting */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <Icons.Globe className="w-5 h-5 text-slate-600" />
                <span className="font-medium text-slate-700">{t('me.settings_language')}</span>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleLanguageChange('zh')}
                  className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    i18nInstance.language === 'zh'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {t('me.settings_language_zh')}
                </button>
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    i18nInstance.language === 'en'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {t('me.settings_language_en')}
                </button>
              </div>
            </div>
          </div>

          {/* Logout Button */}
          {loggedIn && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <button
                onClick={handleLogoutClick}
                className="w-full p-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>{t('me.settings_logout')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 退出登录确认弹框 */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 border border-slate-200 shadow-2xl">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">{t('me.settings_logout')}</h3>
              <p className="text-slate-600 text-sm">{t('me.settings_logout_confirm')}</p>
            </div>

            {/* 按钮组 */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleLogoutConfirm}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 退出成功提示 */}
      {showSuccessMessage && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 border border-slate-200 shadow-2xl">
            <div className="text-center">
              <div className="mb-4">
                <svg className="w-16 h-16 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-slate-900 font-medium text-lg mb-2">{t('me.settings_logout_success')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

