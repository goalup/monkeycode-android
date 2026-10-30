/**
 * 任务排队消息（queued-inputs）。
 *
 * 后端把用户输入写入服务端队列，按提交顺序在本轮结束后派发。
 * 队列变更会通过任务流的 `queued-input` 事件推送，调用方应据此刷新快照，
 * 不要依赖前端本地推断。
 */
import { request } from './client';
import { base64DecodeToString, base64Encode } from '@/messages/base64';
import type {
  QueuedInput,
  QueuedInputDelivery,
  QueuedInputSnapshot,
  SubmitQueuedInputReq,
} from './types';

/**
 * 后端 `content` 是 Go 的 `[]byte`，JSON 里以 base64 传输。
 * 这里在边界统一编解码，界面层始终拿明文。
 */
type RawQueuedInput = Omit<QueuedInput, 'content'> & { content?: string };

const B64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * 解码 base64 文本。`base64DecodeToString` 会静默丢弃非法字符，
 * 因此这里先用正则做严格校验，再用往返比对防止把明文误当 base64。
 */
function decodeContent(raw: string): string {
  if (!raw) return '';
  if (!B64_RE.test(raw)) return raw;
  try {
    const text = base64DecodeToString(raw);
    if (base64Encode(text) !== raw) return raw;
    return text;
  } catch {
    return raw;
  }
}

function decodeItem(raw: RawQueuedInput): QueuedInput {
  return { ...raw, content: decodeContent(raw.content ?? '') };
}

function decodeSnapshot(resp: { data?: QueuedInputSnapshot | null }) {
  const data = resp.data;
  if (!data) return resp;
  const items = Array.isArray(data.items) ? data.items.map((it) => decodeItem(it as RawQueuedInput)) : [];
  return { ...resp, data: { ...data, items } };
}

export function listQueuedInputs(taskId: string) {
  return request<QueuedInputSnapshot>(`/api/v1/users/tasks/${taskId}/queued-inputs`).then(decodeSnapshot);
}

export function submitQueuedInput(
  taskId: string,
  req: SubmitQueuedInputReq,
  signal?: AbortSignal,
) {
  return request<QueuedInputSnapshot>(`/api/v1/users/tasks/${taskId}/queued-inputs`, {
    method: 'POST',
    body: { ...req, content: base64Encode(req.content) },
    signal,
  }).then(decodeSnapshot);
}

export function updateQueuedInputDelivery(
  taskId: string,
  itemId: string,
  delivery: QueuedInputDelivery,
) {
  return request<QueuedInputSnapshot>(
    `/api/v1/users/tasks/${taskId}/queued-inputs/${itemId}`,
    { method: 'PUT', body: { delivery } },
  ).then(decodeSnapshot);
}

export function withdrawQueuedInput(taskId: string, itemId: string) {
  return request<QueuedInputSnapshot>(
    `/api/v1/users/tasks/${taskId}/queued-inputs/${itemId}`,
    { method: 'DELETE' },
  ).then(decodeSnapshot);
}
