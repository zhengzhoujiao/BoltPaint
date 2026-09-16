import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL, authenticatedFetch } from '../services/nanoBananaService';

const PaymentResultPage: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<'checking' | 'success' | 'failed'>('checking');
    const [message, setMessage] = useState('正在查询支付结果...');
    const [needLogin, setNeedLogin] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resolvedRef = useRef(false);
    const lastProviderQueryRef = useRef(0);

    useEffect(() => {
        // --- 防穿透回退保护 ---
        // 阻止用户在支付结果页左滑/后退回到支付宝收银台或已失效的 Checkout 页
        const handlePopState = (e: PopStateEvent) => {
            e.preventDefault();
            // 强制跳转到安全页面（如订单列表或上一页）
            navigate('/me', { replace: true });
        };
        
        // 往历史栈压入一条替身记录，使得物理返回键只会消耗掉这条记录，并触发 popstate 事件
        window.history.pushState(null, '', window.location.href);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [navigate, searchParams]);

    useEffect(() => {
        // useSearchParams 从 hash 路由的查询参数中读取
        // 支付宝在有些情况下可能会把参数拼接在 hash 之前，也就是 window.location.search 中
        const urlSearchParams = new URLSearchParams(window.location.search);
        
        const orderId = searchParams.get('order_id') || searchParams.get('out_trade_no') || urlSearchParams.get('order_id') || urlSearchParams.get('out_trade_no');

        // [PaymentResult] 日志：打印当前页面收到的所有参数，用于排查跳转链路
        console.log('[PaymentResult] 页面加载，详细参数:', {
            orderId,
            hashSearch: window.location.hash,
            urlSearch: window.location.search,
            fullHref: window.location.href,
        });

        if (!orderId) {
            console.warn('[PaymentResult] 缺少 order_id，跳转失败');
            setStatus('failed');
            setMessage('订单信息丢失');
            return;
        }

        const token = localStorage.getItem('auth_token');
        if (!token) {
            setStatus('failed');
            setNeedLogin(true);
            setMessage('请先登录后查看支付结果');
            return;
        }

        const stopPolling = () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };

        const pollOrderStatus = async () => {
            try {
                const res = await authenticatedFetch(`${API_BASE_URL}/orders/${orderId}`);
                if (!res.ok) {
                    if (res.status === 404) return;
                    throw new Error('查询失败');
                }
                const order = await res.json();
                console.log('[PaymentResult] 查询订单状态:', { orderId, status: order?.status });
                if (order?.status === 'paid') {
                    resolvedRef.current = true;
                    setStatus('success');
                    setMessage('支付成功！');
                    stopPolling();
                    console.log('[PaymentResult] 支付成功，即将跳转到: /me');
                    successTimeoutRef.current = setTimeout(() => navigate('/me', { replace: true }), 3000);
                    return;
                }

                // 异步通知通常会先到账；每 5 秒最多主动向支付宝查一次，作为通知延迟/丢失兜底。
                const now = Date.now();
                if (order?.status === 'pending' && now - lastProviderQueryRef.current >= 5000) {
                    lastProviderQueryRef.current = now;
                    const queryRes = await authenticatedFetch(`${API_BASE_URL}/orders/${orderId}/alipay/query`);
                    if (queryRes.ok) {
                        const queryResult = await queryRes.json();
                        if (queryResult?.status === 'paid') {
                            resolvedRef.current = true;
                            setStatus('success');
                            setMessage('支付成功！');
                            stopPolling();
                            successTimeoutRef.current = setTimeout(() => navigate('/me', { replace: true }), 3000);
                        }
                    }
                }
            } catch (err) {
                console.error('[PaymentResult] 轮询订单状态出错:', err);
                if (err instanceof Error && err.message === '登录已过期') {
                    stopPolling();
                }
            }
        };

        pollOrderStatus();
        intervalRef.current = setInterval(pollOrderStatus, 2000);

        const maxWait = 60000;
        const timeout = setTimeout(() => {
            stopPolling();
            if (!resolvedRef.current) {
                console.warn('[PaymentResult] 轮询超时，订单状态未确认为 paid');
                setStatus('failed');
                setMessage('查询超时，请到个人中心查看积分余额');
            }
        }, maxWait);

        return () => {
            stopPolling();
            clearTimeout(timeout);
            if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
            }
        };
    }, [navigate, searchParams]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            backgroundColor: '#f5f5f5'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '40px',
                textAlign: 'center',
                maxWidth: '400px',
                width: '100%',
                boxShadow: '0 2px 12px rgba(0,0,0,0.1)'
            }}>
                {status === 'checking' && (
                    <>
                        <div style={{
                            width: '60px',
                            height: '60px',
                            border: '4px solid #f3f3f3',
                            borderTop: '4px solid #1890ff',
                            borderRadius: '50%',
                            margin: '0 auto 20px',
                            animation: 'spin 1s linear infinite'
                        }} />
                        <h2 style={{ marginBottom: '10px', color: '#333' }}>查询中...</h2>
                        <p style={{ color: '#666' }}>{message}</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div style={{
                            width: '60px',
                            height: '60px',
                            backgroundColor: '#52c41a',
                            borderRadius: '50%',
                            margin: '0 auto 20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '32px',
                            color: 'white'
                        }}>✓</div>
                        <h2 style={{ marginBottom: '10px', color: '#52c41a' }}>支付成功</h2>
                        <p style={{ color: '#666' }}>{message}</p>
                        <p style={{ color: '#999', fontSize: '14px', marginTop: '10px' }}>
                            即将跳转到个人中心...
                        </p>
                    </>
                )}

                {status === 'failed' && (
                    <>
                        <div style={{
                            width: '60px',
                            height: '60px',
                            backgroundColor: '#ff4d4f',
                            borderRadius: '50%',
                            margin: '0 auto 20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '32px',
                            color: 'white'
                        }}>✕</div>
                        <h2 style={{ marginBottom: '10px', color: '#ff4d4f' }}>支付失败</h2>
                        <p style={{ color: '#666', marginBottom: '20px' }}>{message}</p>
                        <button
                            onClick={() => navigate(needLogin ? '/login' : '/me')}
                            style={{
                                padding: '10px 30px',
                                backgroundColor: '#1890ff',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '16px'
                            }}
                        >
                            {needLogin ? '去登录' : '个人中心'}
                        </button>
                    </>
                )}
            </div>

            <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

export default PaymentResultPage;
