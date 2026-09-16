import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic } from 'antd';
import { UserOutlined, PayCircleOutlined, ScheduleOutlined, FileSyncOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { getDashboardStats, getUserGrowthChart, getOrderFlowChart } from '../../api';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>({});
  const [userGrowth, setUserGrowth] = useState<any[]>([]);
  const [orderFlow, setOrderFlow] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, growthRes, flowRes] = await Promise.all([
          getDashboardStats(),
          getUserGrowthChart(),
          getOrderFlowChart()
        ]);
        setStats(statsRes || {});
        setUserGrowth(Array.isArray(growthRes) ? growthRes : []);
        setOrderFlow(Array.isArray(flowRes) ? flowRes : []);
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div>
      <Row gutter={16}>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="今日新增用户"
              value={stats.todayNewUsers || 0}
              prefix={<UserOutlined />}
              loading={loading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="今日总收入 (CNY)"
              value={stats.todayRevenue || 0}
              precision={2}
              prefix={<PayCircleOutlined />}
              loading={loading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="任务成功率"
              value={stats.taskSuccessRate || 0}
              suffix="%"
              prefix={<FileSyncOutlined />}
              loading={loading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="待处理工单"
              value={stats.pendingTickets || 0}
              prefix={<ScheduleOutlined />}
              valueStyle={{ color: '#cf1322' }}
              loading={loading}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={12}>
          <Card title="近7日用户增长趋势" bordered={false}>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={userGrowth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#1890ff" name="新增用户" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="近7日订单流水" bordered={false}>
             <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderFlow}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="amount" fill="#52c41a" name="流水金额" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
