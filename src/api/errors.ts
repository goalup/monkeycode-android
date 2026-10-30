/**
 * 后端错误码到用户可读文案的映射。
 *
 * 后端 errcode 包按模块分段：10000 通用、10200-10232 主机、10301 设备池、106xx 认证、
 * 10800-10815 任务。后端 message 已经是中文，这里只补充少数需要引导用户操作的情况。
 */
import { ApiError } from './client';

const MESSAGES: Record<number, string> = {
  10811: '同时运行的任务已达上限，请先终止一个任务',
  10301: '设备池状态冲突，请刷新后重试',
  10633: '登录状态已失效，请重新登录',
  10002: '资源不存在或已删除',
};

/** 把任意错误转成可直接展示的文案。 */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (typeof e.code === 'number' && MESSAGES[e.code]) return MESSAGES[e.code];
    return e.message || '请求失败';
  }
  if (e instanceof Error) return e.message || '未知错误';
  return '未知错误';
}

/** 是否为并发上限错误，调用方可据此弹 ConcurrentLimitModal。 */
export function isConcurrencyLimit(e: unknown): boolean {
  return e instanceof ApiError && e.code === 10811;
}

/** 是否为资源不存在（任务/对象已被删除）。 */
export function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && (e.code === 10002 || e.status === 404);
}
