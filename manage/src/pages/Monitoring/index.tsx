import React, { useState, useEffect } from 'react';
import { Table, Card, Form, Input, Select, Button, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getTasks } from '../../api';

// --- Task List Component ---
interface Task {
  id: string;
  user_id: string;
  template_id: string;
  state: 'generating' | 'completed' | 'failed'; // Backend uses completed instead of generated
  status: 'generating' | 'completed' | 'failed';
  fail_reason?: string;
  error_message?: string;
  create_time: string;
  created_at: string;
}

const TaskList: React.FC = () => {
  const [data, setData] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchTasks = async (params: any = {}) => {
      setLoading(true);
      try {
          const res = await getTasks(params);
          setData(Array.isArray(res) ? res : []); 
      } catch (error) {
          console.error(error);
      } finally {
          setLoading(false);
      }
  }

  useEffect(() => {
      fetchTasks();
  }, []);

  const handleSearch = (values: any) => {
      const params: any = {};
      if (values.state) params.status = values.state; // Map state to status
      if (values.user_id) params.user_id = values.user_id;
      fetchTasks(params);
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: '用户ID', dataIndex: 'user_id', key: 'user_id' },
    { title: '模板ID', dataIndex: 'template_id', key: 'template_id' },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string) => {
        let color = 'default';
        if (status === 'completed') color = 'success';
        if (status === 'failed') color = 'error';
        if (status === 'generating') color = 'processing';
        return <Tag color={color}>{status}</Tag>;
      }
    },
    { title: '失败原因', dataIndex: 'error_message', key: 'error_message' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss') },
  ];

  return (
    <>
      <Form form={form} layout="inline" onFinish={handleSearch} style={{ marginBottom: 16 }}>
        <Form.Item name="state" label="状态">
          <Select allowClear placeholder="选择状态" style={{ width: 120 }}>
            <Select.Option value="generating">生成中</Select.Option>
            <Select.Option value="completed">已生成</Select.Option>
            <Select.Option value="failed">失败</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="user_id" label="用户ID">
          <Input placeholder="输入用户ID" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>搜索</Button>
        </Form.Item>
      </Form>
      <Table 
        columns={columns} 
        dataSource={Array.isArray(data) ? data : []} 
        rowKey="id" 
        loading={loading}
        onRow={(record) => {
            return {
                style: record.status === 'failed' ? { background: '#fff1f0' } : {}
            }
        }}
      />
    </>
  );
};

const Monitoring: React.FC = () => {
  return (
    <Card>
      <TaskList />
    </Card>
  );
};

export default Monitoring;
