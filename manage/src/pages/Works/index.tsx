import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Card,
  Button,
  Form,
  Input,
  Select,
  Space,
  Image,
  Modal,
  message,
  Popconfirm,
  DatePicker,
  Descriptions,
  Spin,
  Tag,
} from 'antd';
import {
  SearchOutlined,
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { getAdminArtworks, getAdminArtwork, deleteArtwork, getTemplates } from '../../api';

const { RangePicker } = DatePicker;

interface ArtworkItem {
  id: string;
  artwork_name: string | null;
  image_url: string;
  thumbnail_url: string | null;
  user_id: string;
  user_name: string;
  user_avatar: string;
  template_id: string | null;
  user_input_prompt: string;
  created_at: string;
  is_release?: boolean;
  likes_count?: number;
}

interface ArtworkDetail extends ArtworkItem {
  template_name: string | null;
}

const Works: React.FC = () => {
  const [data, setData] = useState<ArtworkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  // 详情 Modal
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ArtworkDetail | null>(null);

  // 模板下拉选项
  const [templateOptions, setTemplateOptions] = useState<{ id: string; name: string }[]>([]);

  const [searchForm] = Form.useForm();

  const fetchTemplateOptions = async () => {
    try {
      const res = await getTemplates({});
      const list = res?.data ?? (Array.isArray(res) ? res : []);
      setTemplateOptions(Array.isArray(list) ? list : []);
    } catch {
      // ignore
    }
  };

  const fetchData = useCallback(async (page = 1, extraParams: Record<string, any> = {}) => {
    setLoading(true);
    try {
      const values = searchForm.getFieldsValue();
      const params: Record<string, any> = { page, page_size: pageSize };

      if (values.artwork_name) params.artwork_name = values.artwork_name;
      if (values.author) params.author = values.author;
      if (values.template_id) params.templateId = values.template_id;
      if (values.release_status) params.releaseStatus = values.release_status;
      if (values.date_range && values.date_range.length === 2) {
        params.start_date = values.date_range[0].toISOString();
        params.end_date = values.date_range[1].toISOString();
      }

      Object.assign(params, extraParams);

      const res: any = await getAdminArtworks(params);
      // 后端返回结构为 { data: [...], total: 100 }
      // 由于 axios 拦截器已经返回了 response.data，这里的 res 就是后端的这个对象
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const totalCount = typeof res?.total === 'number' ? res.total : list.length;
      
      setData(list);
      setTotal(totalCount);
      setCurrentPage(page);
    } catch (err) {
      console.error(err);
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [searchForm, pageSize]);

  useEffect(() => {
    fetchData(1);
    fetchTemplateOptions();
  }, []);

  const handleSearch = () => {
    fetchData(1);
  };

  const handleReset = () => {
    searchForm.resetFields();
    fetchData(1);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteArtwork(id);
      message.success('作品已删除');
      fetchData(currentPage);
    } catch {
      message.error('删除失败');
    }
  };

  const handleViewDetail = async (record: ArtworkItem) => {
    setDetailVisible(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await getAdminArtwork(record.id);
      setDetail(res?.data ?? res);
    } catch {
      message.error('获取详情失败');
      setDetailVisible(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: ColumnsType<ArtworkItem> = [
    {
      title: '作品名称',
      dataIndex: 'artwork_name',
      key: 'artwork_name',
      ellipsis: true,
      render: (val: string | null) => val || <span style={{ color: '#bbb' }}>（未命名）</span>,
    },
    {
      title: '作品图片',
      dataIndex: 'image_url',
      key: 'image_url',
      width: 90,
      render: (url: string, record: ArtworkItem) => (
        <Image
          src={record.thumbnail_url || url}
          width={64}
          height={64}
          style={{ objectFit: 'cover', borderRadius: 6 }}
          fallback="https://via.placeholder.com/64?text=图片"
          preview={{ src: url }}
        />
      ),
    },
    {
      title: '发布状态',
      dataIndex: 'is_release',
      key: 'is_release',
      width: 100,
      render: (val: boolean | undefined) =>
        val ? <Tag color="green">已发布</Tag> : <Tag>未发布</Tag>,
    },
    {
      title: '点赞',
      dataIndex: 'likes_count',
      key: 'likes_count',
      width: 72,
      render: (n: number | undefined) => (typeof n === 'number' ? n : 0),
    },
    {
      title: '用户 Prompt',
      dataIndex: 'user_input_prompt',
      key: 'user_input_prompt',
      ellipsis: true,
      width: 200,
    },
    {
      title: '作者',
      key: 'author',
      width: 150,
      render: (_: any, record: ArtworkItem) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{record.user_name}</span>
          <span style={{ color: '#999', fontSize: 12 }}>{record.user_id}</span>
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (val: string) => (val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-'),
      sorter: (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
      defaultSortOrder: 'descend',
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: any, record: ArtworkItem) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          <Popconfirm
            title="确定删除该作品吗？"
            description="删除后不可恢复；若已发布将从广场移除。"
            onConfirm={() => handleDelete(record.id)}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      {/* 搜索栏 */}
      <Form
        form={searchForm}
        layout="inline"
        style={{ marginBottom: 24, rowGap: 12, flexWrap: 'wrap' }}
        onFinish={handleSearch}
        initialValues={{ release_status: 'published' }}
      >
        <Form.Item name="release_status" label="发布范围">
          <Select style={{ width: 140 }} options={[
            { value: 'published', label: '已发布' },
            { value: 'unpublished', label: '未发布' },
            { value: 'all', label: '全部' },
          ]} />
        </Form.Item>
        <Form.Item name="artwork_name" label="作品名称">
          <Input placeholder="请输入作品名称" style={{ width: 160 }} allowClear />
        </Form.Item>
        <Form.Item name="date_range" label="发布时间">
          <RangePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" style={{ width: 340 }} />
        </Form.Item>
        <Form.Item name="author" label="作者">
          <Input placeholder="作者名称或ID" style={{ width: 160 }} allowClear />
        </Form.Item>
        <Form.Item name="template_id" label="模板">
          <Select placeholder="选择模板" style={{ width: 180 }} allowClear showSearch optionFilterProp="children">
            {templateOptions.map((t) => (
              <Select.Option key={t.id} value={t.id}>
                {t.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
              搜索
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>

      {/* 作品列表 */}
      <Table<ArtworkItem>
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: false,
          onChange: (page) => fetchData(page),
        }}
        locale={{ emptyText: '暂无作品' }}
      />

      {/* 详情 Modal */}
      <Modal
        title="作品详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={<Button onClick={() => setDetailVisible(false)}>关闭</Button>}
        width={700}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin tip="加载中..." />
          </div>
        ) : detail ? (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* 作品图片 */}
            <div style={{ textAlign: 'center' }}>
              <Image
                src={detail.image_url}
                style={{ maxHeight: 360, objectFit: 'contain', borderRadius: 8 }}
                fallback="https://via.placeholder.com/400x300?text=图片"
              />
            </div>

            <Descriptions
              bordered
              column={2}
              size="small"
              labelStyle={{ width: 110, fontWeight: 500 }}
            >
              <Descriptions.Item label="作品名称" span={2}>
                {detail.artwork_name || <span style={{ color: '#bbb' }}>（未命名）</span>}
              </Descriptions.Item>
              <Descriptions.Item label="作品模版" span={2}>
                {detail.template_name ? (
                  <Tag color="blue">{detail.template_name}</Tag>
                ) : detail.template_id ? (
                  <span style={{ color: '#999' }}>{detail.template_id}（名称未找到）</span>
                ) : (
                  <span style={{ color: '#bbb' }}>—</span>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="作品提示词" span={2}>
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {detail.user_input_prompt || '—'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="作者名称">{detail.user_name}</Descriptions.Item>
              <Descriptions.Item label="作者 ID">
                <code style={{ fontSize: 12 }}>{detail.user_id}</code>
              </Descriptions.Item>
              <Descriptions.Item label="发布状态">
                {detail.is_release ? <Tag color="green">已发布</Tag> : <Tag>未发布</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="点赞数">{detail.likes_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>
                {detail.created_at ? dayjs(detail.created_at).format('YYYY-MM-DD HH:mm:ss') : '—'}
              </Descriptions.Item>
            </Descriptions>
          </Space>
        ) : null}
      </Modal>
    </Card>
  );
};

export default Works;
