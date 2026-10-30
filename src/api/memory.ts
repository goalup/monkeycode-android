/**
 * 记忆（memories）。
 *
 * 后端把记忆能力放在 MCP 服务后面，控制台接口是它的代理。
 * 列表 query 非空时走语义检索（返回带 score），否则按时间倒序分页。
 */
import { request } from './client';
import type { MemoryContext, MemoryItem, MemoryListResp } from './types';

export function listMemories(
  params: { q?: string; category?: string; status?: string; limit?: number; offset?: number } = {},
) {
  return request<MemoryListResp>('/api/v1/users/memories', { query: params });
}

export function getMemoryContext() {
  return request<MemoryContext>('/api/v1/users/memories/profile');
}

export function getMemory(id: string) {
  return request<MemoryItem>(`/api/v1/users/memories/${id}`);
}

export function createMemory(body: {
  content: string;
  category?: string;
  temporal_type?: string;
  importance?: number;
  standing?: boolean;
}) {
  return request('/api/v1/users/memories', { method: 'POST', body });
}

export function updateMemory(
  id: string,
  body: {
    content?: string;
    category?: string;
    temporal_type?: string;
    importance?: number;
    standing?: boolean;
    reason?: string;
  },
) {
  return request(`/api/v1/users/memories/${id}`, { method: 'PUT', body });
}

export function deleteMemory(id: string) {
  return request(`/api/v1/users/memories/${id}`, { method: 'DELETE' });
}
