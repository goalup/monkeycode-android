/**
 * 任务详情底部面板：用量、时间线、排队消息、工作区快照。
 *
 * 统一用全屏 Modal + GlassNav 承载，避免在会话页塞入过多内联区块。
 */
import React from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Icons } from '@/components/Icons';
import { EmptyView, LoadingView, Pill, PrimaryButton, Toast } from '@/components/ui';
import { errorMessage } from '@/api/errors';
import { getTaskTimeline, getTaskUsage } from '@/api/usage';
import {
  listQueuedInputs,
  submitQueuedInput,
  updateQueuedInputDelivery,
  withdrawQueuedInput,
} from '@/api/queue';
import { getWorkspaceSnapshot, listWorkspaceSnapshotVersions } from '@/api/snapshot';
import {
  getSubagentUsage,
  getTaskSubagents,
  setTaskSubagents,
  type SubagentUsageResp,
  type TaskSubagentConfig,
} from '@/api/skill';
import type {
  QueuedInput,
  QueuedInputDelivery,
  QueuedInputSnapshot,
  TaskTimelineTurn,
  TaskUsage,
  TaskModelFailure,
  WorkspaceSnapshot,
  WorkspaceSnapshotVersion,
} from '@/api/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontSize, radius, spacing, useTheme, type Theme } from '@/theme';

/* ------------------------------ 通用容器 ------------------------------ */

