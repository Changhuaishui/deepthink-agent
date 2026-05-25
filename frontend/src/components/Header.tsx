import { motion } from "framer-motion";
import { BrainCircuit, Activity, BarChart3, Trash2 } from "lucide-react";

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
      className="flex h-14 items-center justify-between border-b border-obsidian-border bg-obsidian-panel px-6"
    >
      {/* Left: Title */}
      <div className="flex items-center gap-3">
        <BrainCircuit className="h-5 w-5 text-accent-flash" />
        <h1 className="font-display text-xl tracking-wide text-ivory">
          DeepThink Agent
        </h1>
        <span className="rounded bg-obsidian-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-ivory-muted">
          Control Deck
        </span>
      </div>

      {/* Center: Status */}
      <div className="flex items-center gap-4">
        {isRunning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
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

      {/* Right: Actions */}
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
