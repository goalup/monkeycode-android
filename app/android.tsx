/**
 * 安卓设备池（仅团队管理员）。
 *
 * 后端直接代理 android-runner：读取 15s 超时、写入 90s 超时（销毁是同步的）。
 * 页面职责：展示治理快照与实例/队列，强制回收实例，调整运行参数。
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
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
import {
  cancelAndroidRequest,
  destroyAndroidInstance,
  getAndroidConfig,
  getAndroidOverview,
  updateAndroidConfig,
} from '@/api/android';
import { errorMessage } from '@/api/errors';
import type { AndroidConfigMap, AndroidConfigPatch, AndroidInstance, AndroidOverview } from '@/api/types';
import { Icons } from '@/components/Icons';
import { EmptyView, GlassNav, LoadingView, PrimaryButton, Toast } from '@/components/ui';
import { fontSize, radius, spacing, useTheme } from '@/theme';

const STATE_TONE: Record<string, { label: string; color: 'ac' | 'amber' | 'red' | 'tx2' }> = {
  online: { label: '在线', color: 'ac' },
  creating: { label: '创建中', color: 'amber' },
  sleeping: { label: '休眠', color: 'tx2' },
  stopped: { label: '已停止', color: 'tx2' },
  destroying: { label: '销毁中', color: 'amber' },
  unknown: { label: '未知', color: 'red' },
};

/** runner 把布尔配置序列化成 "1"/"0" 字符串，这里统一判定。 */
function isTruthy(v?: string): boolean {
  if (v == null) return false;
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/** 占用者展示：优先 AI 命名，其次用户名，最后 holder。 */
function occupantLabel(entry: {
  display_name?: string;
  owner_name?: string;
  holder?: string;
  owner?: string;
}): string {
  const ai = (entry.display_name || '').trim();
  const owner = (entry.owner_name || '').trim();
  const holder = (entry.holder || '').trim();
  if (ai && owner && ai !== owner) return `${ai}（${owner}）`;
  return ai || owner || holder || (entry.owner || '').trim();
}

function fmtDuration(sec?: number | null): string {
  if (sec == null || sec < 0) return '—';
  const s = Math.floor(sec);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtTs(sec?: number): string {
  if (!sec) return '—';
  const d = new Date(sec * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AndroidPoolScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [overview, setOverview] = useState<AndroidOverview | null>(null);
  const [config, setConfig] = useState<AndroidConfigMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busyId, setBusyId] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const resp = await getAndroidOverview();
      const data = resp.data ?? null;
      setOverview(data);
      if (data?.can_manage) {
        const cfg = await getAndroidConfig().catch(() => null);
        const map = cfg?.data ?? {};
        setConfig(map);
        setDraft(map);
      }
      setError(data?.error || '');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const destroy = useCallback((inst: AndroidInstance) => {
    Alert.alert('强制回收设备', `将销毁设备 ${inst.device}，租约内的使用会被中断。确定继续？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '回收',
        style: 'destructive',
        onPress: async () => {
          setBusyId(inst.device);
          try {
            await destroyAndroidInstance(inst.device);
            setToast('已提交回收');
            void load();
          } catch (e) {
            setToast(errorMessage(e));
          } finally {
            setBusyId('');
          }
        },
      },
    ]);
  }, [load]);

  const cancelWaiter = useCallback(
    async (waiterId?: string) => {
      if (!waiterId) return;
      setBusyId(waiterId);
      try {
        await cancelAndroidRequest({ waiter_id: waiterId });
        setToast('已取消排队');
        void load();
      } catch (e) {
        setToast(errorMessage(e));
      } finally {
        setBusyId('');
      }
    },
    [load],
  );

  const setBool = useCallback(
    async (key: keyof AndroidConfigPatch, value: boolean) => {
      try {
        const resp = await updateAndroidConfig({ [key]: value } as AndroidConfigPatch);
        setConfig(resp.data ?? config);
        setDraft(resp.data ?? config);
        setToast('已保存');
      } catch (e) {
        setToast(errorMessage(e));
      }
    },
    [config],
  );

  const saveConfig = useCallback(async () => {
    if (saving) return;
    const patch: AndroidConfigPatch = {};
    const num = (k: string) => {
      const v = Number(draft[k]);
      return Number.isFinite(v) && v >= 0 ? v : undefined;
    };
    const lease = num('lease_ttl_seconds');
    if (lease !== undefined) patch.lease_ttl_seconds = lease;
    const hmin = num('hard_min');
    if (hmin !== undefined) patch.hard_min = hmin;
    const hmax = num('hard_max');
    if (hmax !== undefined) patch.hard_max = hmax;
    const sleep = num('sleep_after_idle_seconds');
    if (sleep !== undefined) patch.sleep_after_idle_seconds = sleep;
    const stop = num('stop_after_idle_seconds');
    if (stop !== undefined) patch.stop_after_idle_seconds = stop;

    setSaving(true);
    try {
      const resp = await updateAndroidConfig(patch);
      setConfig(resp.data ?? config);
      setDraft(resp.data ?? config);
      setToast('配置已保存');
      setShowConfig(false);
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [draft, saving, config]);

  const gov = overview?.governor;
  const instances = overview?.instances ?? [];
  const queue = overview?.queue ?? [];
  const alerts = overview?.alerts ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GlassNav
        title="安卓设备池"
        onBack={() => router.back()}
        right={
          overview?.can_manage ? (
            <Pressable onPress={() => setShowConfig((v) => !v)} hitSlop={8} style={{ paddingHorizontal: 12 }}>
              <Icons.server size={18} color={showConfig ? t.ac : t.tx2} sw={1.9} />
            </Pressable>
          ) : undefined
        }
      />
      <View style={{ height: insets.top + 52 }} />

      {loading ? (
        <LoadingView label="加载设备池" />
      ) : error && !overview ? (
        <EmptyView title="加载失败" subtitle={error} icon="alert" />
      ) : !overview?.enabled ? (
        <EmptyView title="设备池未启用" subtitle="当前环境没有开启安卓设备池" icon="server" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.pad, paddingBottom: insets.bottom + 32, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={t.tx3}
            />
          }
        >
          {!!overview.error && (
            <View style={[styles.notice, { backgroundColor: t.redGhost, borderColor: t.red }]}>
              <Text style={{ color: t.red, fontSize: fontSize.sm }}>{overview.error}</Text>
            </View>
          )}

          {gov && (
            <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.line }]}>
              <Text style={sectionTitle(t)}>并发治理</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                <Metric t={t} label="目标实例" value={String(gov.target ?? 0)} />
                <Metric t={t} label="生效实例" value={String(gov.effective ?? 0)} />
                <Metric t={t} label="上限" value={String(gov.hard_max ?? 0)} />
                <Metric t={t} label="下限" value={String(gov.hard_min ?? 0)} />
                <Metric t={t} label="按内存" value={String(gov.by_mem ?? 0)} />
                <Metric t={t} label="按 CPU" value={String(gov.by_cpu ?? 0)} />
                <Metric t={t} label="可用内存" value={`${gov.mem_available_mb ?? 0} MB`} />
                <Metric t={t} label="负载" value={(gov.loadavg ?? 0).toFixed(2)} />
              </View>
              {gov.cpu_brake_enabled && (
                <Text style={{ color: t.amber, fontSize: fontSize.xs, marginTop: 10 }}>
                  CPU 刹车已启用（阈值 {gov.cpu_brake ?? 0}%）
                </Text>
              )}
            </View>
          )}

          {alerts.length > 0 && (
            <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.line }]}>
              <Text style={sectionTitle(t)}>告警</Text>
              {alerts.map((a, idx) => (
                <View key={idx} style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <View
                    style={[
                      styles.dotBadge,
                      {
                        backgroundColor:
                          a.level === 'error' || a.level === 'critical' ? t.red : t.amber,
                      },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.tx2, fontSize: fontSize.sm }}>{a.message ?? '未知告警'}</Text>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 2 }}>{fmtTs(a.ts)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.line }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={sectionTitle(t)}>实例 {instances.length}</Text>
            </View>
            {instances.length === 0 ? (
              <Text style={{ color: t.tx3, fontSize: fontSize.sm, marginTop: 10 }}>
                当前没有运行中的设备
              </Text>
            ) : (
              instances.map((inst) => {
                const tone = STATE_TONE[inst.state ?? 'unknown'] ?? STATE_TONE.unknown;
                const color =
                  tone.color === 'ac' ? t.ac : tone.color === 'amber' ? t.amber : tone.color === 'red' ? t.red : t.tx2;
                const bg =
                  tone.color === 'ac'
                    ? t.acGhost
                    : tone.color === 'amber'
                      ? t.amberGhost
                      : tone.color === 'red'
                        ? t.redGhost
                        : t.bg4;
                const occupant = occupantLabel(inst);
                const leaseInfo =
                  inst.lease_remaining_seconds != null
                    ? `租约剩余 ${fmtDuration(inst.lease_remaining_seconds)}`
                    : `空闲 ${fmtDuration(inst.idle_seconds)}`;
                return (
                  <View key={inst.device} style={[styles.instRow, { borderTopColor: t.line }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text numberOfLines={1} style={{ color: t.tx, fontSize: fontSize.md, fontWeight: '600' }}>
                          {inst.device}
                        </Text>
                        <View style={[styles.badge, { backgroundColor: bg }]}>
                          <Text style={{ color, fontSize: fontSize.xs }}>{tone.label}</Text>
                        </View>
                      </View>
                      <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 3 }} numberOfLines={2}>
                        {[
                          occupant ? `占用 ${occupant}` : '',
                          inst.endpoint || '',
                          `运行 ${fmtDuration(inst.age_seconds)}`,
                          leaseInfo,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    {overview.can_manage && (
                      <Pressable
                        onPress={() => destroy(inst)}
                        disabled={busyId === inst.device}
                        hitSlop={6}
                        style={{ padding: 6 }}
                      >
                        <Icons.trash size={16} color={t.tx3} sw={1.8} />
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}
          </View>

          {queue.length > 0 && (
            <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.line }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={sectionTitle(t)}>等待队列 {overview?.queue_depth ?? queue.length}</Text>
              </View>
              {queue.map((q, idx) => (
                <View key={q.waiter_id ?? `${q.holder}-${idx}`} style={[styles.queueRow, { borderTopColor: t.line }]}>
                  <Text style={{ color: t.tx3, fontSize: fontSize.xs, width: 22 }}>
                    {(q.position ?? idx) + 1}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: t.tx2, fontSize: fontSize.sm }}>
                      {occupantLabel(q) || '未知'}
                    </Text>
                    <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 2 }}>
                      等待 {fmtDuration(q.wait_seconds)}
                      {q.eta_seconds ? ` · 预计 ${fmtDuration(q.eta_seconds)}` : ''}
                    </Text>
                  </View>
                  {!!q.waiter_id && (
                    <Pressable
                      onPress={() => void cancelWaiter(q.waiter_id)}
                      disabled={busyId === q.waiter_id}
                      hitSlop={6}
                      style={{ padding: 6 }}
                    >
                      <Icons.trash size={15} color={t.red} sw={1.8} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}

          {overview.can_manage && showConfig && (
            <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.acLine }]}>
              <Text style={sectionTitle(t)}>运行参数</Text>
              <ConfigField t={t} label="租约时长（秒）" k="lease_ttl_seconds" draft={draft} setDraft={setDraft} />
              <ConfigField t={t} label="实例下限" k="hard_min" draft={draft} setDraft={setDraft} />
              <ConfigField t={t} label="实例上限" k="hard_max" draft={draft} setDraft={setDraft} />
              <ConfigField t={t} label="空闲休眠（秒）" k="sleep_after_idle_seconds" draft={draft} setDraft={setDraft} />
              <ConfigField t={t} label="空闲停止（秒）" k="stop_after_idle_seconds" draft={draft} setDraft={setDraft} />
              <ToggleRow
                t={t}
                label="启用自动休眠"
                value={isTruthy(config.sleep_enabled)}
                onChange={(v) => void setBool('sleep_enabled', v)}
              />
              <ToggleRow
                t={t}
                label="释放时销毁容器"
                value={isTruthy(config.destroy_on_release)}
                onChange={(v) => void setBool('destroy_on_release', v)}
              />
              <ToggleRow
                t={t}
                label="启用对账"
                value={isTruthy(config.reconcile_enabled)}
                onChange={(v) => void setBool('reconcile_enabled', v)}
              />
              <PrimaryButton
                label={saving ? '保存中' : '保存参数'}
                icon="check"
                block
                onPress={saveConfig}
                disabled={saving}
                style={{ marginTop: 12 }}
              />
            </View>
          )}
        </ScrollView>
      )}
      {!!toast && <Toast text={toast} />}
    </View>
  );
}

function sectionTitle(t: ReturnType<typeof useTheme>) {
  return { color: t.tx, fontSize: fontSize.md, fontWeight: '700' as const };
}

function Metric({ t, label, value }: { t: ReturnType<typeof useTheme>; label: string; value: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: 5 }}>
      <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>{label}</Text>
      <Text style={{ color: t.tx, fontSize: fontSize.md, fontWeight: '700', marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function ConfigField({
  t,
  label,
  k,
  draft,
  setDraft,
}: {
  t: ReturnType<typeof useTheme>;
  label: string;
  k: string;
  draft: Record<string, string>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginBottom: 5 }}>{label}</Text>
      <TextInput
        value={draft[k] ?? ''}
        onChangeText={(v) => setDraft((prev) => ({ ...prev, [k]: v }))}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={t.tx3}
        style={[styles.cfgInput, { color: t.tx, backgroundColor: t.bg3, borderColor: t.line }]}
      />
    </View>
  );
}

function ToggleRow({
  t,
  label,
  value,
  onChange,
}: {
  t: ReturnType<typeof useTheme>;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
      <Text style={{ color: t.tx, fontSize: fontSize.md }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  notice: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  instRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    marginTop: 8,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  dotBadge: {
    width: 7,
    height: 7,
    borderRadius: 99,
    marginTop: 6,
  },
  cfgInput: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: fontSize.md,
  },
});
