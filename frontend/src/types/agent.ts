/**
 * 前端类型定义模块
 *
 * 本文件定义了前后端共享的数据结构类型，与后端 api/schemas.py 一一对应。
 * 企业级开发中，前后端接口契约必须保持同步，修改任意一端时需同步更新另一端。
 */

/**
 * SSE（Server-Sent Events）事件类型枚举
 * 对应后端 api/schemas.py 中 SSEEvent 的 type 字段
 */
export type SSEEventType =
  | "run_start"      // Agent 运行开始
  | "node_start"     // 某个节点开始执行
  | "node_end"       // 某个节点执行结束
  | "message"        // LLM 消息（AI / Human / Tool）
  | "tool_call"      // 工具调用请求
  | "tool_result"    // 工具执行结果
  | "thought"        // CoT / ToT / Reflect 思考过程
  | "candidate"      // ToT 候选方案更新
  | "state_update"   // 状态变更通知
  | "usage"          // Token / 成本用量统计
  | "error"          // 执行错误
  | "run_complete";  // 整个运行流程结束

/**
 * SSE 流事件结构
 * 后端通过 EventSource 推送到前端的每条消息都符合此格式
 */
export interface SSEEvent {
  type: SSEEventType;
  node?: string;                    // 关联的节点名称（如 agent / cot / tools）
  data: Record<string, unknown>;    // 事件载荷，根据 type 不同结构不同
  timestamp: string;                // ISO 格式时间戳
}

/**
 * 消息载荷 —— 对应 LLM 产生的各类消息
 */
export interface MessagePayload {
  role: "user" | "assistant" | "tool";
  content: string;
  model_type?: string;              // "pro" | "flash" | ""，仅 assistant 消息有
  tool_calls?: ToolCallInfo[];      // assistant 消息中的工具调用请求列表
  name?: string;                    // tool 消息的名称标识
  tool_ok?: boolean;                // tool 消息：工具执行是否成功
  tool_data?: unknown;              // tool 消息：工具返回的数据
  tool_error?: string;              // tool 消息：错误信息
}

/**
 * 单个工具调用信息
 */
export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * 工具调用事件载荷
 */
export interface ToolCallPayload {
  tool_name: string;
  arguments: Record<string, unknown>;
}

/**
 * 工具结果事件载荷
 */
export interface ToolResultPayload {
  tool_name: string;
  ok: boolean;
  data: unknown;
  error: string;
}

/**
 * 思考事件载荷 —— CoT / ToT / Reflect 节点产生
 */
export interface ThoughtPayload {
  thought_type: "cot" | "tot" | "reflect";
  content: string;
  details?: Record<string, unknown>;
}

/**
 * ToT 候选方案事件载荷
 */
export interface CandidatePayload {
  candidates: Array<Record<string, unknown>>;
  best_idx: number;
}

/**
 * 状态更新事件载荷
 */
export interface StateUpdatePayload {
  iteration: number;        // 当前迭代次数
  tot_rounds: number;       // ToT 探索轮次
  need_tot: boolean;        // 是否需要继续 ToT
  permission_granted?: boolean;
}

/**
 * 用量统计载荷
 */
export interface UsagePayload {
  elapsed_ms: number;       // 本次运行总耗时（毫秒）
  thread_id?: string;
  calls: number;            // LLM 调用次数
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
}

/**
 * Agent 后端配置响应
 */
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

/**
 * 前端内部使用的流式消息结构
 * 由 useAgentStream hook 根据 SSEEvent 转换而来，直接驱动 UI 渲染
 */
export interface StreamMessage {
  id: string;               // 前端生成的唯一标识
  type: "user" | "assistant" | "tool_call" | "tool_result" | "thought" | "candidate" | "system";
  content: string;          // 展示的文本内容
  payload?: Record<string, unknown>;  // 原始载荷，供组件按需读取
  timestamp: number;        // 前端收到时间（Unix 毫秒）
}

/** 执行步骤类型 — 驱动 ExecutionTimeline */
export type ExecutionStepType =
  | "llm_decision"
  | "permission_check"
  | "tool_call_step"
  | "tool_result_step"
  | "cot_step"
  | "tot_step"
  | "candidates_step"
  | "evaluate_step"
  | "final_step";

/** 执行时间线步骤 */
export interface ExecutionStep {
  id: string;
  type: ExecutionStepType;
  node: string;                    // SSE event.node
  model_type?: string;             // pro | flash
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_ok?: boolean;
  tool_data?: unknown;
  content: string;
  iteration?: number;
  tot_rounds?: number;
  status: "running" | "success" | "error" | "pending";
  timestamp: number;
  collapsed?: boolean;
}
