import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Form, Input, InputNumber, Modal, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getTags, createTag, updateTag, deleteTag } from '../../api';

interface Tag {
  id: string;
  label: string;
  value: string;
  order: number;
}

const Tags: React.FC = () => {
  const [data, setData] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentTag, setCurrentTag] = useState<Tag | null>(null);
  const [form] = Form.useForm();

  const fetchTagsList = async () => {
    setLoading(true);
    try {
        const res = await getTags();
        setData(Array.isArray(res) ? res : []);
    } catch (error) {
        console.error(error);
    } finally {
        setLoading(false);
    }
  }

  useEffect(() => {
      fetchTagsList();
  }, []);

  const handleEdit = (record: Tag) => {
    setCurrentTag(record);
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const handleAdd = () => {
    setCurrentTag(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleDelete = async (id: string) => {
      try {
          await deleteTag(id);
          message.success('删除成功');
          fetchTagsList();
      } catch (error) {
          message.error('删除失败');
      }
  }

  const handleOk = () => {
    form.validateFields().then(async values => {
      try {
        if (currentTag) {
            await updateTag(currentTag.id, values);
            message.success('更新成功');
        } else {
            await createTag(values);
            message.success('添加成功');
        }
        setIsModalVisible(false);
        fetchTagsList();
      } catch (error) {
         message.error('操作失败');
      }
    });
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: '标签名(中文)', dataIndex: 'label', key: 'label' },
    { title: '标签值(英文)', dataIndex: 'value', key: 'value' },
    { title: '排序权重', dataIndex: 'order', key: 'order', sorter: (a: Tag, b: Tag) => a.order - b.order },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Tag) => (
        <Space>
            <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
            <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record.id)}>
                <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增标签</Button>
      </div>
      <Table columns={columns} dataSource={Array.isArray(data) ? data : []} rowKey="id" pagination={false} loading={loading} />

      <Modal
        title={currentTag ? "编辑标签" : "新增标签"}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="label" label="标签名(中文)" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="value" label="标签值(英文)" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="order" label="排序权重" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Tags;
