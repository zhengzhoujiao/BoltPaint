# Gemini 3 Pro Image 手册

本文档详细介绍了如何接入和使用 Google Gemini 3 Pro Image AI 图片生成模型。

---

## 1. 快速开始 (Quick Start)

### 1.1 获取 API Key
访问: [Google AI Studio](https://makersuite.google.com/app/apikey) 获取密钥。

### 1.2 配置环境变量
编辑 `backend/.env`：
```bash
NANO_BANANA_API_KEY=你的API密钥
NANO_BANANA_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent
```

### 1.3 测试功能
1. 启动后端：`python run.py`。
2. 在前端“创作”页面输入提示词，例如：“生成图片：赛博朋克风格的霓虹城市”。

---

## 2. 核心特性与配置

### 2.1 模型优势
- **高保真文本渲染**: 在图片中准确呈现文字。
- **高分辨率输出**: 支持 **1K (1024px)**, **2K (2048px)**, **4K (4096px)**。
- **高级推理 (Thinking)**: 自动优化复杂指令。

### 2.2 API 调用关键参数
- **responseModalities**: 必须设置为 `["TEXT", "IMAGE"]`。
- **imageConfig**:
  - `aspectRatio`: 支持 `1:1`, `16:9`, `9:16`, `4:3`, `3:4`。
  - `imageSize`: 必须使用大写（1K, 2K, 4K）。

---

## 3. 提示词 (Prompt) 最佳实践

### 基本生成
在提示词开头加上“**生成图片：**”前缀，例如：
> 生成图片：一只可爱的橘猫坐在窗台上晒太阳，温暖的午后光线，细节丰富。

### 图片编辑 (Image-to-Image)
上传参考图并提供修改指令：
> 将这幅画中的背景改为森林，保持主体人物不变。

---

## 4. 故障排查与性能参考

| 分辨率 | 预计时间 | 适用场景 |
|--------|---------|---------|
| 1K | 20-40秒 | 快速预览 |
| 2K | 40-80秒 | 标准输出 |
| 4K | 60-120秒| 专业画质 |

### 常见问题
- **返回随机图**: API Key 配置错误，请检查以 `AIza` 开头的密钥是否正确。
- **响应无图片**: 提示词不明确，请确保包含“生成图片”字样。
- **超时**: 4K 图片生成较慢，系统默认超时时间为 180 秒。
