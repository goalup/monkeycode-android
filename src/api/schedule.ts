/**
 * 定时任务（task-schedules）。
 *
 * 注意：后端没有独立的「创建」端点，定时项在创建任务时通过 CreateTaskReq.extra 一并提交。
 * 这里只封装列表、启停、修改提示词/间隔、立即执行、执行历史、删除。
 */
import { request } from './client';
import type { TaskSchedule, TaskScheduleListResp, TaskScheduleRun } from './types';

export function listSchedules(
  params: { page?: number; size?: number; status?: 'enabled' | 'disabled'; keyword?: string } = {},
) {
  return request<TaskScheduleListResp>('/api/v1/users/task-schedules', { query: params });
}

export function setScheduleEnabled(id: string, enabled: boolean) {
  return request(`/api/v1/users/task-schedules/${id}/enabled`, {
    method: 'PUT',
    body: { enabled },
  });
}

export function updateSchedule(
  id: string,
  body: { prompt?: string; interval_seconds?: number },
) {
  return request<TaskSchedule>(`/api/v1/users/task-schedules/${id}`, {
    method: 'PUT',
    body,
  });
}

export function runScheduleNow(id: string) {
  return request(`/api/v1/users/task-schedules/${id}/run`, { method: 'POST' });
}

export function listScheduleRuns(id: string, limit = 20) {
  return request<TaskScheduleRun[]>(`/api/v1/users/task-schedules/${id}/runs`, {
    query: { limit },
  });
}

export function deleteSchedule(id: string) {
  return request(`/api/v1/users/task-schedules/${id}`, { method: 'DELETE' });
}
