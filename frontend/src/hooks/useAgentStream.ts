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

const API_BASE = "http://localhost:8000";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AgentState {
  isRunning: boolean;
  activeNode: string | null;
  messages: StreamMessage[];
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
    iteration: 0,
    totRounds: 0,
    needTot: false,
    usage: null,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    (question: string, enableTot = false) => {
      // 如果有正在运行的请求，先中止
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const abortController = new AbortController();
      abortRef.current = abortController;

      // 添加用户消息
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

      const payload = {
        question,
        thread_id: `frontend-${Date.now()}`,
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
                // ignore malformed events
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

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState((prev) => ({ ...prev, isRunning: false, activeNode: null }));
  }, []);

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
