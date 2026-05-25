/**
 * 前端类型定义（与后端 api/schemas.py 对应）
 */

export type SSEEventType =
  | "run_start"
  | "node_start"
  | "node_end"
  | "message"
  | "tool_call"
  | "tool_result"
  | "thought"
  | "candidate"
  | "state_update"
  | "usage"
  | "error"
  | "run_complete";

export interface SSEEvent {
  type: SSEEventType;
  node?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface MessagePayload {
  role: "user" | "assistant" | "tool";
  content: string;
  model_type?: string;
  tool_calls?: ToolCallInfo[];
  name?: string;
  tool_ok?: boolean;
  tool_data?: unknown;
  tool_error?: string;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolCallPayload {
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultPayload {
  tool_name: string;
  ok: boolean;
  data: unknown;
  error: string;
}

export interface ThoughtPayload {
  thought_type: "cot" | "tot" | "reflect";
  content: string;
  details?: Record<string, unknown>;
}

export interface CandidatePayload {
  candidates: Array<Record<string, unknown>>;
  best_idx: number;
}

export interface StateUpdatePayload {
  iteration: number;
  tot_rounds: number;
  need_tot: boolean;
  permission_granted?: boolean;
}

export interface UsagePayload {
  elapsed_ms: number;
  thread_id?: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
}

export interface AgentConfig {
  pro_model: string;
  flash_model: string;
  base_url: string;
  temperature: number;
  max_tokens: number;
  max_iterations: number;
  permission_check: boolean;
  context_compact: boolean;
  tools: Array<{ name: string; description: string }>;
}

export interface StreamMessage {
  id: string;
  type: "user" | "assistant" | "tool_call" | "tool_result" | "thought" | "candidate" | "system";
  content: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}
