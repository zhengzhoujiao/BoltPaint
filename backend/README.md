# BoltPaint 后端服务

基于 FastAPI + MongoDB 的 AI 图片生成应用后端服务。

## 功能特性

- ✅ 用户管理（用户信息、余额、充值）
- ✅ 模板管理（模板列表、详情）
- ✅ 作品管理（作品列表、详情、搜索）
- ✅ 点赞功能
- ✅ 图片生成
- ✅ 分页支持
- ✅ CORS 支持

## 技术栈

- **FastAPI**: 现代、快速的 Web 框架
- **MongoDB**: NoSQL 数据库
- **Motor**: 异步 MongoDB 驱动
- **Pydantic**: 数据验证
- **Uvicorn**: ASGI 服务器

## 快速开始

### 1. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置 MongoDB 连接等信息。

### 3. 启动 MongoDB

确保 MongoDB 服务正在运行：

**Windows:**
```powershell
# 方法 1: 使用服务（如果已安装为服务）
net start MongoDB

# 方法 2: 使用 Docker
docker run -d -p 27017:27017 --name mongodb mongo

# 方法 3: 直接运行 mongod（需要先安装 MongoDB）
mongod
```

**Linux/Mac:**
```bash
sudo systemctl start mongod
# 或
brew services start mongodb-community
```

**详细安装指南：** 参考 [**运维维护手册.md**](./运维维护手册.md)

### 4. 初始化数据库

运行数据库初始化脚本，创建所有集合和示例数据：

```bash
python database/init_db.py
```

初始化脚本会创建：
- **用户集合**：按环境变量创建 1 个管理员账号和 1 个演示用户（需配置 `INITIAL_ADMIN_PASSWORD` 与 `INITIAL_TEST_USER_PASSWORD`）
- **模板集合**：6个示例模板（赛博朋克、吉卜力、古典油画等）
- **作品集合**：3个示例作品
- **订单集合**：2个示例订单
- **工单集合**：4个示例工单
- **标签集合**：24个常用标签（风格、主题、氛围、质量）
- **任务集合**：3个示例任务（生成中、已完成、失败）

**注意**：如果集合已存在数据，脚本会跳过初始化，避免重复创建。

**数据迁移**：如果需要为现有数据添加时间戳字段，可以运行：

```bash
python database/migrate_add_timestamps.py
```

此脚本会为所有缺少 `created_at` 和 `updated_at` 字段的文档添加这些字段。

### 5. 运行服务

```bash
python run.py
```

或者使用 uvicorn 直接运行：

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

服务将在 `http://localhost:8000` 启动。

### 6. Docker 部署 (推荐)

如果你打算使用 Docker 构建镜像或进行生产环境部署，运维步骤已并入：
👉 [**运维维护手册 (Docker 部署章节)**](./运维维护手册.md)
👉 [**待办事项 (待办事项.md)**](./待办事项.md)
👉 [**数据库详细设计文档 (数据库详细设计文档.md)**](./数据库详细设计文档.md)

启动服务后，访问以下地址查看 API 文档（默认 80 端口，由 Nginx 转发）：

- Swagger UI: http://localhost/docs
- ReDoc: http://localhost/redoc

## API 端点

### 用户相关
- `POST /user/login` - 用户名密码登录
- `POST /user/register` - 手机号注册
- `POST /user/send-code` - 发送验证码
- `POST /user/verify-code` - 验证验证码
- `GET /user/me` - 获取当前用户信息
- `PUT /user/me` - 更新用户信息（昵称、头像）

### 充值档位
- `GET /recharge-packages` - 充值档位列表（管理端与客户端；App 仅展示 `enabled=true`）
- `POST /recharge-packages` - 新增档位（管理）
- `PUT /recharge-packages/{id}` / `DELETE /recharge-packages/{id}` - 更新、删除（管理）

### 模板相关
- `GET /templates` - 获取模板列表（分页、搜索、筛选）
- `GET /templates/{template_id}` - 获取模板详情
- `POST /templates` - 创建模板（管理员）
- `PUT /templates/{template_id}` - 更新模板（管理员）
- `DELETE /templates/{template_id}` - 删除模板（管理员）
- `POST /templates/{template_id}/collect` - 切换收藏状态
- `GET /templates/user/collections` - 获取用户收藏的模板列表

