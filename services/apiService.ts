
import { User } from '../types';

// 使用相对路径，Vite 和 Vercel 会处理代理转发
const API_BASE_URL = '';

/**
 * 核心响应处理器：确保流只被读取一次，并兼容 HTML 错误页
 */
async function handleResponse(response: Response) {
  const text = await response.text();
  let data: any;
  
  try {
    data = JSON.parse(text);
  } catch (e) {
    // 捕获非 JSON 响应（如 Nginx 404 页面）
    data = null;
  }

  if (!response.ok) {
    // 处理常见的 HTTP 错误状态
    if (response.status === 404) {
      throw new Error('API 接口路径不存在 (404)。请确认后端服务地址或路径是否正确。');
    }
    if (response.status === 502 || response.status === 504 || response.status === 500) {
      throw new Error('后端服务暂时无法连接 (Server Error)，请检查网络或稍后重试。');
    }

    let msg = `请求失败 (状态码: ${response.status})`;
    if (data && typeof data === 'object' && data.message) {
      msg = data.message;
    } else if (text && text.length > 0) {
      // 简单清理 HTML 标签并截取，提供更友好的错误提示
      const plainText = text.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
      msg = plainText.length > 0 ? (plainText.substring(0, 50) + '...') : msg;
    }
    throw new Error(msg);
  }

  // 业务逻辑错误码处理（后端约定 code=0 为成功）
  if (data && typeof data === 'object' && data.code !== undefined && data.code !== 0) {
    throw new Error(data.message || '服务器返回业务错误');
  }

  return data;
}

const mapApiUserToAppUser = (apiUser: any): User => ({
  id: String(apiUser.user_id || apiUser.id || ''),
  nickname: apiUser.nickname || apiUser.username || 'User',
  email: apiUser.email || '',
  avatar: apiUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${apiUser.user_id || apiUser.username || 'default'}`
});

export const api = {
  /**
   * 获取上传凭证
   */
  getUploadCredentials: async (filenames: string[]) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/shp_file/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        files: filenames.map(name => ({ filename: name })) 
      }),
      credentials: 'include',
    });
    const result = await handleResponse(response);
    return result.data;
  },

  /**
   * 获取删除凭证
   */
  deleteCloudFileCredentials: async (filename: string, objectKey: string) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/shp_file/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ filename, object_key: objectKey }]
      }),
      credentials: 'include',
    });
    const result = await handleResponse(response);
    return result.data;
  },

  /**
   * 获取云端文件列表
   */
  getMyCloudFiles: async () => {
    const response = await fetch(`${API_BASE_URL}/api/v1/shp_file`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    const result = await handleResponse(response);
    return result.data;
  },

  sendRegisterCode: async (email: string) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/user/captcha/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'include',
    });
    return await handleResponse(response);
  },

  sendForgotPasswordCode: async (email: string) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/user/captcha/change_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'include',
    });
    return await handleResponse(response);
  },

  register: async (email: string, password: string, username: string, captcha: string, logid?: string) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/user/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username, nickname: username, captcha, logid }),
      credentials: 'include',
    });
    return await handleResponse(response);
  },

  login: async (account: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password }),
      credentials: 'include',
    });
    const data = await handleResponse(response);
    const rawUser = data.user || data.data || (data.data && data.data.user);
    if (rawUser) return mapApiUserToAppUser(rawUser);
    
    // 某些后端在登录成功后需要短暂延迟来同步 Session 状态
    for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 800));
        const userProfile = await api.checkLoginStatus();
        if (userProfile) return userProfile;
    }
    throw new Error("登录成功但用户信息同步失败，请手动刷新页面重试。");
  },

  checkLoginStatus: async (): Promise<User | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/user/login`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        credentials: 'include',
      });
      const data = await handleResponse(response);
      const rawUser = data.user || data.data || (data.data && data.data.user);
      return rawUser ? mapApiUserToAppUser(rawUser) : null;
    } catch { return null; }
  },

  resetPassword: async (email: string, password: string, captcha: string, logid?: string) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/user/change_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, captcha, logid }),
      credentials: 'include',
    });
    return await handleResponse(response);
  },

  logout: async () => {
    try {
      await fetch(`${API_BASE_URL}/api/v1/user/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
  }
};
