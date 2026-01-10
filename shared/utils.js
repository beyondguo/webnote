// ========================================
// 工具函数库
// ========================================

/**
 * 生成唯一ID
 * @returns {string} UUID格式的唯一标识符
 */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 格式化日期时间
 * @param {string|Date} timestamp - 时间戳或Date对象
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  // 小于1分钟
  if (diff < 60000) {
    return '刚刚';
  }
  
  // 小于1小时
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}分钟前`;
  }
  
  // 小于24小时
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}小时前`;
  }
  
  // 小于7天
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days}天前`;
  }
  
  // 完整日期
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/**
 * 生成URL的哈希值（用于文件名）
 * @param {string} url - 网页URL
 * @returns {string} 哈希值
 */
function hashUrl(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * 解析标签字符串
 * @param {string} input - 用户输入的标签字符串
 * @returns {string[]} 标签数组
 */
function parseTags(input) {
  if (!input || typeof input !== 'string') {
    return [];
  }
  
  // 移除#号，按空格分割，过滤空字符串
  return input
    .replace(/#/g, '')
    .split(/\s+/)
    .filter(tag => tag.trim().length > 0)
    .map(tag => tag.trim());
}

/**
 * 获取标签颜色
 * @param {string} tag - 标签名称
 * @returns {string} 颜色值
 */
function getTagColor(tag) {
  const colors = [
    '#667eea', '#f56565', '#48bb78', '#ed8936', 
    '#38b2ac', '#9f7aea', '#ec4899', '#3b82f6'
  ];
  
  // 根据标签名生成一致的颜色索引
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * 截断文本
 * @param {string} text - 原始文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的文本
 */
function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
}

/**
 * 转义HTML特殊字符
 * @param {string} text - 原始文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 导出为Markdown格式
 * @param {Object} pageData - 页面数据对象
 * @returns {string} Markdown格式的文本
 */
function exportToMarkdown(pageData) {
  let markdown = `# ${pageData.pageTitle}\n\n`;
  markdown += `**URL**: ${pageData.url}\n`;
  markdown += `**创建时间**: ${formatDate(pageData.createdAt)}\n`;
  markdown += `**笔记数量**: ${pageData.notes.length}\n\n`;
  markdown += `---\n\n`;
  markdown += `## 📝 笔记\n\n`;
  
  pageData.notes.forEach((note, index) => {
    markdown += `### ${index + 1}. [${formatDate(note.timestamp)}]`;
    
    if (note.tags && note.tags.length > 0) {
      markdown += ` ${note.tags.map(tag => `#${tag}`).join(' ')}`;
    }
    
    markdown += `\n\n`;
    markdown += `> ${note.text.replace(/\n/g, '\n> ')}\n\n`;
    
    if (note.note) {
      markdown += `**备注**: ${note.note}\n\n`;
    }
    
    markdown += `---\n\n`;
  });
  
  return markdown;
}

/**
 * 导出所有笔记为Markdown
 * @param {Object[]} allPages - 所有页面数据数组
 * @returns {string} Markdown格式的文本
 */
function exportAllToMarkdown(allPages) {
  let markdown = `# 我的网页笔记\n\n`;
  markdown += `**导出时间**: ${formatDate(new Date())}\n`;
  markdown += `**总页面数**: ${allPages.length}\n`;
  
  const totalNotes = allPages.reduce((sum, page) => sum + page.notes.length, 0);
  markdown += `**总笔记数**: ${totalNotes}\n\n`;
  markdown += `---\n\n`;
  
  allPages.forEach((pageData, index) => {
    markdown += exportToMarkdown(pageData);
    if (index < allPages.length - 1) {
      markdown += `\n\n`;
    }
  });
  
  return markdown;
}

/**
 * 下载文件
 * @param {string} content - 文件内容
 * @param {string} filename - 文件名
 * @param {string} mimeType - MIME类型
 */
function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 显示通知
 * @param {string} message - 通知消息
 * @param {string} type - 通知类型 (success, error, info)
 */
function showNotification(message, type = 'info') {
  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = `notification notification-${type} fade-in`;
  notification.textContent = message;
  
  // 样式
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '12px 20px',
    borderRadius: '8px',
    backgroundColor: type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#667eea',
    color: 'white',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: '999999',
    maxWidth: '300px'
  });
  
  document.body.appendChild(notification);
  
  // 3秒后自动移除
  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

/**
 * 获取当前主题
 * @returns {string} 'light' 或 'dark'
 */
function getCurrentTheme() {
  return localStorage.getItem('theme') || 'light';
}

/**
 * 设置主题
 * @param {string} theme - 'light' 或 'dark'
 */
function setTheme(theme) {
  localStorage.setItem('theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * 切换主题
 */
function toggleTheme() {
  const currentTheme = getCurrentTheme();
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
  return newTheme;
}

// 初始化主题
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setTheme(getCurrentTheme());
  });
}
