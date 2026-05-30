/**
 * MessageStream 组件 —— 辅助聊天视图（浅色主题）
 *
 * 保留原有的消息气泡展示，但不再承担主要执行过程解释。
 * 执行过程由 ExecutionTimeline 组件负责。
 */
import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { User, Bot, Wrench, CheckCircle2, XCircle, Lightbulb, GitBranch, Info } from "lucide-react";
import type { StreamMessage } from "../types/agent";

function cleanThoughtContent(content: string): string {
  let cleaned = content;
  cleaned = cleaned.replace(/```(?:json)?\n?([\s\S]*?)```/g, "$1");
  cleaned = cleaned.replace(/^\[(CoT|ToT|反思|Thought|Reflect|分析)\]\s*/gim, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function MarkdownRender({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        pre: ({ children }) => (
          <pre className="my-2 overflow-x-auto rounded bg-gray-100 p-3 text-[12px] text-gray-700">
            {children}
          </pre>
        ),
        code: ({ children, className }) => {
          const isInline = !className;
          return isInline ? (
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px] text-gray-700">
              {children}
            </code>
          ) : (
            <code className="text-[12px]">{children}</code>
          );
        },
        ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900">{children}</strong>
        ),
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-[12px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-100 text-gray-700">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-gray-200">{children}</tbody>
        ),
        th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2">{children}</td>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="my-3 border-gray-200" />,
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-3 border-purple-200 pl-3 italic text-gray-500">
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface MessageStreamProps {
  messages: StreamMessage[];
  activeNode: string | null;
}

function MessageBubble({ msg }: { msg: StreamMessage }) {
  const variants = {
    hidden: { opacity: 0, y: 12, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1 },
  };

  switch (msg.type) {
    case "user":
      return (
        <motion.div variants={variants} initial="hidden" animate="visible" className="flex justify-end">
          <div className="max-w-[80%] rounded-lg rounded-br-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5">
              <User className="h-3 w-3 text-gray-400" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">用户</span>
            </div>
            <p className="text-sm leading-relaxed text-gray-800">{msg.content}</p>
          </div>
        </motion.div>
      );

    case "assistant": {
      const modelType = (msg.payload?.model_type as string) || "";
      const isPro = modelType === "pro";
      return (
        <motion.div variants={variants} initial="hidden" animate="visible" className="flex justify-start">
          <div className="max-w-[85%] rounded-lg rounded-bl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5">
              <Bot className="h-3 w-3 text-gray-400" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Agent</span>
              {modelType && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    isPro ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {modelType}
                </span>
              )}
            </div>
            <div className="text-sm leading-relaxed text-gray-700">
              <MarkdownRender content={msg.content} />
            </div>
          </div>
        </motion.div>
      );
    }

    case "tool_call": {
      const tc = msg.payload as { tool_name?: string; arguments?: Record<string, unknown> };
      return (
        <motion.div variants={variants} initial="hidden" animate="visible" className="flex justify-start">
          <div className="max-w-[85%] rounded-lg rounded-bl-sm border border-orange-200 bg-orange-50 px-4 py-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Wrench className="h-3 w-3 text-orange-500" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-orange-600">工具调用</span>
            </div>
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-orange-600">{tc.tool_name}</span>
            </p>
            {tc.arguments && (
              <pre className="mt-2 overflow-x-auto rounded bg-white/60 p-2 text-[11px] text-gray-500">
                {JSON.stringify(tc.arguments, null, 2)}
              </pre>
            )}
          </div>
        </motion.div>
      );
    }

    case "tool_result": {
      const tr = msg.payload as { tool_name?: string; ok?: boolean; data?: unknown; error?: string };
      const ok = tr.ok ?? true;
      return (
        <motion.div variants={variants} initial="hidden" animate="visible" className="flex justify-start">
          <div
            className={`max-w-[85%] rounded-lg rounded-bl-sm border px-4 py-3 ${
              ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
            }`}
          >
            <div className="mb-1 flex items-center gap-1.5">
              {ok ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              ) : (
                <XCircle className="h-3 w-3 text-red-500" />
              )}
              <span className={`text-[10px] font-medium uppercase tracking-wider ${ok ? "text-emerald-600" : "text-red-600"}`}>
                工具结果 — {tr.tool_name}
              </span>
            </div>
            {tr.data !== undefined && tr.data !== null && (
              <pre className="mt-1 overflow-x-auto rounded bg-white/60 p-2 text-[11px] text-gray-500">
                {typeof tr.data === "string" ? tr.data : JSON.stringify(tr.data, null, 2)}
              </pre>
            )}
            {tr.error && <p className="mt-1 text-xs text-red-500">{tr.error}</p>}
          </div>
        </motion.div>
      );
    }

    case "thought": {
      const th = msg.payload as { thought_type?: string };
      const typeLabel =
        th.thought_type === "cot" ? "CoT 思考" : th.thought_type === "tot" ? "ToT 探索" : "反思";
      const color =
        th.thought_type === "cot" ? "#7950f2" : th.thought_type === "tot" ? "#1971c2" : "#0ca678";
      return (
        <motion.div variants={variants} initial="hidden" animate="visible" className="flex justify-start">
          <div
            className="max-w-[85%] rounded-lg rounded-bl-sm border px-4 py-3"
            style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <Lightbulb className="h-3 w-3" style={{ color }} />
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color }}>
                {typeLabel}
              </span>
            </div>
            <div className="text-sm leading-relaxed text-gray-600">
              <MarkdownRender content={cleanThoughtContent(msg.content)} />
            </div>
          </div>
        </motion.div>
      );
    }

    case "candidate": {
      const cand = msg.payload as { candidates?: Array<Record<string, unknown>>; best_idx?: number };
      return (
        <motion.div variants={variants} initial="hidden" animate="visible" className="flex justify-start">
          <div className="max-w-[90%] rounded-lg rounded-bl-sm border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5">
              <GitBranch className="h-3 w-3 text-blue-500" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-blue-600">ToT 候选方案</span>
            </div>
            <div className="space-y-2">
              {cand.candidates?.map((c, i) => (
                <div
                  key={i}
                  className={`rounded border px-3 py-2 ${
                    i === cand.best_idx
                      ? "border-blue-300 bg-blue-100"
                      : "border-gray-200 bg-white/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-800">{String(c.name)}</span>
                    {i === cand.best_idx && (
                      <span className="rounded bg-blue-200 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                        最佳
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">{String(c.logic || "")}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      );
    }

    case "system":
      return (
        <motion.div variants={variants} initial="hidden" animate="visible" className="flex justify-center">
          <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 shadow-sm">
            <Info className="h-3 w-3 text-gray-400" />
            <span className="text-[10px] text-gray-500">{msg.content}</span>
          </div>
        </motion.div>
      );

    default:
      return null;
  }
}

export default function MessageStream({ messages, activeNode }: MessageStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, activeNode]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
      <AnimatePresence mode="popLayout">
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {activeNode && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 py-2"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-xs text-gray-400">节点 {activeNode} 执行中...</span>
            </motion.div>
          )}
        </div>
      </AnimatePresence>
    </div>
  );
}
