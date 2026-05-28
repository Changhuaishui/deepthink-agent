# DeepThink Agent

> 2025 年初，我翻完一本叫《AI大模型开发实战》的教材，又啃了几天 Claude Code 泄露的源码。书里的代码能跑，但离"生产级"差得远；Claude Code 的架构很扎实，但源码是 TypeScript，而且塞满了 Anthropic 内部的业务逻辑，没法直接拿来学。
> 
> 我就想着，能不能用 Python + LangGraph 把这两份资料的核心思想串起来，搭一个自己能看懂、能改、能扩展的 Agent 框架。这个项目就是结果。

---

## 这个项目从哪来

一开始我只是想复现书里的 ReAct Agent。但跑了几遍之后发现几个问题：

- 书里用的是 LangChain 旧版的 `initialize_agent`，已经不太够用了
- 没有显式的 CoT/ToT 实现，推理过程黑盒
- 工具都是模拟的，search 返回的是写死的字典，不是真实搜索
- 没有成本追踪，跑了多少 Token、花了多少钱，完全不知道

我又去看了 Claude Code 的源码。它的核心循环很清楚：`messages[] → LLM → 判断是否需要工具 → 执行 → 循环`。但源码是 TypeScript，而且捆了一堆内部基础设施，初学者根本读不动。

所以我决定自己写一个——把 Claude Code 的架构思想，用 Python + LangGraph 重新实现一遍，同时把书里能用的部分（RAG、评估方法）接进来。

**一句话总结：** 这是一个"教材理论 + 生产架构"的混血项目，目标是让 Agent 的每个决策步骤都看得见、摸得着。

---

## 它能干什么

你扔一个问题给它，它会自己判断：直接回答？上网搜？写代码算？读本地文件？还是启动深度思考模式？

我列了几个实际跑通的例子：

| 输入 | 它的反应 |
|------|---------|
| "搜索最新的 AI Agent 框架" | 调用 `search_tool`，走 DuckDuckGo 真实搜索 |
| "计算 2024 的平方根" | 调用 `calc_tool`，安全求值 |
| "用 Python 画个正弦波" | 调用 `python_tool`，沙箱执行 |
| "当前目录有哪些文件" | 调用 `list_dir_tool`，真实读文件系统 |
| "拉取 Claude Code 源码" | 调用 `git_clone_tool`，执行 `git clone` |
| "对比两个方案哪个更好" | 启动 ToT 模式，生成多个候选并评估 |

注意，所有工具都是真实调用，不是假数据。

---

## 技术栈的选择

我没有选最潮的，只选了最贴合这个目标的：

- **`langgraph`** — 状态图编排。比起传统链式 Agent，图结构让循环、分支、条件跳转变得显式，调试时能看清每一步走了哪条边。
- **`langchain-openai`** — 兼容 OpenAI API 格式。我实际接的是 DeepSeek，但换 OpenAI、SiliconFlow 只需要改 `.env` 里的 base_url。
- **`faiss-cpu` + `sentence-transformers`** — 复用书里第 4 章的 RAG 代码，把 Embedding + 向量检索接成 Agent 的一个工具。
- **`ddgs`** — DuckDuckGo 搜索，免费，不用申请 API Key。
- **`sqlite3`** — 内置模块，记录每次 LLM 调用的 Token 和成本，省得再装一个数据库。

---

## 项目结构

```
deepthink-agent/
├── .env                  # API Key，只在本地，不入 Git
├── config.py             # 配置中心，自动读 .env
├── graph.py              # 状态图：节点和边的连接关系
├── main.py               # CLI 入口
├── state.py              # 状态容器
├── nodes/
│   └── nodes.py          # 8 个节点：Agent / 权限 / CoT / ToT / 工具执行 / 评估 / 反思 / 最终回答
├── tools/
│   └── tools.py          # 9 个工具
└── utils/
    ├── compact.py        # 上下文压缩
    └── usage_db.py       # SQLite 持久化用量
```

---

## 核心设计

### 状态图

```
用户输入
    │
    ▼
┌─────────┐
│ agent   │ ← LLM 主决策，bind_tools + 上下文压缩
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
  agent（循环）
```

核心循环是 `agent → permission → tools → agent → ...`，和 Claude Code 的 `messages[] → LLM → tool_use? → 执行 → 循环` 本质一样。

### 权限节点

我加了一个 `permission_node`，对标 Claude Code 的权限弹窗。如果 Agent 要执行敏感操作（写文件、执行命令、git clone），会先停下来等确认。目前是通过状态标记控制，后续可以扩展成真正的人机交互确认。

### 用量记录

每次 LLM 调用后，自动往 SQLite 里写一条记录：时间、模型、prompt tokens、completion tokens、成本、延迟。跑完 `python main.py -u` 就能看到花了多少钱。

---

## 快速开始

```bash
pip install -r requirements.txt
```

编辑 `.env`：

```env
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
LLM_PRO_MODEL=deepseek-v4-pro
LLM_FLASH_MODEL=deepseek-v4-flash
```

运行：

```bash
# 单次提问
python main.py -q "什么是 LangGraph"

# 交互模式
python main.py -i

# 查看用量
python main.py -u
```

---

## 写在后面

做这个项目的时候，我最大的感受是：**Agent 的核心不是"有多少工具"，而是"循环是否可控"**。Claude Code 的源码有 50 万行，但核心循环就那么几十行：发消息、等响应、判断要不要调工具、调完再发。其余的都是包裹层——权限、流式、压缩、成本、子代理。

我把这个循环用 LangGraph 的节点和边显式画出来之后，调试轻松了很多。以前用黑盒 `initialize_agent`，出了问题不知道卡在哪一步；现在看 `graph.py` 就能知道数据从哪个节点流向哪个节点。

如果你也想搭一个自己的 Agent，我建议不要从工具开始。先把主循环跑通，再一颗一颗往上加工具。
