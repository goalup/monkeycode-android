/**
 * 领域类型 —— 从 Web 端 `frontend/src/api/Api.ts` 抽取出移动端实际用到的子集。
 * 字段命名与后端 JSON 保持一致。
 */

export type TaskStatus = 'pending' | 'processing' | 'error' | 'finished';
export type TaskType = 'develop' | 'design' | 'review';

export interface ApiEnvelope<T = unknown> {
  code: number;
  message?: string;
  data?: T;
}

export interface ModelBrief {
  id?: string;
  model?: string;
  remark?: string;
  provider?: string;
}

export interface TaskStats {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  llm_requests?: number;
}

/** 开发环境（VM）准备过程中的条件，task.virtualmachine.conditions 取最后一项作当前状态。 */
export type ConditionType =
  | 'Scheduled' | 'ImagePulled' | 'ProjectCloned' | 'ImageBuilt'
  | 'ContainerCreated' | 'ContainerStarted' | 'Ready' | 'Failed';
export interface Condition {
  type?: ConditionType;
  status?: number; // 0 未知 / 1 进行中 / 2 完成 / 3 失败
  reason?: string;
  message?: string;
  progress?: number; // 0-100
  last_transition_time?: number;
}

export interface ProjectTask {
  id: string;
  title?: string;
  content?: string;
  summary?: string;
  status?: TaskStatus;
  type?: TaskType;
  sub_type?: string;
  cli_name?: string;
  repo_url?: string;
  repo_filename?: string;
  branch?: string;
  full_name?: string;
  model?: ModelBrief;
  stats?: TaskStats;
  virtualmachine?: { id?: string; conditions?: Condition[] };
  created_at?: number;
  completed_at?: number;
}

export interface Project {
  id?: string;
  name?: string;
  description?: string;
  full_name?: string;
  repo_url?: string;
  platform?: string;
  auto_review_enabled?: boolean;
  created_at?: number;
  updated_at?: number;
  tasks?: ProjectTask[];
  issues?: { id?: string; status?: string }[];
}

export interface PageInfo {
  page?: number;
  size?: number;
  total?: number;
  total_count?: number;
  has_next_page?: boolean;
}

export interface ListTaskResp {
  tasks?: ProjectTask[];
  page_info?: PageInfo;
}

export interface Cursor {
  cursor?: string;
  has_more?: boolean;
}

export interface ListProjectResp {
  projects?: Project[];
  page?: Cursor;
}

/** 任务对话的原始事件块（rounds 接口返回）。data 为 base64 字符串。 */
export interface TaskChunkEntry {
  event?: string;
  kind?: string;
  data?: string;
  labels?: Record<string, string>;
  timestamp?: number;
}

export interface TaskRoundsResp {
  chunks?: TaskChunkEntry[];
  has_more?: boolean;
  next_cursor?: string;
}

/** 用户输入索引条目（domain.TaskUserInputItem）。 */
export interface TaskUserInputItem {
  id?: string;
  content?: string;
  truncated?: boolean;
  /** 纳秒精度，与流 chunk.timestamp 对齐；Loki 存储时可能缺省。 */
  timestamp?: number;
  /** 仅 ClickHouse 日志存储提供，可用于按轮次跳转。 */
  seq?: number;
}

/** 用户输入索引一页（domain.TaskUserInputsResp）。 */
export interface TaskUserInputsResp {
  items?: TaskUserInputItem[];
  has_more?: boolean;
  next_cursor?: string;
}

export interface UserStatus {
  id?: string;
  name?: string;
  username?: string;
  email?: string;
  avatar?: string;
  avatar_url?: string;
  role?: string;
  team?: { id?: string; name?: string };
}

export interface Wallet {
  /** 积分余额（展示时需 /1000） */
  balance?: number;
  /** 每日免费模型剩余 tokens */
  daily_token_balance?: number;
  /** 每日免费模型 tokens 上限 */
  daily_token_limit?: number;
}

export interface Subscription {
  /** "basic" | "pro" | "ultra" | "flagship" */
  plan?: string;
  expires_at?: string;
  auto_renew?: boolean;
  source?: string;
}