export function PanelShell({
  title,
  onClose,
  children,
  right,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={[styles.shellHead, { borderBottomColor: t.line }]}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.shellBack}>
          <Icons.back size={22} color={t.tx} />
        </Pressable>
        <Text style={{ color: t.tx, fontSize: fontSize.lg, fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/* ------------------------------ 用量面板 ------------------------------ */

function fmtTokens(n?: number): string {
  if (!n || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** RFC3339 -> MM-DD HH:mm */
function fmtIso(v?: string): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 纳秒时间戳 -> HH:mm:ss */
function fmtNanoTime(ns?: number): string {
  if (!ns || ns <= 0) return '';
  const d = new Date(Math.floor(ns / 1e6));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtMs(ms?: number): string {
  if (!ms || ms <= 0) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function UsagePanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const t = useTheme();
  const [usage, setUsage] = React.useState<TaskUsage | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await getTaskUsage(taskId);
        if (alive) setUsage(resp.data ?? null);
      } catch (e) {
        if (alive) setError(errorMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [taskId]);

  const tk = usage?.tokens;
  const rows: { label: string; value: string }[] = [
    { label: '输入（未缓存）', value: fmtTokens(tk?.input_uncached) },
    { label: '缓存读取', value: fmtTokens(tk?.cache_read) },
    { label: '缓存写入', value: fmtTokens(tk?.cache_write) },
    { label: '输出', value: fmtTokens(tk?.output) },
    { label: '推理', value: fmtTokens(tk?.reasoning) },
    { label: '合计', value: fmtTokens(tk?.total) },
  ];
  const stats: { label: string; value: string }[] = [
    { label: '轮次', value: String(usage?.rounds ?? 0) },
    { label: '步骤', value: String(usage?.steps ?? 0) },
    { label: '请求数', value: String(usage?.requests ?? 0) },
    { label: '缓存命中', value: `${((usage?.cache_hit_rate ?? 0) * 100).toFixed(1)}%` },
    { label: '首字延迟', value: fmtMs(usage?.ttft_ms) },
    { label: '模型耗时', value: fmtMs(usage?.model_time_ms) },
    { label: '工具耗时', value: fmtMs(usage?.tool_time_ms) },
    { label: '吞吐', value: usage?.tps ? `${usage.tps.toFixed(1)} t/s` : '—' },
  ];

  return (
    <PanelShell title="用量统计" onClose={onClose}>
      {loading ? (
        <LoadingView label="加载用量" />
      ) : error ? (
        <EmptyView title="加载失败" subtitle={error} icon="alert" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.pad, paddingBottom: 48 }}>
          <View style={[styles.heroCard, { backgroundColor: t.acGhost, borderColor: t.acLine }]}>
            <Text style={{ color: t.acTx, fontSize: fontSize.sm }}>总 Token</Text>
            <Text style={{ color: t.tx, fontSize: 34, fontWeight: '800', marginTop: 4 }}>
              {fmtTokens(tk?.total)}
            </Text>
            <Text style={{ color: t.tx3, fontSize: fontSize.sm, marginTop: 4 }}>
              缓存命中 {(usage?.cache_hit_rate ?? 0) * 100 > 0 ? ((usage?.cache_hit_rate ?? 0) * 100).toFixed(1) : '0'}%
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: t.tx }]}>Token 分项</Text>
          <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.line }]}>
            {rows.map((r, i) => (
              <View
                key={r.label}
                style={[
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line2 },
                ]}
              >
                <Text style={{ color: t.tx2, fontSize: fontSize.md }}>{r.label}</Text>
                <Text style={{ color: t.tx, fontSize: fontSize.md, fontWeight: '600' }}>{r.value}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { color: t.tx }]}>运行指标</Text>
          <View style={styles.grid}>
            {stats.map((s) => (
              <View
                key={s.label}
                style={[styles.gridItem, { backgroundColor: t.bg2, borderColor: t.line }]}
              >
                <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>{s.label}</Text>
                <Text style={{ color: t.tx, fontSize: fontSize.lg, fontWeight: '700', marginTop: 4 }}>
                  {s.value}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </PanelShell>
  );
}

/* ------------------------------ 子代理 ------------------------------ */

const TIER_LABEL: Record<string, string> = {
  inherit: '继承主模型',
  basic: '基础',
  standard: '标准',
  strong: '增强',
  ultra: '极强',
};

/**
 * 子代理面板：展示每个预置子 agent 的生效模型/档位与用量归因。
 *
 * 后端只有在任务运行中（OpenCode 会话已建立）才接受改写，
 * 因此这里以只读展示为主，开关失败会把后端 message 直接透出。
 */
export function SubagentPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const t = useTheme();
  const [items, setItems] = React.useState<TaskSubagentConfig[]>([]);
  const [usage, setUsage] = React.useState<SubagentUsageResp | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState('');
  const [busy, setBusy] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      const [cfg, usageResp] = await Promise.all([
        getTaskSubagents(taskId),
        getSubagentUsage(taskId).catch(() => null),
      ]);
      setItems(cfg.data?.subagents ?? []);
      setUsage(usageResp?.data ?? null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const usageOf = React.useCallback(
    (name: string) => usage?.subagents?.find((u) => u.name === name),
    [usage],
  );

  const toggle = React.useCallback(
    async (item: TaskSubagentConfig, next: boolean) => {
      setBusy(item.name);
      try {
        const resp = await setTaskSubagents(
          taskId,
          items.map((i) => ({
            name: i.name,
            enabled: i.name === item.name ? next : i.enabled,
            tier_override: i.tier_override || undefined,
            model_id: i.model?.id ?? null,
          })),
        );
        if (resp.data?.success === false) {
          setToast(resp.data?.message || '后端拒绝该变更');
        } else {
          setItems((prev) => prev.map((i) => (i.name === item.name ? { ...i, enabled: next } : i)));
          setToast(next ? '已启用' : '已停用');
        }
      } catch (e) {
        setToast(errorMessage(e));
      } finally {
        setBusy('');
      }
    },
    [items, taskId],
  );

  const total = usage?.total;

  return (
    <PanelShell title="子代理" onClose={onClose}>
      {loading ? (
        <LoadingView label="加载子代理" />
      ) : error ? (
        <EmptyView title="加载失败" subtitle={error} icon="alert" />
      ) : items.length === 0 ? (
        <EmptyView title="该任务没有子代理" subtitle="当前 CLI 或模型不支持子代理" icon="sparkle" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.pad, paddingBottom: 48 }}>
          {total && (
            <View style={[styles.heroCard, { backgroundColor: t.acGhost, borderColor: t.acLine }]}>
              <Text style={{ color: t.acTx, fontSize: fontSize.sm }}>子代理总用量</Text>
              <Text style={{ color: t.tx, fontSize: 30, fontWeight: '800', marginTop: 4 }}>
                {fmtTokens(total.total_tokens)}
              </Text>
              <Text style={{ color: t.tx3, fontSize: fontSize.sm, marginTop: 4 }}>
                {total.requests ?? 0} 次请求 · 输出 {fmtTokens(total.output_tokens)}
              </Text>
            </View>
          )}

          {items.map((item) => {
            const u = usageOf(item.name);
            return (
              <View key={item.name} style={[styles.turnCard, { backgroundColor: t.bg2, borderColor: t.line }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: t.tx, fontSize: fontSize.md, fontWeight: '700' }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={2}>
                      {item.description}
                    </Text>
                  </View>
                  <Switch
                    value={!!item.enabled}
                    disabled={busy === item.name}
                    onValueChange={(v) => void toggle(item, v)}
                  />
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  <View style={[styles.chipSm, { backgroundColor: t.bg3 }]}>
                    <Text style={{ color: t.tx2, fontSize: fontSize.xs }}>
                      {TIER_LABEL[item.tier ?? ''] ?? item.tier ?? '—'}
                    </Text>
                  </View>
                  {item.read_only && (
                    <View style={[styles.chipSm, { backgroundColor: t.bg3 }]}>
                      <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>只读</Text>
                    </View>
                  )}
                  {item.model?.model && (
                    <View style={[styles.chipSm, { backgroundColor: t.bg3 }]}>
                      <Text style={{ color: t.tx2, fontSize: fontSize.xs }} numberOfLines={1}>
                        {item.model.model}
                      </Text>
                    </View>
                  )}
                  {item.fallback && (
                    <View style={[styles.chipSm, { backgroundColor: t.amberGhost }]}>
                      <Text style={{ color: t.amber, fontSize: fontSize.xs }}>已回退主模型</Text>
                    </View>
                  )}
                </View>

                {u && (
                  <View style={{ flexDirection: 'row', marginTop: 10, gap: 14 }}>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>
                      输入 {fmtTokens(u.input_tokens)}
                    </Text>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>
                      缓存 {fmtTokens(u.cached_tokens)}
                    </Text>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>
                      输出 {fmtTokens(u.output_tokens)}
                    </Text>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>{u.requests ?? 0} 次</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
      {!!toast && <Toast text={toast} />}
    </PanelShell>
  );
}

/* ------------------------------ 时间线 ------------------------------ */

export function TimelinePanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const t = useTheme();
  const [turns, setTurns] = React.useState<TaskTimelineTurn[]>([]);
  const [failures, setFailures] = React.useState<TaskModelFailure[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await getTaskTimeline(taskId);
        if (alive) {
          setTurns(resp.data?.turns ?? []);
          setFailures(resp.data?.model_failures ?? []);
        }
      } catch (e) {
        if (alive) setError(errorMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [taskId]);

  return (
    <PanelShell title="执行时间线" onClose={onClose}>
      {loading ? (
        <LoadingView label="加载时间线" />
      ) : error ? (
        <EmptyView title="加载失败" subtitle={error} icon="alert" />
      ) : turns.length === 0 && failures.length === 0 ? (
        <EmptyView title="暂无执行记录" subtitle="任务开始后这里会显示每轮耗时" icon="clock" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.pad, paddingBottom: 48 }}>
          {failures.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: t.tx, marginTop: 0 }]}>
                模型失败（{failures.length}）
              </Text>
              <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.line, marginBottom: 14 }]}>
                {failures.map((f, i) => (
                  <View
                    key={`${f.at}-${i}`}
                    style={[
                      styles.row,
                      { alignItems: 'flex-start' },
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line2 },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: t.tx, fontSize: fontSize.sm, fontWeight: '600' }} numberOfLines={1}>
                        {f.model_name || f.provider || '未知模型'}
                      </Text>
                      <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={2}>
                        {[f.error_class, f.source].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>
                      {fmtNanoTime(f.at)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
          {turns.map((turn) => {
            const total = Math.max(turn.duration_ms || 0, 1);
            const pct = Math.min(100, Math.max(4, ((turn.context_used ?? 0) / Math.max(turn.context_size ?? 1, 1)) * 100));
            return (
              <View
                key={turn.turn_seq}
                style={[styles.turnCard, { backgroundColor: t.bg2, borderColor: t.line }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: t.tx, fontWeight: '700', fontSize: fontSize.md }}>
                    第 {turn.turn_seq} 轮
                  </Text>
                  <Pill
                    color={turn.status === 'completed' ? t.add : turn.exit_code ? t.red : t.tx2}
                    bg={turn.status === 'completed' ? t.addBg : turn.exit_code ? t.redGhost : t.bg3}
                  >
                    {turn.status || '未知'}
                  </Pill>
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: t.tx2, fontSize: fontSize.sm }}>
                    {(total / 1000).toFixed(1)}s
                  </Text>
                </View>
                {!!turn.message && (
                  <Text style={{ color: t.tx2, fontSize: fontSize.sm, marginTop: 6 }} numberOfLines={3}>
                    {turn.message}
                  </Text>
                )}
                <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
                  <Meta t={t} label="步骤" value={String(turn.steps ?? 0)} />
                  <Meta t={t} label="计划" value={String(turn.plans ?? 0)} />
                  <Meta
                    t={t}
                    label="上下文"
                    value={`${fmtTokens(turn.context_used)} / ${fmtTokens(turn.context_size)}`}
                  />
                </View>
                <View style={[styles.bar, { backgroundColor: t.track }]}>
                  <View
                    style={[styles.barFill, { width: `${pct}%`, backgroundColor: t.ac }]}
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </PanelShell>
  );
}

function Meta({ t, label, value }: { t: Theme; label: string; value: string }) {
  return (
    <View>
      <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>{label}</Text>
      <Text style={{ color: t.tx2, fontSize: fontSize.sm, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

/* ------------------------------ 排队消息 ------------------------------ */

const DELIVERY_LABEL: Record<QueuedInputDelivery, string> = {
  after_turn: '本轮结束后',
  immediate: '尽快发送',
  interrupt: '中断后发送',
};

const STATUS_LABEL: Record<string, string> = {
  queued: '等待中',
  dispatching: '派发中',
  dispatched: '已派发',
  failed: '失败',
  cancelled: '已取消',
};

export function QueuePanel({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const t = useTheme();
  const [items, setItems] = React.useState<QueuedInput[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [delivery, setDelivery] = React.useState<QueuedInputDelivery>('after_turn');
  const [toast, setToast] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const resp = await listQueuedInputs(taskId);
      setItems(resp.data?.items ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const applySnapshot = (snap?: QueuedInputSnapshot | null) => {
    if (snap?.items) setItems(snap.items);
    onChanged?.();
  };

  const handleWithdraw = async (item: QueuedInput) => {
    setBusy(item.id);
    try {
      const resp = await withdrawQueuedInput(taskId, item.id);
      applySnapshot(resp.data);
      setToast('已撤回');
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const handleDelivery = async (item: QueuedInput) => {
    const order: QueuedInputDelivery[] = ['after_turn', 'immediate', 'interrupt'];
    const idx = order.indexOf(item.delivery);
    const next = order[(idx + 1) % order.length];
    setBusy(item.id);
    try {
      const resp = await updateQueuedInputDelivery(taskId, item.id, next);
      applySnapshot(resp.data);
      setToast(`改为${DELIVERY_LABEL[next]}`);
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const handleSubmit = async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const resp = await submitQueuedInput(taskId, {
        content: text,
        delivery,
        client_request_id: `${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      applySnapshot(resp.data);
      setDraft('');
      setToast('已加入队列');
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PanelShell title={`排队消息${items.length ? ` (${items.length})` : ''}`} onClose={onClose}>
      {loading ? (
        <LoadingView label="加载队列" />
      ) : (
        <View style={{ flex: 1 }}>
          {error ? (
            <EmptyView title="加载失败" subtitle={error} icon="alert" />
          ) : items.length === 0 ? (
            <EmptyView title="队列为空" subtitle="本轮运行中也可以补充消息，会按顺序发送" icon="tasks" />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(it) => it.id}
              contentContainerStyle={{ padding: spacing.pad, paddingBottom: 24, gap: 10 }}
              renderItem={({ item }) => (
                <View style={[styles.queueCard, { backgroundColor: t.bg2, borderColor: t.line }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pill
                      color={item.status === 'failed' ? t.red : item.status === 'queued' ? t.ac : t.tx2}
                      bg={item.status === 'failed' ? t.redGhost : item.status === 'queued' ? t.acGhost : t.bg3}
                    >
                      {STATUS_LABEL[item.status] ?? item.status}
                    </Pill>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>#{item.seq}</Text>
                    <View style={{ flex: 1 }} />
                    <Pressable onPress={() => handleDelivery(item)} hitSlop={8} disabled={busy === item.id}>
                      <Text style={{ color: t.ac, fontSize: fontSize.xs }}>
                        {DELIVERY_LABEL[item.delivery]}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: t.tx, fontSize: fontSize.md, marginTop: 8 }} numberOfLines={6}>
                    {item.content}
                  </Text>
                  {!!item.last_error && (
                    <Text style={{ color: t.red, fontSize: fontSize.xs, marginTop: 6 }}>
                      {item.last_error}
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                    <Pressable
                      onPress={() => handleWithdraw(item)}
                      disabled={busy === item.id}
                      hitSlop={8}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Icons.trash size={14} color={t.red} />
                      <Text style={{ color: t.red, fontSize: fontSize.sm }}>撤回</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />
          )}

          <View
            style={[
              styles.composer,
              { backgroundColor: t.bg2, borderTopColor: t.line, paddingBottom: 20 },
            ]}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="补充一条消息，将在本轮结束后发送"
              placeholderTextColor={t.tx3}
              multiline
              style={[styles.input, { color: t.tx, backgroundColor: t.bg3, borderColor: t.line }]}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
              {(['after_turn', 'immediate', 'interrupt'] as QueuedInputDelivery[]).map((d) => (
                <Pressable key={d} onPress={() => setDelivery(d)}>
                  <Pill color={delivery === d ? t.ac : t.tx3} bg={delivery === d ? t.acGhost : t.bg3}>
                    {DELIVERY_LABEL[d]}
                  </Pill>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <PrimaryButton
                label={submitting ? '发送中' : '加入队列'}
                icon="send"
                onPress={handleSubmit}
                disabled={!draft.trim() || submitting}
              />
            </View>
          </View>
        </View>
      )}
      {!!toast && <Toast text={toast} />}
    </PanelShell>
  );
}

/* ------------------------------ 工作区快照 ------------------------------ */

export function SnapshotPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const t = useTheme();
  const [current, setCurrent] = React.useState<WorkspaceSnapshot | null>(null);
  const [versions, setVersions] = React.useState<WorkspaceSnapshotVersion[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [snap, vers] = await Promise.all([
          getWorkspaceSnapshot(taskId).catch(() => null),
          listWorkspaceSnapshotVersions(taskId).catch(() => null),
        ]);
        if (!alive) return;
        setCurrent(snap?.data ?? null);
        setVersions(Array.isArray(vers?.data) ? vers.data : []);
      } catch (e) {
        if (alive) setError(errorMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [taskId]);

  return (
    <PanelShell title="工作区快照" onClose={onClose}>
      {loading ? (
        <LoadingView label="加载快照" />
      ) : error ? (
        <EmptyView title="加载失败" subtitle={error} icon="alert" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.pad, paddingBottom: 48 }}>
          {current ? (
            <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.line, padding: 16 }]}>
              <Text style={{ color: t.tx2, fontSize: fontSize.sm }}>当前版本</Text>
              <Text style={{ color: t.tx, fontSize: fontSize.xxl, fontWeight: '800', marginTop: 4 }}>
                v{String(current.version ?? '—')}
              </Text>
              {!!current.branch && (
                <Text style={{ color: t.tx2, fontSize: fontSize.sm, marginTop: 6 }} numberOfLines={1}>
                  分支 {current.branch}
                </Text>
              )}
              {!!current.commit_hash && (
                <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={1}>
                  {current.commit_hash.slice(0, 12)}
                </Text>
              )}
              {!!current.updated_at && (
                <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 6 }}>
                  更新于 {fmtIso(current.updated_at)}
                </Text>
              )}
            </View>
          ) : (
            <EmptyView title="暂无快照" subtitle="任务运行或停止时会自动保存工作区快照" icon="cube" />
          )}

          {versions.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: t.tx }]}>历史版本</Text>
              <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.line }]}>
                {versions.map((v, i) => (
                  <View
                    key={String(v.version)}
                    style={[
                      styles.row,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line2 },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: t.tx, fontSize: fontSize.md, fontWeight: '600' }}>
                        v{v.version}
                      </Text>
                      <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={1}>
                        {[v.branch, v.commit_hash ? v.commit_hash.slice(0, 8) : '']
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </Text>
                    </View>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>
                      {fmtIso(v.created_at)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </PanelShell>
  );
}

/* ------------------------------ 样式 ------------------------------ */

const styles = StyleSheet.create({
  shellHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  shellBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  heroCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 10,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '47.5%',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  turnCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
  },
  bar: { height: 5, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  chipSm: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  queueCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.pad,
    paddingTop: 12,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    maxHeight: 110,
    fontSize: fontSize.md,
  },
});
