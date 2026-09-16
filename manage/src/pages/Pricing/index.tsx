import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Form, Input, InputNumber, Modal, message, Popconfirm, Select, Space, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getPricingStrategies, getPricingModels, createPricingStrategy, updatePricingStrategy, deletePricingStrategy } from '../../api';

const { Text } = Typography;

interface PricingStrategy {
    id: string;
    name: string;
    model_id?: string;
    price_1k: number;
    price_2k: number;
    price_4k: number;
}

interface GeminiModelInfo {
    name: string;
    is_flash: boolean;
    description: string;
}

const Pricing: React.FC = () => {
    const [data, setData] = useState<PricingStrategy[]>([]);
    const [models, setModels] = useState<Record<string, GeminiModelInfo>>({});
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [currentStrategy, setCurrentStrategy] = useState<PricingStrategy | null>(null);
    const [form] = Form.useForm();

    const fetchPricingList = async () => {
        setLoading(true);
        try {
            const res = await getPricingStrategies();
            setData(Array.isArray(res) ? res : []);
        } catch (error) {
            console.error(error);
            message.error('获取定价策略失败');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchPricingList();
        getPricingModels().then((res: any) => setModels(res || {})).catch(() => {});
    }, []);

    const handleEdit = (record: PricingStrategy) => {
        setCurrentStrategy(record);
        form.setFieldsValue({ ...record, model_id: record.model_id || 'gemini-3-pro-image-preview' });
        setIsModalVisible(true);
    };

    const handleAdd = () => {
        setCurrentStrategy(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deletePricingStrategy(id);
            message.success('删除成功');
            fetchPricingList();
        } catch (error: any) {
            message.error(error.response?.data?.detail || '删除失败');
        }
    }

    const handleOk = () => {
        form.validateFields().then(async values => {
            try {
                if (currentStrategy) {
                    await updatePricingStrategy(currentStrategy.id, values);
                    message.success('更新成功');
                } else {
                    await createPricingStrategy(values);
                    message.success('添加成功');
                }
                setIsModalVisible(false);
                fetchPricingList();
            } catch (error) {
                message.error('操作失败');
            }
        });
    };

    const columns = [
        { title: '策略名称', dataIndex: 'name', key: 'name' },
        {
            title: '生图模型',
            dataIndex: 'model_id',
            key: 'model_id',
            render: (val: string) => {
                const info = models[val];
                if (!info) return val || '-';
                return (
                    <span>
                        {info.name}
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>{info.description}</Text>
                    </span>
                );
            }
        },
        {
            title: '1K 价格',
            dataIndex: 'price_1k',
            key: 'price_1k',
            render: (val: number) => <Text strong>{val} 豆</Text>
        },
        {
            title: '2K 价格',
            dataIndex: 'price_2k',
            key: 'price_2k',
            render: (val: number) => <Text strong color="blue">{val} 豆</Text>
        },
        {
            title: '4K 价格',
            dataIndex: 'price_4k',
            key: 'price_4k',
            render: (val: number) => <Text strong type="danger">{val} 豆</Text>
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: PricingStrategy) => (
                <Space>
                    <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
                    <Popconfirm title="确定删除吗？如果该策略已被模板使用，将无法删除。" onConfirm={() => handleDelete(record.id)}>
                        <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <Card title="定价策略管理" extra={<Text type="secondary">配置不同模型和分辨率的计费标准</Text>}>
            <div style={{ marginBottom: 16, textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增定价策略</Button>
            </div>
            <Table columns={columns} dataSource={data} rowKey="id" pagination={false} loading={loading} />

            <Modal
                title={currentStrategy ? "编辑定价策略" : "新增定价策略"}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
            >
                <Form form={form} layout="vertical" initialValues={{ model_id: 'gemini-3-pro-image-preview', price_1k: 5, price_2k: 10, price_4k: 20 }}>
                    <Form.Item name="name" label="策略名称" rules={[{ required: true, message: '请输入策略名称' }]}>
                        <Input placeholder="例如：基础计价、高质量计价" />
                    </Form.Item>
                    <Form.Item name="model_id" label="生图模型" rules={[{ required: true, message: '请选择生图模型' }]} extra="模版关联此策略即使用该模型生图">
                        <Select placeholder="选择 Gemini 模型">
                            {Object.entries(models).map(([id, info]) => (
                                <Select.Option key={id} value={id}>
                                    <span>
                                        {info.name}
                                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>{info.description}</Text>
                                    </span>
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="price_1k" label="1K 分辨率价格 (豆子)" rules={[{ required: true }]}>
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="price_2k" label="2K 分辨率价格 (豆子)" rules={[{ required: true }]}>
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="price_4k" label="4K 分辨率价格 (豆子)" rules={[{ required: true }]}>
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default Pricing;