### 作品相关
- `GET /artworks` - 获取作品列表（分页、搜索、筛选）
- `GET /artworks/{artwork_id}` - 获取作品详情
- `POST /artworks` - 保存作品（设置名称、发布状态）
- `PUT /artworks/{artwork_id}` - 更新作品信息
- `PUT /artworks/{artwork_id}/publish` - 发布/取消发布作品
- `DELETE /artworks/{artwork_id}` - 删除作品
- `GET /artworks/user/{user_id}/works` - 获取用户作品
- `GET /artworks/user/likes` - 获取用户点赞的作品
- `POST /artworks/{artwork_id}/like` - 切换点赞状态

### 生成相关
- `POST /generate` - 生成图片（创建任务，立即返回）
- `POST /generate/{task_id}/to-artwork` - 将完成的任务转换为作品

### 任务相关
- `GET /tasks` - 获取任务列表（支持用户ID、状态筛选、分页）
- `GET /tasks/{task_id}` - 获取任务详情
- `DELETE /tasks/{task_id}` - 删除任务
- `GET /tasks/stats/summary` - 获取任务统计信息

### 工单相关
- `POST /tickets` - 创建工单
- `GET /tickets` - 获取工单列表（支持用户ID、客服ID和状态筛选）
- `GET /tickets/{ticket_id}` - 获取工单详情
- `POST /tickets/{ticket_id}/reply` - 客服回复工单（添加到reply_content数组）
- `POST /tickets/{ticket_id}/message` - 用户追加消息（添加到content数组）
- `PUT /tickets/{ticket_id}/status` - 更新工单状态（管理员/客服）
- `DELETE /tickets/{ticket_id}` - 删除工单（管理员）

### 订单相关
- `POST /orders/alipay/pay` - BoltPaint 直连支付宝创建支付（请求体含 `package_id`、`pay_type`）
- `POST /orders/alipay/notify` - 支付宝异步通知（验签、核对金额并幂等入账）
- `GET /orders/alipay/return` - 支付宝同步回跳入口
- `GET /orders/{order_id}/alipay/query` - 主动查询支付宝订单状态
- `POST /orders` - 创建充值订单
- `GET /orders` - 获取订单列表（支持用户ID和状态筛选）
- `GET /orders/{order_id}` - 获取订单详情
- `POST /orders/{order_id}/pay` - 支付订单（模拟支付）
- `POST /orders/{order_id}/callback` - 管理员测试回调
- `PUT /orders/{order_id}/refund` - 退款订单（管理员）

### 标签相关
- `POST /tags` - 创建标签（管理员）
- `GET /tags` - 获取标签列表（按 order 升序排序）
- `GET /tags/{tag_id}` - 获取标签详情
- `PUT /tags/{tag_id}` - 更新标签（管理员）
- `DELETE /tags/{tag_id}` - 删除标签（管理员）

## 数据库结构

### Collections

根据文档设计，数据库包含以下集合：

- **`users`**: 用户信息
  - 字段：id, username, phone, avatar, balance_beans, is_new_user, password_hash, wx_unionid, like_ids, collection_ids, created_at, updated_at
  - `like_ids`: 喜欢作品的 id 列表（数组）
  - `collection_ids`: 收藏模板的 id 列表（数组）
  - `created_at`: 创建时间（插入时自动设置）
  - `updated_at`: 更新时间（修改时自动更新）
- **`templates`**: 模板信息
  - 字段：id, name, cover_image, system_instruction, preset_prompt, category, description, price, tags (标签ID列表), use_count (使用次数), is_featured (是否推荐), created_at, updated_at
  - `created_at`: 创建时间（插入时自动设置）
  - `updated_at`: 更新时间（修改时自动更新）
- **`artworks`**: 作品信息
  - 字段：id, user_id, user_avatar, user_name, template_id, image_url, artwork_name, user_input_prompt, aspect_ratio, resolution, is_release, likes_count, status, tags (标签ID列表，继承自模板), created_at, updated_at, is_liked
  - `created_at`: 创建时间（生成时自动设置）
  - `updated_at`: 更新时间（修改时自动更新）
