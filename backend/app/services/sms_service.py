"""
阿里云短信服务封装
- sms_enabled = True  → 调用阿里云 Dysmsapi 发送真实短信
- sms_enabled = False → 仅打印到控制台（开发/调试模式）
"""
from app.config import settings


async def send_verification_sms(phone: str, code: str) -> None:
    """
    发送短信验证码。
    若 settings.sms_enabled 为 False，仅打印到控制台。
    发送失败时抛出 RuntimeError。
    """
    if not settings.sms_enabled:
        # 开发模式：打印到控制台，不实际发短信
        print(f"📱 [开发模式] 验证码 → {phone}: {code}（有效期 5 分钟）")
        return

    # 生产模式：调用阿里云短信 API
    try:
        from alibabacloud_dysmsapi20170525.client import Client
        from alibabacloud_dysmsapi20170525 import models as sms_models
        from alibabacloud_tea_openapi import models as open_api_models
        import json

        # 初始化客户端
        config = open_api_models.Config(
            access_key_id=settings.aliyun_access_key_id,
            access_key_secret=settings.aliyun_access_key_secret,
        )
        config.endpoint = "dysmsapi.aliyuncs.com"
        client = Client(config)

        # 构造发送请求
        send_request = sms_models.SendSmsRequest(
            phone_numbers=phone,
            sign_name=settings.aliyun_sms_sign_name,
            template_code=settings.aliyun_sms_template_code,
            template_param=json.dumps({"code": code}),
        )

        response = client.send_sms(send_request)
        result = response.body

        if result.code != "OK":
            print(f"❌ 短信发送失败: code={result.code}, message={result.message}")
            raise RuntimeError(f"短信发送失败: {result.message}")

        print(f"✅ 短信发送成功 → {phone}")

    except RuntimeError:
        raise
    except Exception as e:
        print(f"❌ 短信服务异常: {e}")
        raise RuntimeError(f"短信服务异常，请稍后重试") from e


async def send_reset_password_sms(phone: str, code: str) -> None:
    """
    发送密码重置短信验证码。
    若 settings.sms_enabled 为 False，仅打印到控制台。
    发送失败时抛出 RuntimeError。
    """
    if not settings.sms_enabled:
        # 开发模式：打印到控制台，不实际发短信
        print(f"📱 [开发模式] 密码重置验证码 → {phone}: {code}（有效期 5 分钟）")
        return

    # 生产模式：调用阿里云短信 API（使用密码重置专属模板）
    try:
        from alibabacloud_dysmsapi20170525.client import Client
        from alibabacloud_dysmsapi20170525 import models as sms_models
        from alibabacloud_tea_openapi import models as open_api_models
        import json

        config = open_api_models.Config(
            access_key_id=settings.aliyun_access_key_id,
            access_key_secret=settings.aliyun_access_key_secret,
        )
        config.endpoint = "dysmsapi.aliyuncs.com"
        client = Client(config)

        send_request = sms_models.SendSmsRequest(
            phone_numbers=phone,
            sign_name=settings.aliyun_sms_sign_name,
            template_code=settings.aliyun_sms_reset_template_code,
            template_param=json.dumps({"code": code}),
        )

        response = client.send_sms(send_request)
        result = response.body

        if result.code != "OK":
            print(f"❌ 密码重置短信发送失败: code={result.code}, message={result.message}")
            raise RuntimeError(f"短信发送失败: {result.message}")

        print(f"✅ 密码重置短信发送成功 → {phone}")

    except RuntimeError:
        raise
    except Exception as e:
        print(f"❌ 短信服务异常: {e}")
        raise RuntimeError(f"短信服务异常，请稍后重试") from e
