/**
 * 客户端图片压缩工具 (Manage端)
 */

/**
 * 将 Base64 转换为 Blob
 */
export const base64ToBlob = (base64: string): Blob => {
  const parts = base64.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
};

/**
 * 压缩图片并返回 Base64
 */
export const compressImage = (file: File, maxWidth: number = 1024, quality: number = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

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

        ctx.drawImage(img, 0, 0, width, height);

        try {
          const base64 = canvas.toDataURL('image/webp', quality);
          resolve(base64);
        } catch (e) {
          const base64 = canvas.toDataURL('image/jpeg', quality);
          resolve(base64);
        }
      };
      img.onerror = (e) => reject(e);
    };
    reader.onerror = (e) => reject(e);
  });
};

/**
 * 压缩图片并返回 File 对象（主要用于 FormData 上传）
 */
export const compressImageToFile = async (file: File, maxWidth: number = 1024, quality: number = 0.8): Promise<File> => {
  const base64 = await compressImage(file, maxWidth, quality);
  const blob = base64ToBlob(base64);
  const ext = blob.type.split('/')[1] || 'webp';
  const newFilename = `${file.name.split('.')[0]}_compressed.${ext}`;
  return new File([blob], newFilename, { type: blob.type });
};
