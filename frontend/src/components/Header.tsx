/**
 * Header 组件 —— 顶部状态栏
 *
 * 职责：
 * - 展示项目名称与品牌标识
 * - 实时显示 Agent 运行状态（待机 / 运行中 / 活跃节点）
 * - 提供统计面板开关和清空对话按钮
 */
import { motion } from "framer-motion";
import { BrainCircuit, Activity, BarChart3, Trash2 } from "lucide-react";

interface HeaderProps {
  isRunning: boolean;        // Agent 是否正在执行
  activeNode: string | null; // 当前活跃的 LangGraph 节点名称
  onToggleStats: () => void; // 切换统计面板显隐
  onClear: () => void;       // 清空消息流
}

export default function Header({ isRunning, activeNode, onToggleStats, onClear }: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex h-14 items-center justify-between border-b border-obsidian-border bg-obsidian-panel px-6"
    >
      {/* 左侧：项目标识 */}
      <div className="flex items-center gap-3">
        <BrainCircuit className="h-5 w-5 text-accent-flash" />
        <h1 className="font-display text-xl tracking-wide text-ivory">
          DeepThink Agent
        </h1>
        <span className="rounded bg-obsidian-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-ivory-muted">
          Control Deck
        </span>
      </div>

      {/* 中间：实时状态指示器 */}
      <div className="flex items-center gap-4">
        {isRunning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
            {/* 脉冲动画圆点 */}
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-flash opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-flash" />
            </span>
            <span className="text-xs text-accent-flash">
              {activeNode ? `节点: ${activeNode}` : "运行中..."}
            </span>
          </motion.div>
        )}
        {!isRunning && (
          <div className="flex items-center gap-2 text-xs text-ivory-muted">
            <Activity className="h-3 w-3" />
            <span>待机</span>
          </div>
        )}
      </div>

      {/* 右侧：操作按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleStats}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-ivory-muted transition-colors hover:bg-obsidian-panel-hover hover:text-ivory"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          统计
        </button>
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-ivory-muted transition-colors hover:bg-obsidian-panel-hover hover:text-accent-error"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清空
        </button>
      </div>
    </motion.header>
  );
}
