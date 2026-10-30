/** 任务用量与时间线。 */
import { request } from './client';
import type { TaskTimelineResp, TaskUsage } from './types';

export function getTaskUsage(taskId: string) {
  return request<TaskUsage>(`/api/v1/users/tasks/${taskId}/usage`);
}

export function getTaskTimeline(taskId: string, params: { limit?: number; cursor?: string } = {}) {
  return request<TaskTimelineResp>(`/api/v1/users/tasks/${taskId}/timeline`, {
    query: params,
  });
}
