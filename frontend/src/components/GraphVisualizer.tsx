/**
 * GraphVisualizer 组件 —— LangGraph 状态图可视化
 *
 * 职责：
 * - 以 SVG 形式展示 Agent 的 8 个核心节点与 12 条有向边
 * - 实时高亮当前活跃节点（脉冲发光效果）
 * - 活跃边显示流动虚线动画
 * - 底部图例说明节点颜色含义
 *
 * 设计说明：
 * - 采用百分比坐标系（viewBox="0 0 100 100"），自适应容器大小
 * - 不引入外部图谱库，保持轻量
 */
import { motion, AnimatePresence } from "framer-motion";
import type { StreamMessage } from "../types/agent";

interface GraphVisualizerProps {
  activeNode: string | null;   // 当前活跃节点 ID
  messages: StreamMessage[];   // 消息流（预留，未来可用于展示节点历史访问次数）
}

/**
 * 节点定义：id / 显示标签 / SVG 坐标(x,y) / 主题色
 */
const NODES = [
  { id: "agent",      label: "Agent",    x: 50, y: 8,  color: "#00d4aa" },  // 青绿 — 主决策
  { id: "permission", label: "Permission",x: 20, y: 28, color: "#fdcb6e" },  // 暖黄 — 权限检查
  { id: "cot",        label: "CoT",      x: 50, y: 28, color: "#b8a1e6" },  // 淡紫 — 链式思考
  { id: "tot",        label: "ToT",      x: 80, y: 28, color: "#4facfe" },  // 钴蓝 — 树状思考
  { id: "tools",      label: "Tools",    x: 20, y: 50, color: "#f5a623" },  // 琥珀 — 工具执行
  { id: "evaluate",   label: "Evaluate", x: 80, y: 50, color: "#4facfe" },  // 钴蓝 — 方案评估
  { id: "reflect",    label: "Reflect",  x: 80, y: 70, color: "#b8a1e6" },  // 淡紫 — 反思回溯
  { id: "final",      label: "Final",    x: 50, y: 88, color: "#00d4aa" },  // 青绿 — 最终输出
];

/**
 * 边定义：有向连接关系（from → to）
 */
const EDGES = [
  { from: "agent", to: "permission" },
  { from: "agent", to: "cot" },
  { from: "agent", to: "tot" },
  { from: "agent", to: "evaluate" },
  { from: "agent", to: "final" },
  { from: "permission", to: "tools" },
  { from: "tools", to: "agent" },       // 核心循环回边
  { from: "cot", to: "agent" },         // 思考后回决策
  { from: "tot", to: "tools" },         // 探索后验证
  { from: "evaluate", to: "reflect" },
  { from: "reflect", to: "tot" },       // 反思后重新探索
  { from: "reflect", to: "final" },     // 反思后输出答案
];

export default function GraphVisualizer({ activeNode }: GraphVisualizerProps) {
  return (
    <div className="flex h-full flex-col">
      {/* 面板标题 */}
      <div className="border-b border-obsidian-border px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ivory-muted">
          状态图
        </h2>
      </div>

      {/* SVG 状态图画布 */}
      <div className="relative flex-1 overflow-hidden">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
        >
          {/* 绘制边（连线） */}
          {EDGES.map((edge, i) => {
            const fromNode = NODES.find((n) => n.id === edge.from)!;
            const toNode = NODES.find((n) => n.id === edge.to)!;
            // 当边的起点是当前活跃节点时，高亮该边
            const isActive = activeNode === edge.from;
            return (
              <line
                key={i}
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke={isActive ? fromNode.color : "#1e1f2a"}
                strokeWidth={isActive ? 0.6 : 0.3}
                strokeDasharray={isActive ? "2 1" : "1 1"}
                className={isActive ? "animate-flow-dash" : ""}
                opacity={isActive ? 0.8 : 0.4}
              />
            );
          })}

          {/* 绘制节点（圆点 + 标签） */}
          {NODES.map((node) => {
            const isActive = activeNode === node.id;
            return (
              <g key={node.id}>
                {/* 活跃节点外发光脉冲 */}
                <AnimatePresence>
                  {isActive && (
                    <motion.circle
                      cx={node.x}
                      cy={node.y}
                      r={4}
                      fill={node.color}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 0.3, scale: 2 }}
                      exit={{ opacity: 0, scale: 0 }}
                      transition={{ duration: 0.4 }}
                    />
                  )}
                </AnimatePresence>
                {/* 节点本体 */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isActive ? 2.8 : 2.2}
                  fill={isActive ? node.color : "#1e1f2a"}
                  stroke={isActive ? node.color : "#2a2b36"}
                  strokeWidth={0.4}
                  className="transition-all duration-300"
                />
                {/* 节点标签 */}
                <text
                  x={node.x}
                  y={node.y + 5}
                  textAnchor="middle"
                  fill={isActive ? node.color : "#6b6b75"}
                  fontSize={2.8}
                  fontFamily="JetBrains Mono, monospace"
                  className="transition-colors duration-300"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 图例：颜色 → 功能含义 */}
      <div className="border-t border-obsidian-border px-4 py-3">
        <div className="flex flex-wrap gap-3">
          {[
            { label: "决策", color: "#00d4aa" },
            { label: "思考", color: "#b8a1e6" },
            { label: "探索", color: "#4facfe" },
            { label: "工具", color: "#f5a623" },
            { label: "权限", color: "#fdcb6e" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[10px] text-ivory-muted">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
