import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Form, Input, Select, Switch, Space, Image, Drawer, message, Popconfirm, Upload, Tabs, Badge, Modal } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, LoadingOutlined, UploadOutlined, FileImageOutlined, CheckOutlined, CloseOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { RcFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, getTags, getPricingStrategies, getPendingTemplates, reviewTemplate } from '../../api';
import { compressImageToFile } from '../../utils/image';

interface Template {
  id: string;
  name: string;
  cover_image: string;
  pricing_strategy_id: string;
  use_count: number;
  is_featured: boolean;
  updated_at: string;
  tags: string[];
  reference_images: string[];
  description?: string;
  system_instruction?: string;
  preset_prompt?: string;
  // 高阶生图相关
  status?: string;
  is_custom?: boolean;
  creator_id?: string;
  creator_name?: string;
  creator_avatar?: string;
  model_id?: string;
  reject_reason?: string;
  created_at?: string;
  /** 用户进入创作页时的默认宽高比 */
  default_aspect_ratio?: string | null;
  /** 用户进入创作页时的默认分辨率 */
  default_resolution?: string | null;
}

const ASPECT_RATIO_OPTIONS = [
  { value: '1:1', label: '1:1 方图' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '16:9', label: '16:9 横屏' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
];

const RESOLUTION_OPTIONS = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const Templates: React.FC = () => {
  const [data, setData] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null);
  const [form] = Form.useForm();
  const [searchForm] = Form.useForm();
  const [tagsList, setTagsList] = useState<any[]>([]);
  const [pricingList, setPricingList] = useState<any[]>([]);
  // 待审核模板
  const [pendingData, setPendingData] = useState<Template[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchTemplates = async (params: any = {}) => {
    setLoading(true);
    try {
      const res = await getTemplates(params);
      const list = res?.data ?? (Array.isArray(res) ? res : []);
      setData(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await getTags();
      // res usually an AxiosResponse, so use res.data
      setTagsList(res.data || res);
    } catch (error) {
      console.error(error);
    }
  }

  const fetchPricing = async () => {
    try {
      const res = await getPricingStrategies();
      setPricingList(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    fetchTemplates();
    fetchTags();
    fetchPricing();
    fetchPendingTemplates();
  }, []);

  const fetchPendingTemplates = async () => {
    setPendingLoading(true);
    try {
      const res = await getPendingTemplates({ page: 1, page_size: 100 });
      const list = res?.data?.data ?? (Array.isArray(res?.data) ? res.data : []);
      setPendingData(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error('Failed to load pending templates:', error);
    } finally {
      setPendingLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await reviewTemplate(id, 'approve');
      message.success('已通过审核，模板将对所有用户可见');
      fetchPendingTemplates();
      fetchTemplates();
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : (Array.isArray(detail) ? '审核失败：参数错误' : '审核失败'));
    }
  };

  const handleRejectOpen = (id: string) => {
    setRejectTargetId(id);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectTargetId) return;
    setRejectLoading(true);
    try {
      await reviewTemplate(rejectTargetId, 'reject', rejectReason);
      message.success('已驳回模板');
      setRejectModalVisible(false);
      fetchPendingTemplates();
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : (Array.isArray(detail) ? '驳回失败：参数错误' : '驳回失败'));
    } finally {
      setRejectLoading(false);
    }
  };

  const pendingColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 140 },
    {
      title: '封面/模型',
      key: 'cover',
      width: 80,
      render: (_: any, record: Template) => (
        <Image src={record.cover_image} width={60} height={60} style={{ objectFit: 'cover', borderRadius: 6 }} fallback="https://via.placeholder.com/60?text=None" />
      ),
    },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '提交者',
      key: 'creator',
      render: (_: any, record: Template) => record.creator_name || record.creator_id || '-',
    },
    {
      title: '定价策略',
      dataIndex: 'pricing_strategy_id',
      key: 'pricing_strategy_id',
      render: (id: string) => pricingList.find(p => p.id === id)?.name || id
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => val ? dayjs(val).format('MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 300,
      render: (_: any, record: Template) => (
        <Space>
          <Button type="primary" icon={<CheckOutlined />} size="small" onClick={() => handleApprove(record.id)}>通过</Button>
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)}>修改</Button>
          <Button danger icon={<CloseOutlined />} size="small" onClick={() => handleRejectOpen(record.id)}>驳回</Button>
          <Popconfirm
            title="彻底删除模板"
            description="删除后该用户的提交记录将彻底消失，确定吗？"
            onConfirm={() => handleDeletePending(record.id)}
            icon={<QuestionCircleOutlined style={{ color: 'red' }} />}
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small">删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];


  const handleSearch = (values: any) => {
    const params: any = {};
    if (values.is_featured !== undefined) params.is_featured = values.is_featured;
    if (values.is_custom !== undefined) params.is_custom = values.is_custom;
    fetchTemplates(params);
  };

  const handleEdit = (record: Template) => {
    setCurrentTemplate(record);
    form.setFieldsValue(record);
    setIsDrawerVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate(id);
      message.success('删除成功');
      fetchTemplates(searchForm.getFieldsValue());
    } catch (error) {
      message.error('删除失败');
    }
  }

  const handleDeletePending = async (id: string) => {
    try {
      await deleteTemplate(id);
      message.success('删除成功');
      fetchPendingTemplates();
    } catch (error) {
      message.error('删除失败');
    }
  }

  const handleAdd = () => {
    setCurrentTemplate(null);
    form.resetFields();
    setIsDrawerVisible(true);
  };

  const handleSubmit = () => {
    form.validateFields().then(async values => {
      const payload = {
        ...values,
        default_aspect_ratio: values.default_aspect_ratio ?? null,
        default_resolution: values.default_resolution ?? null,
      };
      try {
        if (currentTemplate) {
          await updateTemplate(currentTemplate.id, payload);
          message.success('更新成功');
        } else {
          await createTemplate(payload);
          message.success('创建成功');
        }
        setIsDrawerVisible(false);
        fetchTemplates(searchForm.getFieldsValue());
        fetchPendingTemplates();
      } catch (error) {
        message.error('操作失败');
      }
    });
  }

  const handleUpload = async (file: RcFile) => {
    const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp';
    if (!isJpgOrPng) {
      message.error('只能上传 JPG/PNG/WebP 格式的图片!');
      return false;
    }
    const isLt20M = file.size / 1024 / 1024 < 20;
    if (!isLt20M) {
      message.error('图片大小不能超过 20MB!');
      return false;
    }

    setUploading(true);
    try {
      // 执行客户端压缩
      const compressedFile = await compressImageToFile(file);
      
      const formData = new FormData();
      formData.append('file', compressedFile);

      const token = localStorage.getItem('admin_token');
      const response = await fetch('/boltPaint/api/uploads/image', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const result = await response.json();
      if (result.success) {
        form.setFieldsValue({ cover_image: result.url });
        message.success('上传成功');
      } else {
        message.error(result.detail || '上传失败');
      }
    } catch (error) {
      message.error('上传出错');
    } finally {
      setUploading(false);
    }
    return false; // 阻止 antd 默认上传行为
  };

  const handleReferenceUpload = async (file: RcFile) => {
    const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp';
    if (!isJpgOrPng) {
      message.error('只能上传 JPG/PNG/WebP 格式的图片!');
      return false;
    }
    const isLt20M = file.size / 1024 / 1024 < 20;
    if (!isLt20M) {
      message.error('图片大小不能超过 20MB!');
      return false;
    }

    const currentImages = form.getFieldValue('reference_images') || [];
    if (currentImages.length >= 3) {
      message.error('最多只能上传3张参考图');
      return false;
    }

    setUploading(true);
    try {
      // 执行客户端压缩
      const compressedFile = await compressImageToFile(file);

      const formData = new FormData();
      formData.append('file', compressedFile);

      const token = localStorage.getItem('admin_token');
      const response = await fetch('/boltPaint/api/uploads/image', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const result = await response.json();
      if (result.success) {
        form.setFieldsValue({ reference_images: [...currentImages, result.url] });
        message.success('上传成功');
      } else {
        message.error(result.detail || '上传失败');
      }
    } catch (error) {
      message.error('上传出错');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const removeReferenceImage = (index: number) => {
    const currentImages = form.getFieldValue('reference_images') || [];
    form.setFieldsValue({ reference_images: currentImages.filter((_: string, i: number) => i !== index) });
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: '封面', dataIndex: 'cover_image', key: 'cover_image', render: (src: string) => <Image src={src} width={50} fallback="https://via.placeholder.com/50?text=Error" /> },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '定价策略',
      dataIndex: 'pricing_strategy_id',
      key: 'pricing_strategy_id',
      render: (id: string) => pricingList.find(p => p.id === id)?.name || id
    },
    { title: '使用次数', dataIndex: 'use_count', key: 'use_count', sorter: (a: Template, b: Template) => a.use_count - b.use_count },
    { title: '推荐', dataIndex: 'is_featured', key: 'is_featured', render: (val: boolean) => <Switch checked={val} disabled /> },
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss') },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Template) => (
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
      <Tabs
        defaultActiveKey="approved"
        items={[
          {
            key: 'approved',
            label: '已发布模板',
            children: (
              <>
                <Form form={searchForm} layout="inline" onFinish={handleSearch} style={{ marginBottom: 24 }}>
                  <Form.Item name="is_featured" label="推荐">
                    <Select placeholder="是否推荐" allowClear style={{ width: 120 }}>
                      <Select.Option value={true}>是</Select.Option>
                      <Select.Option value={false}>否</Select.Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="is_custom" label="自定义">
                    <Select placeholder="是否自定义" allowClear style={{ width: 120 }}>
                      <Select.Option value={true}>是</Select.Option>
                      <Select.Option value={false}>否</Select.Option>
                    </Select>
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>搜索</Button>
                    <Button style={{ marginLeft: 8 }} onClick={() => { searchForm.resetFields(); handleSearch({}); }}>重置</Button>
                  </Form.Item>
                  <div style={{ marginLeft: 'auto' }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增模板</Button>
                  </div>
                </Form>
                <Table columns={columns} dataSource={Array.isArray(data) ? data : []} rowKey="id" loading={loading} />
              </>
            ),
          },
          {
            key: 'pending',
            label: (
              <Badge count={pendingData.length} offset={[8, 0]} size="small">
                <span>待审核</span>
              </Badge>
            ),
            children: (
              <>
                <div style={{ marginBottom: 16, color: '#666', fontSize: 13 }}>
                  用户通过高阶生图提交的模板，审核通过后将对所有用户可见。
                </div>
                <Table
                  columns={pendingColumns}
                  dataSource={Array.isArray(pendingData) ? pendingData : []}
                  rowKey="id"
                  loading={pendingLoading}
                  locale={{ emptyText: '暂无待审核模板 ✅' }}
                />
                {/* 驳回原因 Modal */}
                <Modal
                  title="驳回模板"
                  open={rejectModalVisible}
                  onOk={handleRejectConfirm}
                  confirmLoading={rejectLoading}
                  onCancel={() => setRejectModalVisible(false)}
                  okText="确认驳回"
                  okButtonProps={{ danger: true }}
                >
                  <Input.TextArea
                    rows={3}
                    placeholder="驳回原因（可不填）"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </Modal>
              </>
            ),
          },
        ]}
      />

      <Drawer
        title={currentTemplate ? "编辑模板" : "新增模板"}
        width={720}
        onClose={() => setIsDrawerVisible(false)}
        open={isDrawerVisible}
        extra={
          <Space>
            <Button onClick={() => setIsDrawerVisible(false)}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>提交</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="pricing_strategy_id" label="计价策略" rules={[{ required: true }]}>
            <Select placeholder="选择计价策略">
              {pricingList.map(p => (
                <Select.Option key={p.id} value={p.id}>{p.name} (1K:{p.price_1k}豆 / 2K:{p.price_2k}豆 / 4K:{p.price_4k}豆)</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="封面图" required>
            <Form.Item name="cover_image" noStyle rules={[{ required: true, message: '请上传封面图' }]}>
              <Input type="hidden" />
            </Form.Item>

            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={handleUpload}
              className="cover-uploader"
            >
              <div style={{
                width: 240,
                height: 240,
                border: '1px dashed #d9d9d9',
                borderRadius: 8,
                backgroundColor: '#fafafa',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
                transition: 'border-color 0.3s'
              }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#1890ff')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#d9d9d9')}
              >
                {form.getFieldValue('cover_image') ? (
                  <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <img
                      src={form.getFieldValue('cover_image')}
                      alt="cover"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      backgroundColor: 'rgba(0,0,0,0.45)',
                      opacity: 0,
                      transition: 'opacity 0.3s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 16
                    }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
                    >
                      <UploadOutlined style={{ marginRight: 8 }} /> 更换图片
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    {uploading ? <LoadingOutlined style={{ fontSize: 32, color: '#1890ff' }} /> : <FileImageOutlined style={{ fontSize: 32, color: '#999' }} />}
                    <div style={{ marginTop: 8, color: '#666' }}>{uploading ? '上传中...' : '点击上传'}</div>
                  </div>
                )}
              </div>
            </Upload>
          </Form.Item>

          <Form.Item name="system_instruction" label="System Instruction" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="输入系统的提示词指令" />
          </Form.Item>
          <Form.Item name="preset_prompt" label="Preset Prompt">
            <Input.TextArea rows={3} placeholder="输入预设的 Prompt 模板" />
          </Form.Item>

          <Form.Item name="default_aspect_ratio" label="默认尺寸（宽高比）">
            <Select
              allowClear
              placeholder="不填则客户端使用全局默认（首个比例）"
              options={ASPECT_RATIO_OPTIONS}
            />
          </Form.Item>
          <Form.Item name="default_resolution" label="默认分辨率">
            <Select
              allowClear
              placeholder="不填则按客户端默认（普通创作 1K；高阶默认 2K）"
              options={RESOLUTION_OPTIONS}
            />
          </Form.Item>
          <div style={{ marginTop: -12, marginBottom: 16, color: '#999', fontSize: 12 }}>
            用户在模板详情或创作页选用该模板时，将优先使用上述默认值；Flash 模型下分辨率选项由客户端固定处理。
          </div>

          <Form.Item label="参考图（生图时使用）">
            <Form.Item name="reference_images" noStyle initialValue={[]}>
              <Input type="hidden" />
            </Form.Item>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {(form.getFieldValue('reference_images') || []).map((url: string, index: number) => (
                <div key={index} style={{
                  width: 100,
                  height: 100,
                  border: '1px solid #d9d9d9',
                  borderRadius: 4,
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  <img src={url} alt={`参考图${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => removeReferenceImage(index)}
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      background: 'rgba(0,0,0,0.5)',
                      color: 'white',
                      border: 'none'
                    }}
                  />
                </div>
              ))}

              {(form.getFieldValue('reference_images') || []).length < 3 && (
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={handleReferenceUpload}
                >
                  <div style={{
                    width: 100,
                    height: 100,
                    border: '1px dashed #d9d9d9',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    backgroundColor: '#fafafa'
                  }}>
                    {uploading ? <LoadingOutlined style={{ fontSize: 24 }} /> : <PlusOutlined style={{ fontSize: 24 }} />}
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      {uploading ? '上传中' : '上传'}
                    </div>
                  </div>
                </Upload>
              )}
            </div>
            <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
              最多上传3张参考图，创作时将自动添加到参考图列表
            </div>
          </Form.Item>

          <Form.Item name="tags" label="关联标签">
            <Select mode="multiple" placeholder="选择标签">
              {(Array.isArray(tagsList) ? tagsList : []).map(tag => (
                <Select.Option key={tag.id} value={tag.id}>{tag.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="is_featured" label="是否推荐" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </Card>
  );
};

export default Templates;
