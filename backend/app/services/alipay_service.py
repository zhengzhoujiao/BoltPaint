"""BoltPaint 支付宝直连服务。"""

import logging
from typing import Any, Dict, Optional

from alipay import AliPay

from app.config import settings


logger = logging.getLogger(__name__)


class AlipayService:
    def __init__(self) -> None:
        self._alipay: Optional[AliPay] = None

        if not all(
            (
                settings.alipay_app_id,
                settings.alipay_private_key,
                settings.alipay_public_key,
            )
        ):
            logger.warning("Alipay credentials are not configured")
            return

        try:
            self._alipay = AliPay(
                appid=settings.alipay_app_id,
                app_notify_url=settings.alipay_notify_url or None,
                app_private_key_string=self._normalize_key(
                    settings.alipay_private_key, "PRIVATE"
                ),
                alipay_public_key_string=self._normalize_key(
                    settings.alipay_public_key, "PUBLIC"
                ),
                sign_type="RSA2",
                debug="alipaydev.com" in settings.alipay_gateway,
            )
        except Exception:
            logger.exception("Failed to initialize Alipay SDK")

    @staticmethod
    def _normalize_key(key: str, key_type: str) -> str:
        """兼容环境变量中的单行 Base64 密钥和完整 PEM 密钥。"""
        value = key.strip().replace("\\n", "\n")
        if "-----BEGIN" in value:
            return value

        compact = "".join(value.split())
        return (
            f"-----BEGIN {key_type} KEY-----\n"
            f"{compact}\n"
            f"-----END {key_type} KEY-----"
        )

    def is_available(self) -> bool:
        return self._alipay is not None

    def create_payment(
        self,
        *,
        order_id: str,
        subject: str,
        total_amount: float,
        pay_type: str,
    ) -> Optional[str]:
        """生成手机网站支付或电脑网站支付地址。"""
        if not self._alipay:
            return None

        common = {
            "out_trade_no": order_id,
            "total_amount": f"{total_amount:.2f}",
            "subject": subject,
            "return_url": settings.alipay_return_url,
        }

        try:
            if pay_type == "h5":
                order_string = self._alipay.api_alipay_trade_wap_pay(**common)
            else:
                order_string = self._alipay.api_alipay_trade_page_pay(**common)
            return f"{settings.alipay_gateway}?{order_string}"
        except Exception:
            logger.exception("Failed to create Alipay payment for order %s", order_id)
            return None

    def verify(self, data: Dict[str, Any]) -> bool:
        """验证支付宝同步或异步通知签名，不修改调用方传入的数据。"""
        if not self._alipay:
            return False

        payload = dict(data)
        signature = payload.pop("sign", None)
        if not signature:
            return False

        try:
            return bool(self._alipay.verify(payload, signature))
        except Exception:
            logger.exception("Failed to verify Alipay signature")
            return False

    def query_payment(self, order_id: str) -> Optional[Dict[str, Any]]:
        if not self._alipay:
            return None

        try:
            result = self._alipay.api_alipay_trade_query(out_trade_no=order_id)
            return result if result.get("code") == "10000" else None
        except Exception:
            logger.exception("Failed to query Alipay order %s", order_id)
            return None


alipay_service = AlipayService()
