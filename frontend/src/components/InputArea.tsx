/**
 * InputArea 组件 —— 底部输入控制栏
 *
 * 职责：
 * - 提供多行文本输入框（支持 Shift+Enter 换行）
 * - ToT 深度思考模式开关
 * - 发送按钮（运行中变为停止按钮）
 *
 * 交互设计：
 * - 回车发送，Shift+Enter 换行
 * - 运行中时停止按钮变红，防止误操作
 */
import { useState, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Send, Square, BrainCircuit } from "lucide-react";

interface InputAreaProps {
  onSend: (question: string, enableTot: boolean) => void;  // 发送消息回调
  onStop: () => void;                                       // 停止运行回调
  isRunning: boolean;                                       // 是否正在运行
}

export default function InputArea({ onSend, onStop, isRunning }: InputAreaProps) {
  const [input, setInput] = useState("");           // 输入框内容
  const [enableTot, setEnableTot] = useState(false); // ToT 模式开关

  /**
   * 发送消息
   */
  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isRunning) return;
    onSend(trimmed, enableTot);
    setInput("");
  };

  /**
   * 键盘事件处理：回车发送，Shift+Enter 换行
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="border-t border-obsidian-border bg-obsidian-panel px-6 py-4"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        {/* 工具栏：ToT 开关 + 快捷键提示 */}
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2">
            {/* 自定义开关按钮 */}
            <button
              onClick={() => setEnableTot((v) => !v)}
              className={`relative h-4 w-8 rounded-full transition-colors ${
                enableTot ? "bg-accent-tot" : "bg-obsidian-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-ivory transition-transform ${
                  enableTot ? "left-4" : "left-0.5"
                }`}
              />
            </button>
            <span className="flex items-center gap-1 text-xs text-ivory-muted">
              <BrainCircuit className="h-3 w-3" />
              ToT 深度思考
            </span>
          </label>
          <span className="text-[10px] text-ivory-muted/60">Shift + Enter 换行</span>
        </div>

        {/* 输入行：文本域 + 操作按钮 */}
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="输入问题，观察 Agent 如何思考..."
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-obsidian-border bg-obsidian-bg px-4 py-2.5 text-sm text-ivory placeholder:text-ivory-muted/40 focus:border-accent-flash/50 focus:outline-none focus:ring-1 focus:ring-accent-flash/20"
            disabled={isRunning}
          />
          {/* 运行中时显示停止按钮，否则显示发送按钮 */}
          {isRunning ? (
            <button
              onClick={onStop}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent-error/30 bg-accent-error/10 text-accent-error transition-colors hover:bg-accent-error/20"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent-flash/30 bg-accent-flash/10 text-accent-flash transition-colors hover:bg-accent-flash/20 disabled:opacity-30"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
