/**
 * 客户端图片压缩工具
 * 
 * @param file 原始文件对象
 * @param maxWidth 最大宽度限制（默认 1024px）
 * @param quality 压缩质量（0-1，默认 0.8）
 * @returns Promise<string> 压缩后的 Base64 数据
 */
export const compressImage = (file: File, maxWidth: number = 1024, quality: number = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        // 创建 Canvas
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 等比例缩放计算
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 Canvas 上下文'));
          return;
        }

        // 绘制到 Canvas 上
        ctx.drawImage(img, 0, 0, width, height);

        // 导出为 WebP 格式（如果浏览器不支持则回退到 jpeg）
        try {
          // 优先尝试 WebP，以获得更好的压缩比
          const base64 = canvas.toDataURL('image/webp', quality);
          resolve(base64);
        } catch (e) {
          // Fallback to JPEG
          const base64 = canvas.toDataURL('image/jpeg', quality);
          resolve(base64);
        }
      };
      img.onerror = (e) => reject(e);
    };
    reader.onerror = (e) => reject(e);
  });
};
