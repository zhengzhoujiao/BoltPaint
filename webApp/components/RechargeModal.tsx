import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL, authenticatedFetch, nanoBananaService } from '../services/nanoBananaService';
import { RechargePackage, PaymentPlatform, User } from '../types';
import Toast from '../components/Toast';

interface RechargeModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    returnUrl?: string; // 可选的返回链接
}

const RechargeModal: React.FC<RechargeModalProps> = ({ isOpen, onClose, user, returnUrl }) => {
    const { t } = useTranslation();
    const [selectedPackage, setSelectedPackage] = useState<RechargePackage | null>(null);
    const [rechargePackages, setRechargePackages] = useState<RechargePackage[]>([]);
    const [packagesLoading, setPackagesLoading] = useState(false);
    const [paymentPlatform, setPaymentPlatform] = useState<PaymentPlatform>(PaymentPlatform.ALIPAY);
    const [paying, setPaying] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setSelectedPackage(null);
            return;
        }

        let cancelled = false;
        setPackagesLoading(true);
        nanoBananaService
            .getRechargePackages()
            .then((list) => {
                if (!cancelled) {
                    setRechargePackages(
                        list.filter((p) => p.enabled).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
                    );
                }
            })
            .catch(() => {
                if (!cancelled) setRechargePackages([]);
            })
            .finally(() => {
                if (!cancelled) setPackagesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    const handleSelectPackage = (pkg: RechargePackage) => {
        setSelectedPackage(pkg);
    };

    const handleConfirmPayment = async () => {
        if (!selectedPackage || !user) return;
        // BoltPaint 后端直连支付宝，目前仅支持支付宝。
        if (paymentPlatform === PaymentPlatform.WECHAT) {
            setErrorMsg(t('me.wechat_coming_soon') || '当前仅支持支付宝支付，请选择支付宝');
            return;
        }

        try {
            setPaying(true);
            const token = localStorage.getItem('auth_token');
            if (!token) {
                setErrorMsg(t('me.login_required') || '请先登录后再充值');
                return;
            }

            const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
            const resp = await authenticatedFetch(`${API_BASE_URL}/orders/alipay/pay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    package_id: selectedPackage.id,
                    pay_type: isMobile ? 'h5' : 'page',
                }),
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.detail || '创建支付宝订单失败，请稍后重试');
            }

            const { payment_url } = await resp.json();
            if (!payment_url) {
                throw new Error('未能获取支付宝收银台地址');
            }
            window.location.assign(payment_url);
        } catch (error: any) {
            console.error('充值失败:', error);
            setErrorMsg(error.message || '充值失败，请稍后重试');
        } finally {
            setPaying(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center animate-in fade-in duration-200 backdrop-blur-sm p-4">
            {errorMsg && <Toast message={errorMsg} type="error" onClose={() => setErrorMsg(null)} />}
            <div className="bg-white w-full max-w-md rounded-2xl p-6 border border-slate-200 shadow-2xl max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-base font-bold text-slate-900">{t('me.modal_recharge_title')}</h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-900 text-2xl leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* 充值套餐选择 */}
                <div className="mb-6">
                    <p className="text-sm font-medium text-slate-700 mb-3">{t('me.select_package')}</p>
                    {packagesLoading ? (
                        <div className="flex justify-center py-8 text-slate-500 text-sm">加载套餐中…</div>
                    ) : rechargePackages.length === 0 ? (
                        <p className="text-sm text-center text-slate-500 py-6">暂无可售充值档位，请稍后再试或联系客服。</p>
                    ) : (
                        <div
                            className={`grid gap-3 ${rechargePackages.length === 1 ? 'grid-cols-1' : rechargePackages.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
                        >
                            {rechargePackages.map((pkg) => (
                                <TopUpOption
                                    key={pkg.id}
                                    pkg={pkg}
                                    selected={selectedPackage?.id === pkg.id}
                                    onClick={() => handleSelectPackage(pkg)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* 支付方式选择 */}
                <div className="mb-6">
                    <p className="text-sm font-medium text-slate-700 mb-3">{t('me.payment_method')}</p>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setPaymentPlatform(PaymentPlatform.ALIPAY)}
                            className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${paymentPlatform === PaymentPlatform.ALIPAY
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                        >
                            <img src="/boltPaint/images/zfb.png" alt="Alipay" className="w-7 h-7 object-contain" />
                            <span className="font-medium text-slate-700">{t('me.alipay')}</span>
                        </button>
                    </div>
                </div>

                {/* 确认按钮 */}
                <button
                    onClick={handleConfirmPayment}
                    disabled={!selectedPackage || paying}
                    className={`w-full py-2.5 rounded-lg font-semibold text-white transition-all ${!selectedPackage || paying
                        ? 'bg-slate-300 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98]'
                        }`}
                >
                    {paying ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('me.paying')}
                        </span>
                    ) : selectedPackage ? (
                        `${t('me.confirm_pay')} ¥${selectedPackage.amount_cny}`
                    ) : (
                        t('me.select_package_first')
                    )}
                </button>

                <p className="text-xs text-center text-slate-500 mt-4">{t('me.modal_secure')}</p>
            </div>
        </div>
    );
};

const TopUpOption = ({
    pkg,
    selected,
    onClick,
}: {
    pkg: RechargePackage;
    selected: boolean;
    onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${selected
                ? 'border-indigo-500 bg-indigo-50 shadow-md'
                : 'border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300'
            }`}
    >
        {pkg.label ? (
            <span className={`text-xs mb-1 ${selected ? 'text-indigo-500' : 'text-slate-500'}`}>{pkg.label}</span>
        ) : null}
        <div className="flex items-center gap-1 mb-2">
            <img src="/boltPaint/images/beans.png" alt="Beans" className="w-6 h-6 object-contain" />
            <span className={`font-bold text-base ${selected ? 'text-indigo-600' : 'text-yellow-600'}`}>{pkg.beans_amount}</span>
        </div>
        <span className={`text-sm ${selected ? 'text-indigo-600 font-semibold' : 'text-slate-600'}`}>¥ {pkg.amount_cny}</span>
    </button>
);

export default RechargeModal;
