import { motion, AnimatePresence } from "framer-motion";
import { X, Coins, Clock, Zap } from "lucide-react";
import type { UsagePayload } from "../types/agent";

interface StatsPanelProps {
  open: boolean;
  onClose: () => void;
  usage: UsagePayload | null;
  iteration: number;
  totRounds: number;
}

export default function StatsPanel({ open, onClose, usage, iteration, totRounds }: StatsPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40"
          />
          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 z-50 h-full w-80 border-l border-obsidian-border bg-obsidian-panel shadow-2xl"
          >
            <div className="flex h-14 items-center justify-between border-b border-obsidian-border px-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-ivory-muted">
                执行统计
              </h2>
              <button
                onClick={onClose}
                className="rounded p-1 text-ivory-muted transition-colors hover:bg-obsidian-panel-hover hover:text-ivory"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* Iteration Info */}
              <div className="rounded-lg border border-obsidian-border bg-obsidian-bg p-4">
                <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-ivory-muted">
                  当前会话
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-ivory-muted">迭代次数</p>
                    <p className="mt-0.5 text-lg font-mono text-accent-flash">{iteration}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-ivory-muted">ToT 轮次</p>
                    <p className="mt-0.5 text-lg font-mono text-accent-tot">{totRounds}</p>
                  </div>
                </div>
              </div>

              {/* Usage Summary */}
              {usage ? (
                <div className="rounded-lg border border-obsidian-border bg-obsidian-bg p-4">
                  <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-ivory-muted">
                    用量摘要
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-accent-tool" />
                        <span className="text-xs text-ivory-muted">调用次数</span>
                      </div>
                      <span className="font-mono text-sm text-ivory">{usage.calls}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Coins className="h-3.5 w-3.5 text-accent-pro" />
                        <span className="text-xs text-ivory-muted">总 Tokens</span>
                      </div>
                      <span className="font-mono text-sm text-ivory">
                        {usage.total_tokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Coins className="h-3.5 w-3.5 text-accent-cot" />
                        <span className="text-xs text-ivory-muted">成本</span>
                      </div>
                      <span className="font-mono text-sm text-accent-pro">
                        ${usage.total_cost_usd.toFixed(6)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-accent-flash" />
                        <span className="text-xs text-ivory-muted">平均延迟</span>
                      </div>
                      <span className="font-mono text-sm text-ivory">
                        {Math.round(usage.avg_latency_ms)}ms
                      </span>
                    </div>
                    {usage.elapsed_ms && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-accent-tot" />
                          <span className="text-xs text-ivory-muted">本次耗时</span>
                        </div>
                        <span className="font-mono text-sm text-ivory">
                          {usage.elapsed_ms}ms
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-obsidian-border bg-obsidian-bg p-6 text-center">
                  <p className="text-xs text-ivory-muted">暂无用量数据</p>
                  <p className="mt-1 text-[10px] text-ivory-muted/60">
                    发送消息后将显示统计
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
