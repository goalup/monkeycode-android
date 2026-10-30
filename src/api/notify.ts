/** 通知中心。 */
import { request } from './client';
import type { NotificationListResp } from './types';

export interface ListNotificationsParams {
  /** 返回条数，后端默认与上限由服务端控制，这里按 Web 端惯例取 100。 */
  limit?: number;
  unread_only?: boolean;
  kind?: 'task' | 'schedule';
  level?: 'info' | 'warning' | 'error';
}

export function listNotifications(params: ListNotificationsParams = {}) {
  return request<NotificationListResp>('/api/v1/users/notifications', {
    query: { limit: params.limit ?? 100, ...params },
  });
}

export function markNotificationsRead(refIds: string[]) {
  return request('/api/v1/users/notifications/read', {
    method: 'POST',
    body: { ref_ids: refIds },
  });
}

export function markAllNotificationsRead() {
  return request('/api/v1/users/notifications/read-all', { method: 'POST' });
}
