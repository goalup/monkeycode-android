/**
 * 对话定位（用户输入索引）的纯计算逻辑 —— 移植自 Web 端
 * `frontend/src/components/console/task/task-user-input-index-model.ts`。
 *
 * 目标：把 REST `/users/tasks/user-inputs` 返回的索引条目与实时流里的用户消息
 * 合并成同一份按时间升序的列表，并提供「点状缩略图」的分桶算法。
 */
import { normalizeTimestampToNs, type ChatMessage } from './handler';

export interface UserInputIndexEntry {
  id: string;
  timestamp: number;
  content: string;
  truncated: boolean;
}

export interface UserInputIndexSourceItem {
  id?: string;
  timestamp?: number;
  content?: string;
  truncated?: boolean;
}

export interface UserInputIndexDot {
  key: string;
  startIndex: number;
  endIndex: number;
}

/** 服务端按「最新在前」返回一页；这里转成时间升序（最旧在前）。 */
export function normalizeUserInputIndexPage(items: UserInputIndexSourceItem[]): UserInputIndexEntry[] {
  return items
    .map((item) => {
      const ts = normalizeTimestampToNs(item.timestamp ?? 0);
      return {
        id: ts > 0 ? `user-input-${ts}` : (item.id ?? ''),
        timestamp: ts,
        content: item.content ?? '',
        truncated: !!item.truncated,
      };
    })
    .reverse();
}

/** 翻页加载更早的一页：pageEntries 是更旧的一段，拼在当前列表前面。 */
export function mergeLoadedUserInputIndexEntries(
  currentEntries: UserInputIndexEntry[],
  pageEntries: UserInputIndexEntry[],
): UserInputIndexEntry[] {
  return [...pageEntries, ...currentEntries];
}

/** 合并已加载条目与实时流里的用户消息（去重，实时消息追加在末尾）。 */
export function mergeUserInputIndexEntries(
  entries: UserInputIndexEntry[],
  liveMessages: ChatMessage[],
): UserInputIndexEntry[] {
  const seen = new Set<string>();
  const unique: UserInputIndexEntry[] = [];
  for (const entry of entries) {
    if (!entry.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    unique.push(entry);
  }

  const tail: UserInputIndexEntry[] = [];
  for (const message of liveMessages) {
    if (message.kind !== 'user') continue;
    if (!message.id || seen.has(message.id)) continue;
    seen.add(message.id);
    tail.push({
      id: message.id,
      timestamp: normalizeTimestampToNs(message.time ?? 0),
      content: message.text ?? '',
      truncated: false,
    });
  }

  return [...unique, ...tail];
}

/** 把条目均匀分桶成最多 maxDots 个点。 */
export function getUserInputIndexDots(entries: UserInputIndexEntry[], maxDots: number): UserInputIndexDot[] {
  if (entries.length === 0 || maxDots <= 0) return [];
  const dotCount = Math.min(entries.length, maxDots);
  return Array.from({ length: dotCount }, (_, dotIndex) => {
    const startIndex = Math.floor((dotIndex * entries.length) / dotCount);
    const endIndex = Math.floor(((dotIndex + 1) * entries.length) / dotCount) - 1;
    return {
      key: entries[startIndex]?.id ?? `dot-${dotIndex}`,
      startIndex,
      endIndex: Math.max(startIndex, endIndex),
    };
  });
}

/** 当前条目落在第几个点（无命中返回 null）。 */
export function getDotIndexForEntryId(
  entries: UserInputIndexEntry[],
  entryId: string | null,
  maxDots: number,
): number | null {
  if (!entryId) return null;
  const entryIndex = entries.findIndex((entry) => entry.id === entryId);
  if (entryIndex === -1) return null;
  const dots = getUserInputIndexDots(entries, maxDots);
  const dotIndex = dots.findIndex((dot) => entryIndex >= dot.startIndex && entryIndex <= dot.endIndex);
  return dotIndex === -1 ? null : dotIndex;
}
