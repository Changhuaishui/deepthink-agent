import { useState } from "react";
import { motion } from "framer-motion";
import { useAgentStream } from "./hooks/useAgentStream";
import Header from "./components/Header";
import GraphVisualizer from "./components/GraphVisualizer";
import MessageStream from "./components/MessageStream";
import InputArea from "./components/InputArea";
import StatsPanel from "./components/StatsPanel";

export default function App() {
  const { state, sendMessage, stop, clear } = useAgentStream();
  const [showStats, setShowStats] = useState(false);

  return (
    <div className="grain-overlay relative flex h-screen w-screen flex-col overflow-hidden bg-obsidian-bg text-ivory font-mono">
      {/* Scanline effect */}
      <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.02] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

      {/* Header */}
      <Header
        isRunning={state.isRunning}
        activeNode={state.activeNode}
        onToggleStats={() => setShowStats((s) => !s)}
        onClear={clear}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Graph Visualizer */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="hidden w-[35%] flex-col border-r border-obsidian-border lg:flex"
        >
          <GraphVisualizer activeNode={state.activeNode} messages={state.messages} />
        </motion.aside>

        {/* Right: Message Stream */}
        <main className="flex flex-1 flex-col">
          <MessageStream messages={state.messages} activeNode={state.activeNode} />
          <InputArea
            onSend={(q, tot) => sendMessage(q, tot)}
            onStop={stop}
            isRunning={state.isRunning}
          />
        </main>
      </div>

      {/* Stats Panel (slide-over) */}
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