export interface InvitationItem {
  id?: string;
  name?: string;
  avatar_url?: string;
  credits?: number;
  invited_at?: number;
}

export interface InvitationListResp {
  count?: number;
  items?: InvitationItem[];
}

export type OwnerType = 'private' | 'public' | 'team';

export interface Model {
  id?: string;
  model?: string;
  remark?: string;
  provider?: string;
  is_default?: boolean;
  is_free?: boolean;
  is_hidden?: boolean;
  access_level?: string;
  weight?: number;
  owner?: { id?: string; name?: string; type?: OwnerType };
  /** 以下字段仅自有模型（owner.type === 'private'）返回，共享模型会被后端脱敏 */
  base_url?: string;
  api_key?: string;
  interface_type?: ModelInterfaceType;
  context_limit?: number;
  output_limit?: number;
  thinking_enabled?: boolean;
  support_image?: boolean;
}

export type ModelInterfaceType = 'openai_chat' | 'openai_responses' | 'anthropic';

/** 创建自有模型请求体（对齐后端 DomainCreateModelReq） */
export interface CreateModelReq {
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
  interface_type: ModelInterfaceType;
  remark?: string;
  context_limit?: number;
  output_limit?: number;
  thinking_enabled?: boolean;
  support_image?: boolean;
  is_default?: boolean;
}

/** 模型健康检查结果（DomainCheckModelResp） */
export interface CheckModelResp {
  success?: boolean;
  error?: string;
}

/** 更新自有模型请求体（对齐后端 DomainUpdateModelReq，字段均可选） */
export type UpdateModelReq = Partial<CreateModelReq>;

/** 供应商可用模型项（DomainProviderModelListItem） */
export interface ProviderModelItem {
  model?: string;
}

/** 宿主机（domain.Host）。 */
export interface Host {
  id?: string;
  name?: string;
  remark?: string;
  arch?: string;
  os?: string;
  cores?: number;
  memory?: number;
  status?: string;
  /** 后端同时下发 `default` 与 `is_default`，两者都可能为真。 */
  default?: boolean;
  is_default?: boolean;
  external_ip?: string;
}

export interface Image {
  id?: string;
  name?: string;
  remark?: string;
  default?: boolean;
  is_default?: boolean;
  owner?: { id?: string; name?: string; type?: OwnerType };
}

export interface SkillScope {
  type: string;
  id: string;
}

export interface SkillGroupRef {
  id: string;
  name?: string;
}

/** 技能列表项（domain.SkillListItem）。 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  categories?: string[];
  active_version?: string;
  is_force_delivery?: boolean;
  enabled?: boolean;
  scope?: SkillScope;
  groups?: SkillGroupRef[];
  owner_id?: string;
  owner_name?: string;
}

/** Git 平台类型（对齐后端 consts.GitPlatform）。internal 为系统内部身份，不对用户展示。 */
export type GitPlatform = 'github' | 'gitlab' | 'gitea' | 'gitee' | 'codeup' | 'cnb' | 'atomgit' | 'internal';

/** Git 身份有权限访问的仓库（git-identities 详情接口返回）。 */
export interface AuthRepository {
  url?: string;
  full_name?: string;
  description?: string;
}

/** Git 身份凭证（对齐后端 domain.GitIdentity）。 */
export interface GitIdentity {
  id?: string;
  platform?: GitPlatform;
  base_url?: string;
  username?: string;
  email?: string;
  access_token?: string;
  remark?: string;
  organization_id?: string;
  /** true 表示通过 GitHub App 安装绑定（无需手动 token，编辑时隐藏 token 字段） */
  is_installation_app?: boolean;
  created_at?: string;
  /** 仅 git-identities 详情接口返回：该身份有权访问的仓库列表 */
  authorized_repositories?: AuthRepository[];
}

/** 添加 Git 身份请求体（对齐后端 domain.AddGitIdentityReq）。 */
export interface AddGitIdentityReq {
  platform: GitPlatform;
  base_url: string;
  access_token: string;
  username: string;
  email: string;
  remark?: string;
  organization_id?: string;
}

