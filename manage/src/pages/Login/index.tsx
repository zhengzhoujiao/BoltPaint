import React, { useState } from 'react';
import { Card, Form, Input, Button, Alert, Typography } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { adminLogin } from '../../api';

const { Title, Text } = Typography;

const Login: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const onFinish = async (values: any) => {
        setLoading(true);
        setError('');

        try {
            const res = await adminLogin({
                username: values.username,
                password: values.password
            }) as any;

            if (res.success) {
                localStorage.setItem('admin_token', res.token);
                localStorage.setItem('admin_user', JSON.stringify(res.user));
                window.location.href = '/boltPaint/JManage/';
            } else {
                setError(res.message || '登录失败');
            }
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.response?.data?.detail || '登录失败，请检查账号密码或联系超级管理员');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f8fafc',
            padding: '24px'
        }}>
            <Card
                bordered={false}
                style={{
                    maxWidth: 400,
                    width: '100%',
                    borderRadius: 24,
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 80,
                        height: 80,
                        borderRadius: 16,
                        backgroundColor: '#4f46e5',
                        marginBottom: 24,
                        boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.4)'
                    }}>
                        <SafetyOutlined style={{ fontSize: 40, color: 'white' }} />
                    </div>
                    <Title level={2} style={{ margin: '0 0 8px 0' }}>管理后台</Title>
                    <Text type="secondary">请输入管理员凭据以继续</Text>
                </div>

                {error && (
                    <Alert
                        message={error}
                        type="error"
                        showIcon
                        style={{ marginBottom: 24, borderRadius: 12 }}
                    />
                )}

                <Form
                    name="login"
                    layout="vertical"
                    initialValues={{ remember: true }}
                    onFinish={onFinish}
                    size="large"
                >
                    <Form.Item
                        name="username"
                        rules={[{ required: true, message: '请输入管理员账号!' }]}
                    >
                        <Input
                            prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="用户名 / 手机号"
                            style={{ borderRadius: 12, padding: '12px' }}
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: '请输入密码!' }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="密码"
                            style={{ borderRadius: 12, padding: '12px' }}
                        />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0 }}>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            block
                            style={{
                                height: 50,
                                borderRadius: 12,
                                fontWeight: 'bold',
                                backgroundColor: '#4f46e5',
                                border: 'none'
                            }}
                        >
                            立即登录
                        </Button>
                    </Form.Item>
                </Form>

                <div style={{ marginTop: 32, textAlign: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        © 2026 BoltPaint Management. All rights reserved.
                    </Text>
                </div>
            </Card>
        </div>
    );
};

export default Login;
