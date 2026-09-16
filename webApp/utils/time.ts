/**
 * 时间工具函数
 * 用于将UTC时间转换为用户本地时区显示
 * 默认时区：北京时间（UTC+8）
 */

// 默认时区：北京时间（UTC+8）
const DEFAULT_TIMEZONE = 'Asia/Shanghai';
const DEFAULT_LOCALE = 'zh-CN';

/**
 * 获取用户时区，如果无法获取则返回默认时区（北京时间）
 */
const getUserTimezone = (): string => {
  try {
    // 尝试获取用户时区
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return userTimezone || DEFAULT_TIMEZONE;
  } catch (error) {
    // 如果无法获取，返回默认时区
    return DEFAULT_TIMEZONE;
  }
};

/**
 * 将UTC时间字符串转换为本地Date对象
 * 确保正确处理UTC时间（带'Z'后缀或不带时区信息的情况）
 * JavaScript的Date对象会自动将UTC时间转换为用户本地时区
 */
export const parseUTCDate = (dateString: string): Date | null => {
  if (!dateString) return null;

  let normalizedDateString = dateString.trim();

  // 检查是否已经有时区标识
  const hasTimezone = normalizedDateString.endsWith('Z') ||
    normalizedDateString.includes('+') ||
    (normalizedDateString.includes('-') && normalizedDateString.length > 19);

  // 如果没有时区信息，假设是UTC时间，添加'Z'后缀
  // 这样Date对象会正确解析为UTC时间，然后自动转换为本地时区
  if (!hasTimezone) {
    // 确保字符串格式正确（ISO 8601格式）
    if (normalizedDateString.includes('T')) {
      normalizedDateString = normalizedDateString + 'Z';
    } else {
      // 如果只是日期，添加时间部分
      normalizedDateString = normalizedDateString + 'T00:00:00Z';
    }
  }

  const date = new Date(normalizedDateString);

  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
};

/**
 * 格式化相对时间（如：刚刚、5分钟前、2小时前等）
 */
export const formatRelativeTime = (dateString: string): string => {
  const date = parseUTCDate(dateString);
  if (!date) return '';

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes <= 0 ? '刚刚' : `${minutes}分钟前`;
    }
    return `${hours}小时前`;
  } else if (days === 1) {
    return '昨天';
  } else if (days < 7) {
    return `${days}天前`;
  } else {
    return date.toLocaleDateString(DEFAULT_LOCALE, {
      month: '2-digit',
      day: '2-digit',
      timeZone: getUserTimezone()
    });
  }
};

/**
 * 格式化时间（用于消息时间显示）
 * 显示格式：今天显示时间，昨天显示"昨天 + 时间"，7天内显示"X天前 + 时间"，更早显示完整日期时间
 */
export const formatMessageTime = (dateString: string): string => {
  const date = parseUTCDate(dateString);
  if (!date) return '';

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const timezone = getUserTimezone();

  // 使用用户时区格式化时间（默认北京时间）
  const timeString = date.toLocaleTimeString(DEFAULT_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone
  });

  if (days === 0) {
    return timeString;
  } else if (days === 1) {
    return '昨天 ' + timeString;
  } else if (days < 7) {
    return `${days}天前 ` + timeString;
  } else {
    const dateStr = date.toLocaleDateString(DEFAULT_LOCALE, {
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone
    });
    return dateStr + ' ' + timeString;
  }
};

/**
 * 格式化完整日期时间（用于订单等需要完整信息的场景）
 */
export const formatFullDateTime = (dateString: string): string => {
  const date = parseUTCDate(dateString);
  if (!date) return '';

  // 使用用户时区格式化时间（默认北京时间）
  return date.toLocaleString(DEFAULT_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: getUserTimezone()
  });
};

/**
 * 格式化日期（仅日期部分，不包含时间）
 */
export const formatDate = (dateString: string): string => {
  const date = parseUTCDate(dateString);
  if (!date) return '';

  // 使用用户时区格式化日期（默认北京时间）
  return date.toLocaleDateString(DEFAULT_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: getUserTimezone()
  });
};
