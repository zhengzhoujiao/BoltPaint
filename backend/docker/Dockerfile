# 使用 Python 3.11 轻量版作为基础镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量，防止 Python 生成 .pyc 文件，并确保日志实时输出
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 安装系统依赖（如果项目需要一些特定的 C 库，可以在这里添加）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 复制 requirements.txt 并安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# 复制项目代码
COPY . .

# 暴露后端端口 (与 config.py 中的 API_PORT 对应)
EXPOSE 8000

# 启动命令
# 注意：我们使用 uvicorn 运行 FastAPI 应用
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