/** 更新 Git 身份请求体（对齐后端 domain.UpdateGitIdentityReq，字段均可选，只传需变更的）。 */
export interface UpdateGitIdentityReq {
  platform?: GitPlatform;
  base_url?: string;
  access_token?: string;
  username?: string;
  email?: string;
  remark?: string;
  organization_id?: string;
}

/** OAuth 授权地址响应（domain.OAuthURLResp）。 */
export interface OAuthURLResp {
  url?: string;
}

/** 创建项目请求体（对齐后端 domain.CreateProjectReq，移动端用到的子集）。 */
export interface CreateProjectReq {
  name?: string;
  description?: string;
  platform?: GitPlatform;
  git_identity_id?: string;
  repo_url?: string;
}

/** 创建任务请求体（对齐后端 DomainCreateTaskReq） */
export interface CreateTaskReq {
  content: string;
  cli_name: string;
  model_id: string;
  host_id: string;
  image_id: string;
  task_type: TaskType;
  repo: { repo_url?: string; branch?: string; zip_url?: string; repo_filename?: string };
  resource: { core: number; memory: number; life: number };
  extra?: { skill_ids?: string[]; project_id?: string; issue_id?: string };
  git_identity_id?: string;
}

/* ===================== 任务详情增强 ===================== */

/** 队列条目投递方式（domain.QueuedInputDelivery）。 */
export type QueuedInputDelivery = 'after_turn' | 'immediate' | 'interrupt';

/** 队列条目状态（domain.QueuedInputStatus）。 */
export type QueuedInputStatus =
  | 'queued'
  | 'dispatching'
  | 'dispatched'
  | 'failed'
  | 'cancelled';

/** 一条待派发的用户输入（domain.QueuedInput）。 */
export interface QueuedInput {
  id: string;
  task_id: string;
  user_id: string;
  seq: number;
  content: string;
  attachments?: { url: string; filename: string }[];
  delivery: QueuedInputDelivery;
  status: QueuedInputStatus;
  client_request_id?: string;
  attempts?: number;
  last_error?: string;
  dispatched_at?: string;
  created_at?: string;
  updated_at?: string;
}

/** 队列快照（domain.QueuedInputSnapshot）。 */
export interface QueuedInputSnapshot {
  size: number;
  items?: QueuedInput[];
}

/** 提交队列条目请求。 */
export interface SubmitQueuedInputReq {
  content: string;
  attachments?: { url: string; filename: string }[];
  delivery?: QueuedInputDelivery;
  client_request_id?: string;
}

/** Token 用量（domain.TaskUsage）。 */
export interface TaskUsage {
  tokens?: {
    input_uncached?: number;
    cache_read?: number;
    cache_write?: number;
    output?: number;
    reasoning?: number;
    total?: number;
  } | null;
  cache_hit_rate?: number;
  rounds?: number;
  steps?: number;
  model_time_ms?: number;
  tool_time_ms?: number;
  ttft_ms?: number;
  tps?: number;
  requests?: number;
  cost?: number | null;
}

/** 时间线中的工具调用摘要（domain.TaskTimelineToolCall）。 */
export interface TaskTimelineToolCall {
  id: string;
  title: string;
  kind: string;
  status: string;
  /** 纳秒时间戳。 */
  started_at: number;
  /** 纳秒时间戳。 */
  ended_at: number;
  duration_ms: number;
  parent_call_id?: string;
  subagent_type?: string;
  description?: string;
}

/** 时间线中的失败事件（domain.TaskTimelineError）。 */
export interface TaskTimelineError {
  /** 纳秒时间戳。 */
  at: number;
  message: string;
  exit_code?: number;
}

/** 时间线单轮（domain.TaskTimelineTurn）。时间戳为纳秒。 */
export interface TaskTimelineTurn {
  turn_seq: number;
  started_at: number;
  ended_at: number;
  duration_ms: number;
  status: string;
  exit_code?: number;
  message?: string;
  steps: number;
  tool_calls?: TaskTimelineToolCall[];
  plans: number;
  context_used?: number;
  context_size?: number;
  errors?: TaskTimelineError[];
}

