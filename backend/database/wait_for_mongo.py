"""
等待 MongoDB 就绪后再退出。
用于 docker 启动时确保数据库可连接再启动 uvicorn，避免 502。
使用纯 socket 检测端口，不依赖 pymongo/motor，避免容器内 pyOpenSSL 版本兼容问题。
"""
import os
import socket
import sys
import time
from urllib.parse import urlparse


def _parse_mongo_host_port(url: str) -> tuple[str, int]:
    """从 MONGODB_URL 解析 host 和 port。"""
    u = urlparse(url)
    netloc = u.netloc or "localhost:27017"
    if "@" in netloc:
        netloc = netloc.split("@", 1)[1]
    parts = netloc.rsplit(":", 1)
    host = parts[0] or "localhost"
    port = int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else 27017
    return host, port


def wait_for_mongo(max_attempts: int = 30, interval: float = 1.0) -> bool:
    """轮询检测 MongoDB 端口是否可连，成功返回 True，超时返回 False。"""
    url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    host, port = _parse_mongo_host_port(url)
    for attempt in range(1, max_attempts + 1):
        try:
            with socket.create_connection((host, port), timeout=3):
                print(f"[OK] MongoDB 已就绪 (尝试 {attempt}/{max_attempts})")
                return True
        except (socket.error, OSError) as e:
            print(f"[*] 等待 MongoDB {host}:{port}... ({attempt}/{max_attempts}) {e}")
            time.sleep(interval)
    return False


def main():
    ok = wait_for_mongo()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
