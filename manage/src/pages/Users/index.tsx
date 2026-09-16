import React, { useState, useEffect } from 'react';
import { Table, Card, Form, Input, Select, Button, Modal, message, Tag } from 'antd';
import { SearchOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getUsers, updateUser } from '../../api';

interface User {
  id: string;
  username: string;
  phone?: string;
  balance_beans: number;
  is_new_user: boolean;
  is_disabled: boolean;
  plain_password?: string;
  create_time: string;
  created_at?: string;
}

const Users: React.FC = () => {
  const [form] = Form.useForm();
  const [data, setData] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [modalForm] = Form.useForm();

  const fetchUsers = async (params: any = {}) => {
    setLoading(true);
    try {
      // API returns list directly based on my `list_users` implementation
      const res = await getUsers(params);
      setData(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSearch = (values: any) => {
    const params: any = {};
    if (values.username) params.username = values.username;
    if (values.phone) params.phone = values.phone;
    if (values.is_new_user !== undefined) params.is_new_user = values.is_new_user;
    fetchUsers(params);
  };

  const handleEdit = (record: User) => {
    setCurrentUser(record);
    modalForm.setFieldsValue({
      username: record.username,
      phone: record.phone,
      balance_beans: record.balance_beans,
      is_new_user: record.is_new_user,
      is_disabled: record.is_disabled || false,
      current_password: record.plain_password || '-'
    });
    setIsModalVisible(true);
  };

  const handleOk = () => {
    modalForm.validateFields().then(async values => {
      if (!currentUser) return;
      try {
        const { current_password, password, ...rest } = values;
        const payload: Record<string, unknown> = {
          ...rest,
          balance_beans: Number(rest.balance_beans),
        };
        if (password && String(password).trim()) {
          payload.password = password;
        }
        await updateUser(currentUser.id, payload);
        message.success('更新成功');
        setIsModalVisible(false);
        fetchUsers(form.getFieldsValue());
      } catch (error) {
        message.error('更新失败');
      }
    });
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '手机号', dataIndex: 'phone', key: 'phone' },
    {
      title: '当前密码(解密)',
      dataIndex: 'plain_password',
      key: 'plain_password',
      width: 220,
      ellipsis: true,
      render: (text: string | undefined) => (text && text.trim() ? text : '—'),
    },
    {
      title: '豆子余额',
      dataIndex: 'balance_beans',
      key: 'balance_beans',
      sorter: (a: User, b: User) => a.balance_beans - b.balance_beans
    },
    {
      title: '是否新用户',
      dataIndex: 'is_new_user',
      key: 'is_new_user',
      render: (val: boolean) => val ? <Tag color="green">是</Tag> : <Tag>否</Tag>
    },
    {
      title: '账号状态',
      dataIndex: 'is_disabled',
      key: 'is_disabled',
      render: (val: boolean) => val ? <Tag color="error">禁用</Tag> : <Tag color="success">正常</Tag>
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a: User, b: User) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix()
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: User) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
          编辑
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <Form form={form} layout="inline" onFinish={handleSearch} style={{ marginBottom: 24 }}>
        <Form.Item name="username" label="用户名">
          <Input placeholder="请输入用户名" />
        </Form.Item>
        <Form.Item name="phone" label="手机号">
          <Input placeholder="请输入手机号" />
        </Form.Item>
        <Form.Item name="is_new_user" label="新用户">
          <Select placeholder="请选择" allowClear style={{ width: 120 }}>
            <Select.Option value={true}>是</Select.Option>
            <Select.Option value={false}>否</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
            搜索
          </Button>
          <Button style={{ marginLeft: 8 }} onClick={() => { form.resetFields(); handleSearch({}); }}>
            重置
          </Button>
        </Form.Item>
      </Form>

      <Table columns={columns} dataSource={Array.isArray(data) ? data : []} rowKey="id" loading={loading} />

      <Modal
        title="编辑用户"
        open={isModalVisible}
        onOk={handleOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={modalForm} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input />
          </Form.Item>
          <Form.Item name="balance_beans" label="余额" rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="is_new_user" label="是否新用户">
            <Select>
              <Select.Option value={true}>是</Select.Option>
              <Select.Option value={false}>否</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="is_disabled" label="账号禁用">
            <Select>
              <Select.Option value={true}>是 (禁止登录)</Select.Option>
              <Select.Option value={false}>否 (正常状态)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="current_password" label="当前原始密码 (只读)">
            <Input disabled />
          </Form.Item>
          <Form.Item name="password" label="重置新密码" help="如需修改密码请在此输入，留空则保持不变">
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Users;
