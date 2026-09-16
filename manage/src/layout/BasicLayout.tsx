import React, { useState } from 'react';
import { Layout, Menu, Button, theme } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  UserOutlined,
  FileImageOutlined,
  TagsOutlined,
  MonitorOutlined,
  PayCircleOutlined,
  CustomerServiceOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  LogoutOutlined,
  PictureOutlined,
  AccountBookOutlined,
  RobotOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const BasicLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/login');
  };

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '仪表盘',
    },
    {
      key: '/users',
      icon: <UserOutlined />,
      label: '用户管理',
    },
    {
      key: '/templates',
      icon: <FileImageOutlined />,
      label: '模板管理',
    },
    {
      key: '/works',
      icon: <PictureOutlined />,
      label: '作品管理',
    },
    {
      key: '/tags',
      icon: <TagsOutlined />,
      label: '标签管理',
    },
    {
      key: '/monitoring',
      icon: <MonitorOutlined />,
      label: '任务监控',
    },
    {
      key: '/orders',
      icon: <PayCircleOutlined />,
      label: '订单管理',
    },
    {
      key: '/tickets',
      icon: <CustomerServiceOutlined />,
      label: '工单系统',
    },
    {
      key: '/pricing',
      icon: <DollarOutlined />,
      label: '定价策略管理',
    },
    {
      key: '/image-models',
      icon: <RobotOutlined />,
      label: '生图模型配置',
    },
    {
      key: '/recharge-packages',
      icon: <AccountBookOutlined />,
      label: '充值档位管理',
    },
    {
      key: '/activation-codes',
      icon: <SafetyCertificateOutlined />,
      label: '激活码管理',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统参数设置',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed}>
        <div className="demo-logo-vertical" style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', textAlign: 'center', color: 'white', lineHeight: '32px' }}>
          {collapsed ? 'BP' : '后台管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px 0 0', background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: '16px',
              width: 64,
              height: 64,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: '#64748b' }}>
              管理员
            </span>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              danger
            >
              退出登录
            </Button>
          </div>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default BasicLayout;
