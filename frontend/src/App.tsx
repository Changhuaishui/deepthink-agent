/**
 * App 根组件 —— 浅色专业三栏布局
 *
 * 布局结构：
 * ┌──────────────────────────────────────────┐
 * │ Header（顶部状态栏）                      │
 * ├────────────┬─────────────────────────────┤
 * │ 简化拓扑   │ ExecutionTimeline（主视图）   │
 * │ 可收起     │                             │
 * ├────────────┴─────────────────────────────┤
 * │ InputArea（底部输入栏）                   │
 * └──────────────────────────────────────────┘
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { PanelLeftOpen } from "lucide-react";
import { useAgentStream } from "./hooks/useAgentStream";
import Header from "./components/Header";
import GraphVisualizer from "./components/GraphVisualizer";
import ExecutionTimeline from "./components/ExecutionTimeline";
import InputArea from "./components/InputArea";
import StatsPanel from "./components/StatsPanel";

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;

export default function App() {
  const { state, sendMessage, stop, clear } = useAgentStream();
  const [showStats, setShowStats] = useState(false);
  const [prefill, setPrefill] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50"
      onMouseMove={(e) => {
        if (!isResizing) return;
        const newWidth = Math.min(Math.max(e.clientX, MIN_SIDEBAR_WIDTH), 500);
        setSidebarWidth(newWidth);
      }}
      onMouseUp={() => setIsResizing(false)}
      onMouseLeave={() => setIsResizing(false)}
    >
      {/* 顶部状态栏 */}
      <Header
        isRunning={state.isRunning}
        activeNode={state.activeNode}
        onClear={clear}
      />

      {/* 主体内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：简化拓扑 */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{
            opacity: isCollapsed ? 0 : 1,
            x: isCollapsed ? -20 : 0,
            width: isCollapsed ? 0 : sidebarWidth,
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="hidden lg:flex flex-col"
          style={{ width: isCollapsed ? 0 : sidebarWidth }}
        >
          <GraphVisualizer
            activeNode={state.activeNode}
            messages={state.messages}
            onCollapse={() => setIsCollapsed(true)}
          />
        </motion.aside>

        {/* 拖拽调整条 */}
        {!isCollapsed && (
          <div
            onMouseDown={() => setIsResizing(true)}
            className="hidden w-1 cursor-col-resize bg-transparent hover:bg-emerald-200/40 lg:block"
          />
        )}

        {/* 收起状态展开按钮 */}
        {isCollapsed && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            onClick={() => setIsCollapsed(false)}
            className="hidden h-full w-8 items-center justify-center border-r border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-emerald-500 lg:flex"
            title="展开节点面板"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </motion.button>
        )}

        {/* 主区域：时间线 */}
        <main className="flex min-w-0 flex-1 flex-col bg-gray-50">
          <ExecutionTimeline
            steps={state.executionSteps}
            isRunning={state.isRunning}
            activeNode={state.activeNode}
            error={state.error}
            onSuggestionClick={setPrefill}
          />
          <InputArea
            onSend={(q, tot) => sendMessage(q, tot)}
            onStop={stop}
            isRunning={state.isRunning}
            prefilledText={prefill}
            onPrefillConsumed={() => setPrefill("")}
          />
        </main>
      </div>

      {/* 统计面板 */}
      <StatsPanel
        open={showStats}
        onClose={() => setShowStats(false)}
        usage={state.usage}
        iteration={state.iteration}
        totRounds={state.totRounds}
      />

      {/* 免责声明（中国法规要求） */}
      <div className="flex h-5 items-center justify-center border-t border-gray-200 bg-white">
        <span className="text-[10px] text-gray-300">
          该内容为 AI 搜集生成，请谨慎识别
        </span>
      </div>
    </div>
  );
}
