import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { nanoBananaService } from '../services/nanoBananaService';
import { Ticket, TicketStatus } from '../types';
import { Icons } from '../constants';
import { formatFullDateTime } from '../utils/time';
import Toast from '../components/Toast';

const Tickets: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await nanoBananaService.getTickets();
      setTickets(data);
    } catch (error: any) {
      console.error('加载工单失败:', error);
      setError(error.message || '加载工单失败，请稍后重试');
      setTickets([]); // 确保失败时显示空列表
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!subject.trim() || !content.trim()) {
      setError('请填写主题和内容');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await nanoBananaService.createTicket(subject, content);
      setShowCreateDialog(false);
      setSubject('');
      setContent('');
      loadTickets(); // 重新加载工单列表
    } catch (error: any) {
      console.error('创建工单失败:', error);
      setError(error.message || '创建工单失败');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: TicketStatus) => {
    switch (status) {
      case TicketStatus.PENDING:
        return 'bg-yellow-100 text-yellow-700';
      case TicketStatus.IN_PROGRESS:
      case TicketStatus.UNREAD:
        return 'bg-blue-100 text-blue-700';
      case TicketStatus.RESOLVED:
        return 'bg-green-100 text-green-700';
      case TicketStatus.CLOSED:
        return 'bg-slate-100 text-slate-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  const getStatusText = (status: TicketStatus) => {
    switch (status) {
      case TicketStatus.PENDING:
        return t('tickets.status_pending');
      case TicketStatus.IN_PROGRESS:
      case TicketStatus.UNREAD:
        return t('tickets.status_in_progress');
      case TicketStatus.RESOLVED:
        return t('tickets.status_resolved');
      case TicketStatus.CLOSED:
        return t('tickets.status_closed');
      default:
        return status;
    }
  };

  // 格式化时间为"创建于：具体时间"格式
  const formatDate = (dateString: string): string => {
    const formattedTime = formatFullDateTime(dateString);
    return formattedTime ? `创建于：${formattedTime}` : '';
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm h-[50px]">
        <div className="flex items-center gap-3 h-full px-3">
          <button
            onClick={() => navigate(-1)}
            className="text-slate-600 hover:text-slate-900 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-slate-900 flex-1">{t('tickets.title')}</h1>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-semibold text-sm transition-colors"
          >
            <Icons.Plus className="w-4 h-4" />
            <span>{t('tickets.btn_create')}</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <Toast message={error} type="error" onClose={() => setError('')} />
      )}

      {/* Tickets List */}
      <div className="px-4 pt-4 pb-6">
        {loading ? (
          <div className="p-10 text-center text-slate-500">{t('tickets.loading')}</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex justify-center mb-4">
              <img src="/boltPaint/images/ticket.png" alt="ticket" className="w-20 h-20 object-contain" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-2">{t('tickets.empty')}</h3>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="text-indigo-600 hover:text-indigo-500 font-semibold"
            >
              {t('tickets.btn_create_first')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => navigate(`/tickets/${ticket.id}`)}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-base font-semibold text-slate-900 flex-1 line-clamp-1">
                    {ticket.subject || ticket.content[0]?.content.substring(0, 50) || '无主题'}
                  </h3>
                  <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(ticket.status)}`}>
                    {getStatusText(ticket.status)}
                  </span>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2 mb-3">
                  {ticket.content[ticket.content.length - 1]?.content || '无内容'}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{formatDate(ticket.created_at)}</span>
                  <div className="flex items-center gap-3">
                    <span>{t('tickets.messages_count', { count: ticket.content.length + ticket.reply_content.length })}</span>
                    {(ticket.status && String(ticket.status).toLowerCase().trim() === 'unread') && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-green-600 font-bold">{t('tickets.status_unread')}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建工单对话框 */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 border border-slate-200 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">{t('tickets.dialog_title')}</h3>
              <button
                onClick={() => setShowCreateDialog(false)}
                className="text-slate-400 hover:text-slate-900 transition-colors"
              >
                <Icons.X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t('tickets.label_subject')}
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('tickets.placeholder_subject')}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t('tickets.label_content')}
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t('tickets.placeholder_content')}
                  rows={6}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreateDialog(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
                >
                  {t('tickets.btn_cancel')}
                </button>
                <button
                  onClick={handleCreateTicket}
                  disabled={submitting || !subject.trim() || !content.trim()}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-500 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? t('tickets.btn_submitting') : t('tickets.btn_submit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tickets;
