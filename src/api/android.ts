/**
 * Android 设备池（仅团队管理员可操作）。
 *
 * 后端是纯代理，转发到 android-runner。读取 15s、写入 90s 超时，
 * 因为 runner 销毁容器是同步的。
 */
import { request } from './client';
import type { AndroidConfigMap, AndroidConfigPatch, AndroidOverview } from './types';

export function getAndroidOverview() {
  return request<AndroidOverview>('/api/v1/users/android/overview');
}

export function getAndroidConfig() {
  return request<AndroidConfigMap>('/api/v1/users/android/config');
}

export function updateAndroidConfig(patch: AndroidConfigPatch) {
  return request<AndroidConfigMap>('/api/v1/users/android/config', {
    method: 'PUT',
    body: patch,
  });
}

/**
 * 取消排队中的等待者或回收一个活动租约。
 * holder / waiter_id / lease_id 至少提供一个。
 */
export function cancelAndroidRequest(body: {
  holder?: string;
  waiter_id?: string;
  lease_id?: string;
}) {
  return request('/api/v1/users/android/cancel', { method: 'POST', body });
}

export function destroyAndroidInstance(instanceId: string) {
  return request(`/api/v1/users/android/instances/${instanceId}`, { method: 'DELETE' });
}
