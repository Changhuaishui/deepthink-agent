/**
 * App 根组件 —— Obsidian Control Deck 主布局
 *
 * 整体布局结构（三栏式）：
 * ┌─────────────────────────────────────────┐
 * │ Header（顶部状态栏）                     │
 * ├──────────────────┬──────────────────────┤
 * │ GraphVisualizer  │ MessageStream        │
 * │ （状态图可视化）  │ （消息流展示）        │
 * │     35% 宽度     │      65% 宽度        │
 * │                  │                      │
 * ├──────────────────┴──────────────────────┤
 * │ InputArea（底部输入栏）                  │
 * └─────────────────────────────────────────┘
 *
 * 视觉层：
 * - 全屏深色系（Obsidian）
 * - 颗粒噪点 overlay（grain-overlay）
 * - 扫描线效果（scanline）
 * - 所有子组件通过 Framer Motion 交错入场
 *
 * 状态管理：
 * - 使用 useAgentStream hook 管理 SSE 连接与消息状态
 * - StatsPanel 显隐由本地 useState 控制
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { useAgentStream } from "./hooks/useAgentStream";
import Header from "./components/Header";
import GraphVisualizer from "./components/GraphVisualizer";
import MessageStream from "./components/MessageStream";
import InputArea from "./components/InputArea";
import StatsPanel from "./components/StatsPanel";

export default function App() {
  // SSE 流式状态管理（消息、活跃节点、用量等）
  const { state, sendMessage, stop, clear } = useAgentStream();
  // 统计面板显隐状态
  const [showStats, setShowStats] = useState(false);

  return (
    <div className="grain-overlay relative flex h-screen w-screen flex-col overflow-hidden bg-obsidian-bg text-ivory font-mono">
      {/* CRT 扫描线视觉效果 */}
      <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.02] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

      {/* 顶部状态栏 */}
      <Header
        isRunning={state.isRunning}
        activeNode={state.activeNode}
        onToggleStats={() => setShowStats((s) => !s)}
        onClear={clear}
      />

      {/* 主体内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：状态图可视化（大屏显示，移动端隐藏） */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="hidden w-[35%] flex-col border-r border-obsidian-border lg:flex"
        >
          <GraphVisualizer activeNode={state.activeNode} messages={state.messages} />
        </motion.aside>

        {/* 右侧：消息流 + 输入栏 */}
        <main className="flex flex-1 flex-col">
          <MessageStream messages={state.messages} activeNode={state.activeNode} />
          <InputArea
            onSend={(q, tot) => sendMessage(q, tot)}
            onStop={stop}
            isRunning={state.isRunning}
          />
        </main>
      </div>

      {/* 统计面板（滑出层） */}
      <StatsPanel
        open={showStats}
        onClose={() => setShowStats(false)}
        usage={state.usage}
        iteration={state.iteration}
        totRounds={state.totRounds}
      />
    </div>
  );
}
