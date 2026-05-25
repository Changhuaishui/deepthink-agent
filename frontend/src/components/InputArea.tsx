import { useState, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Send, Square, BrainCircuit } from "lucide-react";

interface InputAreaProps {
  onSend: (question: string, enableTot: boolean) => void;
  onStop: () => void;
  isRunning: boolean;
}

export default function InputArea({ onSend, onStop, isRunning }: InputAreaProps) {
  const [input, setInput] = useState("");
  const [enableTot, setEnableTot] = useState(false);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isRunning) return;
    onSend(trimmed, enableTot);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="border-t border-obsidian-border bg-obsidian-panel px-6 py-4"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2">
            <button
              onClick={() => setEnableTot((v) => !v)}
              className={`relative h-4 w-8 rounded-full transition-colors ${
                enableTot ? "bg-accent-tot" : "bg-obsidian-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-ivory transition-transform ${
                  enableTot ? "left-4" : "left-0.5"
                }`}
              />
            </button>
            <span className="flex items-center gap-1 text-xs text-ivory-muted">
              <BrainCircuit className="h-3 w-3" />
              ToT 深度思考
            </span>
          </label>
          <span className="text-[10px] text-ivory-muted/60">Shift + Enter 换行</span>
        </div>

        {/* Input Row */}
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="输入问题，观察 Agent 如何思考..."
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-obsidian-border bg-obsidian-bg px-4 py-2.5 text-sm text-ivory placeholder:text-ivory-muted/40 focus:border-accent-flash/50 focus:outline-none focus:ring-1 focus:ring-accent-flash/20"
            disabled={isRunning}
          />
          {isRunning ? (
            <button
              onClick={onStop}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent-error/30 bg-accent-error/10 text-accent-error transition-colors hover:bg-accent-error/20"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent-flash/30 bg-accent-flash/10 text-accent-flash transition-colors hover:bg-accent-flash/20 disabled:opacity-30"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
