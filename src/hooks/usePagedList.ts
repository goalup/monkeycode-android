/**
 * 服务端分页通用 hook。
 *
 * 移动端列表统一走「焦点刷新 + 下拉刷新 + 加载更多」。这里把重复的
 * 分页、加载态、错误态、去重合并收拢，避免每个页面各写一套。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PagedResult<T> {
  items: T[];
  hasMore: boolean;
}

export interface UsePagedListOptions<T> {
  /** 拉取一页；page 从 1 开始。 */
  fetchPage: (page: number) => Promise<PagedResult<T>>;
  /** 是否立即加载。默认 true。 */
  enabled?: boolean;
  /** 取唯一键用于去重合并。默认取 item.id。 */
  keyOf?: (item: T) => string;
}

export interface UsePagedListState<T> {
  items: T[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** 本地覆盖列表（乐观更新后调用）。 */
  setItems: (next: T[] | ((prev: T[]) => T[])) => void;
  /** 重置到第一页。 */
  reset: () => void;
}

export function usePagedList<T>(opts: UsePagedListOptions<T>): UsePagedListState<T> {
  const { fetchPage, enabled = true } = opts;
  const keyOfRef = useRef(
    opts.keyOf ?? ((item: T) => String((item as { id?: string }).id ?? '')),
  );
  keyOfRef.current = opts.keyOf ?? keyOfRef.current;

  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fetchPage 每次渲染都会变，用 ref 保存最新实现，避免 effect 反复触发。
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  // 请求序号守卫：切页/刷新/卸载后丢弃过期响应。
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      seqRef.current += 1;
    };
  }, []);

  const load = useCallback(async (targetPage: number, mode: 'initial' | 'refresh' | 'more') => {
    const seq = ++seqRef.current;
    if (mode === 'refresh') setRefreshing(true);
    else if (mode === 'more') setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetchRef.current(targetPage);
      if (!mountedRef.current || seq !== seqRef.current) return;
      setItems((prev) => {
        if (mode === 'more') {
          const keyOf = keyOfRef.current;
          const seen = new Set(prev.map(keyOf));
          return [...prev, ...res.items.filter((it) => !seen.has(keyOf(it)))];
        }
        return res.items;
      });
      setPage(targetPage);
      setHasMore(res.hasMore);
    } catch (e) {
      if (!mountedRef.current || seq !== seqRef.current) return;
      setError((e as Error)?.message || '加载失败');
      if (mode !== 'more') setHasMore(false);
    } finally {
      if (mountedRef.current && seq === seqRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, []);

  const reload = useCallback(async () => {
    await load(1, 'initial');
  }, [load]);

  const refresh = useCallback(async () => {
    await load(1, 'refresh');
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    await load(page + 1, 'more');
  }, [load, loadingMore, loading, hasMore, page]);

  const reset = useCallback(() => {
    seqRef.current += 1;
    setItems([]);
    setPage(1);
    setHasMore(true);
    setError(null);
    setLoading(true);
    setLoadingMore(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load(1, 'initial');
    // 依赖只取 enabled：fetchPage 通过 ref 取最新值。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    items,
    page,
    hasMore,
    loading,
    loadingMore,
    refreshing,
    error,
    reload,
    refresh,
    loadMore,
    setItems,
    reset,
  };
}