/** 一次失败的模型调用（domain.TaskModelFailure），用于失败诊断。 */
export interface TaskModelFailure {
  /** 纳秒时间戳。 */
  at: number;
  provider: string;
  model_name: string;
  error_class: string;
  source: string;
  request_id?: string;
}

/** 时间线响应（domain.TaskTimelineResp）。 */
export interface TaskTimelineResp {
  turns: TaskTimelineTurn[];
  next_cursor?: string;
  has_more: boolean;
  model_failures?: TaskModelFailure[];
}

/** 工作区最后一次变更快照（domain.TaskWorkspaceSnapshot）。 */
export interface WorkspaceSnapshot {
  version: number;
  changes?: unknown;
  branch?: string;
  commit_hash?: string;
  updated_at?: string;
}

/** 工作区快照历史版本摘要（domain.TaskWorkspaceSnapshotVersion）。 */
export interface WorkspaceSnapshotVersion {
  version: number;
  branch?: string;
  commit_hash?: string;
  created_at?: string;
}

/** 通知条目（domain.UserNotification）。 */
export interface NotificationItem {
  ref_id: string;
  kind: string;
  level: string;
  title: string;
  content?: string;
  task_id?: string;
  schedule_id?: string;
  occurred_at: number;
  read: boolean;
}

/** 通知未读分布（domain.NotificationSummary）。 */
export interface NotificationSummary {
  total: number;
  unread: number;
  task_unread: number;
  schedule_unread: number;
  error_unread: number;
}

/** 通知列表响应（domain.ListUserNotificationsResp）。 */
export interface NotificationListResp {
  items: NotificationItem[];
  unread_count: number;
  summary?: NotificationSummary;
}

/** 云盘配额。 */
export interface DriveQuota {
  used: number;
  limit: number;
  max_file_size: number;
}

/** 云盘预签名直传凭证（domain.DriveUploadTicket）。 */
export interface DriveUploadTicket {
  id: string;
  path: string;
  object_key: string;
  upload_url: string;
  expires_in: number;
}

/** 云盘对象（domain.DriveObject）。时间字段为 RFC3339 字符串。 */
export interface DriveObject {
  id: string;
  user_id?: string;
  team_id?: string;
  task_id?: string;
  path: string;
  name: string;
  mime?: string;
  size?: number;
  sha256?: string;
  created_at?: string;
  updated_at?: string;
}

/** 列目录响应（domain.DriveListResp）：Dirs 是由文件路径推导出的子目录名。 */
export interface DriveListResp {
  path?: string;
  dirs?: string[];
  files?: DriveObject[];
}

/** 全盘搜索响应（domain.DriveSearchResp）。 */
export interface DriveSearchResp {
  files?: DriveObject[];
  total?: number;
}

/** 记忆条目（domain.MemoryItem）。ID 是 32 位十六进制串。 */
export interface MemoryItem {
  id: string;
  content: string;
  category?: string;
  temporal_type?: string;
  importance?: number;
  standing?: boolean;
  status?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  access_count?: number;
  expires_at?: string;
  score?: number;
  archived?: boolean;
}

/** 记忆列表响应（domain.MemoryListResp）。 */
export interface MemoryListResp {
  memories?: MemoryItem[];
  total?: number;
  limit?: number;
  offset?: number;
  query?: string;
  count?: number;
}

/** 画像高频词（domain.MemoryKeyword）。 */
export interface MemoryKeyword {
  word: string;
  count: number;
}

/** 记忆上下文（domain.MemoryContext）：画像 + 常驻记忆 + 热记忆。 */
export interface MemoryContext {
  profile?: MemoryProfile;
  standing?: MemoryItem[];
  hot?: MemoryItem[];
  categories?: string[];
}

