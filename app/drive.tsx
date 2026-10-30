/**
 * 个人云盘。
 *
 * 后端是扁平路径存储：/users/drive/objects?path= 返回 dirs + files，
 * 目录由文件路径推导。这里做目录下钻 + 全盘搜索 + 下载/分享/批量删除。
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deleteDriveObjects,
  getDriveDownloadUrl,
  getDriveQuota,
  listDriveObjects,
  renameDriveObject,
  searchDriveObjects,
  shareDriveObject,
  uploadDriveFile,
} from '@/api/drive';
import { pickDriveFile } from '@/api/upload';
import { errorMessage } from '@/api/errors';
import type { DriveObject, DriveQuota } from '@/api/types';
import { Icons } from '@/components/Icons';
import { EmptyView, GlassNav, LoadingView, Toast } from '@/components/ui';
import { fontSize, radius, spacing, useTheme } from '@/theme';

function fmtSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(2)} GB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtDate(s?: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 把文件路径拆成面包屑（'' 为根）。 */
function crumbsOf(path: string): { label: string; path: string }[] {
  const segs = path.split('/').filter(Boolean);
  const out: { label: string; path: string }[] = [{ label: '云盘', path: '' }];
  let acc = '';
  for (const s of segs) {
    acc += `/${s}`;
    out.push({ label: s, path: acc });
  }
  return out;
}