- **`orders`**: 充值订单
  - 字段：id, user_id, amount_cny, beans_amount, status (pending/paid/failed/refunded), platform (alipay/wechat), transaction_id, created_at, updated_at
  - `created_at`: 创建时间（订单创建时自动设置）
  - `updated_at`: 更新时间（订单状态变更时自动更新）
- **`tickets`**: 工单（支持多轮对话）
  - 字段：id, user_id, support_id, theme, content, reply_content, status, created_at, updated_at
  - `support_id`: 客服ID（可选）
  - `theme`: 工单主题（可选）
  - `content`: 用户消息数组，每条消息包含 {content, timestamp}
  - `reply_content`: 客服回复数组，每条回复包含 {content, timestamp}
  - `status`: 工单状态（pending-待处理/in_progress-处理中/resolved-已解决/closed-已关闭）
  - `created_at`: 创建时间（工单创建时自动设置）
  - `updated_at`: 更新时间（添加消息或状态变更时自动更新）
- **`tags`**: 标签
  - 字段：id, label (标签中文名称), value (标签英文名称), order (排序权重，数值越小越靠前), created_at, updated_at
  - `created_at`: 创建时间（标签创建时自动设置）
  - `updated_at`: 更新时间（标签修改时自动更新）
- **`tasks`**: 生图任务（异步任务管理）
  - 字段：id, user_id, template_id, image_url, user_input_prompt, aspect_ratio, resolution, is_release, likes_count, tags (标签ID列表，继承自模板), status (generating/completed/failed), error_message, created_at, updated_at
  - `status`: 任务状态
    - `generating`: 生成中
    - `completed`: 已生成
    - `failed`: 生成失败
  - `error_message`: 失败原因（仅当 status 为 failed 时有值）
  - `image_url`: 生成的图片 URL（仅当 status 为 completed 时有值）
  - `created_at`: 任务创建时间（用户提交生成请求时）
  - `updated_at`: 任务更新时间（状态变更时）

### 任务流程说明

1. **创建任务**: 用户发起生成请求 → 立即创建任务记录（status: generating）→ 扣除豆子 → 返回任务 ID
2. **后台处理**: 异步调用 Gemini API 生成图片
3. **更新任务**: 生成成功 → 更新任务状态（status: completed, image_url: xxx）；生成失败 → 更新任务状态（status: failed, error_message: xxx）
4. **转换作品**: 用户可以将完成的任务转换为正式作品（保存到 artworks 集合）

### 时间戳字段说明

所有集合都包含以下时间戳字段：
- **`created_at`**: 文档创建时间，在插入数据时自动设置为当前时间
- **`updated_at`**: 文档更新时间，在修改数据时自动更新为当前时间

这些字段用于：
- 数据审计和追踪
- 按时间排序查询
- 数据同步和备份
- 业务逻辑判断（如自动关闭过期工单）

## 开发

### 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          # 应用入口
│   ├── config.py         # 配置管理
│   ├── database.py       # 数据库连接
│   ├── models.py         # 数据模型
│   └── routers/          # 路由模块
│       ├── __init__.py
│       ├── users.py
│       ├── templates.py
│       ├── artworks.py
│       └── generate.py
├── requirements.txt      # 依赖列表
├── .env.example         # 环境变量示例
├── run.py               # 启动脚本
└── README.md
```

## 配置说明

### API 监听地址

服务默认监听 `0.0.0.0:8000`，这意味着：
- ✅ 可以通过 `http://localhost:8000` 访问
- ✅ 可以通过 `http://127.0.0.1:8000` 访问
- ✅ 可以通过本机 IP 地址访问（局域网内其他设备也可访问）

如果只想本地访问，可以在 `.env` 文件中设置：
```
API_HOST=127.0.0.1
```

### MongoDB 连接

如果 MongoDB 未运行，服务仍会启动，但会显示警告信息，数据库操作会失败。

## 注意事项

1. 确保 MongoDB 服务正在运行（参考 [**运维维护手册.md**](./运维维护手册.md)）
2. 根据实际情况配置 `.env` 文件
3. 图片生成功能需要配置相应的 API Key（参考 [**Gemini 手册.md**](./Gemini手册.md)）
4. 默认用户 ID 为 `u_001`，实际应用中应实现用户认证

---
> [!NOTE]
> 更多接口详情请参考 [**接口文档.md**](./接口文档.md)
