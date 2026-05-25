/**
 * useAgentStream —— Agent SSE 流式连接管理 Hook
 *
 * 职责：
 * 1. 通过 fetch + ReadableStream 连接后端 /api/chat/stream SSE 接口
 * 2. 实时解析 SSE 数据流，转换为前端状态（消息列表、活跃节点、用量统计）
 * 3. 提供 sendMessage / stop / clear 三个操作接口
 *
 * 设计决策：
 * - 使用 fetch 而非原生 EventSource，因为 EventSource 不支持 POST 请求和自定义请求头
 * - 使用 ReadableStream.getReader() 手动读取流，实现逐事件解析
 * - AbortController 用于支持用户手动中断运行
 */
import { useState, useCallback, useRef } from "react";
import type {
  SSEEvent,
  StreamMessage,
  MessagePayload,
  ToolCallPayload,
  ToolResultPayload,
  ThoughtPayload,
  CandidatePayload,
  StateUpdatePayload,
  UsagePayload,
} from "../types/agent";

/**
 * 后端 API 基础地址
 * 开发环境前后端分离，前端在 5173，后端在 8000
 * 生产环境应通过环境变量或反向代理配置
 */
const API_BASE = "http://localhost:8000";

/**
 * 生成前端唯一消息 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Agent 运行时状态
 * 驱动整个 UI 的单一数据源（Single Source of Truth）
 */
export interface AgentState {
  isRunning: boolean;           // 是否正在运行
  activeNode: string | null;    // 当前活跃的 LangGraph 节点
  messages: StreamMessage[];    // 消息流（用户、AI、工具、思考等）
  iteration: number;            // 当前迭代计数
  totRounds: number;            // ToT 探索轮次
  needTot: boolean;             // 是否需要继续 ToT
  usage: UsagePayload | null;   // 用量统计
  error: string | null;         // 错误信息
}

/**
 * useAgentStream Hook
 *
 * @returns state —— 当前 Agent 运行状态
 * @returns sendMessage —— 发送新问题，启动 SSE 流
 * @returns stop —— 中止当前运行
 * @returns clear —— 清空所有状态
 */
