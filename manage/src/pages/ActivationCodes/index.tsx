import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Modal, message, Popconfirm, Space, Select } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getActivationCodes, createActivationCodes, deleteActivationCode } from '../../api';

interface ActivationCodeItem {
  _id: string;
  code: string;
  used_by_user_id: string | null;
  used_at: string | null;
  created_at: string;
}

const ActivationCodes: React.FC = () => {
  const [data, setData] = useState<ActivationCodeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalVisible, setModalVisible] = useState(false);
  const [singleCode, setSingleCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res: any = await getActivationCodes({
        status: statusFilter || undefined,
        page,
        page_size: pageSize,
      });
      setData(Array.isArray(res?.data) ? res.data : []);
      setTotal(res?.total ?? 0);
    } catch (error) {
      console.error(error);
      message.error('获取激活码列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [statusFilter, page, pageSize]);

  const handleCreate = () => {
    setSingleCode('');
    setModalVisible(true);
  };

  const handleSubmitCreate = async () => {
    const code = singleCode.trim().toUpperCase();
    if (!code) {
      message.error('请输入激活码');
      return;
    }
    setSubmitting(true);
    try {
      await createActivationCodes({ code });
      message.success('添加成功');
      setModalVisible(false);
      setSingleCode('');
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (code: string) => {
    try {
      await deleteActivationCode(code);
      message.success('删除成功');
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '删除失败');
    }
  };

  const columns = [
    { title: '激活码', dataIndex: 'code', key: 'code', width: 160 },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_: any, record: ActivationCodeItem) =>
        record.used_at ? <span style={{ color: '#999' }}>已使用</span> : <span style={{ color: '#52c41a' }}>未使用</span>,
    },
    { title: '使用用户 ID', dataIndex: 'used_by_user_id', key: 'used_by_user_id', ellipsis: true },
    {
      title: '使用时间',
      dataIndex: 'used_at',
      key: 'used_at',
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: ActivationCodeItem) =>
        !record.used_at ? (
          <Popconfirm title="确定删除该激活码？" onConfirm={() => handleDelete(record.code)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <Card title="激活码管理">
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <span>状态：</span>
          <Select
            value={statusFilter || undefined}
            onChange={(v) => { setStatusFilter(v ?? ''); setPage(1); }}
            style={{ width: 120 }}
            allowClear
            placeholder="全部"
            options={[
              { label: '全部', value: '' },
              { label: '未使用', value: 'unused' },
              { label: '已使用', value: 'used' },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>生成激活码</Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="code"
        loading={loading}
        pagination={{
          current: page,
          pageSize: pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            if (typeof ps === 'number') setPageSize(ps);
          },
        }}
      />
      <Modal
        title="新增激活码"
        open={modalVisible}
        onOk={handleSubmitCreate}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitting}
        okText="确定"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <span style={{ marginRight: 8 }}>激活码：</span>
            <Input
              value={singleCode}
              onChange={(e) => setSingleCode(e.target.value.toUpperCase())}
              placeholder="请输入激活码（自定义）"
              maxLength={32}
              style={{ width: 260 }}
            />
            <div style={{ color: '#999', fontSize: 12, marginTop: 6 }}>
              仅支持单个添加。若需批量，可自行生成后逐个导入或扩展接口。
            </div>
          </div>
        </Space>
      </Modal>
    </Card>
  );
};

export default ActivationCodes;
