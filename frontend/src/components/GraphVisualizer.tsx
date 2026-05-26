/**
 * GraphVisualizer 组件 —— LangGraph 状态图可视化（重构版）
 *
 * 设计方向：霓虹网络拓扑 + 实时路径追踪
 * 遵循 frontend-design skill 标准：拒绝通用 AI 审美，大胆独特的视觉表达
 *
 * 核心改进：
 * - 节点从 2px 小圆点 → 圆角矩形卡片，带文字标签
 * - 连线从暗色细线 → 2px 发光粗线，活跃路径使用渐变色流动
 * - 新增"执行路径追踪"：从 Agent → 当前节点的完整路径全部高亮
 * - 新增"步骤指示器"：当前节点上方显示执行阶段文字
 * - 活跃节点使用双层脉冲动画（外圈扩散 + 内圈呼吸）
 * - 非活跃节点使用玻璃态半透明效果，降低视觉干扰
 */
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, Activity } from "lucide-react";
import type { StreamMessage } from "../types/agent";

interface GraphVisualizerProps {
  activeNode: string | null;
  messages: StreamMessage[];
  onCollapse: () => void;
}

/**
 * 节点定义（百分比坐标系）
 * 每个节点包含：id / 标签 / 图标缩写 / 坐标 / 主题色
 */
const NODES = [
  { id: "agent",      label: "决策",     abbr: "AG", x: 50, y: 12,  color: "#00d4aa", desc: "LLM 主决策" },
  { id: "permission", label: "权限",     abbr: "PM", x: 15, y: 32,  color: "#fdcb6e", desc: "权限确认" },
  { id: "cot",        label: "CoT",      abbr: "CT", x: 38, y: 32,  color: "#b8a1e6", desc: "链式思考" },
  { id: "tot",        label: "ToT",      abbr: "TT", x: 62, y: 32,  color: "#4facfe", desc: "树状探索" },
  { id: "tools",      label: "工具",     abbr: "TL", x: 15, y: 58,  color: "#f5a623", desc: "工具执行" },
  { id: "evaluate",   label: "评估",     abbr: "EV", x: 85, y: 58,  color: "#4facfe", desc: "方案评估" },
  { id: "reflect",    label: "反思",     abbr: "RF", x: 62, y: 72,  color: "#b8a1e6", desc: "反思回溯" },
  { id: "final",      label: "输出",     abbr: "FN", x: 50, y: 88,  color: "#00d4aa", desc: "最终答案" },
];

/**
 * 边定义：有向连接关系
 */
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

/**
 * 计算从起点到目标节点的最短路径（BFS）
 * 用于高亮当前执行路径
 */
function computePath(targetId: string | null): Set<string> {
  if (!targetId) return new Set();
  const path = new Set<string>();
  path.add(targetId);

  // 构建邻接表（反向，从子节点找父节点）
  const parents: Record<string, string[]> = {};
  EDGES.forEach((e) => {
    if (!parents[e.to]) parents[e.to] = [];
    parents[e.to].push(e.from);
  });

  // BFS 回溯到起点 agent
  const queue = [targetId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const ps = parents[curr] || [];
    for (const p of ps) {
      if (!path.has(p)) {
        path.add(p);
        queue.push(p);
      }
    }
  }
  return path;
}

