import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Form, Input, Modal, message, Popconfirm, Select, Switch, InputNumber, Space, Typography, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getImageModels, createImageModel, updateImageModel, deleteImageModel, getPricingStrategies } from '../../api';

const { Text } = Typography;

interface ImageModel {
    id: string;
    name: string;
    is_flash: boolean;
    supports_512: boolean;
    description: string;
    pricing_strategy_id: string;
    enabled: boolean;
    sort_order: number;
    price_1k?: number;
    price_2k?: number;
    price_4k?: number;
}

interface PricingStrategy {
    id: string;
    name: string;
}

const ImageModels: React.FC = () => {
    const [data, setData] = useState<ImageModel[]>([]);
    const [strategies, setStrategies] = useState<PricingStrategy[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [currentModel, setCurrentModel] = useState<ImageModel | null>(null);
    const [form] = Form.useForm();

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await getImageModels({ enabled_only: false });
            setData(Array.isArray(res) ? res : []);
        } catch {
            message.error('获取模型列表失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        getPricingStrategies()
            .then((res: any) => setStrategies(Array.isArray(res) ? res : []))
            .catch(() => {});
    }, []);

    const handleAdd = () => {
        setCurrentModel(null);
        form.resetFields();
        form.setFieldsValue({ is_flash: false, supports_512: false, enabled: true, sort_order: 0 });
        setIsModalVisible(true);
    };

    const handleEdit = (record: ImageModel) => {
        setCurrentModel(record);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteImageModel(id);
            message.success('删除成功');
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.detail || '删除失败');
        }
    };

    const handleOk = () => {
        form.validateFields().then(async values => {
            try {
                if (currentModel) {
                    await updateImageModel(currentModel.id, values);
                    message.success('更新成功');
                } else {
                    await createImageModel(values);
                    message.success('添加成功');
                }
                setIsModalVisible(false);
                fetchData();
            } catch (error: any) {
                message.error(error.response?.data?.detail || '操作失败');
            }
        });
    };

    const columns = [
        {
            title: '排序',
            dataIndex: 'sort_order',
            key: 'sort_order',
            width: 60,
            sorter: (a: ImageModel, b: ImageModel) => a.sort_order - b.sort_order,
        },
        {
            title: '模型 ID',
            dataIndex: 'id',
            key: 'id',
            render: (val: string) => <Text code style={{ fontSize: 12 }}>{val}</Text>,
        },
        { title: '展示名称', dataIndex: 'name', key: 'name' },
        {
            title: '类型',
            key: 'type',
            render: (_: any, record: ImageModel) => (
                <Space>
                    {record.is_flash && <Tag color="orange">Flash</Tag>}
                    {record.supports_512 && <Tag color="blue">支持512</Tag>}
                    {!record.is_flash && !record.supports_512 && <Tag color="green">标准</Tag>}
                </Space>
            ),
        },
        {
            title: '关联定价策略',
            dataIndex: 'pricing_strategy_id',
            key: 'pricing_strategy_id',
            render: (val: string, record: ImageModel) => (
                <span>
                    <Text strong>{val}</Text>
                    {record.price_2k != null && (
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                            2K:{record.price_2k}豆 · 4K:{record.price_4k}豆
                        </Text>
                    )}
                </span>
            ),
        },
        { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
        {
            title: '状态',
            dataIndex: 'enabled',
            key: 'enabled',
            render: (val: boolean) => val
                ? <Tag color="success">已启用</Tag>
                : <Tag color="default">已禁用</Tag>,
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: ImageModel) => (
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
        <Card
            title="生图模型配置"
            extra={<Text type="secondary">配置前端可选的生图模型，每个模型关联一个定价策略</Text>}
        >
            <div style={{ marginBottom: 16, textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增模型</Button>
            </div>
            <Table
                columns={columns}
                dataSource={data}
                rowKey="id"
                pagination={false}
                loading={loading}
            />

            <Modal
                title={currentModel ? '编辑生图模型' : '新增生图模型'}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
                width={560}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="id"
                        label="模型 ID（Gemini API model ID）"
                        rules={[{ required: true, message: '请输入模型ID' }]}
                        extra="如：gemini-3-pro-image-preview"
                    >
                        <Input placeholder="gemini-3-pro-image-preview" disabled={!!currentModel} />
                    </Form.Item>
                    <Form.Item name="name" label="展示名称" rules={[{ required: true }]}>
                        <Input placeholder="如：香蕉Pro" />
                    </Form.Item>
                    <Form.Item name="description" label="模型简介">
                        <Input.TextArea rows={2} placeholder="展示在用户的模型选择列表中" />
                    </Form.Item>
                    <Form.Item
                        name="pricing_strategy_id"
                        label="关联定价策略"
                        rules={[{ required: true, message: '请选择定价策略' }]}
                        extra="该模型生图时将按此策略计费"
                    >
                        <Select placeholder="选择定价策略">
                            {strategies.map(s => (
                                <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="sort_order" label="排序（越小越靠前）" initialValue={0}>
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Space style={{ width: '100%' }} size="large">
                        <Form.Item name="is_flash" label="Flash 模型" valuePropName="checked" initialValue={false}>
                            <Switch />
                        </Form.Item>
                        <Form.Item name="supports_512" label="支持 512 分辨率" valuePropName="checked" initialValue={false}>
                            <Switch />
                        </Form.Item>
                        <Form.Item name="enabled" label="启用" valuePropName="checked" initialValue={true}>
                            <Switch />
                        </Form.Item>
                    </Space>
                </Form>
            </Modal>
        </Card>
    );
};

export default ImageModels;