export default function DriveScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [quota, setQuota] = useState<DriveQuota | null>(null);
  const [files, setFiles] = useState<DriveObject[]>([]);
  const [dirs, setDirs] = useState<string[]>([]);
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState<DriveObject | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);

  const load = useCallback(async (targetPath: string) => {
    try {
      const [qResp, listResp] = await Promise.all([
        getDriveQuota().catch(() => null),
        listDriveObjects(targetPath),
      ]);
      setQuota(qResp?.data ?? null);
      setDirs(listResp?.data?.dirs ?? []);
      setFiles(listResp?.data?.files ?? []);
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
      void load(path);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(id);
  }, [toast]);

  const runSearch = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) {
      setSearching(false);
      setLoading(true);
      void load(path);
      return;
    }
    setSearching(true);
    setLoading(true);
    try {
      const resp = await searchDriveObjects(kw, 100);
      setFiles(resp.data?.files ?? []);
      setDirs([]);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [keyword, path, load]);

  const clearSearch = useCallback(() => {
    setKeyword('');
    setSearching(false);
    setLoading(true);
    void load(path);
  }, [load, path]);

  const enterDir = useCallback(
    (dir: string) => {
      const next = `${path}/${dir}`.replace(/\/+/g, '/');
      setPath(next);
      setSelected(new Set());
      setKeyword('');
      setSearching(false);
      setLoading(true);
      void load(next);
    },
    [load, path],
  );

  const goTo = useCallback(
    (next: string) => {
      setPath(next);
      setSelected(new Set());
      setKeyword('');
      setSearching(false);
      setLoading(true);
      void load(next);
    },
    [load],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const download = useCallback(async (obj: DriveObject) => {
    try {
      const resp = await getDriveDownloadUrl(obj.id);
      const url = resp.data?.url;
      if (!url) {
        setToast('下载地址不可用');
        return;
      }
      const target = `${FileSystem.cacheDirectory}${obj.name || obj.id}`;
      const dl = await FileSystem.downloadAsync(url, target);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(dl.uri);
      else await Linking.openURL(url);
    } catch (e) {
      setToast(errorMessage(e));
    }
  }, []);

  const share = useCallback(async (obj: DriveObject) => {
    try {
      const resp = await shareDriveObject(obj.id);
      const url = resp.data?.url;
      if (!url) {
        setToast('生成分享链接失败');
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      setToast(errorMessage(e));
    }
  }, []);

  const removeSelected = useCallback(() => {
    if (selected.size === 0) return;
    Alert.alert('删除文件', `将删除 ${selected.size} 个文件，且不可恢复。确定删除？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDriveObjects([...selected]);
            setSelected(new Set());
            setToast('已删除');
            void load(path);
          } catch (e) {
            setToast(errorMessage(e));
          }
        },
      },
    ]);
  }, [selected, load, path]);

  const upload = useCallback(async () => {
    if (uploading) return;
    try {
      const file = await pickDriveFile(quota?.max_file_size || 1 << 30);
      if (!file) return;
      setUploading(true);
      await uploadDriveFile(path, file);
      setToast(`已上传 ${file.name}`);
      await load(path);
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }, [uploading, quota?.max_file_size, path, load]);

  const openRename = useCallback((obj: DriveObject) => {
    setRenaming(obj);
    setRenameText(obj.name || obj.path.split('/').pop() || '');
  }, []);

  const submitRename = useCallback(async () => {
    const target = renaming;
    if (!target || renameBusy) return;
    const name = renameText.trim();
    if (!name) {
      setToast('请输入新文件名');
      return;
    }
    const dir = path.replace(/\/+$/, '');
    const nextPath = `${dir}/${name}`;
    if (nextPath === target.path) {
      setRenaming(null);
      return;
    }
    setRenameBusy(true);
    try {
      await renameDriveObject(target.id, nextPath);
      setRenaming(null);
      setToast('已重命名');
      await load(path);
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setRenameBusy(false);
    }
  }, [renaming, renameBusy, renameText, path, load]);

  const usedPct = quota && quota.limit > 0 ? Math.min(1, quota.used / quota.limit) : 0;
  const crumbs = crumbsOf(path);
  const total = dirs.length + files.length;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GlassNav
        title="云盘"
        onBack={() => (path ? goTo(crumbs[crumbs.length - 2]?.path ?? '') : router.back())}
        right={
          selected.size > 0 ? (
            <Pressable onPress={removeSelected} hitSlop={8} style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: t.red, fontSize: fontSize.sm, fontWeight: '600' }}>
                删除 {selected.size}
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => void upload()} hitSlop={8} disabled={uploading} style={{ paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {uploading ? (
                <ActivityIndicator size="small" color={t.ac} />
              ) : (
                <Icons.upload size={17} color={t.ac} sw={1.9} />
              )}
              <Text style={{ color: t.ac, fontSize: fontSize.sm, fontWeight: '600' }}>
                {uploading ? '上传中' : '上传'}
              </Text>
            </Pressable>
          )
        }
      />
      <View style={{ height: insets.top + 52 }} />

      {loading ? (
        <LoadingView label="加载云盘" />
      ) : (
        <>
          <View style={{ paddingHorizontal: spacing.pad, paddingTop: 12 }}>
            <View style={[styles.quotaCard, { backgroundColor: t.bg2, borderColor: t.line }]}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text style={{ color: t.tx, fontSize: fontSize.md, fontWeight: '700' }}>存储空间</Text>
                <Text style={{ color: t.tx2, fontSize: fontSize.sm }}>
                  {fmtSize(quota?.used)} / {fmtSize(quota?.limit)}
                </Text>
              </View>
              <View style={[styles.bar, { backgroundColor: t.track }]}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.max(usedPct * 100, 2)}%`, backgroundColor: usedPct > 0.9 ? t.red : t.ac },
                  ]}
                />
              </View>
              <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 6 }}>
                单文件上限 {fmtSize(quota?.max_file_size)}
              </Text>
            </View>

            <View style={[styles.search, { backgroundColor: t.bg2, borderColor: t.line }]}>
              <Icons.search size={16} color={t.tx3} sw={1.9} />
              <TextInput
                value={keyword}
                onChangeText={setKeyword}
                onSubmitEditing={() => void runSearch()}
                returnKeyType="search"
                placeholder="全盘按文件名搜索"
                placeholderTextColor={t.tx3}
                style={{ flex: 1, color: t.tx, fontSize: fontSize.md, paddingVertical: 9 }}
              />
              {(!!keyword || searching) && (
                <Pressable onPress={clearSearch} hitSlop={8}>
                  <Text style={{ color: t.tx3, fontSize: 16 }}>×</Text>
                </Pressable>
              )}
            </View>

            {!searching && (
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                {crumbs.map((c, i) => (
                  <React.Fragment key={c.path || 'root'}>
                    {i > 0 && <Text style={{ color: t.tx3, fontSize: fontSize.xs }}>/</Text>}
                    <Pressable onPress={() => goTo(c.path)} hitSlop={6}>
                      <Text
                        style={{
                          color: i === crumbs.length - 1 ? t.tx : t.ac,
                          fontSize: fontSize.sm,
                          fontWeight: i === crumbs.length - 1 ? '700' : '500',
                        }}
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  </React.Fragment>
                ))}
              </View>
            )}
          </View>

          {error ? (
            <EmptyView title="加载失败" subtitle={error} icon="alert" />
          ) : total === 0 ? (
            <EmptyView
              title={searching ? '没有匹配的文件' : '这个目录是空的'}
              subtitle={searching ? undefined : '任务产物与上传的文件会出现在这里'}
              icon="folder"
            />
          ) : (
            <FlatList
              data={[
                ...dirs.map((d) => ({ type: 'dir' as const, name: d })),
                ...files.map((f) => ({ type: 'file' as const, obj: f })),
              ]}
              keyExtractor={(i) => (i.type === 'dir' ? `dir:${i.name}` : `file:${i.obj.id}`)}
              contentContainerStyle={{ padding: spacing.pad, paddingBottom: insets.bottom + 32, gap: 8 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    if (searching) void runSearch();
                    else void load(path);
                  }}
                  tintColor={t.tx3}
                />
              }
              renderItem={({ item }) => {
                if (item.type === 'dir') {
                  return (
                    <Pressable
                      onPress={() => enterDir(item.name)}
                      style={({ pressed }) => [
                        styles.row,
                        { backgroundColor: t.bg2, borderColor: t.line },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: t.bg4 }]}>
                        <Icons.folder size={17} color={t.tx2} sw={1.8} />
                      </View>
                      <Text numberOfLines={1} style={{ flex: 1, color: t.tx, fontSize: fontSize.md, fontWeight: '600' }}>
                        {item.name}
                      </Text>
                      <Icons.chevron size={16} color={t.tx3} sw={1.9} />
                    </Pressable>
                  );
                }
                const obj = item.obj;
                const on = selected.has(obj.id);
                return (
                  <Pressable
                    onPress={() => (selected.size > 0 ? toggleSelect(obj.id) : void download(obj))}
                    onLongPress={() => toggleSelect(obj.id)}
                    style={({ pressed }) => [
                      styles.row,
                      { backgroundColor: on ? t.acGhost : t.bg2, borderColor: on ? t.acLine : t.line },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: t.bg4 }]}>
                      <Icons.file size={17} color={t.tx2} sw={1.8} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: t.tx, fontSize: fontSize.md, fontWeight: '600' }}>
                        {obj.name || obj.id}
                      </Text>
                      <Text numberOfLines={1} style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 2 }}>
                        {fmtSize(obj.size)}
                        {obj.created_at ? ` · ${fmtDate(obj.created_at)}` : ''}
                        {searching && obj.path ? ` · ${obj.path}` : ''}
                      </Text>
                    </View>
                    {selected.size === 0 && (
                      <>
                        <Pressable onPress={() => openRename(obj)} hitSlop={8} style={{ padding: 6 }}>
                          <Icons.edit size={17} color={t.tx3} sw={1.8} />
                        </Pressable>
                        <Pressable onPress={() => void share(obj)} hitSlop={8} style={{ padding: 6 }}>
                          <Icons.link size={17} color={t.tx3} sw={1.8} />
                        </Pressable>
                        <Pressable onPress={() => void download(obj)} hitSlop={8} style={{ padding: 6 }}>
                          <Icons.download size={17} color={t.ac} sw={1.9} />
                        </Pressable>
                      </>
                    )}
                    {on && <Icons.check size={18} color={t.ac} sw={2.4} />}
                  </Pressable>
                );
              }}
            />
          )}
        </>
      )}
      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)} statusBarTranslucent>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: spacing.pad }}>
          <View style={{ width: '100%', maxWidth: 420, borderRadius: radius.lg, backgroundColor: t.bg2, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, padding: 18 }}>
            <Text style={{ color: t.tx, fontSize: fontSize.lg, fontWeight: '700' }}>重命名</Text>
            <Text style={{ color: t.tx3, fontSize: fontSize.xs, marginTop: 4 }} numberOfLines={1}>
              {renaming?.path}
            </Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void submitRename()}
              placeholder="新文件名"
              placeholderTextColor={t.tx3}
              style={{ marginTop: 12, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, backgroundColor: t.bg, color: t.tx, fontSize: fontSize.md, paddingHorizontal: 12, paddingVertical: 10 }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={() => setRenaming(null)}
                style={({ pressed }) => [{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md, backgroundColor: t.bg4 }, pressed && { opacity: 0.7 }]}
              >
                <Text style={{ color: t.tx2, fontSize: fontSize.md, fontWeight: '600' }}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => void submitRename()}
                disabled={renameBusy}
                style={({ pressed }) => [{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md, backgroundColor: t.ac, opacity: renameBusy ? 0.6 : 1 }, pressed && { opacity: 0.8 }]}
              >
                <Text style={{ color: t.acInk, fontSize: fontSize.md, fontWeight: '700' }}>{renameBusy ? '保存中' : '保存'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {!!toast && <Toast text={toast} />}
    </View>
  );
}

const styles = StyleSheet.create({
  quotaCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  bar: { height: 6, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