/**
 * 根据消息流统计每个节点被访问的次数
 */
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
  const activePath = useMemo(() => computePath(activeNode), [activeNode]);
  const visitCounts = useMemo(() => computeVisitCounts(messages), [messages]);

  const currentNodeData = NODES.find((n) => n.id === activeNode);

  return (
    <div className="flex h-full flex-col">
      {/* 面板标题 + 收起按钮 */}
      <div className="flex items-center justify-between border-b border-obsidian-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-accent-flash" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ivory-muted">
            执行拓扑
          </h2>
        </div>
        <button
          onClick={onCollapse}
          className="rounded p-1 text-ivory-muted transition-colors hover:bg-obsidian-panel-hover hover:text-accent-flash"
          title="收起面板"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 当前执行状态指示 */}
      <div className="border-b border-obsidian-border px-4 py-2">
        {currentNodeData ? (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                style={{ backgroundColor: currentNodeData.color }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ backgroundColor: currentNodeData.color }}
              />
            </span>
            <span className="text-[11px] font-medium" style={{ color: currentNodeData.color }}>
              {currentNodeData.desc}
            </span>
            <span className="text-[10px] text-ivory-muted">
              {visitCounts[activeNode || ""] ? `(第 ${visitCounts[activeNode || ""]} 次)` : ""}
            </span>
          </div>
        ) : messages.length > 0 ? (
          <span className="text-[11px] text-ivory-muted">执行完毕</span>
        ) : (
          <span className="text-[11px] text-ivory-muted">等待输入...</span>
        )}
      </div>

      {/* SVG 状态图画布 */}
      <div className="relative flex-1 overflow-hidden">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
        >
          <defs>
            {/* 定义发光滤镜 */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 绘制边（连线） */}
          {EDGES.map((edge, i) => {
            const fromNode = NODES.find((n) => n.id === edge.from)!;
            const toNode = NODES.find((n) => n.id === edge.to)!;
            const isInPath = activePath.has(edge.from) && activePath.has(edge.to);
            const isActiveEdge = activeNode === edge.from && isInPath;

            return (
              <g key={i}>
                {/* 背景连线（暗色底） */}
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke="#1e1f2a"
                  strokeWidth={1.5}
                  opacity={0.6}
                />
                {/* 活跃路径高亮 */}
                {isInPath && (
                  <line
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke={isActiveEdge ? fromNode.color : `${fromNode.color}40`}
                    strokeWidth={isActiveEdge ? 2 : 1}
                    strokeDasharray={isActiveEdge ? "3 2" : "0"}
                    filter={isActiveEdge ? "url(#glow)" : undefined}
                    opacity={isActiveEdge ? 1 : 0.5}
                    className={isActiveEdge ? "animate-flow-dash" : ""}
                  />
                )}
              </g>
            );
          })}

          {/* 绘制节点 */}
          {NODES.map((node) => {
            const isActive = activeNode === node.id;
            const isInPath = activePath.has(node.id);
            const visitCount = visitCounts[node.id] || 0;
            const hasVisited = visitCount > 0;

            // 节点尺寸：活跃时更大
            const rx = isActive ? 6 : 5;
            const ry = isActive ? 3.5 : 3;

            return (
              <g key={node.id}>
                {/* 已访问节点外发光（玻璃态光环） */}
                <AnimatePresence>
                  {(isInPath || hasVisited) && (
                    <motion.rect
                      x={node.x - rx - 1}
                      y={node.y - ry - 1}
                      width={(rx + 1) * 2}
                      height={(ry + 1) * 2}
                      rx={ry + 1}
                      fill={node.color}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: isActive ? 0.25 : 0.08 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      filter="url(#glow)"
                    />
                  )}
                </AnimatePresence>

                {/* 活跃节点脉冲外圈 */}
                <AnimatePresence>
                  {isActive && (
                    <motion.rect
                      x={node.x - rx - 2}
                      y={node.y - ry - 2}
                      width={(rx + 2) * 2}
                      height={(ry + 2) * 2}
                      rx={ry + 2}
                      fill="none"
                      stroke={node.color}
                      strokeWidth={0.5}
                      initial={{ opacity: 0.6, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.4 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  )}
                </AnimatePresence>

                {/* 节点本体（圆角矩形） */}
                <rect
                  x={node.x - rx}
                  y={node.y - ry}
                  width={rx * 2}
                  height={ry * 2}
                  rx={ry}
                  fill={isActive ? `${node.color}20` : isInPath ? `${node.color}10` : "#0f1016"}
                  stroke={isActive ? node.color : hasVisited ? `${node.color}60` : "#2a2b36"}
                  strokeWidth={isActive ? 1.2 : 0.8}
                  className="transition-all duration-300"
                />

                {/* 节点缩写文字 */}
                <text
                  x={node.x}
                  y={node.y + 0.5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isActive ? node.color : hasVisited ? `${node.color}90` : "#4a4b55"}
                  fontSize={2.8}
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight={isActive ? "700" : "500"}
                  className="transition-colors duration-300"
                >
                  {node.abbr}
                </text>

                {/* 节点完整标签（下方） */}
                <text
                  x={node.x}
                  y={node.y + ry + 3}
                  textAnchor="middle"
                  fill={isActive ? node.color : hasVisited ? "#6b6b75" : "#3a3b45"}
                  fontSize={2.4}
                  fontFamily="JetBrains Mono, monospace"
                  className="transition-colors duration-300"
                >
                  {node.label}
                </text>

                {/* 访问计数小红点 */}
                {visitCount > 1 && (
                  <circle
                    cx={node.x + rx - 1}
                    cy={node.y - ry + 1}
                    r={1.5}
                    fill={node.color}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 底部：节点图例 + 统计 */}
      <div className="border-t border-obsidian-border px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1.5">
          {NODES.map((node) => {
            const count = visitCounts[node.id] || 0;
            return (
              <div key={node.id} className="flex items-center gap-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-sm"
                  style={{ backgroundColor: count > 0 ? node.color : "#2a2b36" }}
                />
                <span className={`text-[10px] ${count > 0 ? "text-ivory-muted" : "text-ivory-muted/30"}`}>
                  {node.label}
                  {count > 0 && <span className="ml-0.5 text-[9px] opacity-60">{count}</span>}
                </span>
              </div>
            );
          })}
        </div>
        {messages.length > 0 && (
          <div className="text-[9px] text-ivory-muted/40">
            已执行 {messages.filter((m) => m.type !== "user").length} 个步骤
          </div>
        )}
      </div>
    </div>
  );
}
