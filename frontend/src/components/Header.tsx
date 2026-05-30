/**
 * Header 组件 —— 顶部状态栏（浅色主题）
 */
import { motion } from "framer-motion";
import { BrainCircuit, Activity, Trash2, BarChart3 } from "lucide-react";

interface HeaderProps {
  isRunning: boolean;
  activeNode: string | null;
  onToggleStats: () => void;
  onClear: () => void;
}

export default function Header({ isRunning, activeNode, onToggleStats, onClear }: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex h-12 items-center justify-between border-b border-gray-200 bg-white px-5"
    >
      {/* 左侧：品牌标识 */}
      <div className="flex items-center gap-2.5">
        <BrainCircuit className="h-5 w-5 text-emerald-600" />
        <h1 className="font-display text-lg tracking-wide text-gray-900">
          DeepThink Agent
        </h1>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-gray-500">
          Control Deck
        </span>
      </div>

      {/* 中间：状态指示 */}
      <div className="flex items-center gap-3">
        {isRunning ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs text-emerald-600">
              {activeNode ? `节点: ${activeNode}` : "运行中..."}
            </span>
          </motion.div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Activity className="h-3 w-3" />
            <span>待机</span>
          </div>
        )}
      </div>

      {/* 右侧：操作按钮 */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleStats}
          className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-emerald-600"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          统计
        </button>
        <button
          onClick={onClear}
          className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清空
        </button>
      </div>
    </motion.header>
  );
}
