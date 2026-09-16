import React, { useState, useEffect, Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import { isLoggedIn } from './utils/auth';
import { AppProvider, useAppContext } from './contexts/AppContext';

// 路由懒加载：各页面按需加载，大幅减少首屏 JS 体积
const Square = lazy(() => import('./pages/Square'));
const Templates = lazy(() => import('./pages/Templates'));
const TemplateDetail = lazy(() => import('./pages/TemplateDetail'));
const Creation = lazy(() => import('./pages/Creation'));
const Works = lazy(() => import('./pages/Works'));
const Tools = lazy(() => import('./pages/Tools'));
const Me = lazy(() => import('./pages/Me'));
const ArtworkDetail = lazy(() => import('./pages/ArtworkDetail'));
const Register = lazy(() => import('./pages/Register'));
const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Settings = lazy(() => import('./pages/Settings'));
const Tickets = lazy(() => import('./pages/Tickets'));
const TicketDetail = lazy(() => import('./pages/TicketDetail'));
const AboutUs = lazy(() => import('./pages/AboutUs'));
const Orders = lazy(() => import('./pages/Orders'));
const Tasks = lazy(() => import('./pages/Tasks'));
const PaymentResult = lazy(() => import('./pages/PaymentResult'));
const Expansion = lazy(() => import('./pages/Expansion'));
const AdvancedCreation = lazy(() => import('./pages/AdvancedCreation'));
const ComicGeneration = lazy(() => import('./pages/ComicGeneration'));
const ComicDetail = lazy(() => import('./pages/ComicDetail'));
const MyTemplates = lazy(() => import('./pages/MyTemplates'));

// 路由保护组件
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// 底部导航包装组件（需要访问路由位置）
const BottomNavWrapper: React.FC = () => {
  const location = useLocation();

  // 只有指定的五个主页面显示底部导航
  const mainPages = ['/', '/templates', '/works', '/tools', '/me'];
  const showBottomNav = mainPages.includes(location.pathname);

  if (!showBottomNav) {
    return null;
  }

  return <BottomNav />;
};

// 推荐追踪组件：监听 URL 参数中的 ref
const ReferralTracker: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    if (ref) {
      console.log('🔗 捕获到邀请码:', ref);
      localStorage.setItem('referrer_code', ref);
    }
  }, [location]);

  return null;
};

// 首屏加载骨架屏
const PageFallback: React.FC = () => (
  <div className="w-full h-[100vh] p-4 flex flex-col gap-5 animate-pulse bg-slate-50">
    {/* 顶部栏 */}
    <div className="flex items-center justify-between mt-2 mb-2">
      <div className="w-1/3 h-8 bg-slate-200 rounded-lg"></div>
      <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
    </div>
    
    {/* 横幅区 */}
    <div className="w-full h-40 bg-slate-200 rounded-2xl"></div>
    
    {/* 金刚区/导航区 */}
    <div className="flex justify-between px-2 mt-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 bg-slate-200 rounded-2xl"></div>
          <div className="w-10 h-3 bg-slate-200 rounded"></div>
        </div>
      ))}
    </div>
    
    {/* 瀑布流/网格区 */}
    <div className="grid grid-cols-2 gap-4 mt-4">
      <div className="w-full h-56 bg-slate-200 rounded-2xl"></div>
      <div className="w-full h-48 bg-slate-200 rounded-2xl"></div>
      <div className="w-full h-48 bg-slate-200 rounded-2xl"></div>
      <div className="w-full h-56 bg-slate-200 rounded-2xl"></div>
    </div>
  </div>
);

const AppContent: React.FC = () => {
  const { systemSettings, isLoadingSettings } = useAppContext();
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  useEffect(() => {
    if (systemSettings?.announcement_enabled && systemSettings?.announcement_text) {
      setShowAnnouncement(true);
    }
  }, [systemSettings]);

  // 维护模式：设置加载完成后才做拦截，加载期间正常渲染页面
  if (!isLoadingSettings && systemSettings?.maintenance_mode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-8 text-center">
        <div className="text-6xl mb-6">🛠️</div>
        <h1 className="text-2xl font-bold mb-4">系统维护中</h1>
        <p className="text-slate-400 mb-8">
          我们正在进行系统升级，以提供更好的服务。请稍后再试。
        </p>
        <div className="text-sm text-slate-500 italic">
          {systemSettings.announcement_text || "预计维护时间：2小时"}
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="bg-slate-50 min-h-screen text-slate-900 max-w-lg mx-auto shadow-2xl overflow-hidden relative border-x border-slate-200">
        {/* 全局公告 */}
        {showAnnouncement && (
          <div className="absolute top-0 left-0 right-0 z-50 bg-indigo-600 text-white p-3 shadow-lg flex items-start animate-in slide-in-from-top duration-300">
            <div className="text-xl mr-3">📢</div>
            <div className="flex-1 text-sm">
              <div className="font-bold mb-0.5">系统公告</div>
              <div>{systemSettings.announcement_text}</div>
            </div>
            <button
              onClick={() => setShowAnnouncement(false)}
              className="ml-2 p-1 hover:bg-white/20 rounded text-xl leading-none"
            >
              ×
            </button>
          </div>
        )}

        {/* Suspense 包裹所有路由，页面 chunk 加载时显示轻量 spinner */}
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/" element={<ProtectedRoute><Square /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/template/:id" element={<ProtectedRoute><TemplateDetail /></ProtectedRoute>} />
            <Route path="/create" element={<ProtectedRoute><Creation /></ProtectedRoute>} />
            <Route path="/works" element={<ProtectedRoute><Works /></ProtectedRoute>} />
            <Route path="/tools" element={<ProtectedRoute><Tools /></ProtectedRoute>} />
            <Route path="/tools/expansion" element={<ProtectedRoute><Expansion /></ProtectedRoute>} />
            <Route path="/tools/advanced-creation" element={<ProtectedRoute><AdvancedCreation /></ProtectedRoute>} />
            <Route path="/tools/comic-generation" element={<ProtectedRoute><ComicGeneration /></ProtectedRoute>} />
            <Route path="/me" element={<ProtectedRoute><Me /></ProtectedRoute>} />
            <Route path="/artwork/:id" element={<ProtectedRoute><ArtworkDetail /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
            <Route path="/tickets/:id" element={<ProtectedRoute><TicketDetail /></ProtectedRoute>} />
            <Route path="/about" element={<ProtectedRoute><AboutUs /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
            <Route path="/tasks/comic/:taskId" element={<ProtectedRoute><ComicDetail /></ProtectedRoute>} />
            <Route path="/my-templates" element={<ProtectedRoute><MyTemplates /></ProtectedRoute>} />
            <Route path="/payment/result" element={<PaymentResult />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>

        <ReferralTracker />
        <BottomNavWrapper />
      </div>
    </Router>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;