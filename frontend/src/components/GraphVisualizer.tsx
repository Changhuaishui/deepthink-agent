import { motion, AnimatePresence } from "framer-motion";
import type { StreamMessage } from "../types/agent";

interface GraphVisualizerProps {
  activeNode: string | null;
  messages: StreamMessage[];
}

const NODES = [
  { id: "agent", label: "Agent", x: 50, y: 8, color: "#00d4aa" },
  { id: "permission", label: "Permission", x: 20, y: 28, color: "#fdcb6e" },
  { id: "cot", label: "CoT", x: 50, y: 28, color: "#b8a1e6" },
  { id: "tot", label: "ToT", x: 80, y: 28, color: "#4facfe" },
  { id: "tools", label: "Tools", x: 20, y: 50, color: "#f5a623" },
  { id: "evaluate", label: "Evaluate", x: 80, y: 50, color: "#4facfe" },
  { id: "reflect", label: "Reflect", x: 80, y: 70, color: "#b8a1e6" },
  { id: "final", label: "Final", x: 50, y: 88, color: "#00d4aa" },
];

const EDGES = [
  { from: "agent", to: "permission" },
  { from: "agent", to: "cot" },
  { from: "agent", to: "tot" },
  { from: "agent", to: "evaluate" },
  { from: "agent", to: "final" },
  { from: "permission", to: "tools" },
  { from: "tools", to: "agent" },
  { from: "cot", to: "agent" },
  { from: "tot", to: "tools" },
  { from: "evaluate", to: "reflect" },
  { from: "reflect", to: "tot" },
  { from: "reflect", to: "final" },
];

export default function GraphVisualizer({ activeNode }: GraphVisualizerProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-obsidian-border px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ivory-muted">
          状态图
        </h2>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
        >
          {/* Edges */}
          {EDGES.map((edge, i) => {
            const fromNode = NODES.find((n) => n.id === edge.from)!;
            const toNode = NODES.find((n) => n.id === edge.to)!;
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

          {/* Nodes */}
          {NODES.map((node) => {
            const isActive = activeNode === node.id;
            const wasVisited = activeNode !== null; // simplified
            return (
              <g key={node.id}>
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
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isActive ? 2.8 : 2.2}
                  fill={isActive ? node.color : wasVisited ? "#2a2b36" : "#1e1f2a"}
                  stroke={isActive ? node.color : "#2a2b36"}
                  strokeWidth={0.4}
                  className="transition-all duration-300"
                />
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

      {/* Legend */}
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
