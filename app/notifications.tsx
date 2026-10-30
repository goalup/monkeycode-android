/**
 * 通知中心。
 *
 * 列表来自 /api/v1/users/notifications，点击条目跳转到对应任务；
 * 支持单条已读与全部已读。后端按 occurred_at 倒序返回，未读以 ref_id 回执标记。
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import { listNotifications, markAllNotificationsRead, markNotificationsRead } from '@/api/notify';
import type { NotificationItem } from '@/api/types';
import { Icons } from '@/components/Icons';
import { EmptyView, GlassNav, LoadingView, Toast } from '@/components/ui';
import { fontSize, radius, spacing, useTheme } from '@/theme';

const FILTERS: { key: 'all' | 'task' | 'schedule' | 'unread'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'task', label: '任务' },
  { key: 'schedule', label: '计划' },
];

const LEVEL_TONE: Record<string, 'red' | 'amber' | 'ac'> = {
  error: 'red',
  warn: 'amber',
  warning: 'amber',
  info: 'ac',
};

const KIND_ICON: Record<string, string> = {
  task: 'tasks',
  vm: 'server',
  quota: 'crown',
  drive: 'folder',
};

function relativeTime(sec?: number): string {
  if (!sec) return '';
  const diff = Date.now() / 1000 - sec;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NotificationsScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<'all' | 'task' | 'schedule' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async (mode: 'init' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const resp = await listNotifications({ limit: 100 });
      setItems(resp.data?.items ?? []);
      setUnread(resp.data?.unread_count ?? 0);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load('init');
    }, [load]),
  );

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(id);
  }, [toast]);

  const visible = items.filter((i) =>
    filter === 'all' ? true : filter === 'unread' ? !i.read : i.kind === filter,
  );

  const onPressItem = useCallback(
    async (item: NotificationItem) => {
      if (!item.read) {
        setItems((prev) =>
          prev.map((i) => (i.ref_id === item.ref_id ? { ...i, read: true } : i)),
        );
        setUnread((n) => Math.max(0, n - 1));
        markNotificationsRead([item.ref_id]).catch(() => undefined);
      }
      if (item.task_id) router.push(`/task/${item.task_id}`);
    },
    [router],
  );

  const onReadAll = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setUnread(0);
      setToast('已全部标为已读');
    } catch (e) {
      setToast(errorMessage(e));
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GlassNav
        title="通知"
        onBack={() => router.back()}
        right={
          unread > 0 ? (
            <Pressable onPress={onReadAll} hitSlop={8} style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: t.ac, fontSize: fontSize.sm, fontWeight: '600' }}>全部已读</Text>
            </Pressable>
          ) : undefined
        }
      />
      <View style={{ height: insets.top + 52 }} />
      {!loading && !error && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: spacing.pad, paddingBottom: 10 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  backgroundColor: active ? t.ac : t.bg3,
                }}
              >
                <Text style={{ color: active ? t.acInk : t.tx2, fontSize: fontSize.sm, fontWeight: '600' }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {loading ? (
        <LoadingView label="加载通知" />
      ) : error ? (
        <EmptyView title="加载失败" subtitle={error} icon="alert" />
      ) : visible.length === 0 ? (
        <EmptyView
          title="暂无通知"
          subtitle={filter === 'all' ? '任务完成、失败、额度变化时会在这里提醒' : '当前筛选下没有通知'}
          icon="info"
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(i) => i.ref_id}
          contentContainerStyle={{ padding: spacing.pad, paddingBottom: insets.bottom + 32, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={t.tx3} />
          }
          renderItem={({ item }) => {
            const tone = LEVEL_TONE[item.level] ?? 'ac';
            const toneColor = tone === 'red' ? t.red : tone === 'amber' ? t.amber : t.ac;
            const toneBg = tone === 'red' ? t.redGhost : tone === 'amber' ? t.amberGhost : t.acGhost;
            const icon = KIND_ICON[item.kind] ?? 'info';
            const I = Icons[icon];
            return (
              <Pressable
                onPress={() => void onPressItem(item)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: t.bg2,
                    borderColor: item.read ? t.line : t.acLine,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={[styles.iconWrap, { backgroundColor: toneBg }]}>
                    {I ? <I size={17} color={toneColor} sw={1.9} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1, color: t.tx, fontSize: fontSize.md, fontWeight: item.read ? '600' : '700' }}
                      >
                        {item.title}
                      </Text>
                      {!item.read && (
                        <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: t.ac }} />
                      )}
                    </View>
                    {!!item.content && (
                      <Text numberOfLines={2} style={{ color: t.tx2, fontSize: fontSize.sm, marginTop: 4 }}>
                        {item.content}
                      </Text>
                    )}
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 6 }}>
                      {relativeTime(item.occurred_at)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      {!!toast && <Toast text={toast} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
