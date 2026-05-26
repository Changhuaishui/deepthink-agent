/**
 * App 根组件 —— Obsidian Control Deck 主布局
 *
 * 整体布局结构（三栏式 + 可拖拽侧边栏）：
 * ┌─────────────────────────────────────────┐
 * │ Header（顶部状态栏）                     │
 * ├──────────────────┬──────────────────────┤
 * │ GraphVisualizer  │ MessageStream        │
 * │ （状态图可视化）  │ （消息流展示）        │
 * │   可拖拽宽度     │      自适应剩余      │
 * │   可收起展开     │                      │
 * │                  │                      │
 * ├──────────────────┴──────────────────────┤
 * │ InputArea（底部输入栏）                  │
 * └─────────────────────────────────────────┘
 *
 * 交互设计：
 * - 左侧状态图支持鼠标拖拽调整宽度（15% ~ 50%）
 * - 提供收起/展开按钮，折叠后左侧变为窄条浮层
 * - 收起状态下点击浮层按钮可恢复
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
 * - sidebarWidth / isCollapsed 管理左侧面板状态
 */
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { PanelLeftOpen } from "lucide-react";
import { useAgentStream } from "./hooks/useAgentStream";
import Header from "./components/Header";
import GraphVisualizer from "./components/GraphVisualizer";
import MessageStream from "./components/MessageStream";
import InputArea from "./components/InputArea";
import StatsPanel from "./components/StatsPanel";

/**
 * 默认侧边栏宽度（像素）
 */
const DEFAULT_SIDEBAR_WIDTH = 420;
/**
 * 侧边栏最小宽度（像素）
 */
const MIN_SIDEBAR_WIDTH = 220;
/**
 * 侧边栏最大宽度（像素）
 */
const MAX_SIDEBAR_WIDTH = 700;

export default function App() {
  // SSE 流式状态管理（消息、活跃节点、用量等）
  const { state, sendMessage, stop, clear } = useAgentStream();
  // 统计面板显隐状态
  const [showStats, setShowStats] = useState(false);

  // ========== 左侧面板状态 ==========
  // 侧边栏宽度（像素），使用 CSS 变量同步到子组件
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  // 是否收起
  const [isCollapsed, setIsCollapsed] = useState(false);
  // 是否正在拖拽调整宽度
  const isResizing = useRef(false);

  /**
   * 开始拖拽调整宽度
   */
  const startResize = () => {
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  /**
   * 收起侧边栏
   */
  const collapseSidebar = () => {
    setIsCollapsed(true);
    isResizing.current = false;
  };

  /**
   * 展开侧边栏
   */
  const expandSidebar = () => {
    setIsCollapsed(false);
    if (sidebarWidth < MIN_SIDEBAR_WIDTH) {
      setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    }
  };

  /**
   * 全局鼠标移动监听：实现拖拽调整宽度
   */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(
        Math.max(e.clientX, MIN_SIDEBAR_WIDTH),
        MAX_SIDEBAR_WIDTH
      );
      setSidebarWidth(newWidth);
      // 拖拽过程中自动退出收起状态
      if (isCollapsed) setIsCollapsed(false);
    };

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isCollapsed]);

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
        {/* 左侧：状态图可视化（可拖拽宽度、可收起展开） */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{
            opacity: isCollapsed ? 0 : 1,
            x: isCollapsed ? -20 : 0,
            width: isCollapsed ? 0 : sidebarWidth,
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="hidden flex-col border-r border-obsidian-border lg:flex"
          style={{ width: isCollapsed ? 0 : sidebarWidth }}
        >
          <GraphVisualizer
            activeNode={state.activeNode}
            messages={state.messages}
            onCollapse={collapseSidebar}
          />
        </motion.aside>

        {/* 拖拽调整条（仅未收起时显示） */}
        {!isCollapsed && (
          <div
            onMouseDown={startResize}
            className="hidden w-1 cursor-col-resize bg-transparent hover:bg-accent-flash/30 lg:block"
            title="拖拽调整宽度"
          />
        )}

        {/* 收起状态下的展开按钮（左侧边缘浮动） */}
        {isCollapsed && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            onClick={expandSidebar}
            className="hidden h-full w-8 items-center justify-center border-r border-obsidian-border bg-obsidian-panel text-ivory-muted hover:bg-obsidian-panel-hover hover:text-accent-flash lg:flex"
            title="展开状态图"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </motion.button>
        )}

        {/* 右侧：消息流 + 输入栏 */}
        <main className="flex min-w-0 flex-1 flex-col">
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