export function useAgentStream() {
  // Agent 完整状态
  const [state, setState] = useState<AgentState>({
    isRunning: false,
    activeNode: null,
    messages: [],
    iteration: 0,
    totRounds: 0,
    needTot: false,
    usage: null,
    error: null,
  });

  // AbortController 引用，用于中断 fetch 请求
  const abortRef = useRef<AbortController | null>(null);

  /**
   * 发送消息并启动 SSE 流
   *
   * @param question —— 用户输入的问题
   * @param enableTot —— 是否启用 Tree-of-Thought 深度思考模式
   */
  const sendMessage = useCallback(
    (question: string, enableTot = false) => {
      // 如果有正在运行的请求，先中止，防止竞态
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      // 构造用户消息并加入列表
      const userMsg: StreamMessage = {
        id: generateId(),
        type: "user",
        content: question,
        timestamp: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        isRunning: true,
        activeNode: "start",
        messages: [...prev.messages, userMsg],
        error: null,
        usage: null,
      }));

      // 构造请求体
      const payload = {
        question,
        thread_id: `frontend-${Date.now()}`,
        enable_tot: enableTot,
        max_iterations: 10,
      };

      // 发起 SSE POST 请求
      fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.text();
            throw new Error(err);
          }
          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          if (!reader) return;

          let buffer = "";

          // 循环读取流数据
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // SSE 协议以 "\n\n" 分隔事件
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const jsonStr = trimmed.slice(6); // 去掉 "data: " 前缀
              try {
                const event: SSEEvent = JSON.parse(jsonStr);
                handleEvent(event);
              } catch {
                // 忽略格式异常的事件
              }
            }
          }
        })
        .catch((err) => {
          // AbortError 是用户主动中断，不算错误
          if (err.name === "AbortError") return;
          setState((prev) => ({
            ...prev,
            isRunning: false,
            activeNode: null,
            error: err.message || "连接失败",
          }));
        });

      /**
       * 处理单个 SSE 事件，更新前端状态
       *
       * 事件类型与状态更新映射：
       * - run_start     → 标记 activeNode 为 agent
       * - message       → 将 LLM 消息追加到消息列表
       * - tool_call     → 显示工具调用卡片
       * - tool_result   → 显示工具执行结果
       * - thought       → 显示 CoT / ToT / Reflect 思考过程
       * - candidate     → 显示候选方案列表
       * - state_update  → 更新迭代计数、ToT 状态等
       * - usage         → 记录用量统计
       * - error         → 记录错误信息
       * - run_complete  → 标记运行结束
       */
      function handleEvent(event: SSEEvent) {
        setState((prev) => {
          const next = { ...prev };

          switch (event.type) {
            case "run_start": {
              next.activeNode = "agent";
              break;
            }
            case "node_start":
            case "node_end": {
              next.activeNode = event.node || prev.activeNode;
              break;
            }
            case "message": {
              const msg = event.data as unknown as MessagePayload;
              if (msg.role === "user") break; // 忽略重复用户消息
              next.messages = [
                ...prev.messages,
                {
                  id: generateId(),
                  type: msg.role === "tool" ? "tool_result" : "assistant",
                  content: msg.content,
                  payload: msg as unknown as Record<string, unknown>,
                  timestamp: Date.now(),
                },
              ];
              next.activeNode = event.node || prev.activeNode;
              break;
            }
            case "tool_call": {
              const tc = event.data as unknown as ToolCallPayload;
              next.messages = [
                ...prev.messages,
                {
                  id: generateId(),
                  type: "tool_call",
                  content: `调用工具: ${tc.tool_name}`,
                  payload: tc as unknown as Record<string, unknown>,
                  timestamp: Date.now(),
                },
              ];
              next.activeNode = "tools";
              break;
            }
            case "tool_result": {
              const tr = event.data as unknown as ToolResultPayload;
              next.messages = [
                ...prev.messages,
                {
                  id: generateId(),
                  type: "tool_result",
                  content: tr.ok
                    ? `工具 ${tr.tool_name} 执行成功`
                    : `工具 ${tr.tool_name} 执行失败: ${tr.error}`,
                  payload: tr as unknown as Record<string, unknown>,
                  timestamp: Date.now(),
                },
              ];
              break;
            }
            case "thought": {
              const th = event.data as unknown as ThoughtPayload;
              next.messages = [
                ...prev.messages,
                {
                  id: generateId(),
                  type: "thought",
                  content: th.content,
                  payload: th as unknown as Record<string, unknown>,
                  timestamp: Date.now(),
                },
              ];
              break;
            }
            case "candidate": {
              const cand = event.data as unknown as CandidatePayload;
              next.messages = [
                ...prev.messages,
                {
                  id: generateId(),
                  type: "candidate",
                  content: `生成 ${cand.candidates.length} 个候选方案`,
                  payload: cand as unknown as Record<string, unknown>,
                  timestamp: Date.now(),
                },
              ];
              break;
            }
            case "state_update": {
              const st = event.data as unknown as StateUpdatePayload;
              if (st.iteration !== undefined) next.iteration = st.iteration;
              if (st.tot_rounds !== undefined) next.totRounds = st.tot_rounds;
              if (st.need_tot !== undefined) next.needTot = st.need_tot;
              break;
            }
            case "usage": {
              next.usage = event.data as unknown as UsagePayload;
              break;
            }
            case "error": {
              next.error = (event.data as { message?: string }).message || "未知错误";
              break;
            }
            case "run_complete": {
              next.isRunning = false;
              next.activeNode = null;
              break;
            }
          }

          return next;
        });
      }
    },
    []
  );

  /**
   * 中止当前运行
   */
  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState((prev) => ({ ...prev, isRunning: false, activeNode: null }));
  }, []);

  /**
   * 清空所有状态，重置到初始值
   */
  const clear = useCallback(() => {
    stop();
    setState({
      isRunning: false,
      activeNode: null,
      messages: [],
      iteration: 0,
      totRounds: 0,
      needTot: false,
      usage: null,
      error: null,
    });
  }, [stop]);

  return { state, sendMessage, stop, clear };
}
