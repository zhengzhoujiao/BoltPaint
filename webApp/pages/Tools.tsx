import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Icons } from '../constants';

const Tools: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            <Helmet>
                <title>工具箱 | BoltPaint</title>
                <meta name="description" content="BoltPaint 提供多种 AI 创作工具，包括高阶生图、AI 扩图、背景替换、漫画大师等，助你轻松实现创意。" />
                <meta name="keywords" content="AI绘画, AI工具, 扩图, 背景替换, 漫画生成, BoltPaint" />
            </Helmet>
            {/* Header - Fixed */}
            <div className="flex-none bg-white/95 backdrop-blur-md h-[50px] px-4 border-b border-slate-200 z-30 flex items-center">
                <h1 className="text-lg font-bold text-slate-900">{t('nav.tools')}</h1>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-4 pb-24">
                <div className="grid grid-cols-1 gap-4">
                    {/* Advanced Creation Tool */}
                    <div
                        onClick={() => navigate('/tools/advanced-creation')}
                        className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 hover:shadow-md hover:border-purple-300 transition-all cursor-pointer group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-base font-semibold text-slate-800 group-hover:text-purple-600 transition-colors">
                                        高阶生图
                                    </h3>
                                </div>
                                <p className="text-sm text-slate-500 leading-normal">
                                    自定义模型和系统指令，专业级图片生成，可提交为公共模板。
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* AI Expansion Tool */}
                    <div
                        onClick={() => navigate('/tools/expansion')}
                        className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                <Icons.Image className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-base font-semibold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">
                                    扩图与背景替换
                                </h3>
                                <p className="text-sm text-slate-500 leading-normal">
                                    支持图片比例调整、扩图、背景替换。
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Comic Generation Tool */}
                    <div
                        onClick={() => navigate('/tools/comic-generation')}
                        className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 hover:shadow-md hover:border-pink-300 transition-all cursor-pointer group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-orange-400 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-base font-semibold text-slate-800 group-hover:text-pink-600 transition-colors">
                                        漫画大师
                                    </h3>
                                    <span className="px-2 py-0.5 text-xs font-medium text-pink-600 bg-pink-100 rounded-full">New</span>
                                </div>
                                <p className="text-sm text-slate-500 leading-normal">
                                    输入基础信息自动生成分镜脚本及多页四格连环漫画。
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Short Drama Master (Under Development) */}
                    <div
                        className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 opacity-60 grayscale cursor-not-allowed"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center flex-shrink-0">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-base font-semibold text-slate-800">
                                        短剧大师
                                    </h3>
                                    <span className="px-2 py-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 rounded-full border border-slate-200">
                                        全力开发中...
                                    </span>
                                </div>
                                <p className="text-sm text-slate-400 leading-normal">
                                    输入剧本自动生成AI短剧，智能分镜、台词生成及角色演绎。
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 更多工具开发中 */}
                    <div className="bg-slate-100/60 rounded-2xl p-4 border border-slate-300 mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-200 rounded-xl flex items-center justify-center flex-shrink-0 opacity-50">
                                <Icons.Tool className="w-6 h-6 text-slate-500" />
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-slate-400 mb-0.5">更多工具开发中...</h3>
                                <p className="text-sm text-slate-400">功能正在加急赶工，敬请期待</p>
                            </div>
                        </div>
                    </div>

                </div>
                {/* 增加一个底部撑开区域，确保不被底栏遮挡 */}
                <div className="h-16"></div>
            </div>
        </div>
    );
};

export default Tools;
