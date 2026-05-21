# DeepThink Agent

一个基于 **LangGraph** + **CoT** + **ToT** + **真实工具调用** 的生产级 AI Agent。

> 本项目同时对照《AI大模型开发实战》教材与 Claude Code 生产源码架构构建，
> 目标是用最清晰的代码展示：一个现代 Agent 应该如何设计、如何运行、如何扩展。

---

## 一、这个项目能做什么

简单说：你扔给它一个问题，它会自己判断——是直接回答，还是上网搜，还是写代码算，还是读文件找答案。

### 实际场景示例

| 你说 | 它会做什么 |
|------|-----------|
| "搜索最新的 AI Agent 框架" | 🔍 调用 `search_tool` 真实联网搜索 |
| "计算 2024 的平方根" | 🔢 调用 `calc_tool` 精确计算 |
| "用 Python 画个正弦波" | 🐍 调用 `python_tool` 沙箱执行代码 |
| "列出当前目录有哪些文件" | 📁 调用 `list_dir_tool` 真实读取文件系统 |
| "拉取 Claude Code 源码到本地" | 📦 调用 `git_clone_tool` 执行 `git clone` |

所有工具都是**真实可用**，不是假数据。

---

## 二、技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 框架核心 | `langgraph` | 状态图编排，节点与边的可视化循环 |
| LLM 接口 | `langchain-openai` | 兼容 OpenAI API 格式（DeepSeek/OpenAI/任意兼容） |
| 向量检索 | `faiss-cpu` + `sentence-transformers` | 复用教材第4章 RAG 技术 |
| 联网搜索 | `ddgs` (DuckDuckGo) | 真实联网搜索，无需 API Key |
| 配置管理 | `python-dotenv` | `.env` 文件管理敏感配置 |
| 用量记录 | `sqlite3` (内置) | 持久化 Token/成本数据库 |

---

## 三、项目结构

```
deepthink-agent/
├── .env                          # API 配置（gitignored，安全）
├── .gitignore                    # 忽略规则
├── config.py                     # 统一配置中心
├── main.py                       # CLI 入口
├── graph.py                      # LangGraph 状态图定义
├── state.py                      # AgentState 状态容器
├── requirements.txt              # 依赖清单
├── nodes/                        # 节点目录（Agent 的大脑）
│   └── nodes.py                  # 8 个核心节点 + 路由函数
├── tools/                        # 工具目录（Agent 的手脚）
│   └── tools.py                  # 9 个生产级工具
└── utils/                        # 工具箱（辅助模块）
    ├── compact.py                # 上下文压缩算法
    ├── cost_tracker.py           # 成本计算器
    └── usage_db.py               # SQLite 持久化用量记录
```

---

## 四、快速开始

### 1. 安装依赖

```bash
cd deepthink-agent
pip install -r requirements.txt
```

### 2. 配置 API

编辑 `.env` 文件（已预填 DeepSeek，可直接用）：

```env
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```

### 3. 运行

```bash
# 单次提问
python main.py -q "什么是 LangGraph"

# 交互模式（推荐）
python main.py -i

# 批量演示
python main.py -d

# 查看用量统计
python main.py -u
```

---

## 五、核心设计

### 状态图架构

```
用户输入
    │
    ▼
┌─────────┐
│ agent   │ ← LLM 主决策（bind_tools + 上下文压缩）
└────┬────┘
     │
┌────┼────┬──────────┐
▼    ▼    ▼          ▼
permission  tot  evaluate  final/end
│
├─ 拒绝 → END
└─ 通过
      │
      ▼
  tools（并行执行）
      │
      ▼
  agent（循环回主决策）
```

**核心循环**：`agent → permission → tools → agent → ...`

### 对标 Claude Code

| Claude Code 源码 | 本项目对应 | 说明 |
|-----------------|-----------|------|
| `src/query.ts` | `nodes/nodes.py` 的 `agent_node` | 核心 LLM 调用循环 |
| `src/services/tools/toolOrchestration.ts` | `tool_executor_node` | 并行工具执行 |
| `src/services/compact/autoCompact.ts` | `_compact_context()` | 上下文压缩 |
| `src/cost-tracker.ts` | `utils/usage_db.py` | Token/成本记录 |
| 权限弹窗系统 | `permission_node` | 敏感操作确认 |

---

## 六、用量记录

每次 LLM 调用都会自动记录到本地 SQLite 数据库：

```bash
# 查看最近 7 天用量
python main.py -u

# 输出示例
📊 全局用量统计
   统计周期: 最近 7 天
   总调用次数: 6
   总 Tokens: 7351
   总成本: $0.001112
```

---

## 七、学习路径

如果你想深入理解这个项目：

1. **读 `graph.py`** — 先看整体流程图，理解节点和边怎么连接
2. **读 `nodes/nodes.py`** — 再看每个节点的具体逻辑
3. **读 `tools/tools.py`** — 最后看工具的注册和实现
4. **对照 Claude Code 源码** — 打开 `claude-code-source-code/src/query.ts`，对比主循环设计

---

## 八、协议

MIT License — 随意使用、修改、分发。
