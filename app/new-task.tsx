import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, createTask, getSubscription, listGitIdentities, listHosts, listImages, listModels, listProjects, listSkills } from '@/api/client';
import { pickZipFile, uploadFileWithPresignedUrl, type PickedFile } from '@/api/upload';
import { AiConsentModal, useAiConsent } from '@/components/AiConsent';
import type { GitIdentity, Host, Image, Model, Project, Skill } from '@/api/types';
import { ConcurrentLimitModal } from '@/components/ConcurrentLimitModal';
import { Icons, providerIconForUrl } from '@/components/Icons';
import { MicButton } from '@/components/MicButton';
import { ModelSheet, RepoUrlSheet } from '@/components/sheets';
import { Card, IconButton, MonkeyLogo, PickerSheet, PrimaryButton, Scrim, type PickerOption } from '@/components/ui';
import { useSpeechToText } from '@/speech/useSpeechToText';
import { DEFAULT_SKILL_IDS, modelLabel, pickDefaultImage, pickDefaultModel, TASK_DEFAULTS } from '@/config';

import { spacing, useTheme, type Theme } from '@/theme';

const SUGGESTIONS = ['修复一个线上 bug', '为这个仓库写单元测试', '重构这个模块', '解释这段代码做了什么'];

const GB = 1024 * 1024 * 1024;

/** 资源规格预设：与 Web 端保持一致（代码任务 2 核 / 8 GB，Web 任务 4 GB）。 */
const RESOURCE_PRESETS = [
  { key: 'std', label: '标准（2 核 / 8 GB）', sub: '常规开发任务', core: 2, memory: 8 * GB },
  { key: 'lite', label: '轻量（1 核 / 4 GB）', sub: 'Web 预览类任务', core: 1, memory: 4 * GB },
  { key: 'pro', label: '加强（4 核 / 16 GB）', sub: '大型仓库或复杂构建', core: 4, memory: 16 * GB },
];

// 「选择仓库」列表里的「手动输入仓库地址」入口标识（区别于真实 project.id）
const MANUAL_REPO_KEY = '__manual_repo__';
const ZIP_REPO_KEY = '__zip_repo__';

/** 从 Git 地址里取 owner/repo 作为简短展示名（取不到则回退为整段地址）。 */
function repoNameFromUrl(url: string): string {
  const cleaned = url.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = cleaned.match(/[/:]([^/:]+\/[^/:]+)$/);
  if (m) return m[1];
  return cleaned.split(/[/:]/).filter(Boolean).pop() || url;
}

function ConfigRow({ icon, label, value, sub, divider, onPress, t }: { icon: string; label: string; value: string; sub?: string; divider?: boolean; onPress: () => void; t: Theme }) {
  const I = Icons[icon];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 13, borderTopWidth: divider ? 1 : 0, borderColor: t.line }, pressed && { backgroundColor: t.bg3 }]}>
      <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: t.bg4, alignItems: 'center', justifyContent: 'center' }}>
        <I size={17} color={t.acTx} sw={1.8} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12, color: t.tx3, fontWeight: '500' }}>{label}</Text>
        <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '600', color: t.tx, marginTop: 1 }}>{value}</Text>
      </View>
      {sub ? <Text numberOfLines={1} style={{ fontFamily: 'monospace', fontSize: 12, color: t.tx3, maxWidth: 120, marginRight: 4 }}>{sub}</Text> : null}
      <Icons.chevron size={17} color={t.tx3} sw={1.9} />
    </Pressable>
  );
}

