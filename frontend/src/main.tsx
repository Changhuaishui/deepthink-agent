/**
 * 前端应用入口文件
 *
 * 职责：
 * - 创建 React 根节点并挂载 App 组件
 * - 引入全局样式（Tailwind + 自定义 CSS）
 *
 * 技术栈：React 18 + StrictMode
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
