/** 工作区快照。 */
import { request } from './client';
import type { WorkspaceSnapshot, WorkspaceSnapshotVersion } from './types';

export function getWorkspaceSnapshot(taskId: string) {
  return request<WorkspaceSnapshot>(
    `/api/v1/users/tasks/${taskId}/workspace-snapshot`,
  );
}

/** 历史版本列表：后端直接返回数组。 */
export function listWorkspaceSnapshotVersions(taskId: string) {
  return request<WorkspaceSnapshotVersion[]>(
    `/api/v1/users/tasks/${taskId}/workspace-snapshot/versions`,
  );
}

export function getWorkspaceSnapshotVersion(taskId: string, version: number | string) {
  return request<WorkspaceSnapshot>(
    `/api/v1/users/tasks/${taskId}/workspace-snapshot/versions/${version}`,
  );
}
