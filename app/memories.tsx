/**
 * 记忆管理。
 *
 * 顶部是画像摘要（总数/常驻/分类分布/高频词），下方是可检索的记忆列表。
 * 支持新增、编辑、删除；常驻记忆标注星标。
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
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
  createMemory,
  deleteMemory,
  getMemoryContext,
  listMemories,
  updateMemory,
} from '@/api/memory';
import type { MemoryItem, MemoryProfile } from '@/api/types';
import { Icons } from '@/components/Icons';
import { EmptyView, GlassNav, LoadingView, PrimaryButton, Scrim, Toast } from '@/components/ui';
import { usePagedList } from '@/hooks/usePagedList';
import { fontSize, radius, spacing, useTheme } from '@/theme';

const PAGE_SIZE = 20;

const CATEGORY_LABEL: Record<string, string> = {
  profile: '档案',
  experience: '经验',
  goal: '目标',
  relationship: '关系',
  preference: '偏好',
  capability: '能力',
};

function categoryLabel(c?: string): string {
  if (!c) return '未分类';
  return CATEGORY_LABEL[c] ?? c;
}

export default function MemoriesScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [toast, setToast] = useState('');
  const [keyword, setKeyword] = useState('');
  const keywordRef = React.useRef('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [draft, setDraft] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [draftStanding, setDraftStanding] = useState(false);
  const [saving, setSaving] = useState(false);

  // 记忆列表分页：offset = (page-1) * PAGE_SIZE。检索（q 非空）走语义检索，
  // 服务端不分页，只取第一页。
  const list = usePagedList<MemoryItem>({
    fetchPage: async (page) => {
      const q = keywordRef.current.trim();
      const offset = (page - 1) * PAGE_SIZE;
      const [ctxResp, listResp] = await Promise.all([
        page === 1 ? getMemoryContext().catch(() => null) : Promise.resolve(null),
        listMemories({ q: q || undefined, limit: PAGE_SIZE, offset: q ? undefined : offset }),
      ]);
      if (ctxResp) setProfile(ctxResp.data?.profile ?? null);
      const memories = listResp?.data?.memories ?? [];
      const total = listResp?.data?.total ?? 0;
      return {
        items: memories,
        hasMore: !q && memories.length === PAGE_SIZE && offset + memories.length < total,
      };
    },
  });
  const { items, loading, refreshing, error, reload, refresh, loadMore, loadingMore, setItems } = list;

  // usePagedList 挂载即拉第一页；这里补「从其它页面返回时刷新」。
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

  const runSearch = useCallback((q: string) => {
    keywordRef.current = q;
    void reload();
  }, [reload]);

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(id);
  }, [toast]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setDraft('');
    setDraftCategory('');
    setDraftStanding(false);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((item: MemoryItem) => {
    setEditing(item);
    setDraft(item.content);
    setDraftCategory(item.category ?? '');
    setDraftStanding(!!item.standing);
    setEditorOpen(true);
  }, []);

  const save = useCallback(async () => {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      if (editing) {
        await updateMemory(editing.id, {
          content,
          category: draftCategory || undefined,
          standing: draftStanding,
        });
        setToast('已更新');
      } else {
        await createMemory({
          content,
          category: draftCategory || undefined,
          standing: draftStanding,
        });
        setToast('已添加');
      }
      setEditorOpen(false);
      void reload();
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [draft, draftCategory, draftStanding, editing, saving, reload]);

  const remove = useCallback(
    (item: MemoryItem) => {
      Alert.alert('删除记忆', '删除后无法恢复，确定删除？', [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMemory(item.id);
              setItems((prev) => prev.filter((i) => i.id !== item.id));
              setToast('已删除');
            } catch (e) {
              setToast(errorMessage(e));
            }
          },
        },
      ]);
    },
    [setItems],
  );

  const categories = profile?.by_category ? Object.entries(profile.by_category) : [];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GlassNav
        title="记忆"
        onBack={() => router.back()}
        right={
          <Pressable onPress={openCreate} hitSlop={8} style={{ paddingHorizontal: 12 }}>
            <Icons.plus size={20} color={t.ac} sw={2.2} />
          </Pressable>
        }
      />
      <View style={{ height: insets.top + 52 }} />

      {loading ? (
        <LoadingView label="加载记忆" />
      ) : error ? (
        <EmptyView title="加载失败" subtitle={error} icon="alert" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.pad, paddingBottom: insets.bottom + 32, gap: 8 }}
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
            <View style={{ gap: 10, marginBottom: 6 }}>
              {profile && (
                <View style={[styles.profileCard, { backgroundColor: t.bg2, borderColor: t.line }]}>
                  <View style={{ flexDirection: 'row', gap: 18 }}>
                    <Stat t={t} label="记忆总数" value={String(profile.total ?? 0)} />
                    <Stat t={t} label="常驻" value={String(profile.standing ?? 0)} />
                    <Stat t={t} label="分类" value={String(categories.length)} />
                  </View>
                  {categories.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                      {categories.map(([c, n]) => (
                        <View key={c} style={[styles.catChip, { backgroundColor: t.bg4 }]}>
                          <Text style={{ color: t.tx2, fontSize: fontSize.xs }}>
                            {categoryLabel(c)} {n}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {!!profile.top_keywords?.length && (
                    <Text numberOfLines={2} style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 10 }}>
                      高频：{profile.top_keywords.slice(0, 10).map((k) => k.word).join(' · ')}
                    </Text>
                  )}
                </View>
              )}

              <View style={[styles.search, { backgroundColor: t.bg2, borderColor: t.line }]}>
                <Icons.search size={16} color={t.tx3} sw={1.9} />
                <TextInput
                  value={keyword}
                  onChangeText={setKeyword}
                  onSubmitEditing={() => runSearch(keyword)}
                  returnKeyType="search"
                  placeholder="检索记忆"
                  placeholderTextColor={t.tx3}
                  style={{ flex: 1, color: t.tx, fontSize: fontSize.md, paddingVertical: 9 }}
                />
                {!!keyword && (
                  <Pressable
                    onPress={() => {
                      setKeyword('');
                      runSearch('');
                    }}
                    hitSlop={8}
                  >
                    <Text style={{ color: t.tx3, fontSize: 16 }}>×</Text>
                  </Pressable>
                )}
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyView title="暂无记忆" subtitle="Agent 会把重要信息记在这里，你也可以手动添加" icon="brain" />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openEdit(item)}
              onLongPress={() => remove(item)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: t.bg2, borderColor: t.line },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.badge, { backgroundColor: t.bg4 }]}>
                  <Text style={{ color: t.tx2, fontSize: fontSize.xs }}>{categoryLabel(item.category)}</Text>
                </View>
                {item.standing && (
                  <View style={[styles.badge, { backgroundColor: t.acGhost }]}>
                    <Text style={{ color: t.acTx, fontSize: fontSize.xs }}>常驻</Text>
                  </View>
                )}
                {typeof item.score === 'number' && item.score > 0 && (
                  <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>相关度 {item.score.toFixed(2)}</Text>
                )}
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => remove(item)} hitSlop={8}>
                  <Icons.trash size={15} color={t.tx3} sw={1.8} />
                </Pressable>
              </View>
              <Text style={{ color: t.tx, fontSize: fontSize.md, marginTop: 8, lineHeight: 21 }}>
                {item.content}
              </Text>
            </Pressable>
          )}
        />
      )}

      {/* 编辑/新增记忆 */}
      <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => setEditorOpen(false)} statusBarTranslucent>
        <Scrim onPress={() => setEditorOpen(false)} />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '88%',
            backgroundColor: t.bg2,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <View style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: t.line2, alignSelf: 'center', marginTop: 10 }} />
          <Text style={{ paddingHorizontal: 20, paddingTop: 14, fontSize: 17, fontWeight: '700', color: t.tx }}>
            {editing ? '编辑记忆' : '新增记忆'}
          </Text>
          <ScrollView contentContainerStyle={{ padding: spacing.pad, gap: 14 }} keyboardShouldPersistTaps="handled">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              placeholder="要记住的内容"
              placeholderTextColor={t.tx3}
              style={[styles.textarea, { color: t.tx, backgroundColor: t.bg3, borderColor: t.line }]}
            />
            <View>
              <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginBottom: 6 }}>分类</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {Object.keys(CATEGORY_LABEL).map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setDraftCategory(draftCategory === c ? '' : c)}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: draftCategory === c ? t.acGhost : t.bg3,
                        borderWidth: 1,
                        borderColor: draftCategory === c ? t.acLine : 'transparent',
                      },
                    ]}
                  >
                    <Text style={{ color: draftCategory === c ? t.acTx : t.tx2, fontSize: fontSize.sm }}>
                      {CATEGORY_LABEL[c]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: t.tx, fontSize: fontSize.md }}>常驻记忆</Text>
                <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 2 }}>
                  每个任务开局都会注入
                </Text>
              </View>
              <Switch value={draftStanding} onValueChange={setDraftStanding} />
            </View>
            <PrimaryButton
              label={saving ? '保存中' : '保存'}
              icon="check"
              block
              onPress={save}
              disabled={!draft.trim() || saving}
            />
          </ScrollView>
        </View>
      </Modal>

      {!!toast && <Toast text={toast} />}
    </View>
  );
}

function Stat({ t, label, value }: { t: ReturnType<typeof useTheme>; label: string; value: string }) {
  return (
    <View>
      <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>{label}</Text>
      <Text style={{ color: t.tx, fontSize: fontSize.xl, fontWeight: '800', marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  textarea: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 120,
    fontSize: fontSize.md,
    textAlignVertical: 'top',
  },
});
