import React, { useState, useEffect } from 'react';
import { Table, Card, Form, Input, Select, Button, Tag, Popconfirm, message } from 'antd';
import { SearchOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getOrders, payOrder } from '../../api';

interface Order {
  id: string;
  user_id: string;
  amount_cny: number;
  beans_amount: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  platform: 'alipay' | 'wechat';
  created_at: string;
  create_time?: string;
}

const Orders: React.FC = () => {
  const [data, setData] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchOrders = async (params: any = {}) => {
    setLoading(true);
    try {
        const res = await getOrders(params);
        setData(Array.isArray(res) ? res : []);
    } catch (error) {
        console.error(error);
    } finally {
        setLoading(false);
    }
  }

  useEffect(() => {
      fetchOrders();
  }, []);

  const handleSearch = (values: any) => {
    const params: any = {};
    if (values.status) params.status = values.status;
    if (values.platform) params.platform = values.platform;
    // Client side filter for ID if backend doesn't support partial match on ID easily or add if needed
    // Backend orders router doesn't explicitly filter by order_id in GET /orders params (only user_id, status)
    // checking router: filters: user_id, status.
    // If I want to filter by order ID, I might need to filter client side or use GET /orders/{id}
    // For now, let's filter client side if id is provided
    if (values.id) {
       // logic: fetch all then filter? or fetch specific?
       // Let's just pass values to fetchOrders and handle there?
       // But backend doesn't support 'id' param.
       // I'll fetch all (filtered by status/platform) then filter by ID in memory for now.
    }
    fetchOrders(params).then(() => {
        if (values.id) {
            setData(prev => (Array.isArray(prev) ? prev : []).filter((o: Order) => o.id.includes(values.id)));
        }
    });
  };

  const handleManualComplete = async (id: string) => {
    try {
        await payOrder(id);
        message.success('手动补单成功，已为用户增加豆子');
        fetchOrders(form.getFieldsValue());
    } catch (error) {
        message.error('操作失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: '用户ID', dataIndex: 'user_id', key: 'user_id' },
    { title: '金额(CNY)', dataIndex: 'amount_cny', key: 'amount_cny' },
    { title: '豆子数量', dataIndex: 'beans_amount', key: 'beans_amount' },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string) => {
          let color = 'default';
          if (status === 'paid') color = 'success';
          if (status === 'pending') color = 'warning';
          if (status === 'failed') color = 'error';
          return (
            <Tag color={color}>
              {status === 'paid' ? '已支付' : (status === 'pending' ? '待支付' : status)}
            </Tag>
          );
      }
    },
    { 
      title: '支付平台', 
      dataIndex: 'platform', 
      key: 'platform',
      render: (platform: string) => (
        <Tag color={platform === 'alipay' ? 'blue' : 'green'}>
          {platform === 'alipay' ? '支付宝' : '微信'}
        </Tag>
      )
    },
    { 
      title: '创建时间', 
      dataIndex: 'created_at', 
      key: 'created_at', 
      render: (val: string) => val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Order) => record.status === 'pending' && (
        <Popconfirm title="确定已收到款项并手动补单吗？此操作将给用户增加豆子。" onConfirm={() => handleManualComplete(record.id)}>
           <Button type="link" icon={<CheckCircleOutlined />}>手动补单</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card>
      <Form form={form} layout="inline" onFinish={handleSearch} style={{ marginBottom: 24 }}>
        <Form.Item name="id" label="订单号">
          <Input placeholder="订单号" />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select allowClear placeholder="选择状态" style={{ width: 120 }}>
            <Select.Option value="paid">已支付</Select.Option>
            <Select.Option value="pending">待支付</Select.Option>
            <Select.Option value="failed">支付失败</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="platform" label="平台">
           <Select allowClear placeholder="选择平台" style={{ width: 120 }}>
            <Select.Option value="alipay">支付宝</Select.Option>
            <Select.Option value="wechat">微信</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>搜索</Button>
        </Form.Item>
      </Form>
      <Table columns={columns} dataSource={Array.isArray(data) ? data : []} rowKey="id" loading={loading} />
    </Card>
  );
};

export default Orders;
