/** 云盘（drive）与产物。 */
import { request } from './client';
import { putFileToUrl, type PickedFile } from './upload';
import type {
  DriveListResp,
  DriveObject,
  DriveQuota,
  DriveSearchResp,
  DriveUploadTicket,
} from './types';

export function getDriveQuota() {
  return request<DriveQuota>('/api/v1/users/drive/quota');
}

/** 列出某目录下的文件（path 为空表示根目录）。 */
export function listDriveObjects(path = '') {
  return request<DriveListResp>('/api/v1/users/drive/objects', { query: { path } });
}

/** 全盘按文件名搜索。 */
export function searchDriveObjects(keyword: string, limit = 50) {
  return request<DriveSearchResp>('/api/v1/users/drive/search', { query: { keyword, limit } });
}

/** 某任务的产物列表（返回数组）。 */
export function listDriveArtifacts(taskId: string) {
  return request<DriveObject[]>('/api/v1/users/drive/artifacts', { query: { task_id: taskId } });
}

/** 重命名或移动（new_path 需以 / 开头且不能是根）。 */
export function renameDriveObject(id: string, newPath: string) {
  return request<DriveObject>(`/api/v1/users/drive/objects/${id}/path`, {
    method: 'PUT',
    body: { new_path: newPath },
  });
}

/** 申请预签名直传地址。 */
export function prepareDriveUpload(body: { path: string; size: number; mime?: string }) {
  return request<DriveUploadTicket>('/api/v1/users/drive/upload-url', {
    method: 'POST',
    body,
  });
}

/** 直传完成后落库元数据。 */
export function commitDriveUpload(body: {
  id: string;
  path: string;
  size: number;
  mime?: string;
  sha256?: string;
}) {
  return request<DriveObject>('/api/v1/users/drive/commit', { method: 'POST', body });
}

export function getDriveDownloadUrl(id: string) {
  return request<{ url: string; expires_in: number }>(
    `/api/v1/users/drive/objects/${id}/download-url`,
  );
}

/**
 * 生成限时分享链接。ttl_seconds 为有效期，download 为 true 时作为附件下载。
 * 后端返回 { url, expires_in }。
 */
export function shareDriveObject(
  id: string,
  body: { ttl_seconds?: number; download?: boolean } = {},
) {
  return request<{ url: string; expires_in: number }>(
    `/api/v1/users/drive/objects/${id}/share`,
    { method: 'POST', body },
  );
}

export function deleteDriveObjects(ids: string[]) {
  return request('/api/v1/users/drive/objects/batch-delete', {
    method: 'POST',
    body: { ids },
  });
}

/**
 * 上传本地文件到云盘指定目录：申请直传地址 -> PUT 原始字节 -> 提交元数据。
 * 超过配额或单文件上限时后端在第一步就会拒绝。
 */
export async function uploadDriveFile(dirPath: string, file: PickedFile) {
  const base = dirPath.replace(/\/+$/, '');
  const path = `${base}/${file.name}`;
  const size = file.size ?? 0;
  if (size <= 0) throw new Error('无法读取文件大小，请重新选择');
  const ticket = await prepareDriveUpload({ path, size, mime: file.mimeType });
  const t = ticket.data;
  if (!t?.upload_url || !t.id) throw new Error('获取上传地址失败：响应缺少 URL');
  await putFileToUrl(t.upload_url, file.uri);
  return commitDriveUpload({
    id: t.id,
    path: t.path || path,
    size,
    mime: file.mimeType,
  });
}
