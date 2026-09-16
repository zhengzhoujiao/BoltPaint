import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { nanoBananaService } from '../services/nanoBananaService';
import { Icons } from '../constants';
import Toast from '../components/Toast';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !password) {
      setError(t('login.error_info_incomplete'));
      return;
    }

    try {
      setLoading(true);
      console.log('🔐 开始登录:', username);
      
      const response = await nanoBananaService.login({
        username,
        password,
      });

      console.log('📥 登录响应:', response);

      if (response.success && response.user && response.token) {
        // 保存登录信息
        localStorage.setItem('auth_token', response.token);
        localStorage.setItem('user_id', response.user.id);
        
        console.log('✅ 登录信息已保存');
        // 跳转到首页
        navigate('/');
      } else {
        setError(t('login.error_failed'));
      }
    } catch (err: any) {
      console.error('❌ 登录错误:', err);
      setError(err.message || t('login.error_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="flex-none bg-white/95 backdrop-blur-md p-4 border-b border-slate-200 z-10">
        <h1 className="text-lg font-bold text-slate-900 text-center">{t('login.title')}</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-6 pb-6 flex items-start justify-center">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6">
          {/* Logo/Icon */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center mb-4">
              <img 
                src="/boltPaint/images/logo.png" 
                alt="Logo" 
                className="w-20 h-20 object-contain"
              />
            </div>
            <h2 className="text-xl font-bold text-slate-900">{t('login.welcome')}</h2>
            <p className="text-slate-500 text-sm mt-2">{t('login.subtitle')}</p>
          </div>

          {/* 用户名输入 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('login.username_label')}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
              placeholder={t('login.username_placeholder')}
              className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              disabled={loading}
              autoComplete="username"
            />
          </div>

          {/* 密码输入 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('login.password_label')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder={t('login.password_placeholder')}
              className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              disabled={loading}
              autoComplete="current-password"
            />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium py-1"
              >
                忘记密码？
              </button>
            </div>
          </div>

          {/* 错误提示 - 改为 Notify 形式 */}
          {error && (
            <Toast message={error} type="error" onClose={() => setError(null)} />
          )}

          {/* 登录按钮 */}
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? t('login.submitting') : t('login.submit')}
          </button>

          {/* 注册链接 */}
          <div className="text-center text-sm text-slate-600">
            <span>{t('login.no_account')}</span>
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="text-indigo-600 hover:text-indigo-700 font-medium ml-1"
            >
              {t('login.register_now')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;

