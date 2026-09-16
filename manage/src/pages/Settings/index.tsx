import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Button, Card, message, Space, Typography, Divider, Switch } from 'antd';
import {
    SaveOutlined,
    SettingOutlined,
    DollarOutlined,
    AlertOutlined,
    NotificationOutlined,
    CustomerServiceOutlined
} from '@ant-design/icons';
import { getSettings, updateSettings } from '../../api';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

const SettingsPage: React.FC = () => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const data = await getSettings();
            form.setFieldsValue(data);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
            message.error('获取系统配置失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const onFinish = async (values: any) => {
        setSaving(true);
        try {
            await updateSettings(values);
            message.success('系统配置已更新，立即生效');
        } catch (error) {
            console.error('Failed to update settings:', error);
            message.error('更新系统配置失败');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 50 }}>
            <Title level={4}>
                <SettingOutlined /> 系统参数配置中心
            </Title>
            <Paragraph>
                在此处修改的参数将实时同步至后端，无需重启服务。请谨慎操作敏感密钥和系统开关。
            </Paragraph>
            <Divider />

            <Card loading={loading}>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={onFinish}
                    autoComplete="off"
                        initialValues={{
                        maintenance_mode: false,
                        announcement_enabled: false,
                        activation_code_required: false,
                        registration_sms_code_required: true,
                        new_user_reward_amount: 100,
                        referral_reward_amount: 50,
                        daily_generation_limit: 100,
                        daily_generation_limit_enabled: true,
                        daily_free_beans_enabled: false,
                        daily_free_beans_amount: 10,
                        recharge_enabled: true,
                    }}
                >
                    {/* 1. 核心与运维 */}
                    <Title level={5}>
                        <AlertOutlined style={{ color: '#faad14' }} /> 核心与运维配置
                    </Title>

                    {/* API 密钥 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                        <Form.Item
                            label="Evolink API Key"
                            name="evolink_api_key"
                            extra="中转站生图 API 密钥（NanoBanana Pro / GPT Image 2 / Z Image Turbo）。"
                        >
                            <Input.Password placeholder="请输入 Evolink API Key" />
                        </Form.Item>
                        <Form.Item
                            label="Gemini API Key"
                            name="gemini_api_key"
                            extra="用于漫画脚本生成、提示词润色等辅助功能。"
                        >
                            <Input.Password placeholder="请输入 Google Gemini API Key" />
                        </Form.Item>
                    </div>

                    {/* 运维开关 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px', marginTop: 8 }}>
                        <Form.Item
                            label="维护模式"
                            name="maintenance_mode"
                            valuePropName="checked"
                            extra="开启后，用户访问 App 将显示维护中提示。"
                        >
                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>
                        <Form.Item
                            label="注册需填写激活码"
                            name="activation_code_required"
                            valuePropName="checked"
                            extra="开启后，用户注册时必须填写有效且未使用的激活码才能注册成功。"
                        >
                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>
                        <Form.Item
                            label="注册需手机验证码"
                            name="registration_sms_code_required"
                            valuePropName="checked"
                            extra="关闭后注册无需短信验证码（生产环境建议开启）。"
                        >
                            <Switch checkedChildren="需要" unCheckedChildren="不需要" />
                        </Form.Item>
                    </div>

                    <Divider />

                    {/* 2. 经济与奖励 */}
                    <Title level={5}>
                        <DollarOutlined style={{ color: '#52c41a' }} /> 经济模型与奖励策略
                    </Title>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>

                        <Form.Item
                            label="新用户奖励金额 (豆子)"
                            name="new_user_reward_amount"
                            extra="新注册用户默认赠送的金额。"
                            rules={[{ required: true, message: '请输入' }]}
                        >
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>

                        <Form.Item
                            label="邀请奖励金额 (豆子)"
                            name="referral_reward_amount"
                            extra="被邀请人注册后给邀请人的奖励。"
                            rules={[{ required: true, message: '请输入' }]}
                        >
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>

                        <Form.Item
                            label="启用每日生图限量"
                            name="daily_generation_limit_enabled"
                            valuePropName="checked"
                            extra="关闭后，用户生图将不再受每日次数限制。"
                        >
                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>

                        <Form.Item
                            label="每人单日生图限量 (次数)"
                            name="daily_generation_limit"
                            extra="单个用户每天最大允许生图数量，仅当「启用每日生图限量」开启时生效。"
                            rules={[{ required: true, message: '请输入' }]}
                        >
                            <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>

                        <Form.Item
                            label="充值功能"
                            name="recharge_enabled"
                            valuePropName="checked"
                            extra="关闭后，用户点击充值按钮将提示「充值功能暂未开放，敬请期待」。"
                        >
                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>

                        <Form.Item
                            label="每日免费豆子"
                            name="daily_free_beans_enabled"
                            valuePropName="checked"
                            extra="开启后，用户每天可领取一次免费豆子。"
                        >
                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>

                        <Form.Item
                            label="每日可领取豆子数量"
                            name="daily_free_beans_amount"
                            extra="用户每天可领取的免费豆子数量，仅当「每日免费豆子」开启时生效。"
                            rules={[{ required: true, message: '请输入' }]}
                        >
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                    </div>

                    <Divider />

                    {/* 3. 通知公告 */}
                    <Title level={5}>
                        <NotificationOutlined style={{ color: '#1890ff' }} /> 公告管理
                    </Title>
                    <Form.Item
                        label="启用全局公告"
                        name="announcement_enabled"
                        valuePropName="checked"
                    >
                        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                    </Form.Item>
                    <Form.Item
                        label="公告内容"
                        name="announcement_text"
                        extra="将显示在 App 首页或显眼位置。"
                    >
                        <TextArea rows={3} placeholder="请输入公告详细内容..." />
                    </Form.Item>

                    <Divider />

                    {/* 4. 客服设置 */}
                    <Title level={5}>
                        <CustomerServiceOutlined style={{ color: '#eb2f96' }} /> 客服设置
                    </Title>
                    <Space size="large" align="start" style={{ width: '100%' }}>
                        <Form.Item
                            label="客服微信号"
                            name="customer_service_wechat"
                            style={{ width: 250 }}
                        >
                            <Input placeholder="例如: BoltSupport" />
                        </Form.Item>
                        <Form.Item
                            label="客服微信二维码 URL"
                            name="customer_service_qr"
                            style={{ flex: 1 }}
                            extra="图片的完整 URL 地址。"
                        >
                            <Input placeholder="https://example.com/qr.jpg" />
                        </Form.Item>
                    </Space>

                    <Form.Item style={{ marginTop: 40 }}>
                        <Button
                            type="primary"
                            htmlType="submit"
                            icon={<SaveOutlined />}
                            loading={saving}
                            size="large"
                            block
                            style={{ height: 50, borderRadius: 8, fontSize: 16 }}
                        >
                            立即同步全部配置
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

export default SettingsPage;
