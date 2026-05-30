/**
 * useAgentStream —— Agent SSE 流式连接管理 Hook
 *
 * 职责：
 * 1. 通过 fetch + ReadableStream 连接后端 /api/chat/stream SSE 接口
 * 2. 实时解析 SSE 数据流，转换为前端状态（消息列表、执行步骤、活跃节点、用量统计）
 * 3. 提供 sendMessage / stop / clear 三个操作接口
 */
import { useState, useCallback, useRef } from "react";
import type {
  SSEEvent,
  StreamMessage,
  ExecutionStep,
  MessagePayload,
  ToolCallPayload,
  ToolResultPayload,
  ThoughtPayload,
  CandidatePayload,
  StateUpdatePayload,
  UsagePayload,
} from "../types/agent";

const API_BASE = "http://localhost:8000";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AgentState {
  isRunning: boolean;
  activeNode: string | null;
  messages: StreamMessage[];
  executionSteps: ExecutionStep[];
  iteration: number;
  totRounds: number;
  needTot: boolean;
  usage: UsagePayload | null;
  error: string | null;
}

export function useAgentStream() {
  const [state, setState] = useState<AgentState>({
    isRunning: false,
    activeNode: null,
    messages: [],
    executionSteps: [],
    iteration: 0,
    totRounds: 0,
    needTot: false,
    usage: null,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const threadIdRef = useRef<string>(`frontend-${Date.now()}`);

  const sendMessage = useCallback(
    (question: string, enableTot = false) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      const userMsg: StreamMessage = {
        id: generateId(),
        type: "user",
        content: question,
        timestamp: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        isRunning: true,
        activeNode: "agent",
        messages: [...prev.messages, userMsg],
        executionSteps: [],
        error: null,
        usage: null,
      }));

      const payload = {
        question,
        thread_id: threadIdRef.current,
        enable_tot: enableTot,
        max_iterations: 10,
      };

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

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const jsonStr = trimmed.slice(6);
              try {
                const event: SSEEvent = JSON.parse(jsonStr);
                handleEvent(event);
              } catch {
                // 忽略格式异常
              }
            }
          }
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setState((prev) => ({
            ...prev,
            isRunning: false,
            activeNode: null,
            error: err.message || "连接失败",
          }));
        });

      function handleEvent(event: SSEEvent) {
        setState((prev) => {
          const next = { ...prev };
          const node = event.node || prev.activeNode;
          const ts = Date.now();

          switch (event.type) {
            // ---- run_start ----
            case "run_start": {
              next.activeNode = "agent";
              break;
            }

            // ---- node_start / node_end ----
            case "node_start":
            case "node_end": {
              next.activeNode = event.node || prev.activeNode;
              break;
            }

            // ---- message (LLM 响应) ----
            case "message": {
              const msg = event.data as unknown as MessagePayload;
              if (msg.role === "user") break;

              next.messages = [
                ...prev.messages,
                {
                  id: generateId(),
                  type: msg.role === "tool" ? "tool_result" : "assistant",
                  content: msg.content,
                  payload: { ...msg, node },
                  timestamp: ts,
                },
              ];
              next.activeNode = node;

              // 派生 executionStep
              if (msg.role === "assistant") {
                const step: ExecutionStep = {
                  id: generateId(),
                  type: next.activeNode === "final" || next.activeNode === "evaluate"
                    ? next.activeNode === "final" ? "final_step" : "evaluate_step"
                    : "llm_decision",
                  node: node || "agent",
                  model_type: msg.model_type,
                  content: msg.content,
                  iteration: prev.iteration,
                  status: "success",
                  timestamp: ts,
                };
                next.executionSteps = [...prev.executionSteps, step];
              }
              break;
            }

            // ---- tool_call ----
            case "tool_call": {
              const tc = event.data as unknown as ToolCallPayload;
              next.messages = [
                ...prev.messages,
                {
                  id: generateId(),
                  type: "tool_call",
                  content: `调用工具: ${tc.tool_name}`,
                  payload: { ...tc, node: "tools" },
                  timestamp: ts,
                },
              ];
              next.activeNode = "tools";

              next.executionSteps = [
                ...prev.executionSteps,
                {
                  id: generateId(),
                  type: "tool_call_step",
                  node: "tools",
                  tool_name: tc.tool_name,
                  tool_args: tc.arguments,
                  content: tc.tool_name,
                  iteration: prev.iteration,
                  status: "running",
                  timestamp: ts,
                },
              ];
              break;
            }

            // ---- tool_result ----
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
                  payload: { ...tr, node: "tools" },
                  timestamp: ts,
                },
              ];

              // 追加 tool_result step
              const updatedSteps = [...prev.executionSteps];
              const toolStep: ExecutionStep = {
                id: generateId(),
                type: "tool_result_step",
                node: "tools",
                tool_name: tr.tool_name,
                tool_ok: tr.ok,
                tool_data: tr.data,
                content: tr.ok ? "成功" : (tr.error || "失败"),
                iteration: prev.iteration,
                status: tr.ok ? "success" : "error",
                timestamp: ts,
              };
              next.executionSteps = [...updatedSteps, toolStep];
              break;
            }

            // ---- thought (CoT / ToT / Reflect) ----
            case "thought": {
              const th = event.data as unknown as ThoughtPayload;
              next.messages = [
                ...prev.messages,
                {
                  id: generateId(),
                  type: "thought",
                  content: th.content,
                  payload: { ...th, node },
                  timestamp: ts,
                },
              ];

              const thoughtType = th.thought_type === "cot"
                ? "cot_step" as const
                : th.thought_type === "tot"
                  ? "tot_step" as const
                  : "evaluate_step" as const;

              next.executionSteps = [
                ...prev.executionSteps,
                {
                  id: generateId(),
                  type: thoughtType,
                  node: node || th.thought_type,
                  content: th.content,
                  iteration: prev.iteration,
                  status: "success",
                  timestamp: ts,
                },
              ];
              next.activeNode = node;
              break;
            }

            // ---- candidate (ToT 候选方案) ----
            case "candidate": {
              const cand = event.data as unknown as CandidatePayload;
              next.messages = [
                ...prev.messages,
                {
                  id: generateId(),
                  type: "candidate",
                  content: `生成 ${cand.candidates.length} 个候选方案`,
                  payload: { ...cand, node: "tot" },
                  timestamp: ts,
                },
              ];

              next.executionSteps = [
                ...prev.executionSteps,
                {
                  id: generateId(),
                  type: "candidates_step",
                  node: "tot",
                  content: `${cand.candidates.length} 个候选方案`,
                  iteration: prev.iteration,
                  status: "success",
                  timestamp: ts,
                },
              ];
              break;
            }

            // ---- state_update ----
            case "state_update": {
              const st = event.data as unknown as StateUpdatePayload;
              if (st.iteration !== undefined) next.iteration = st.iteration;
              if (st.tot_rounds !== undefined) next.totRounds = st.tot_rounds;
              if (st.need_tot !== undefined) next.needTot = st.need_tot;
              break;
            }

            // ---- usage ----
            case "usage": {
              next.usage = event.data as unknown as UsagePayload;
              break;
            }

            // ---- error ----
            case "error": {
              const err = (event.data as { message?: string }).message || "未知错误";
              next.error = err;
              next.executionSteps = [
                ...prev.executionSteps,
                {
                  id: generateId(),
                  type: "evaluate_step",
                  node: "system",
                  content: err,
                  status: "error",
                  timestamp: ts,
                },
              ];
              break;
            }

            // ---- run_complete ----
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

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState((prev) => ({ ...prev, isRunning: false, activeNode: null }));
  }, []);

  const clear = useCallback(() => {
    stop();
    threadIdRef.current = `frontend-${Date.now()}`;
    setState({
      isRunning: false,
      activeNode: null,
      messages: [],
      executionSteps: [],
      iteration: 0,
      totRounds: 0,
      needTot: false,
      usage: null,
      error: null,
    });
  }, [stop]);

  return { state, sendMessage, stop, clear };
}
