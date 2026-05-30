/**
 * ExecutionTimeline — 纵向执行时间线主视图
 *
 * 按 executionSteps 渲染 Agent 的完整执行过程，每条 step 为一条时间线节点。
 * 替代原来 MessageStream 的过程解释角色。
 */
import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Wrench,
  CheckCircle2,
  XCircle,
  Lightbulb,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Search,
  Calculator,
  Code2,
  FolderOpen,
} from "lucide-react";
import type { ExecutionStep, ExecutionStepType } from "../types/agent";

/* ================================================================
 * 步骤类型 → 视觉配置
 * ================================================================ */
interface StepStyle {
  label: string;
  color: string;
  bg: string;
  icon: ReactNode;
}

function getStepStyle(type: ExecutionStepType): StepStyle {
  switch (type) {
    case "llm_decision":
      return { label: "LLM 决策", color: "#0ca678", bg: "rgba(12,166,120,0.06)", icon: <Bot className="h-3.5 w-3.5" /> };
    case "permission_check":
      return { label: "权限检查", color: "#e8590c", bg: "rgba(232,89,12,0.06)", icon: <Wrench className="h-3.5 w-3.5" /> };
    case "tool_call_step":
      return { label: "工具调用", color: "#e8590c", bg: "rgba(232,89,12,0.06)", icon: <Wrench className="h-3.5 w-3.5" /> };
    case "tool_result_step":
      return { label: "工具结果", color: "#0ca678", bg: "rgba(12,166,120,0.04)", icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    case "cot_step":
      return { label: "CoT 思考", color: "#7950f2", bg: "rgba(121,80,242,0.05)", icon: <Lightbulb className="h-3.5 w-3.5" /> };
    case "tot_step":
      return { label: "ToT 探索", color: "#1971c2", bg: "rgba(25,113,194,0.05)", icon: <GitBranch className="h-3.5 w-3.5" /> };
    case "candidates_step":
      return { label: "候选方案", color: "#1971c2", bg: "rgba(25,113,194,0.05)", icon: <GitBranch className="h-3.5 w-3.5" /> };
    case "evaluate_step":
      return { label: "评估", color: "#1971c2", bg: "rgba(25,113,194,0.05)", icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    case "final_step":
      return { label: "最终输出", color: "#0ca678", bg: "rgba(12,166,120,0.06)", icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
  }
}

/* ================================================================
 * 清理思考内容
 * ================================================================ */
function cleanThoughtContent(content: string): string {
  let cleaned = content;
  cleaned = cleaned.replace(/```(?:json)?\n?([\s\S]*?)```/g, "$1");
  cleaned = cleaned.replace(/^\[(CoT|ToT|反思|Thought|Reflect|分析)\]\s*/gim, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

/* ================================================================
 * 内联 Markdown 渲染
 * ================================================================ */
function MarkdownRender({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
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
        ul: ({ children }) => <ul className="mb-1.5 list-disc pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-1.5 list-decimal pl-5">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
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
          <blockquote className="my-2 border-l-3 border-purple-300 pl-3 italic text-gray-500">
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/* ================================================================
 * 建议问题
 * ================================================================ */
const SUGGESTIONS = [
  { icon: <Search className="h-3.5 w-3.5" />, text: "搜索最新的 AI Agent 框架" },
  { icon: <Calculator className="h-3.5 w-3.5" />, text: "计算 2024 的平方根" },
  { icon: <Code2 className="h-3.5 w-3.5" />, text: "用 Python 画个正弦波" },
  { icon: <FolderOpen className="h-3.5 w-3.5" />, text: "分析当前目录结构" },
];

/* ================================================================
 * 空状态
 * ================================================================ */
function EmptyState({ onSuggestionClick }: { onSuggestionClick?: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8">
      <div className="text-center">
        <h2 className="font-display text-3xl text-gray-900">DeepThink Agent</h2>
        <p className="mt-2 text-sm text-gray-500">
          输入问题，观察 Agent 的完整思考与执行流程
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 max-w-lg">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.text}
            onClick={() => onSuggestionClick?.(s.text)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-left text-sm text-gray-600 transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-gray-900 hover:shadow-sm"
          >
            <span className="shrink-0 text-emerald-500">{s.icon}</span>
            <span className="truncate">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
 * Props
 * ================================================================ */
interface ExecutionTimelineProps {
  steps: ExecutionStep[];
  isRunning: boolean;
  activeNode: string | null;
  error: string | null;
  onSuggestionClick?: (text: string) => void;
}

/* ================================================================
 * 主组件
 * ================================================================ */
export default function ExecutionTimeline({
  steps,
  isRunning,
  activeNode,
  error,
  onSuggestionClick,
}: ExecutionTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps.length]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-5">
        <AnimatePresence mode="popLayout">
          {/* 空状态 */}
          {steps.length === 0 && !isRunning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full items-center justify-center"
              style={{ minHeight: "calc(100vh - 200px)" }}
            >
              <EmptyState onSuggestionClick={onSuggestionClick} />
            </motion.div>
          )}

          {/* 时间线 */}
          {steps.length > 0 && (
            <div className="flex flex-col">
              {steps.map((step, i) => {
                const isLast = i === steps.length - 1 && !isRunning;
                const expanded = expandedIds.has(step.id);
                const style = getStepStyle(step.type);
                const isCollapsible = step.type === "tool_call_step" || step.type === "tool_result_step";
                const showExpand = isCollapsible && !!(step.tool_args || step.tool_data);

                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex gap-4"
                  >
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                          step.status === "running"
                            ? "animate-pulse-glow border-current"
                            : step.status === "error"
                              ? "border-red-300 bg-red-50"
                              : "bg-white"
                        }`}
                        style={{
                          borderColor: step.status === "running" ? style.color : undefined,
                          color: style.color,
                        }}
                      >
                        {step.status === "running" ? (
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.color }} />
                        ) : (
                          <>{style.icon as ReactNode}</>
                        )}
                      </div>
                      {!isLast && <div className="w-px flex-1 bg-gray-200" />}
                    </div>
                    <div
                      className={`mb-4 flex-1 rounded-lg border px-4 py-3 ${
                        step.status === "error" ? "border-red-200 bg-red-50" : ""
                      }`}
                      style={{
                        borderColor: step.status === "error" ? undefined : `${style.color}30`,
                        backgroundColor: step.status === "error" ? undefined : style.bg,
                      }}
                    >
                      <div
                        className={`flex items-center gap-2 ${showExpand ? "cursor-pointer" : ""}`}
                        onClick={() => showExpand && toggleExpanded(step.id)}
                      >
                        <span
                          className="text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: style.color }}
                        >
                          {style.label}
                        </span>
                        {step.model_type && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                              step.model_type === "pro"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {step.model_type}
                          </span>
                        )}
                        {step.tool_name && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            {step.tool_name}
                          </span>
                        )}
                        {step.status === "running" ? (
                          <span className="text-[10px] text-gray-400">执行中...</span>
                        ) : null}
                        {step.status === "error" ? (
                          <span className="text-[10px] text-red-500">失败</span>
                        ) : null}
                        <span className="flex-1" />
                        {showExpand && (
                          <span style={{ color: style.color }}>
                            {expanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </span>
                        )}
                      </div>
                      {step.type === "tool_call_step" && step.tool_args && expanded && (
                        <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2.5 text-[11px] text-gray-600">
                          {JSON.stringify(step.tool_args, null, 2)}
                        </pre>
                      )}
                      {step.type === "tool_result_step" && step.tool_data !== undefined && expanded && (
                        <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2.5 text-[11px] text-gray-600">
                          {typeof step.tool_data === "string"
                            ? step.tool_data
                            : JSON.stringify(step.tool_data, null, 2)}
                        </pre>
                      )}
                      {step.type === "tool_result_step" && !showExpand && (
                        <p className="mt-1.5 text-sm text-gray-600">{step.content}</p>
                      )}
                      {(step.type === "llm_decision" ||
                        step.type === "cot_step" ||
                        step.type === "tot_step" ||
                        step.type === "final_step") && (
                        <div className="mt-2 text-sm leading-relaxed text-gray-700">
                          <MarkdownRender
                            content={
                              step.type === "cot_step" || step.type === "tot_step"
                                ? cleanThoughtContent(step.content)
                                : step.content
                            }
                          />
                        </div>
                      )}
                      {step.type === "candidates_step" && (
                        <p className="mt-1.5 text-sm text-gray-600">{step.content}</p>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/* 运行中指示器 */}
              {isRunning && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 py-2"
                >
                  <div className="flex flex-col items-center">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    <div className="w-px flex-1 bg-transparent" />
                  </div>
                  <span className="text-sm text-gray-400">
                    {activeNode ? `节点 ${activeNode} 执行中...` : "运行中..."}
                  </span>
                </motion.div>
              )}

              {/* 错误提示 */}
              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-4"
                >
                  <div className="flex flex-col items-center">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-red-300 bg-red-50 text-red-500">
                      <XCircle className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="flex-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
