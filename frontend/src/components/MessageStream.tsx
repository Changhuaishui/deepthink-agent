/**
 * MessageStream 组件 —— 右侧消息流展示面板
 *
 * 职责：
 * - 按时间顺序展示所有类型的消息（用户、AI、工具调用、工具结果、思考过程、候选方案）
 * - 每条消息根据类型渲染不同的视觉样式（颜色、图标、布局）
 * - 新消息自动滚动到底部
 * - 空状态时展示引导提示
 *
 * 消息类型映射：
 * - user        → 右侧气泡，用户输入
 * - assistant   → 左侧气泡，AI 回复（带 Pro/Flash 模型标签）
 * - tool_call   → 左侧卡片，展示工具名称与参数
 * - tool_result → 左侧卡片，展示执行结果（成功/失败）
 * - thought     → 左侧卡片，CoT/ToT/Reflect 思考内容
 * - candidate   → 左侧卡片，ToT 候选方案列表（高亮最佳方案）
 * - system      → 居中提示，系统级通知
 */
import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  User,
  Bot,
  Wrench,
  CheckCircle2,
  XCircle,
  Lightbulb,
  GitBranch,
  Info,
} from "lucide-react";
import type { StreamMessage } from "../types/agent";

/**
 * 清理思维链内容中的无关代码结构
 *
 * 问题：CoT/ToT 节点有时会返回 markdown 代码块（```json ... ```）、
 *       原始 JSON 字符串、系统标记前缀（[CoT]、[ToT]）等，
 *       直接展示给用户会造成阅读障碍。
 *
 * 策略：
 * 1. 去掉 markdown 代码块标记（保留块内文本）
 * 2. 去掉系统前缀标记 [CoT]、[ToT]、[反思] 等
 * 3. 去掉独立的 JSON 对象/数组块
 * 4. 压缩多余空行，保留段落和列表结构
 */
function cleanThoughtContent(content: string): string {
  let cleaned = content;

  // 去掉 markdown 代码块标记，保留块内文本
  cleaned = cleaned.replace(/```(?:json)?\n?([\s\S]*?)```/g, "$1");

  // 去掉系统前缀标记（行首的 [CoT]、[ToT]、[反思] 等）
  cleaned = cleaned.replace(/^\[(CoT|ToT|反思|Thought|Reflect|分析)\]\s*/gim, "");

  // 去掉独立的 JSON 对象块（通常是大段的 { ... } 或 [ ... ]）
  // 注意：只去掉看起来是完整 JSON 的块，保留行内简短内容
  cleaned = cleaned.replace(/\{[\s\S]{20,}?\}/g, "");
  cleaned = cleaned.replace(/\[[\s\S]{20,}?\]/g, "");

  // 压缩 3 个以上连续换行为 2 个
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

/**
 * Markdown 渲染组件（深色主题适配）
 *
 * 为 react-markdown 提供自定义组件映射，
 * 确保表格、代码块、列表等元素在 Obsidian 深色主题下可读。
 */
function MarkdownRender({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // 段落样式
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        ),
        // 代码块（带语言标识）
        pre: ({ children }) => (
          <pre className="my-2 overflow-x-auto rounded bg-obsidian-bg/80 p-3 text-[12px] text-accent-flash">
            {children}
          </pre>
        ),
        // 行内代码
        code: ({ children, className }) => {
          const isInline = !className;
          return isInline ? (
            <code className="rounded bg-obsidian-bg/60 px-1 py-0.5 text-[12px] text-accent-tool">
              {children}
            </code>
          ) : (
            <code className="text-[12px] text-accent-flash">{children}</code>
          );
        },
        // 无序列表
        ul: ({ children }) => (
          <ul className="mb-2 list-disc pl-5 text-ivory/90">{children}</ul>
        ),
        // 有序列表
        ol: ({ children }) => (
          <ol className="mb-2 list-decimal pl-5 text-ivory/90">{children}</ol>
        ),
        // 列表项
        li: ({ children }) => <li className="mb-1">{children}</li>,
        // 表格容器
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-[12px]">
              {children}
            </table>
          </div>
        ),
        // 表头
        thead: ({ children }) => (
          <thead className="bg-obsidian-panel text-accent-flash">{children}</thead>
        ),
        // 表体
        tbody: ({ children }) => (
          <tbody className="divide-y divide-obsidian-border">{children}</tbody>
        ),
        // 表头单元格
        th: ({ children }) => (
          <th className="px-3 py-2 font-semibold">{children}</th>
        ),
        // 表体单元格
        td: ({ children }) => (
          <td className="px-3 py-2 text-ivory/80">{children}</td>
        ),
        // 粗体
        strong: ({ children }) => (
          <strong className="font-semibold text-ivory">{children}</strong>
        ),
        // 链接
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-tot underline hover:text-accent-flash"
          >
            {children}
          </a>
        ),
        // 水平分割线
        hr: () => <hr className="my-3 border-obsidian-border" />,
        // 引用块
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-accent-cot pl-3 text-ivory-muted italic">
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
  messages: StreamMessage[];      // 消息列表
  activeNode: string | null;      // 当前活跃节点（用于展示"执行中"提示）
}

