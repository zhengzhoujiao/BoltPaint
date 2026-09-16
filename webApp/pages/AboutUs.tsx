import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { Icons } from '../constants';

const AboutUs: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { systemSettings } = useAppContext();

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* 顶部标题栏 */}
      <div className="flex-none bg-white/95 backdrop-blur-md border-b border-slate-200 z-10">
        <div className="flex items-center gap-3 px-3 py-4">
          <button
            onClick={() => navigate(-1)}
            className="text-slate-600 hover:text-slate-900 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-slate-900">{t('about.title')}</h1>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="p-6 max-w-2xl mx-auto">
          {/* Logo 区域 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4">
              <img
                src="/boltPaint/images/logo.png"
                alt="Logo"
                className="w-20 h-20 object-contain"
              />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">{t('about.app_name')}</h2>
            <p className="text-sm text-slate-500">{t('about.version')}</p>
          </div>

          {/* 项目简介 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">{t('about.section_intro')}</h3>
            <div className="text-slate-600 space-y-2 text-sm leading-relaxed">
              <p>{t('about.intro_p1')}</p>
              <p>{t('about.intro_p2')}</p>
              <p>{t('about.intro_p3')}</p>
            </div>
          </div>

          {/* 核心功能 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('about.section_features')}</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-slate-900 mb-1">{t('about.feature_1_title')}</h4>
                <p className="text-sm text-slate-600">{t('about.feature_1_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-1">{t('about.feature_2_title')}</h4>
                <p className="text-sm text-slate-600">{t('about.feature_2_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-1">{t('about.feature_3_title')}</h4>
                <p className="text-sm text-slate-600">{t('about.feature_3_desc')}</p>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-1">{t('about.feature_4_title')}</h4>
                <p className="text-sm text-slate-600">{t('about.feature_4_desc')}</p>
              </div>
            </div>
          </div>

          {/* 联系我们 / 联系客服 */}
          {/* <div className="bg-white rounded-xl border border-slate-200 p-6"> */}
            {/* <h3 className="text-lg font-semibold text-slate-900 mb-3">{t('about.section_contact')}</h3> */}
            {/* <div className="space-y-2 text-sm text-slate-600"> */}
              {/* <p>{systemSettings.customer_service_wechat}</p> */}
              {/* <p>{t('about.contact_website')}</p> */}
            {/* </div> */}
          {/* </div> */}

          {/* 版权信息 */}
          <div className="text-center mt-8 text-xs text-slate-400">
            <p>{t('about.copyright')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;