/** 记忆画像（domain.MemoryProfile）。 */
export interface MemoryProfile {
  total?: number;
  standing?: number;
  by_category?: Record<string, number>;
  by_temporal_type?: Record<string, number>;
  top_keywords?: MemoryKeyword[];
  recent?: MemoryItem[];
  first_memory_at?: string;
  last_memory_at?: string;
}

/** 定时任务（domain.ScheduleWithTask）。时间字段是 RFC3339 字符串。 */
export interface TaskSchedule {
  id: string;
  task_id?: string;
  kind?: string;
  prompt?: string;
  interval_seconds?: number;
  next_run_at?: string;
  enabled?: boolean;
  fail_count?: number;
  last_run_at?: string;
  created_at?: string;
  updated_at?: string;
  task_title?: string;
  task_status?: string;
  task_type?: string;
  last_run?: TaskScheduleRun;
}

/** 一次定时任务执行记录（domain.TaskScheduleRun）。 */
export interface TaskScheduleRun {
  id?: string;
  schedule_id?: string;
  task_id?: string;
  status?: string;
  error?: string;
  started_at?: string;
  finished_at?: string;
  created_at?: string;
}

/** 定时任务列表响应（domain.ListSchedulesResp）。 */
export interface TaskScheduleListResp {
  items?: TaskSchedule[];
  page_info?: { has_next_page?: boolean; total_count?: number };
  summary?: {
    total?: number;
    enabled?: number;
    disabled?: number;
    failing?: number;
    runs_7d?: number;
    failed_7d?: number;
  };
}

/* ===================== Android 设备池 ===================== */

/** 设备池实例状态。 */
export type AndroidInstanceState =
  | 'online'
  | 'creating'
  | 'sleeping'
  | 'stopped'
  | 'destroying'
  | 'unknown';

/** 设备池实例。`device` 是 runner 分配的设备 ID，也是删除接口的路径参数。 */
export interface AndroidInstance {
  device: string;
  state?: AndroidInstanceState;
  holder?: string;
  owner?: string;
  owner_name?: string;
  display_name?: string;
  endpoint?: string;
  created_at?: number;
  boot_at?: number;
  age_seconds?: number;
  idle_seconds?: number;
  lease_remaining_seconds?: number | null;
}

/** 设备池 Governor 指标。 */
export interface AndroidGovernor {
  cores?: number;
  loadavg?: number;
  mem_available_mb?: number;
  reserve_mb?: number;
  per_device_mem_mb?: number;
  by_mem?: number;
  by_cpu?: number;
  target?: number;
  effective?: number;
  hard_min?: number;
  hard_max?: number;
  cpu_brake?: number;
  cpu_brake_enabled?: boolean;
  ts?: number;
}

/** 设备池队列项。`waiter_id` 是取消排队的唯一凭据。 */
export interface AndroidQueueItem {
  waiter_id?: string;
  holder?: string;
  owner?: string;
  owner_name?: string;
  display_name?: string;
  position?: number;
  enqueued_at?: number;
  wait_seconds?: number;
  eta_seconds?: number;
}

/** 设备池告警。 */
export interface AndroidAlert {
  id?: string;
  kind?: string;
  level?: string;
  message?: string;
  age_seconds?: number;
  ts?: number;
}

/** 设备池概览（domain.AndroidOverview）。 */
export interface AndroidOverview {
  enabled?: boolean;
  can_manage?: boolean;
  governor?: AndroidGovernor;
  instances?: AndroidInstance[];
  queue?: AndroidQueueItem[];
  queue_depth?: number;
  alerts?: AndroidAlert[];
  error?: string;
}

/** 设备池配置取值（runner 以字符串返回）。 */
export type AndroidConfigMap = Record<string, string>;

/** 可写配置项（后端只透传已提供的键，未提供的保持原值）。 */
export interface AndroidConfigPatch {
  lease_ttl_seconds?: number;
  hard_min?: number;
  hard_max?: number;
  sleep_enabled?: boolean;
  sleep_after_idle_seconds?: number;
  stop_after_idle_seconds?: number;
  destroy_on_release?: boolean;
  reconcile_enabled?: boolean;
}
