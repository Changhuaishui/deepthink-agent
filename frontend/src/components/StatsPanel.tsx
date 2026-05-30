/**
 * StatsPanel 组件 —— 右侧滑出式统计面板（浅色主题）
 */
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/20"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 z-50 h-full w-80 border-l border-gray-200 bg-white shadow-xl"
          >
            <div className="flex h-12 items-center justify-between border-b border-gray-200 px-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">执行统计</h2>
              <button
                onClick={onClose}
                className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* 当前会话状态 */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">当前会话</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-500">迭代次数</p>
                    <p className="mt-0.5 text-lg font-mono text-emerald-600">{iteration}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">ToT 轮次</p>
                    <p className="mt-0.5 text-lg font-mono text-blue-600">{totRounds}</p>
                  </div>
                </div>
              </div>

              {/* 用量统计 */}
              {usage ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">用量摘要</h3>
                  <div className="space-y-3">
                    <StatRow icon={<Zap className="h-3.5 w-3.5 text-orange-500" />} label="调用次数" value={usage.calls} />
                    <StatRow icon={<Coins className="h-3.5 w-3.5 text-amber-500" />} label="总 Tokens" value={usage.total_tokens.toLocaleString()} />
                    <StatRow icon={<Coins className="h-3.5 w-3.5 text-purple-500" />} label="成本" value={`$${usage.total_cost_usd.toFixed(6)}`} accent />
                    <StatRow icon={<Clock className="h-3.5 w-3.5 text-emerald-500" />} label="平均延迟" value={`${Math.round(usage.avg_latency_ms)}ms`} />
                    {usage.elapsed_ms && (
                      <StatRow icon={<Clock className="h-3.5 w-3.5 text-blue-500" />} label="本次耗时" value={`${usage.elapsed_ms}ms`} />
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
                  <p className="text-xs text-gray-500">暂无用量数据</p>
                  <p className="mt-1 text-[10px] text-gray-400">发送消息后将显示统计</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function StatRow({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <span className={`font-mono text-sm ${accent ? "text-amber-600" : "text-gray-800"}`}>{value}</span>
    </div>
  );
}
