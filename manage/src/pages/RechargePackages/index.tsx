import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Form, Input, InputNumber, Modal, message, Popconfirm, Space, Typography, Switch } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  getRechargePackages,
  createRechargePackage,
  updateRechargePackage,
  deleteRechargePackage,
} from '../../api';

const { Text } = Typography;

interface RechargePackageRow {
  id: string;
  amount_cny: number;
  beans_amount: number;
  label: string;
  sort_order: number;
  enabled: boolean;
}

const RechargePackages: React.FC = () => {
  const [data, setData] = useState<RechargePackageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RechargePackageRow | null>(null);
  const [form] = Form.useForm();

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await getRechargePackages();
      setData(Array.isArray(res) ? res : []);
    } catch {
      message.error('获取充值档位失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      label: '',
      amount_cny: 9.9,
      beans_amount: 100,
      sort_order: 100,
      enabled: true,
    });
    setModalOpen(true);
  };

  const openEdit = (record: RechargePackageRow) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRechargePackage(id);
      message.success('已删除');
      fetchList();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '删除失败');
    }
  };

  const handleOk = () => {
    form.validateFields().then(async (values) => {
      try {
        if (editing) {
          await updateRechargePackage(editing.id, values);
          message.success('已更新');
        } else {
          await createRechargePackage(values);
          message.success('已添加');
        }
        setModalOpen(false);
        fetchList();
      } catch {
        message.error('操作失败');
      }
    });
  };

  const columns = [
    { title: '档位 ID', dataIndex: 'id', key: 'id', width: 160, render: (v: string) => <Text code>{v}</Text> },
    { title: '展示名', dataIndex: 'label', key: 'label' },
    {
      title: '售价 (元)',
      dataIndex: 'amount_cny',
      key: 'amount_cny',
      width: 110,
      render: (v: number) => <Text strong>¥{v}</Text>,
    },
    {
      title: '豆子数',
      dataIndex: 'beans_amount',
      key: 'beans_amount',
      width: 100,
      render: (v: number) => <Text>{v}</Text>,
    },
    { title: '排序', dataIndex: 'sort_order', key: 'sort_order', width: 80 },
    {
      title: '上架',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (v: boolean) => (v ? <Text type="success">是</Text> : <Text type="secondary">否</Text>),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: unknown, record: RechargePackageRow) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除该档位？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="充值档位管理"
      extra={<Text type="secondary">用户 App 仅展示「上架」档位；支付金额与豆子以后台为准</Text>}
    >
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          新增档位
        </Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" pagination={false} loading={loading} />

      <Modal
        title={editing ? '编辑充值档位' : '新增充值档位'}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="label" label="展示名称（可选）">
            <Input placeholder="如：入门包" />
          </Form.Item>
          <Form.Item name="amount_cny" label="售价 (人民币)" rules={[{ required: true, message: '请输入售价' }]}>
            <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="beans_amount" label="到账豆子数" rules={[{ required: true, message: '请输入豆子数' }]}>
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="sort_order" label="排序（越小越靠前）" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="上架" valuePropName="checked">
            <Switch checkedChildren="上架" unCheckedChildren="下架" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default RechargePackages;
