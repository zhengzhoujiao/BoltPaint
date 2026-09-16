import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { nanoBananaService } from '../services/nanoBananaService';
import { Ticket, TicketStatus, Message } from '../types';
import { Icons } from '../constants';
import Toast from '../components/Toast';

const TicketDetail: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      loadTicket();
    }
  }, [id]);

  useEffect(() => {
    // 滚动到底部
    scrollToBottom();
  }, [ticket]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadTicket = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await nanoBananaService.getTicketById(id);
      setTicket(data);
    } catch (err: any) {
      console.error('加载工单详情失败:', err);
      setError(err.message || '加载工单详情失败');
      setTimeout(() => navigate('/tickets'), 2000);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !id) return;

    try {
      setSending(true);
      const updatedTicket = await nanoBananaService.addTicketMessage(id, message);
      setTicket(updatedTicket);
      setMessage('');
      setTimeout(scrollToBottom, 100);
    } catch (err: any) {
      console.error('发送消息失败:', err);
      setError(err.message || '发送消息失败');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
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

  // 合并并排序所有消息
  const getAllMessages = (): Array<{ type: 'user' | 'support'; message: Message }> => {
    if (!ticket) return [];

    const userMessages = ticket.content.map(msg => ({ type: 'user' as const, message: msg }));
    const supportMessages = ticket.reply_content.map(msg => ({ type: 'support' as const, message: msg }));

    const allMessages = [...userMessages, ...supportMessages];

    // 按时间排序
    allMessages.sort((a, b) => {
      return new Date(a.message.timestamp).getTime() - new Date(b.message.timestamp).getTime();
    });

    return allMessages;
  };

  const canSendMessage = ticket && (ticket.status === TicketStatus.PENDING || ticket.status === TicketStatus.IN_PROGRESS || ticket.status === TicketStatus.UNREAD);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-slate-500">{t('tickets.loading')}</div>
        {error && <Toast message={error} type="error" onClose={() => setError('')} />}
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-slate-500">{t('tickets.not_found')}</div>
        {error && <Toast message={error} type="error" onClose={() => setError('')} />}
      </div>
    );
  }

  const messages = getAllMessages();

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Toast Error */}
      {error && <Toast message={error} type="error" onClose={() => setError('')} />}
      {/* 顶部标题栏 */}
      <div className="flex-none bg-white/95 backdrop-blur-md border-b border-slate-200 z-10 h-[50px]">
        <div className="flex items-center gap-3 h-full px-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Icons.ArrowLeft className="w-6 h-6 text-slate-700" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900 line-clamp-1">
              {ticket.subject || ticket.content[0]?.content.substring(0, 50) || '工单详情'}
            </h1>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
            {getStatusText(ticket.status)}
          </span>
        </div>
      </div>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((item, index) => {
            const isUser = item.type === 'user';
            return (
              <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] min-w-0 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                  {/* 发送者和时间 */}
                  <div className={`flex items-center gap-2 mb-1 text-xs text-slate-500 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="font-medium">
                      {isUser ? t('tickets.sender_me') : t('tickets.sender_support')}
                    </span>
                    <span>{formatTime(item.message.timestamp)}</span>
                  </div>

                  {/* 消息内容 */}
                  <div
                    className={`px-4 py-3 rounded-2xl min-w-0 ${isUser
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-white text-slate-900 border border-slate-200 rounded-bl-sm'
                      }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words break-all overflow-wrap-anywhere">{item.message.content}</p>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* 工单已完成提示 */}
        {!canSendMessage && (
          <div className="max-w-3xl mx-auto mt-6 bg-slate-100 border border-slate-200 rounded-lg p-4 text-center">
            <p className="text-sm text-slate-600">
              {ticket.status === TicketStatus.RESOLVED
                ? t('tickets.resolved_hint')
                : t('tickets.closed_hint')}
            </p>
          </div>
        )}
      </div>

      {/* 输入框区域 - 仅在工单未完成时显示 */}
      {canSendMessage && (
        <div className="flex-none bg-white border-t border-slate-200 p-4 z-10">
          <div className="max-w-3xl mx-auto flex gap-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={t('tickets.input_placeholder')}
              rows={2}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            <button
              onClick={handleSendMessage}
              disabled={!message.trim() || sending}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-500 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {sending ? (
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <Icons.Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketDetail;
