import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { nanoBananaService } from '../services/nanoBananaService';
import { Order, PaymentPlatform } from '../types';
import { formatFullDateTime } from '../utils/time';
import Toast from '../components/Toast';

const Orders: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await nanoBananaService.getOrders();
      setOrders(data);
    } catch (error: any) {
      console.error('加载订单列表失败:', error);
      setError(error.message || '加载失败');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  // 使用工具函数格式化时间（自动处理UTC到本地时区转换）
  const formatDate = formatFullDateTime;

  const getPaymentPlatformName = (platform: PaymentPlatform) => {
    return platform === PaymentPlatform.ALIPAY ? t('orders.platform_alipay') : t('orders.platform_wechat');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="p-10 text-center text-slate-500">{t('orders.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 px-3 py-4">
          <button
            onClick={() => navigate(-1)}
            className="text-slate-600 hover:text-slate-900 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-slate-900">{t('orders.title')}</h1>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <Toast message={error} type="error" onClose={() => setError(null)} />
      )}

      {/* Orders List */}
      <div className="px-4 pb-6">
        {orders.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex justify-center mb-4">
              <img src="/boltPaint/images/ticket.png" alt="order" className="w-20 h-20 object-contain" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-2">{t('orders.empty')}</h3>
            <p className="text-slate-500 text-sm">{t('orders.empty_hint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                formatDate={formatDate}
                getPaymentPlatformName={getPaymentPlatformName}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface OrderCardProps {
  order: Order;
  formatDate: (dateString: string) => string;
  getPaymentPlatformName: (platform: PaymentPlatform) => string;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, formatDate, getPaymentPlatformName }) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      {/* 第一行：订单号 */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{t('orders.order_no')}</span>
          <span className="text-sm font-mono text-slate-700">{order.id}</span>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${order.status === 'paid' ? 'bg-green-100 text-green-700' :
          order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
            order.status === 'cancelled' ? 'bg-gray-100 text-gray-700' :
              'bg-blue-100 text-blue-700'
          }`}>
          {t(`orders.status_${order.status}`)}
        </span>
      </div>

      {/* 第二行：支付金额 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm text-slate-500">{t('orders.payment_amount')}:</span>
        <span className="text-sm font-medium text-slate-700">¥{order.amount_cny.toFixed(2)}</span>
      </div>

      {/* 第三行：豆子数目 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm text-slate-500">{t('orders.beans_amount')}:</span>
        <span className="text-sm font-medium text-slate-700">{order.beans_amount} {t('orders.beans')}</span>
      </div>

      {/* 第四行：支付方式 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-slate-500">{t('orders.payment_method')}:</span>
        <span className="text-sm font-medium text-slate-700">{getPaymentPlatformName(order.platform)}</span>
      </div>

      {/* 第五行：订单时间 */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{formatDate(order.created_at)}</span>
      </div>
    </div>
  );
};

export default Orders;