export default function NewTaskScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const aiConsent = useAiConsent(); // 新建任务会把内容发给 AI，需先取得数据处理同意（App Store 2.1）
  const params = useLocalSearchParams<{ repo?: string; repoName?: string; projectId?: string }>();

  const [models, setModels] = useState<Model[]>([]);
  const [plan, setPlan] = useState<string | undefined>(undefined);
  const [projects, setProjects] = useState<Project[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [identities, setIdentities] = useState<GitIdentity[]>([]);
  const [identityId, setIdentityId] = useState('');
  const [images, setImages] = useState<Image[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillIds, setSkillIds] = useState<string[]>([...DEFAULT_SKILL_IDS]);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [branch, setBranch] = useState('');
  const [branchOpen, setBranchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [content, setContent] = useState('');
  const [modelId, setModelId] = useState('');
  const [imageId, setImageId] = useState('');
  const [repoKey, setRepoKey] = useState<string>(params.projectId || ''); // '' = 不关联仓库；project.id = 选中项目；MANUAL_REPO_KEY = 手动输入
  const [manualRepo, setManualRepo] = useState(''); // 手动输入的 Git 仓库地址
  const [zipFile, setZipFile] = useState<PickedFile | null>(null); // 本地上传的 zip 包
  const zipPickingRef = useRef(false);
  const zipPickAfterDismissRef = useRef(false);
  const zipPickFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hostId, setHostId] = useState<string>(TASK_DEFAULTS.hostId);
  const [picking, setPicking] = useState<'repo' | 'model' | 'host' | 'image' | 'resource' | 'identity' | null>(null);
  const [resource, setResource] = useState<{ core: number; memory: number; life: number }>({
    ...TASK_DEFAULTS.resource,
  });
  const [manualOpen, setManualOpen] = useState(false); // 手动输入仓库地址对话框
  const [limitOpen, setLimitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 语音输入：识别文本写回任务描述（保留点麦克风前已有内容作前缀）
  const speechBaseRef = useRef('');
  const speech = useSpeechToText({
    onText: (text) => setContent(speechBaseRef.current + text),
    onError: (msg) => setError(msg),
  });
  const onMic = () => {
    if (speech.status === 'idle') speechBaseRef.current = content && !/\s$/.test(content) ? content + ' ' : content;
    speech.toggle();
  };

  useEffect(() => {
    (async () => {
      try {
        const [m, imgs, projRes, sub, hostRes, skillRes, idRes] = await Promise.all([
          listModels(),
          listImages(),
          listProjects({ limit: 50 }).catch(() => ({ projects: [] as Project[], hasMore: false })),
          getSubscription().catch(() => null),
          listHosts().catch(() => [] as Host[]),
          listSkills().catch(() => [] as Skill[]),
          listGitIdentities().catch(() => [] as GitIdentity[]),
        ]);
        setModels(m);
        setPlan(sub?.plan);
        setModelId(pickDefaultModel(m, sub?.plan));
        setImageId(pickDefaultImage(imgs));
        setProjects(projRes.projects);
        setImages(imgs);
        setSkills(skillRes);
        // 与 Web 端一致：默认技能只在服务端实际存在时才预选，
        // 避免把已下线的路径式 ID 传给后端（后端会静默跳过非法 UUID）。
        if (skillRes.length > 0) {
          const available = new Set(skillRes.map((sk) => sk.id));
          setSkillIds((prev) => prev.filter((id) => available.has(id)));
        }
        setHosts(hostRes);
        setIdentities(idRes);
        if (idRes.length > 0) setIdentityId((prev) => (prev || idRes[0].id || ''));
        if (hostRes.length > 0) {
          setHostId((prev) => (hostRes.some((h) => h.id === prev) ? prev : (hostRes[0].id ?? prev)));
        }
      } catch (e) {
        setLoadError(e instanceof ApiError ? e.message : '加载配置失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedModel = useMemo(() => models.find((m) => m.id === modelId), [models, modelId]);
  const selectedProject = useMemo(() => projects.find((p) => p.id === repoKey), [projects, repoKey]);

  const repoOptions: PickerOption[] = [
    { key: '', title: '快速开始', sub: '不关联仓库', icon: 'sparkle' },
    { key: ZIP_REPO_KEY, title: '上传 Zip 文件', sub: zipFile?.name || '选择本地 .zip 压缩包', icon: 'filePlus' },
    { key: MANUAL_REPO_KEY, title: '手动输入仓库地址', sub: manualRepo || '填写 Git 仓库地址', icon: manualRepo ? providerIconForUrl(manualRepo) : 'git' },
    ...projects.map((p, i) => ({ key: p.id || `p${i}`, title: p.name || p.full_name || '项目', sub: p.repo_url, icon: providerIconForUrl(p.repo_url) })),
  ];

  const selectZip = useCallback(async () => {
    if (zipPickingRef.current) return;
    zipPickingRef.current = true;
    setError('');
    let file: PickedFile | null = null;
    try {
      file = await pickZipFile();
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法选择 zip 文件');
      return;
    } finally {
      zipPickingRef.current = false;
    }
    if (!file) return;
    setZipFile(file);
    setManualRepo('');
    setRepoKey(ZIP_REPO_KEY);
  }, []);

  const runQueuedZipPick = useCallback(() => {
    if (!zipPickAfterDismissRef.current) return;
    zipPickAfterDismissRef.current = false;
    if (zipPickFallbackTimerRef.current) {
      clearTimeout(zipPickFallbackTimerRef.current);
      zipPickFallbackTimerRef.current = null;
    }
    void selectZip();
  }, [selectZip]);

  const queueZipPickAfterSheet = useCallback(() => {
    zipPickAfterDismissRef.current = true;
    setPicking(null);
    if (zipPickFallbackTimerRef.current) clearTimeout(zipPickFallbackTimerRef.current);
    // Android 没有稳定的 Modal onDismiss 回调；iOS 正常走 onDismiss，定时器只作兜底。
    zipPickFallbackTimerRef.current = setTimeout(runQueuedZipPick, 500);
  }, [runQueuedZipPick]);

  useEffect(() => () => {
    if (zipPickFallbackTimerRef.current) clearTimeout(zipPickFallbackTimerRef.current);
  }, []);

  const submit = useCallback(async () => {
    setError('');
    if (!content.trim()) { setError('请描述你想让 AI 做什么'); return; }
    if (!modelId) { setError('请选择模型'); return; }
    if (repoKey === ZIP_REPO_KEY && !zipFile) { setError('请选择 zip 文件'); return; }
    setSubmitting(true);
    try {
      // zip 上传优先；否则手动输入仓库地址；再否则用所选项目；都没有则不关联仓库（快速开始）
      const manualUrl = repoKey === MANUAL_REPO_KEY ? manualRepo.trim() : '';
      let repo: { repo_url?: string; branch?: string; zip_url?: string; repo_filename?: string } = {};
      if (repoKey === ZIP_REPO_KEY && zipFile) {
        const uploaded = await uploadFileWithPresignedUrl(zipFile);
        repo = { zip_url: uploaded.url, repo_filename: uploaded.filename };
      } else if (manualUrl) {
        repo = { repo_url: manualUrl, branch: branch.trim() || undefined };
      } else if (selectedProject) {
        repo = { repo_url: selectedProject.repo_url || undefined, branch: branch.trim() || undefined };
      }
      const task = await createTask({
        content: content.trim(),
        cli_name: TASK_DEFAULTS.cliName,
        model_id: modelId,
        host_id: hostId,
        image_id: imageId,
        task_type: 'develop',
        repo,
        resource: { ...resource },
        git_identity_id: identityId || undefined,
        extra: { skill_ids: skillIds, project_id: (!manualUrl && repoKey !== ZIP_REPO_KEY) ? selectedProject?.id : undefined },
      });
      if (task?.id) router.replace(`/task/${task.id}`);
      else setError('任务创建成功但未返回 ID');
    } catch (e) {
      if (e instanceof ApiError && e.code === 10811) setLimitOpen(true);
      else setError(e instanceof Error ? e.message : '任务创建失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [content, imageId, modelId, router, selectedProject, repoKey, manualRepo, zipFile, hostId, resource, skillIds, branch, identityId]);

  // 仓库行只展示一处信息，避免「快速开始 / 不关联仓库」「名字 / 同名仓库路径」这种左右重复。
  const repoValue = repoKey === ZIP_REPO_KEY
    ? zipFile?.name || 'Zip 文件'
    : repoKey === MANUAL_REPO_KEY && manualRepo
    ? repoNameFromUrl(manualRepo)
    : selectedProject ? (selectedProject.full_name || selectedProject.name || '项目') : '不关联仓库';

  const selectedHost = hosts.find((h) => h.id === hostId);
  const selectedImage = images.find((i) => i.id === imageId);
  const hostLabel = selectedHost ? (selectedHost.name || selectedHost.remark || selectedHost.id || '宿主机') : TASK_DEFAULTS.hostId;
  const selectedIdentity = identities.find((i) => i.id === identityId);
  const identityLabel = selectedIdentity
    ? (selectedIdentity.username || selectedIdentity.platform || selectedIdentity.id || 'Git 身份')
    : identities.length ? '未绑定' : '无可用身份';
  const imageLabel = selectedImage ? (selectedImage.name || selectedImage.remark || selectedImage.id || '镜像') : '默认镜像';
  const resourceLabel = `${resource.core} 核 / ${Math.round(resource.memory / 1024 / 1024 / 1024)} GB / ${Math.round(resource.life / 3600)} 小时`;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior="padding">
      {/* top bar */}
      {/* iOS 是 modal 卡片（已在状态栏下方），不要再叠加 insets.top，否则标题上方一大片空白；Android 是全屏，需要状态栏内边距 */}
      <View style={{ paddingTop: Platform.OS === 'ios' ? 8 : insets.top + 6 }}>
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 }}>
          <View style={{ width: 38 }} />
          <Text style={{ position: 'absolute', left: 56, right: 56, textAlign: 'center', fontSize: 16.5, fontWeight: '700', color: t.tx }}>新建任务</Text>
          <View style={{ marginLeft: 'auto' }}>
            <IconButton icon="plus" onPress={() => router.back()} iconSize={24} sw={2} style={{ transform: [{ rotate: '45deg' }] }} />
          </View>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.ac} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.pad, paddingTop: 14, paddingBottom: insets.bottom + 100 }} keyboardShouldPersistTaps="handled">
          {/* headline */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <MonkeyLogo size={40} />
            <Text style={{ fontSize: 18, fontWeight: '800', letterSpacing: -0.3, color: t.tx }}>你想让我做什么呢？</Text>
          </View>

          {/* config */}
          <Card style={{ overflow: 'hidden', marginBottom: 14 }}>
            <ConfigRow icon={repoKey === ZIP_REPO_KEY ? 'file' : 'folder'} label="代码仓库" value={repoValue} onPress={() => setPicking('repo')} t={t} />
            <ConfigRow icon="cube" label="模型" value={selectedModel ? modelLabel(selectedModel) : '选择模型'} divider onPress={() => setPicking('model')} t={t} />
            <ConfigRow icon="server" label="宿主机" value={hostLabel} divider onPress={() => setPicking('host')} t={t} />
            <ConfigRow icon="cube" label="运行镜像" value={imageLabel} divider onPress={() => setPicking('image')} t={t} />
            <ConfigRow icon="brain" label="资源规格" value={resourceLabel} divider onPress={() => setPicking('resource')} t={t} />
            <ConfigRow
              icon="git"
              label="Git 身份"
              value={identityLabel}
              divider
              onPress={() => setPicking('identity')}
              t={t}
            />
            <ConfigRow
              icon="branch"
              label="分支"
              value={branch.trim() || '默认分支'}
              divider
              onPress={() => setBranchOpen(true)}
              t={t}
            />
            <ConfigRow
              icon="sparkle"
              label="技能"
              value={skillIds.length > 0 ? `已选 ${skillIds.length} 项` : '仅默认技能'}
              divider
              onPress={() => setSkillPickerOpen(true)}
              t={t}
            />
          </Card>

          {/* describe */}
          <Card style={{ padding: 15, marginBottom: 14 }}>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder={speech.active ? '请说话…' : '描述任务，比如：修复登录页 token 刷新失效的问题，并补充测试…'}
              placeholderTextColor={speech.active ? t.acTx : t.tx3}
              multiline
              style={{ minHeight: 110, color: t.tx, fontSize: 15.5, lineHeight: 22, textAlignVertical: 'top', paddingRight: 40, paddingBottom: 34 }}
              editable={!submitting && !speech.active}
            />
            {/* 右下角语音输入 */}
            <View style={{ position: 'absolute', right: 12, bottom: 12 }}>
              <MicButton status={speech.status} active={speech.active} onPress={onMic} disabled={submitting} idleBg={t.bg4} idleColor={t.tx2} />
            </View>
          </Card>

          {/* suggestions */}
          <Text style={{ fontSize: 12, fontWeight: '700', color: t.tx3, letterSpacing: 0.5, marginBottom: 10 }}>试试这些</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => setContent(s)} style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11, backgroundColor: t.bg2, borderWidth: 1, borderColor: t.line }}>
                <Text style={{ color: t.tx2, fontSize: 13.5, fontWeight: '500' }}>{s}</Text>
              </Pressable>
            ))}
          </View>

          {loadError ? <Text style={{ color: t.red, fontSize: 13, marginTop: 14 }}>{loadError}</Text> : null}
          {error ? <Text style={{ color: t.red, fontSize: 13, marginTop: 14 }}>{error}</Text> : null}
        </ScrollView>
      )}

      {/* footer action */}
      {!loading ? (
        <View style={{ paddingHorizontal: spacing.pad, paddingTop: 12, paddingBottom: insets.bottom + 14, borderTopWidth: 1, borderColor: t.line, backgroundColor: t.bg }}>
          <PrimaryButton block icon={submitting ? undefined : 'send'} label={submitting ? (repoKey === ZIP_REPO_KEY ? '正在上传…' : '正在创建…') : '发起任务'} disabled={submitting || !content.trim()} onPress={submit} />
        </View>
      ) : null}

      <PickerSheet visible={picking === 'repo'} title="选择仓库" options={repoOptions} selected={repoKey}
        onPick={(k) => {
          // 「手动输入仓库地址」不直接选中，而是先收起列表、弹出输入框
          if (k === MANUAL_REPO_KEY) { setPicking(null); setManualOpen(true); return; }
          if (k === ZIP_REPO_KEY) { queueZipPickAfterSheet(); return; }
          setZipFile(null); setRepoKey(k); setPicking(null);
        }} onClose={() => setPicking(null)} onDismiss={runQueuedZipPick} />
      <RepoUrlSheet visible={manualOpen} initialUrl={manualRepo}
        onConfirm={(u) => { setZipFile(null); setManualRepo(u); setRepoKey(MANUAL_REPO_KEY); setManualOpen(false); }}
        onClose={() => setManualOpen(false)} />
      <ModelSheet visible={picking === 'model'} models={models} selectedId={modelId} plan={plan}
        onPick={(k) => { setModelId(k); setPicking(null); }} onClose={() => setPicking(null)} />
      <PickerSheet
        visible={picking === 'host'}
        title="选择宿主机"
        options={hosts.length ? hosts.map((h) => ({
          key: h.id ?? '',
          title: h.name || h.remark || h.id || '宿主机',
          sub: [h.os, h.cores ? `${h.cores} 核` : '', h.memory ? `${Math.round(h.memory / 1024 / 1024 / 1024)} GB` : ''].filter(Boolean).join(' · ') || undefined,
          icon: 'server',
          badge: h.is_default || h.default ? '默认' : undefined,
        })) : [{ key: TASK_DEFAULTS.hostId, title: '公共宿主机', sub: TASK_DEFAULTS.hostId, icon: 'server' }]}
        selected={hostId}
        onPick={(k) => { setHostId(k); setPicking(null); }}
        onClose={() => setPicking(null)}
      />
      <PickerSheet
        visible={picking === 'image'}
        title="选择运行镜像"
        options={images.length ? images.map((i) => ({
          key: i.id ?? '',
          title: i.name || i.remark || i.id || '镜像',
          sub: i.remark,
          icon: 'cube',
          badge: i.is_default || i.default ? '默认' : undefined,
        })) : [{ key: imageId, title: '默认镜像', sub: imageId, icon: 'cube' }]}
        selected={imageId}
        onPick={(k) => { setImageId(k); setPicking(null); }}
        onClose={() => setPicking(null)}
      />
      <PickerSheet
        visible={picking === 'identity'}
        title="选择 Git 身份"
        options={[
          { key: '', title: '不指定', sub: '使用仓库默认凭证', icon: 'git' },
          ...identities.map((i) => ({
            key: i.id ?? '',
            title: i.username || i.platform || i.id || 'Git 身份',
            sub: i.base_url || i.platform,
            icon: 'git',
          })),
        ]}
        selected={identityId}
        onPick={(k) => { setIdentityId(k); setPicking(null); }}
        onClose={() => setPicking(null)}
      />
      <PickerSheet
        visible={picking === 'resource'}
        title="资源规格"
        options={RESOURCE_PRESETS.map((p) => ({
          key: p.key,
          title: p.label,
          sub: p.sub,
          icon: 'cube',
        }))}
        selected={RESOURCE_PRESETS.find((p) => p.core === resource.core && p.memory === resource.memory)?.key}
        onPick={(k) => {
          const p = RESOURCE_PRESETS.find((r) => r.key === k);
          if (p) setResource((prev) => ({ ...prev, core: p.core, memory: p.memory }));
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
      <ConcurrentLimitModal visible={limitOpen} onClose={() => setLimitOpen(false)} onStopped={() => { setLimitOpen(false); setTimeout(() => submit(), 400); }} />

      {/* 分支输入 */}
      <Modal visible={branchOpen} transparent animationType="fade" onRequestClose={() => setBranchOpen(false)} statusBarTranslucent>
        <Scrim onPress={() => setBranchOpen(false)} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <View style={{ width: '100%', borderRadius: 22, backgroundColor: t.bg2, padding: 18 }}>
            <Text style={{ fontSize: 16.5, fontWeight: '700', color: t.tx }}>指定分支</Text>
            <Text style={{ fontSize: 12.5, color: t.tx3, marginTop: 4 }}>留空使用仓库默认分支</Text>
            <TextInput
              value={branch}
              onChangeText={setBranch}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="例如 feature/login"
              placeholderTextColor={t.tx3}
              style={{ marginTop: 12, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, backgroundColor: t.bg3, color: t.tx, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable onPress={() => { setBranch(''); setBranchOpen(false); }} style={{ flex: 1, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg3 }}>
                <Text style={{ color: t.tx2, fontSize: 14.5, fontWeight: '600' }}>清除</Text>
              </Pressable>
              <Pressable onPress={() => setBranchOpen(false)} style={{ flex: 1, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: t.ac }}>
                <Text style={{ color: t.acInk, fontSize: 14.5, fontWeight: '700' }}>确定</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 技能多选 */}
      <Modal visible={skillPickerOpen} transparent animationType="slide" onRequestClose={() => setSkillPickerOpen(false)} statusBarTranslucent>
        <Scrim onPress={() => setSkillPickerOpen(false)} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%', backgroundColor: t.bg2, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: insets.bottom + 14 }}>
          <View style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: t.line2, alignSelf: 'center', marginTop: 10, marginBottom: 8 }} />
          <Text style={{ paddingHorizontal: 18, paddingBottom: 6, fontSize: 17, fontWeight: '700', color: t.tx }}>选择技能</Text>
          <Text style={{ paddingHorizontal: 18, paddingBottom: 10, fontSize: 12.5, color: t.tx3 }}>
            默认技能始终包含，其余按需勾选
          </Text>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8 }}>
            {skills.length === 0 ? (
              <Text style={{ color: t.tx3, fontSize: 13, paddingVertical: 20, textAlign: 'center' }}>暂无可用技能</Text>
            ) : (
              skills.map((sk) => {
                const key = sk.id;
                // 强制下发技能由后端重新注入，这里展示为已选且不可取消。
                const forced = !!sk.is_force_delivery;
                const locked = forced || DEFAULT_SKILL_IDS.includes(key);
                const on = forced || skillIds.includes(key);
                return (
                  <Pressable
                    key={key}
                    disabled={locked}
                    onPress={() => setSkillIds((prev) => (on ? prev.filter((x) => x !== key) : [...prev, key]))}
                    style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 12, borderRadius: 13 }, pressed && { backgroundColor: t.bg3 }]}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: on ? t.ac : t.line2, backgroundColor: on ? t.ac : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Icons.check size={14} color={t.acInk} sw={2.6} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: t.tx, fontSize: 14.5, fontWeight: '600' }}>{sk.name || key}</Text>
                      {!!sk.description && (
                        <Text numberOfLines={2} style={{ color: t.tx3, fontSize: 12, marginTop: 2 }}>{sk.description}</Text>
                      )}
                    </View>
                    {locked && <Text style={{ color: t.tx3, fontSize: 11.5 }}>默认</Text>}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <PrimaryButton label="完成" icon="check" block onPress={() => setSkillPickerOpen(false)} />
          </View>
        </View>
      </Modal>

      {/* AI 数据处理同意：新建任务会把内容发给 AI，未同意则退出 */}
      <AiConsentModal visible={aiConsent.status === 'needed'} onAgree={aiConsent.grant} onDecline={() => router.back()} />
    </KeyboardAvoidingView>
  );
}
