/**
 * 技能库。
 *
 * 数据来自 GET /api/v1/skills（读路径并集：global ∪ team ∪ 个人 ∪ 群组分享，
 * 仅返回 enabled=true）。移动端只做浏览与检索，创建/版本管理仍在 Web 控制台。
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import { listSkills } from '@/api/skill';
import type { Skill } from '@/api/types';
import { Icons } from '@/components/Icons';
import { EmptyView, GlassNav, LoadingView } from '@/components/ui';
import { fontSize, radius, spacing, useTheme } from '@/theme';

const SCOPES = [
  { key: 'all', label: '全部' },
  { key: 'global', label: '全局' },
  { key: 'team', label: '团队' },
  { key: 'user', label: '个人' },
] as const;

type ScopeKey = (typeof SCOPES)[number]['key'];

const SCOPE_TONE: Record<string, string> = {
  global: '全局',
  team: '团队',
  user: '个人',
};

export default function SkillsScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [scope, setScope] = useState<ScopeKey>('all');

  const load = useCallback(async (q: string, sc: ScopeKey) => {
    try {
      const resp = await listSkills({ keyword: q.trim() || undefined, scope: sc === 'all' ? undefined : sc });
      setItems((resp.data as Skill[]) ?? []);
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
      void load(keyword, scope);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GlassNav title="技能" onBack={() => router.back()} />
      <View style={{ height: insets.top + 52 }} />

      {loading ? (
        <LoadingView label="加载技能" />
      ) : error ? (
        <EmptyView title="加载失败" subtitle={error} icon="alert" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id ?? i.name ?? Math.random().toString(36)}
          contentContainerStyle={{ padding: spacing.pad, paddingBottom: insets.bottom + 32, gap: 10 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(keyword, scope);
              }}
              tintColor={t.tx3}
            />
          }
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 4 }}>
              <View style={[styles.search, { backgroundColor: t.bg2, borderColor: t.line }]}>
                <Icons.search size={16} color={t.tx3} sw={1.9} />
                <TextInput
                  value={keyword}
                  onChangeText={setKeyword}
                  onSubmitEditing={() => {
                    setLoading(true);
                    void load(keyword, scope);
                  }}
                  returnKeyType="search"
                  placeholder="搜索技能名称、描述或标签"
                  placeholderTextColor={t.tx3}
                  style={{ flex: 1, color: t.tx, fontSize: fontSize.md, paddingVertical: 9 }}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {SCOPES.map((s) => {
                  const on = scope === s.key;
                  return (
                    <Pressable
                      key={s.key}
                      onPress={() => {
                        setScope(s.key);
                        setLoading(true);
                        void load(keyword, s.key);
                      }}
                      style={[
                        styles.scopeChip,
                        {
                          backgroundColor: on ? t.acGhost : t.bg2,
                          borderColor: on ? t.acLine : t.line,
                        },
                      ]}
                    >
                      <Text style={{ color: on ? t.acTx : t.tx2, fontSize: fontSize.sm, fontWeight: '600' }}>
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyView title="暂无技能" subtitle="技能会在新建任务时作为可选能力注入" icon="sparkle" />
          }
          renderItem={({ item }) => {
            const scopeLabel = SCOPE_TONE[item.scope?.type ?? ''] ?? '';
            return (
              <View style={[styles.card, { backgroundColor: t.bg2, borderColor: t.line }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.iconWrap, { backgroundColor: t.acGhost }]}>
                    <Icons.sparkle size={16} color={t.ac} sw={1.9} />
                  </View>
                  <Text numberOfLines={1} style={{ flex: 1, color: t.tx, fontSize: fontSize.md, fontWeight: '700' }}>
                    {item.name ?? '未命名技能'}
                  </Text>
                  {!!scopeLabel && (
                    <View style={[styles.badge, { backgroundColor: t.bg4 }]}>
                      <Text style={{ color: t.tx2, fontSize: fontSize.xs }}>{scopeLabel}</Text>
                    </View>
                  )}
                  {item.is_force_delivery && (
                    <View style={[styles.badge, { backgroundColor: t.amberGhost }]}>
                      <Text style={{ color: t.amber, fontSize: fontSize.xs }}>强制</Text>
                    </View>
                  )}
                </View>
                {!!item.description && (
                  <Text numberOfLines={3} style={{ color: t.tx2, fontSize: fontSize.sm, marginTop: 8, lineHeight: 19 }}>
                    {item.description}
                  </Text>
                )}
                {!!item.tags?.length && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                    {item.tags.slice(0, 6).map((tag) => (
                      <View key={tag} style={[styles.badge, { backgroundColor: t.bg3 }]}>
                        <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {!!item.active_version && (
                  <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 8 }}>
                    版本 {item.active_version}
                    {item.owner_name ? ` · ${item.owner_name}` : ''}
                  </Text>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  scopeChip: {
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
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
