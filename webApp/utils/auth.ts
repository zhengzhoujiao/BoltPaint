/**
 * 认证相关的工具函数
 */

/**
 * 检查用户是否已登录
 */
export const isLoggedIn = (): boolean => {
  const token = localStorage.getItem('auth_token');
  const userId = localStorage.getItem('user_id');
  return !!(token && userId);
};

/**
 * 获取当前用户 ID
 */
export const getCurrentUserId = (): string | null => {
  return localStorage.getItem('user_id');
};

/**
 * 退出登录
 */
export const logout = (): void => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_profile');
};

const loginHashPath = '/login';

/**
 * 清除本地会话并跳转到登录页（用于 401 等未授权场景，与 HashRouter 一致）
 */
export const clearSessionAndRedirectToLogin = (): void => {
  logout();
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const path = raw.split('?')[0];
  if (path === loginHashPath || path.startsWith(`${loginHashPath}/`)) {
    return;
  }
  window.location.hash = `#${loginHashPath}`;
};

