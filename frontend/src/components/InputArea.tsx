/**
 * InputArea —— 浅色专业风格 Prompt 输入区
 *
 * 核心交互：
 * - 分类 Tabs + Suggestion Chips，点击自动填入输入框
 * - 聚焦时发光效果
 * - 轻量分步分析开关
 * - 运行中输入框变暗 + 显示停止按钮
 * - 外部 prefilledText 注入支持
 */
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Square,
  BrainCircuit,
  Sparkles,
  Search,
  Calculator,
  Code2,
  FolderOpen,
  Zap,
} from "lucide-react";

interface InputAreaProps {
  onSend: (question: string, enableDeepThinking: boolean) => void;
  onStop: () => void;
  isRunning: boolean;
  prefilledText?: string;
  onPrefillConsumed?: () => void;
}

type SuggestionTab = "常用" | "搜索" | "计算" | "代码" | "文件";

const TABS: { key: SuggestionTab; icon: React.ReactNode }[] = [
  { key: "常用", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: "搜索", icon: <Search className="h-3.5 w-3.5" /> },
  { key: "计算", icon: <Calculator className="h-3.5 w-3.5" /> },
  { key: "代码", icon: <Code2 className="h-3.5 w-3.5" /> },
  { key: "文件", icon: <FolderOpen className="h-3.5 w-3.5" /> },
];

const SUGGESTIONS: Record<SuggestionTab, string[]> = {
  常用: [
    "什么是 LangGraph，它和 LangChain 有什么关系？",
    "请介绍一下 DeepThink Agent 的工作原理",
    "什么时候需要分步分析？",
  ],
  搜索: [
    "搜索最新的 AI Agent 开发框架",
    "搜索 Python 异步编程最佳实践",
    "搜索 DeepSeek V4 的技术特点",
  ],
  计算: [
    "计算 2024 的平方根",
    "1234 * 5678 加上 9999 的结果",
    "用 Python 计算前 10 个质数的和",
  ],
  代码: [
    "用 Python 画个正弦波",
    "写一个 FastAPI 的依赖注入示例",
    "用 React 实现一个虚拟滚动列表",
  ],
  文件: [
    "分析当前目录结构",
    "读取 requirements.txt 并解释每个依赖",
    "列出 data/ 目录下的所有文件",
  ],
};

export default function InputArea({
  onSend,
  onStop,
  isRunning,
  prefilledText,
  onPrefillConsumed,
}: InputAreaProps) {
  const [input, setInput] = useState("");
  const [enableDeepThinking, setEnableDeepThinking] = useState(false);
  const [activeTab, setActiveTab] = useState<SuggestionTab>("常用");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (prefilledText) {
      setInput(prefilledText);
      onPrefillConsumed?.();
      textareaRef.current?.focus();
    }
  }, [prefilledText, onPrefillConsumed]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isRunning) return;
    onSend(trimmed, enableDeepThinking);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChipClick = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="border-t border-gray-200 bg-white"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-4">
        {/* ====== Suggestion Tabs + Chips ====== */}
        <AnimatePresence>
          {!isRunning && input.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-2"
            >
              {/* Tabs */}
              <div className="flex items-center gap-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                      activeTab === tab.key
                        ? "bg-gray-100 text-gray-800"
                        : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                    }`}
                  >
                    {tab.icon}
                    {tab.key}
                  </button>
                ))}
              </div>

              {/* Chips */}
              <div className="flex flex-wrap gap-2">
                <AnimatePresence mode="popLayout">
                  {SUGGESTIONS[activeTab].map((text, i) => (
                    <motion.button
                      key={`${activeTab}-${text}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => handleChipClick(text)}
                      className="group flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500 transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-gray-800"
                    >
                      <Zap className="h-3 w-3 text-emerald-400 group-hover:text-emerald-500" />
                      <span className="max-w-[240px] truncate">{text}</span>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ====== 输入框容器 ====== */}
        <motion.div
          animate={{
            boxShadow: isFocused
              ? "0 0 0 2px rgba(12, 166, 120, 0.2), 0 4px 24px rgba(12, 166, 120, 0.08)"
              : "0 0 0 1px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)",
          }}
          transition={{ duration: 0.2 }}
          className="relative flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3"
        >
          {/* 顶部工具栏 */}
          <div className="flex items-center justify-between px-1">
            <button
              onClick={() => setEnableDeepThinking((v) => !v)}
              className="flex cursor-pointer items-center gap-2"
            >
              <span
                className={`relative inline-flex h-4 w-8 shrink-0 items-center rounded-full transition-colors ${
                  enableDeepThinking ? "bg-violet-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                    enableDeepThinking ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <BrainCircuit className="h-3 w-3" />
                分步分析
              </span>
            </button>
            <span className="text-[10px] text-gray-400">
              {isRunning ? "Agent 运行中..." : "Shift + Enter 换行"}
            </span>
          </div>

          {/* 输入域 */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            rows={1}
            placeholder="输入问题，观察 Agent 如何思考..."
            disabled={isRunning}
            className="max-h-40 min-h-[48px] w-full resize-none bg-transparent px-1 py-1 text-sm leading-relaxed text-gray-800 placeholder:text-gray-300 focus:outline-none disabled:opacity-40"
          />

          {/* 底部操作栏 */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-300">
                {input.length > 0 && `${input.length} 字符`}
              </span>
            </div>

            {isRunning ? (
              <button
                onClick={onStop}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                停止
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white transition-all hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600"
              >
                <Send className="h-3.5 w-3.5" />
                发送
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
