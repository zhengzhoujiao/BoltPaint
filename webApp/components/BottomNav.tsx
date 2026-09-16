import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icons } from '../constants';

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const navItems = [
    { label: t('nav.square'), path: '/', icon: Icons.Home, highlight: false },
    { label: t('nav.templates'), path: '/templates', icon: Icons.Grid, highlight: false },
    { label: t('nav.works'), path: '/works', icon: Icons.Image, highlight: false },
    { label: t('nav.tools'), path: '/tools', icon: Icons.Tool, highlight: false },
    { label: t('nav.me'), path: '/me', icon: Icons.User, highlight: false },
  ];

  return (
    <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe z-50">
      <div className="flex justify-around items-center h-14">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          if (item.highlight) {
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center -mt-6"
              >
                <div className={`p-3 rounded-full shadow-lg transition-transform active:scale-95 ${isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-slate-100'}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </button>
            )
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-0.5 ${isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;