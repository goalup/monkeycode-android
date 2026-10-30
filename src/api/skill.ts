/** 技能与子代理。 */
import { request } from './client';
import type { Skill } from './types';

export function listSkills(params: { keyword?: string; scope?: string; sort?: string } = {}) {
  return request<Skill[]>('/api/v1/skills', { query: params });
}

/** 预置子 agent 元数据（domain.SubagentPreset）。 */
export interface SubagentPreset {
  name: string;
  description: string;
  read_only: boolean;
  tools: string[];
  default_tier: string;
  max_steps: number;
}

/** 任务子 agent 的运行时视图（domain.SubagentConfig）。 */
export interface TaskSubagentConfig {
  name: string;
  description: string;
  enabled: boolean;
  read_only: boolean;
  tools?: string[];
  model?: { id?: string; model?: string; provider?: string };
  tier?: string;
  tier_override?: string;
  fallback?: boolean;
}

/** 绑定项（subagentcfg.Binding）。model_id 为空时继承主 agent 模型。 */
export interface SubagentBinding {
  name: string;
  enabled?: boolean;
  model_id?: string | null;
  tier_override?: string;
  tools?: string[];
  prompt?: string;
  display_name?: string;
  description?: string;
  read_only?: boolean;
}

/** 单个子 agent 的用量归因（domain.SubagentUsage）。 */
export interface SubagentUsage {
  name: string;
  provider?: string;
  model_name?: string;
  model_id?: string;
  tier?: string;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  total_tokens?: number;
  requests?: number;
  cost?: number;
}

/** 子代理用量响应。 */
export interface SubagentUsageResp {
  subagents?: SubagentUsage[];
  total?: SubagentUsage;
}

export function listSubagentPresets() {
  return request<{ presets?: SubagentPreset[] }>(
    '/api/v1/users/tasks/subagents/presets',
  );
}

export function getTaskSubagents(taskId: string) {
  return request<{ subagents?: TaskSubagentConfig[] }>(
    `/api/v1/users/tasks/${taskId}/subagents`,
  );
}

export function setTaskSubagents(taskId: string, subagents: SubagentBinding[], requestId?: string) {
  return request<{ request_id?: string; success?: boolean; message?: string; session_id?: string }>(
    `/api/v1/users/tasks/${taskId}/subagents`,
    { method: 'PUT', body: { request_id: requestId, subagents } },
  );
}

export function getSubagentUsage(taskId: string) {
  return request<SubagentUsageResp>(`/api/v1/users/tasks/${taskId}/subagent-usage`);
}
