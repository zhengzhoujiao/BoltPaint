import React, { useState, useEffect } from 'react';
import { Table, Card, Form, Input, Select, Button, Tag, Modal, Descriptions, message } from 'antd';
import { SearchOutlined, MessageOutlined, UserOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getTickets, replyTicket, updateTicketStatus } from '../../api';

interface TicketMessage {
  content: string;
  timestamp: string;
}

interface Ticket {
  id: string;
  user_id: string;
  theme: string;
  content: TicketMessage[];
  status: 'pending' | 'in_progress' | 'unread' | 'resolved' | 'closed';
  reply_content?: TicketMessage[];
  created_at: string;
  updated_at?: string;
}

/** 合并用户消息与客服回复，按时间排序，用于展示完整对话 */
function getConversationTimeline(ticket: Ticket): Array<{ role: 'user' | 'support'; content: string; timestamp: string }> {
  const list: Array<{ role: 'user' | 'support'; content: string; timestamp: string }> = [];
  const userList = Array.isArray(ticket.content) ? ticket.content : [];
  const supportList = Array.isArray(ticket.reply_content) ? ticket.reply_content : [];
  userList.forEach(m => list.push({ role: 'user', content: m.content ?? '', timestamp: m.timestamp ?? '' }));
  supportList.forEach(m => list.push({ role: 'support', content: m.content ?? '', timestamp: m.timestamp ?? '' }));
  list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return list;
}

const Tickets: React.FC = () => {
  const [data, setData] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [form] = Form.useForm();

  const fetchTickets = async (params: any = {}) => {
    setLoading(true);
    try {
      const res = await getTickets(params);
      setData(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleSearch = (values: any) => {
    const params: any = {};
    if (values.status) params.status = values.status;
    fetchTickets(params);
  };

  const handleReply = (record: Ticket) => {
    setCurrentTicket(record);
    setReplyText('');
    setIsModalVisible(true);
  };

  const handleSubmitReply = async () => {
    if (!replyText.trim()) {
      message.error('请输入回复内容');
      return;
    }
    if (!currentTicket) return;

    try {
      await replyTicket(currentTicket.id, {
        reply_content: replyText
      });
      message.success('回复成功');
      setIsModalVisible(false);
      fetchTickets(form.getFieldsValue());
    } catch (error) {
      message.error('回复失败');
    }
  };

  const handleStatusUpdate = async (status: string) => {
    if (!currentTicket) return;

    try {
      setLoading(true);
      await updateTicketStatus(currentTicket.id, status);
      message.success(`工单状态已更新为: ${status === 'resolved' ? '已解决' : '已关闭'}`);
      setIsModalVisible(false);
      fetchTickets(form.getFieldsValue());
    } catch (error) {
      message.error('更新状态失败');
    } finally {
      setLoading(false);
    }
  };

  const getSummary = (content: any) => {
    if (Array.isArray(content) && content.length > 0 && content[0]?.content != null) {
      return String(content[0].content);
    }
    return '无内容';
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: '用户ID', dataIndex: 'user_id', key: 'user_id' },
    { title: '主题', dataIndex: 'theme', key: 'theme' },
    {
      title: '内容摘要',
      dataIndex: 'content',
      key: 'content',
      render: (val: any) => <span title={getSummary(val)}>{getSummary(val).slice(0, 30)}...</span>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        let color = 'default';
        let text = status;
        if (status === 'pending') { color = 'red'; text = '待处理'; }
        if (status === 'in_progress') { color = 'blue'; text = '处理中'; }
        if (status === 'unread') { color = 'orange'; text = '未读'; }
        if (status === 'resolved') { color = 'green'; text = '已解决'; }
        if (status === 'closed') { color = 'default'; text = '已关闭'; }
        return <Tag color={color}>{text}</Tag>
      }
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss') },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Ticket) => record.status !== 'closed' && (
        <Button type="link" icon={<MessageOutlined />} onClick={() => handleReply(record)}>处理</Button>
      ),
    },
  ];

  return (
    <Card>
      <Form form={form} layout="inline" onFinish={handleSearch} style={{ marginBottom: 24 }}>
        <Form.Item name="status" label="状态">
          <Select allowClear placeholder="选择状态" style={{ width: 120 }}>
            <Select.Option value="pending">待处理</Select.Option>
            <Select.Option value="unread">未读</Select.Option>
            <Select.Option value="in_progress">处理中</Select.Option>
            <Select.Option value="resolved">已解决</Select.Option>
            <Select.Option value="closed">已关闭</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>搜索</Button>
        </Form.Item>
      </Form>
      <Table columns={columns} dataSource={Array.isArray(data) ? data : []} rowKey="id" loading={loading} />

      <Modal
        title="处理工单"
        open={isModalVisible}
        onOk={handleSubmitReply}
        onCancel={() => setIsModalVisible(false)}
        width={640}
        footer={[
          <Button key="cancel" onClick={() => setIsModalVisible(false)}>
            取消
          </Button>,
          currentTicket?.status !== 'closed' && (
            <Button key="close" danger onClick={() => handleStatusUpdate('closed')}>
              关闭工单
            </Button>
          ),
          currentTicket?.status !== 'resolved' && currentTicket?.status !== 'closed' && (
            <Button key="resolve" style={{ color: '#52c41a', borderColor: '#b7eb8f' }} onClick={() => handleStatusUpdate('resolved')}>
              已解决
            </Button>
          ),
          <Button key="submit" type="primary" onClick={handleSubmitReply}>
            回复并保存
          </Button>,
        ]}
      >
        {currentTicket && (
          <>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="用户ID">{currentTicket.user_id}</Descriptions.Item>
              <Descriptions.Item label="主题">{currentTicket.theme}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={
                  currentTicket.status === 'pending' ? 'red' :
                    currentTicket.status === 'unread' ? 'orange' :
                      currentTicket.status === 'in_progress' ? 'blue' :
                        currentTicket.status === 'resolved' ? 'green' : 'default'
                }>
                  {
                    currentTicket.status === 'pending' ? '待处理' :
                      currentTicket.status === 'unread' ? '未读' :
                        currentTicket.status === 'in_progress' ? '处理中' :
                          currentTicket.status === 'resolved' ? '已解决' : '已关闭'
                  }
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{dayjs(currentTicket.created_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            </Descriptions>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>完整沟通记录</div>
              <div
                style={{
                  maxHeight: 320,
                  overflowY: 'auto',
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: 12,
                  background: '#fafafa',
                }}
              >
                {getConversationTimeline(currentTicket).length === 0 ? (
                  <div style={{ color: '#999', textAlign: 'center', padding: 16 }}>暂无对话记录</div>
                ) : (
                  getConversationTimeline(currentTicket).map((msg, index) => (
                    <div
                      key={index}
                      style={{
                        marginBottom: 12,
                        display: 'flex',
                        flexDirection: msg.role === 'user' ? 'row' : 'row-reverse',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '85%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: msg.role === 'user' ? '#e6f4ff' : '#f6ffed',
                          border: '1px solid ' + (msg.role === 'user' ? '#91caff' : '#b7eb8f'),
                        }}
                      >
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                          {msg.role === 'user' ? <><UserOutlined /> 用户</> : <><CustomerServiceOutlined /> 客服</>}
                          <span style={{ marginLeft: 8 }}>{msg.timestamp ? dayjs(msg.timestamp).format('YYYY-MM-DD HH:mm:ss') : ''}</span>
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content || '—'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Form layout="vertical">
              <Form.Item label="回复内容" required>
                <Input.TextArea
                  rows={4}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="请输入回复内容"
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </Card>
  );
};

export default Tickets;
