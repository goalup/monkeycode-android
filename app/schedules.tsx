/**
 * 定时任务。
 *
 * 后端不支持在此页面直接新建（定时项随任务创建时提交 extra），
 * 因此这里只做：总览统计、启停、改提示词/间隔、立即执行、查看执行历史、删除。
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import {
  deleteSchedule,
  listScheduleRuns,
  listSchedules,
  runScheduleNow,
  setScheduleEnabled,
  updateSchedule,
} from '@/api/schedule';
import type { TaskSchedule, TaskScheduleRun } from '@/api/types';
import { Icons } from '@/components/Icons';
import { EmptyView, GlassNav, LoadingView, PrimaryButton, Scrim, Toast } from '@/components/ui';
import { usePagedList } from '@/hooks/usePagedList';
import { fontSize, radius, spacing, useTheme } from '@/theme';

const PAGE_SIZE = 20;

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'enabled', label: '运行中' },
  { key: 'disabled', label: '已暂停' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function fmtTime(s?: string): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtInterval(sec?: number): string {
  if (!sec || sec <= 0) return '未设置';
  if (sec % 86400 === 0) return `每 ${sec / 86400} 天`;
  if (sec % 3600 === 0) return `每 ${sec / 3600} 小时`;
  if (sec % 60 === 0) return `每 ${sec / 60} 分钟`;
  return `每 ${sec} 秒`;
}

const RUN_TONE: Record<string, { label: string; tone: 'ac' | 'red' | 'amber' }> = {
  success: { label: '成功', tone: 'ac' },
  failed: { label: '失败', tone: 'red' },
  skipped: { label: '跳过', tone: 'amber' },
};

export default function SchedulesScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [summary, setSummary] = useState<NonNullable<Awaited<ReturnType<typeof listSchedules>>['data']>['summary']>();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [toast, setToast] = useState('');
  const [busyId, setBusyId] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TaskSchedule | null>(null);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftInterval, setDraftInterval] = useState('');
  const [saving, setSaving] = useState(false);

  const [runsOpen, setRunsOpen] = useState(false);
  const [runs, setRuns] = useState<TaskScheduleRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsTitle, setRunsTitle] = useState('');

  const load = usePagedList<TaskSchedule>({
    fetchPage: async (page) => {
      const resp = await listSchedules({ page, size: PAGE_SIZE, status: filter === 'all' ? undefined : filter });
      setSummary(resp.data?.summary);
      return {
        items: resp.data?.items ?? [],
        // 后端用 page_info.has_next_page 表示还有下一页（总量足够时才返回该字段）。
        hasMore: !!resp.data?.page_info?.has_next_page,
      };
    },
  });
  const { items, loading, refreshing, error, reload, refresh, loadMore, loadingMore, setItems } = load;

  // usePagedList 在挂载时自动拉第一页；这里只在「从其它页返回」时刷新，避免首屏重复请求，
  // 也避免每次聚焦都把列表切成 loading 骨架。
  const firstFocusRef = React.useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      void refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // 切换筛选：重载第一页。
  const prevFilterRef = React.useRef(filter);
  React.useEffect(() => {
    if (prevFilterRef.current === filter) return;
    prevFilterRef.current = filter;
    void reload();
  }, [filter, reload]);

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(id);
  }, [toast]);

  const toggle = useCallback(async (item: TaskSchedule, next: boolean) => {
    setBusyId(item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, enabled: next } : i)));
    try {
      await setScheduleEnabled(item.id, next);
      setToast(next ? '已启用' : '已暂停');
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, enabled: !next } : i)));
      setToast(errorMessage(e));
    } finally {
      setBusyId('');
    }
  }, [setItems]);

  const runNow = useCallback(async (item: TaskSchedule) => {
    setBusyId(item.id);
    try {
      await runScheduleNow(item.id);
      setToast('已触发执行');
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setBusyId('');
    }
  }, []);

  const openEditor = useCallback((item: TaskSchedule) => {
    setEditing(item);
    setDraftPrompt(item.prompt ?? '');
    setDraftInterval(item.interval_seconds ? String(item.interval_seconds) : '');
    setEditorOpen(true);
  }, []);

  const saveEditor = useCallback(async () => {
    if (!editing || saving) return;
    const sec = draftInterval.trim() ? Number(draftInterval.trim()) : undefined;
    if (sec !== undefined && (!Number.isFinite(sec) || sec <= 0)) {
      setToast('间隔需为正整数秒');
      return;
    }
    setSaving(true);
    try {
      const resp = await updateSchedule(editing.id, {
        prompt: draftPrompt.trim() || undefined,
        interval_seconds: sec,
      });
      const next = resp.data;
      if (next) {
        setItems((prev) => prev.map((i) => (i.id === editing.id ? { ...i, ...next } : i)));
      }
      setToast('已保存');
      setEditorOpen(false);
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [editing, saving, draftPrompt, draftInterval, setItems]);

  const openRuns = useCallback(async (item: TaskSchedule) => {
    setRunsTitle(item.task_title || item.prompt?.slice(0, 20) || '执行历史');
    setRunsOpen(true);
    setRunsLoading(true);
    setRuns([]);
    try {
      const resp = await listScheduleRuns(item.id, 30);
      setRuns(resp.data ?? []);
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const remove = useCallback((item: TaskSchedule) => {
    Alert.alert('删除定时任务', '删除后该任务不再自动执行，确定删除？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSchedule(item.id);
            setItems((prev) => prev.filter((i) => i.id !== item.id));
            setToast('已删除');
          } catch (e) {
            setToast(errorMessage(e));
          }
        },
      },
    ]);
  }, [setItems]);

  const stats = useMemo(
    () => [
      { label: '全部', value: summary?.total ?? 0, tone: 'tx' as const },
      { label: '运行中', value: summary?.enabled ?? 0, tone: 'ac' as const },
      { label: '已暂停', value: summary?.disabled ?? 0, tone: 'tx2' as const },
      { label: '7 天失败', value: summary?.failed_7d ?? 0, tone: 'red' as const },
    ],
    [summary],
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GlassNav title="定时任务" onBack={() => router.back()} />
      <View style={{ height: insets.top + 52 }} />

      {loading ? (
        <LoadingView label="加载定时任务" />
      ) : error ? (
        <EmptyView title="加载失败" subtitle={error} icon="alert" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.pad, paddingBottom: insets.bottom + 32, gap: 10 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={t.tx3}
            />
          }
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={t.tx3} />
              </View>
            ) : null
          }
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 4 }}>
              <View style={[styles.summaryCard, { backgroundColor: t.bg2, borderColor: t.line }]}>
                {stats.map((s) => (
                  <View key={s.label} style={{ flex: 1, alignItems: 'center' }}>
                    <Text
                      style={{
                        fontSize: fontSize.xl,
                        fontWeight: '800',
                        color: s.tone === 'ac' ? t.ac : s.tone === 'red' ? t.red : s.tone === 'tx2' ? t.tx2 : t.tx,
                      }}
                    >
                      {s.value}
                    </Text>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 2 }}>{s.label}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                {FILTERS.map((f) => {
                  const on = filter === f.key;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => setFilter(f.key)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: on ? t.acGhost : t.bg2,
                          borderColor: on ? t.acLine : t.line,
                        },
                      ]}
                    >
                      <Text style={{ color: on ? t.acTx : t.tx2, fontSize: fontSize.sm, fontWeight: '600' }}>
                        {f.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyView
              title="暂无定时任务"
              subtitle="在任务对话中让 AI 创建定时唤醒或周期任务后，会显示在这里"
              icon="clock"
            />
          }
          renderItem={({ item }) => {
            const run = item.last_run;
            const tone = run?.status ? RUN_TONE[run.status] : undefined;
            return (
              <Pressable
                onPress={() => openEditor(item)}
                style={[styles.card, { backgroundColor: t.bg2, borderColor: t.line }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: t.tx, fontSize: fontSize.md, fontWeight: '700' }}>
                      {item.task_title || item.prompt || '未命名任务'}
                    </Text>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 3 }}>
                      {fmtInterval(item.interval_seconds)} · 下次 {fmtTime(item.next_run_at)}
                    </Text>
                  </View>
                  <Switch
                    value={!!item.enabled}
                    onValueChange={(v) => void toggle(item, v)}
                    disabled={busyId === item.id}
                  />
                </View>

                {!!item.prompt && (
                  <Text numberOfLines={2} style={{ color: t.tx2, fontSize: fontSize.sm, marginTop: 8 }}>
                    {item.prompt}
                  </Text>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  {tone && (
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor:
                            tone.tone === 'red' ? t.redGhost : tone.tone === 'amber' ? t.amberGhost : t.acGhost,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: tone.tone === 'red' ? t.red : tone.tone === 'amber' ? t.amber : t.acTx,
                          fontSize: fontSize.xs,
                        }}
                      >
                        上次{tone.label} · {fmtTime(item.last_run_at)}
                      </Text>
                    </View>
                  )}
                  {(item.fail_count ?? 0) > 0 && (
                    <View style={[styles.badge, { backgroundColor: t.redGhost }]}>
                      <Text style={{ color: t.red, fontSize: fontSize.xs }}>连败 {item.fail_count}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => void openRuns(item)} hitSlop={6} style={{ padding: 4 }}>
                    <Icons.clock size={16} color={t.tx3} sw={1.8} />
                  </Pressable>
                  <Pressable
                    onPress={() => void runNow(item)}
                    hitSlop={6}
                    disabled={busyId === item.id}
                    style={{ padding: 4 }}
                  >
                    <Icons.play size={16} color={t.tx3} sw={1.8} />
                  </Pressable>
                  <Pressable onPress={() => remove(item)} hitSlop={6} style={{ padding: 4 }}>
                    <Icons.trash size={16} color={t.tx3} sw={1.8} />
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* 编辑 */}
      <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => setEditorOpen(false)} statusBarTranslucent>
        <Scrim onPress={() => setEditorOpen(false)} />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '86%',
            backgroundColor: t.bg2,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <View style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: t.line2, alignSelf: 'center', marginTop: 10 }} />
          <Text style={{ paddingHorizontal: 20, paddingTop: 14, fontSize: 17, fontWeight: '700', color: t.tx }}>
            编辑定时任务
          </Text>
          <ScrollView contentContainerStyle={{ padding: spacing.pad, gap: 14 }} keyboardShouldPersistTaps="handled">
            <View>
              <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginBottom: 6 }}>提示词</Text>
              <TextInput
                value={draftPrompt}
                onChangeText={setDraftPrompt}
                multiline
                placeholder="每次执行时发给 Agent 的指令"
                placeholderTextColor={t.tx3}
                style={[styles.textarea, { color: t.tx, backgroundColor: t.bg3, borderColor: t.line }]}
              />
            </View>
            <View>
              <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginBottom: 6 }}>执行间隔（秒）</Text>
              <TextInput
                value={draftInterval}
                onChangeText={setDraftInterval}
                keyboardType="number-pad"
                placeholder="例如 3600"
                placeholderTextColor={t.tx3}
                style={[styles.input, { color: t.tx, backgroundColor: t.bg3, borderColor: t.line }]}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {[600, 1800, 3600, 21600, 86400].map((sec) => (
                  <Pressable
                    key={sec}
                    onPress={() => setDraftInterval(String(sec))}
                    style={[styles.preset, { backgroundColor: t.bg3 }]}
                  >
                    <Text style={{ color: t.tx2, fontSize: fontSize.xs }}>{fmtInterval(sec).replace('每 ', '')}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <PrimaryButton
              label={saving ? '保存中' : '保存'}
              icon="check"
              block
              onPress={saveEditor}
              disabled={saving}
            />
          </ScrollView>
        </View>
      </Modal>

      {/* 执行历史 */}
      <Modal visible={runsOpen} transparent animationType="slide" onRequestClose={() => setRunsOpen(false)} statusBarTranslucent>
        <Scrim onPress={() => setRunsOpen(false)} />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '80%',
            backgroundColor: t.bg2,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingBottom: insets.bottom + 12,
          }}
        >
          <View style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: t.line2, alignSelf: 'center', marginTop: 10 }} />
          <Text numberOfLines={1} style={{ paddingHorizontal: 20, paddingTop: 14, fontSize: 17, fontWeight: '700', color: t.tx }}>
            执行历史 · {runsTitle}
          </Text>
          {runsLoading ? (
            <View style={{ paddingVertical: 40 }}>
              <LoadingView label="加载历史" />
            </View>
          ) : runs.length === 0 ? (
            <View style={{ paddingVertical: 40 }}>
              <EmptyView title="暂无执行记录" icon="clock" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: spacing.pad, gap: 8 }}>
              {runs.map((r, idx) => {
                const tone = r.status ? RUN_TONE[r.status] : undefined;
                const color = tone?.tone === 'red' ? t.red : tone?.tone === 'amber' ? t.amber : t.ac;
                const bg = tone?.tone === 'red' ? t.redGhost : tone?.tone === 'amber' ? t.amberGhost : t.acGhost;
                return (
                  <View
                    key={r.id ?? String(idx)}
                    style={[styles.runRow, { backgroundColor: t.bg3, borderColor: t.line }]}
                  >
                    <View style={[styles.badge, { backgroundColor: bg }]}>
                      <Text style={{ color, fontSize: fontSize.xs }}>{tone?.label ?? r.status ?? '未知'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: t.tx2, fontSize: fontSize.sm }}>{fmtTime(r.started_at)}</Text>
                      {!!r.error && (
                        <Text numberOfLines={2} style={{ color: t.red, fontSize: fontSize.xs, marginTop: 2 }}>
                          {r.error}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>

      {!!toast && <Toast text={toast} />}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  preset: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
  },
  textarea: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 110,
    fontSize: fontSize.md,
    textAlignVertical: 'top',
  },
});
