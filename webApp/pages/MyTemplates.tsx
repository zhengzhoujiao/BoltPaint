import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { nanoBananaService } from '../services/nanoBananaService';
import { Template } from '../types';
import { Icons } from '../constants';
import TemplateCard from '../components/TemplateCard';

const MyTemplates: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeStatus, setActiveStatus] = useState<'pending' | 'approved' | 'rejected'>('approved');

    const statuses = [
        { id: 'pending', label: '待审核', icon: Icons.Zap },
        { id: 'approved', label: '已审核', icon: Icons.Check },
        { id: 'rejected', label: '已驳回', icon: Icons.X },
    ];

    useEffect(() => {
        const fetchUserTemplates = async () => {
            setLoading(true);
            try {
                const data = await nanoBananaService.getUserTemplates(activeStatus);
                setTemplates(data);
            } catch (error) {
                console.error('Failed to fetch user templates:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchUserTemplates();
    }, [activeStatus]);

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            {/* Header - Styled like Tasks.tsx */}
            <div className="flex-none bg-white/95 backdrop-blur-md h-[50px] px-3 border-b border-slate-200 z-20 flex items-center">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="text-slate-600 hover:text-slate-900 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    {/* Title: 我的模板 */}
                    <h1 className="text-lg font-bold text-slate-900">我的模板</h1>
                </div>
            </div>

            {/* Status Tabs - Matches Works.tsx style */}
            <div className="flex-none bg-white border-b border-slate-200 z-20">
                <div className="flex">
                    {statuses.map(status => (
                        <button
                            key={status.id}
                            onClick={() => setActiveStatus(status.id as any)}
                            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${activeStatus === status.id
                                ? 'text-indigo-600'
                                : 'text-slate-600 hover:text-slate-900'
                                }`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <status.icon className="w-4 h-4" />
                                <span>{status.label}</span>
                            </div>
                            {/* 选中指示器 */}
                            {activeStatus === status.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content - Waterfall layout */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-4 relative z-10 bg-slate-50">
                {loading ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                ) : templates.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                            <Icons.Grid className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="text-slate-500">
                            {activeStatus === 'pending' ? '暂无待审核模板' :
                                activeStatus === 'approved' ? '暂无已审核模板' : '暂无已驳回模板'}
                        </p>
                        {activeStatus === 'approved' && (
                            <button
                                onClick={() => navigate('/templates')}
                                className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium"
                            >
                                发现模板
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex gap-2 items-start">
                        <div className="flex-1 flex flex-col gap-2">
                            {templates.filter((_, i) => i % 2 === 0).map((template) => (
                                <TemplateCard
                                    key={template.id}
                                    template={template}
                                    onClick={(t) => navigate(`/template/${t.id}`)}
                                />
                            ))}
                        </div>
                        <div className="flex-1 flex flex-col gap-2">
                            {templates.filter((_, i) => i % 2 === 1).map((template) => (
                                <TemplateCard
                                    key={template.id}
                                    template={template}
                                    onClick={(t) => navigate(`/template/${t.id}`)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyTemplates;