/**
 * 单条消息气泡组件
 * 根据 msg.type 选择对应的渲染策略
 */
function MessageBubble({ msg }: { msg: StreamMessage }) {
  // Framer Motion 入场动画配置
  const variants = {
    hidden: { opacity: 0, y: 12, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1 },
  };

  switch (msg.type) {
    // ========== 用户消息 ==========
    case "user":
      return (
        <motion.div
          variants={variants}
          initial="hidden"
          animate="visible"
          className="flex justify-end"
        >
          <div className="max-w-[80%] rounded-lg rounded-br-sm border border-obsidian-border bg-obsidian-panel-hover px-4 py-3">
            <div className="mb-1 flex items-center gap-1.5">
              <User className="h-3 w-3 text-ivory-muted" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-ivory-muted">
                用户
              </span>
            </div>
            <p className="text-sm leading-relaxed text-ivory">{msg.content}</p>
          </div>
        </motion.div>
      );

    // ========== AI 助手消息 ==========
    case "assistant": {
      const modelType = (msg.payload?.model_type as string) || "";
      const isPro = modelType === "pro";
      return (
        <motion.div
          variants={variants}
          initial="hidden"
          animate="visible"
          className="flex justify-start"
        >
          <div
            className={`max-w-[85%] rounded-lg rounded-bl-sm border px-4 py-3 ${
              isPro
                ? "border-accent-pro/30 bg-accent-pro/5"
                : "border-accent-flash/30 bg-accent-flash/5"
            }`}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <Bot className="h-3 w-3 text-ivory-muted" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-ivory-muted">
                Agent
              </span>
              {/* 模型类型标签：Pro 为琥珀金，Flash 为青绿 */}
              {modelType && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    isPro
                      ? "bg-accent-pro/20 text-accent-pro"
                      : "bg-accent-flash/20 text-accent-flash"
                  }`}
                >
                  {modelType}
                </span>
              )}
            </div>
            <div className="text-sm leading-relaxed text-ivory">
              <MarkdownRender content={msg.content} />
            </div>
          </div>
        </motion.div>
      );
    }

    // ========== 工具调用请求 ==========
    case "tool_call": {
      const tc = msg.payload as { tool_name?: string; arguments?: Record<string, unknown> };
      return (
        <motion.div
          variants={variants}
          initial="hidden"
          animate="visible"
          className="flex justify-start"
        >
          <div className="max-w-[85%] rounded-lg rounded-bl-sm border border-accent-tool/30 bg-accent-tool/5 px-4 py-3">
            <div className="mb-1 flex items-center gap-1.5">
              <Wrench className="h-3 w-3 text-accent-tool" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-accent-tool">
                工具调用
              </span>
            </div>
            <p className="text-sm text-ivory">
              <span className="font-semibold text-accent-tool">{tc.tool_name}</span>
            </p>
            {tc.arguments && (
              <pre className="mt-2 overflow-x-auto rounded bg-obsidian-bg/60 p-2 text-[11px] text-ivory-muted">
                {JSON.stringify(tc.arguments, null, 2)}
              </pre>
            )}
          </div>
        </motion.div>
      );
    }

    // ========== 工具执行结果 ==========
    case "tool_result": {
      const tr = msg.payload as { tool_name?: string; ok?: boolean; data?: unknown; error?: string };
      const ok = tr.ok ?? true;
      return (
        <motion.div
          variants={variants}
          initial="hidden"
          animate="visible"
          className="flex justify-start"
        >
          <div
            className={`max-w-[85%] rounded-lg rounded-bl-sm border px-4 py-3 ${
              ok
                ? "border-accent-flash/20 bg-accent-flash/5"
                : "border-accent-error/20 bg-accent-error/5"
            }`}
          >
            <div className="mb-1 flex items-center gap-1.5">
              {ok ? (
                <CheckCircle2 className="h-3 w-3 text-accent-flash" />
              ) : (
                <XCircle className="h-3 w-3 text-accent-error" />
              )}
              <span
                className={`text-[10px] font-medium uppercase tracking-wider ${
                  ok ? "text-accent-flash" : "text-accent-error"
                }`}
              >
                工具结果 — {tr.tool_name}
              </span>
            </div>
            {tr.data !== undefined && tr.data !== null && (
              <pre className="mt-1 overflow-x-auto rounded bg-obsidian-bg/60 p-2 text-[11px] text-ivory-muted">
                {typeof tr.data === "string" ? tr.data : JSON.stringify(tr.data, null, 2)}
              </pre>
            )}
            {tr.error && <p className="mt-1 text-xs text-accent-error">{tr.error}</p>}
          </div>
        </motion.div>
      );
    }

    // ========== 思考过程（CoT / ToT / Reflect）==========
    case "thought": {
      const th = msg.payload as { thought_type?: string };
      const typeLabel =
        th.thought_type === "cot" ? "CoT 思考" : th.thought_type === "tot" ? "ToT 探索" : "反思";
      const color =
        th.thought_type === "cot" ? "#b8a1e6" : th.thought_type === "tot" ? "#4facfe" : "#00d4aa";
      return (
        <motion.div
          variants={variants}
          initial="hidden"
          animate="visible"
          className="flex justify-start"
        >
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
            <div className="text-sm leading-relaxed text-ivory/80">
              <MarkdownRender content={cleanThoughtContent(msg.content)} />
            </div>
          </div>
        </motion.div>
      );
    }

    // ========== ToT 候选方案 ==========
    case "candidate": {
      const cand = msg.payload as { candidates?: Array<Record<string, unknown>>; best_idx?: number };
      return (
        <motion.div
          variants={variants}
          initial="hidden"
          animate="visible"
          className="flex justify-start"
        >
          <div className="max-w-[90%] rounded-lg rounded-bl-sm border border-accent-tot/30 bg-accent-tot/5 px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5">
              <GitBranch className="h-3 w-3 text-accent-tot" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-accent-tot">
                ToT 候选方案
              </span>
            </div>
            <div className="space-y-2">
              {cand.candidates?.map((c, i) => (
                <div
                  key={i}
                  className={`rounded border px-3 py-2 ${
                    i === cand.best_idx
                      ? "border-accent-tot/40 bg-accent-tot/10"
                      : "border-obsidian-border bg-obsidian-bg/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ivory">{String(c.name)}</span>
                    {i === cand.best_idx && (
                      <span className="rounded bg-accent-tot/20 px-1.5 py-0.5 text-[9px] text-accent-tot">
                        最佳
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-ivory-muted">{String(c.logic || "")}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      );
    }

    // ========== 系统通知 ==========
    case "system":
      return (
        <motion.div
          variants={variants}
          initial="hidden"
          animate="visible"
          className="flex justify-center"
        >
          <div className="flex items-center gap-1.5 rounded-full border border-obsidian-border bg-obsidian-panel px-3 py-1">
            <Info className="h-3 w-3 text-ivory-muted" />
            <span className="text-[10px] text-ivory-muted">{msg.content}</span>
          </div>
        </motion.div>
      );

    default:
      return null;
  }
}

export default function MessageStream({ messages, activeNode }: MessageStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * 新消息到达时自动滚动到底部
   */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, activeNode]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
      <AnimatePresence mode="popLayout">
        {/* 空状态引导 */}
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-full flex-col items-center justify-center gap-4"
          >
            <div className="text-center">
              <h2 className="font-display text-2xl text-ivory/40">Obsidian Control Deck</h2>
              <p className="mt-2 text-sm text-ivory-muted">
                输入问题，观察 Agent 的完整思考与执行流程
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                "搜索最新的 AI Agent 框架",
                "计算 2024 的平方根",
                "分析当前目录结构",
                "什么是 LangGraph？",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {}}
                  className="rounded border border-obsidian-border bg-obsidian-panel px-3 py-2 text-left text-xs text-ivory-muted transition-colors hover:border-obsidian-border hover:text-ivory"
                >
                  {q}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* 消息列表 */}
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {/* 运行中指示器 */}
          {activeNode && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 py-2"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-flash" />
              <span className="text-xs text-ivory-muted">节点 {activeNode} 执行中...</span>
            </motion.div>
          )}
        </div>
      </AnimatePresence>
    </div>
  );
}
