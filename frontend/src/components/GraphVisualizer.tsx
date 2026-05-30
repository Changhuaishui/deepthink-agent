/**
 * GraphVisualizer — 简化的节点导航侧边栏
 *
 * 不再使用 SVG 拓扑图和 BFS 路径高亮。
 * 改为简洁的节点列表，只基于真实 event.node 来源的访问计数标记状态。
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { PanelLeftClose, Activity } from "lucide-react";
import type { StreamMessage } from "../types/agent";

interface GraphVisualizerProps {
  activeNode: string | null;
  messages: StreamMessage[];
  onCollapse: () => void;
}

const NODES = [
  { id: "agent",      label: "决策",     color: "#0ca678" },
  { id: "permission", label: "权限",     color: "#e8590c" },
  { id: "cot",        label: "CoT",      color: "#7950f2" },
  { id: "tools",      label: "工具",     color: "#e8590c" },
  { id: "final",      label: "输出",     color: "#0ca678" },
];

function computeVisitCounts(messages: StreamMessage[]): Record<string, number> {
  const counts: Record<string, number> = {};
  messages.forEach((msg) => {
    const node = (msg.payload?.node as string) || "";
    if (node) {
      counts[node] = (counts[node] || 0) + 1;
    }
  });
  return counts;
}

export default function GraphVisualizer({ activeNode, messages, onCollapse }: GraphVisualizerProps) {
  const visitCounts = useMemo(() => computeVisitCounts(messages), [messages]);

  return (
    <div className="flex h-full flex-col border-r border-gray-200 bg-white">
      {/* 面板标题 */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            执行节点
          </h2>
        </div>
        <button
          onClick={onCollapse}
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          title="收起面板"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 节点列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        <div className="space-y-0.5">
          {NODES.map((node, i) => {
            const isActive = activeNode === node.id;
            const count = visitCounts[node.id] || 0;
            const hasVisited = count > 0;

            return (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`flex items-center gap-2 rounded-md px-2.5 py-2 transition-colors ${
                  isActive
                    ? "bg-emerald-50"
                    : hasVisited
                      ? "hover:bg-gray-50"
                      : "opacity-40"
                }`}
              >
                {/* 状态圆点 */}
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: isActive ? node.color : hasVisited ? node.color : "#adb5bd",
                    boxShadow: isActive ? `0 0 6px ${node.color}60` : undefined,
                  }}
                />

                {/* 标签 */}
                <span
                  className={`text-xs font-medium ${
                    isActive ? "text-gray-900" : hasVisited ? "text-gray-600" : "text-gray-300"
                  }`}
                >
                  {node.label}
                </span>

                <span className="flex-1" />

                {/* 访问计数 */}
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                      isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* 底部统计 */}
      {messages.length > 0 && (
        <div className="border-t border-gray-100 px-3 py-2.5">
          <p className="text-[10px] text-gray-400">
            已执行 {messages.filter((m) => m.type !== "user").length} 个步骤
          </p>
        </div>
      )}
    </div>
  );
}
