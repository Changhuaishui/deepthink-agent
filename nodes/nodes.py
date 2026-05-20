"""
LangGraph 节点定义
实现 CoT + ToT + 工具调用的完整推理流程
对标 Claude Code 的 query.ts 主循环 + 书中第5章的感知-思考-行动架构
"""
import json
import os
from typing import Dict, Any, List
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

from state import AgentState
from tools import ALL_TOOLS


# ---------------------------------------------------------------------------
# LLM 初始化
# ---------------------------------------------------------------------------
def get_llm(temperature: float = 0.3) -> ChatOpenAI:
    """获取配置的 LLM 实例
    
    默认支持 DeepSeek API（兼容 OpenAI 格式）。
    也可通过环境变量切换为其他 OpenAI 兼容服务。
    """
    api_key = os.environ.get("OPENAI_API_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.deepseek.com/v1")
    model = os.environ.get("OPENAI_MODEL", "deepseek-chat")
    
    if not api_key or api_key == "your-api-key-here":
        # 模拟模式：返回一个假的 LLM，用于演示图结构
        return None
    
    kwargs = {
        "model": model,
        "temperature": temperature,
        "api_key": api_key,
        "base_url": base_url,
    }
    
    return ChatOpenAI(**kwargs)


# 全局 LLM 实例（带工具绑定）
_llm = get_llm()
if _llm is not None:
    _llm_with_tools = _llm.bind_tools(ALL_TOOLS)
else:
    _llm_with_tools = None


# ---------------------------------------------------------------------------
# 1. Agent 主节点（对标 Claude Code 的 query.ts 核心 LLM 调用）
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """你是一个深度思考型 AI Agent（DeepThink Agent）。你的任务是通过推理和工具调用解决用户问题。

## 工作模式
1. **简单问题**：直接回答，不需要工具。
2. **复杂问题**：启动深度思考模式：
   - 先进行 Chain-of-Thought 拆解（逐步分析）
   - 必要时调用工具获取外部信息
   - 对多路径问题使用 Tree-of-Thought 探索多个方案并评估

## 可用工具
- search_tool: 网络搜索（模拟）
- calc_tool: 数学计算
- python_tool: Python 代码执行
- rag_tool: 本地知识库向量检索

## 输出规则
- 如果你需要调用工具，请直接输出工具调用（Tool Call）。
- 如果你已完成推理，请直接给出最终答案，答案中应包含推理过程。
- 判断问题是否需要深度思考（数学、逻辑、多步骤、需要外部知识）→ 使用工具；闲聊/简单事实 → 直接回答。
"""


def agent_node(state: AgentState) -> Dict[str, Any]:
    """Agent 主决策节点
    
    对标 Claude Code 主循环中的 LLM 调用步骤：
    messages[] -> LLM -> 响应（文本 或 tool_use）
    """
    messages = state["messages"]
    iteration = state.get("iteration", 0)
    
    # 上下文压缩提示（对标 Claude Code autoCompact）
    if iteration >= 3 and len(messages) > 6:
        compact_notice = SystemMessage(content="[系统提示] 对话轮次较多，请尽量简洁地利用已有信息，避免重复调用相同工具。")
        messages = [messages[0], compact_notice] + messages[-4:]
    
    if _llm_with_tools is None:
        # 模拟模式：演示图结构逻辑
        return _simulate_agent_response(state)
    
    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content=SYSTEM_PROMPT),
        MessagesPlaceholder(variable_name="messages"),
    ])
    
    chain = prompt | _llm_with_tools
    response = chain.invoke({"messages": messages})
    
    return {
        "messages": [response],
        "iteration": iteration + 1,
    }


def _simulate_agent_response(state: AgentState) -> Dict[str, Any]:
    """模拟 LLM 响应，用于无 API Key 时的结构演示
    
    此模拟逻辑已针对 '搜索 Claude Code 源码并拉取' 场景做了增强，
    可演示完整的搜索 -> 克隆工具链。
    """
    last_msg = state["messages"][-1] if state["messages"] else None
    last_content = last_msg.content if last_msg else ""
    iteration = state.get("iteration", 0)
    tool_results = state.get("tool_results", {})
    
    # 判断最后一条消息类型
    is_human = isinstance(last_msg, HumanMessage) if last_msg else False
    is_search_result = isinstance(last_msg, ToolMessage) and last_msg.name == "search_tool"
    
    # ===== 智能场景：Claude Code 源码搜索 + 拉取 =====
    # 场景1：用户要求搜索/分析 Claude Code 源码
    if iteration == 0 and is_human and any(k in last_content.lower() for k in ["claude", "源码", "source", "code", "架构"]):
        return {
            "messages": [AIMessage(
                content="",
                tool_calls=[{
                    "id": f"call_search",
                    "name": "search_tool",
                    "args": {"query": "Claude Code source code gitee github"},
                }]
            )],
            "iteration": iteration + 1,
        }
    
    # 场景2：搜索完成后，自动触发 git clone（演示搜索->克隆的完整链路）
    if iteration == 1 and is_search_result:
        # 搜索结果已返回，自动执行克隆（演示 Agent 工具链自动化）
        return {
            "messages": [AIMessage(
                content="搜索完成，已发现 Claude Code 源码仓库，现在执行 git clone 拉取到本地...",
                tool_calls=[{
                    "id": f"call_clone",
                    "name": "git_clone_tool",
                    "args": {
                        "repo_url": "https://gitee.com/wangzengliang1/claude-code-source-code.git",
                        "target_dir": "claude-code-source-code-agent"
                    },
                }]
            )],
            "iteration": iteration + 1,
        }
    
    # 场景3：用户明确要求拉取/克隆（可能已搜索过或已知地址）
    if iteration == 0 and is_human and any(k in last_content.lower() for k in ["clone", "拉取", "下载", "git clone"]):
        # 尝试从用户输入中提取 URL
        url = ""
        for word in last_content.split():
            if "gitee.com" in word or "github.com" in word:
                url = word.strip("<>()'\"",)
                break
        if not url:
            url = "https://gitee.com/wangzengliang1/claude-code-source-code.git"
        return {
            "messages": [AIMessage(
                content="",
                tool_calls=[{
                    "id": f"call_clone",
                    "name": "git_clone_tool",
                    "args": {"repo_url": url, "target_dir": "claude-code-source-code-agent"},
                }]
            )],
            "iteration": iteration + 1,
        }
    
    # ===== 通用模拟逻辑 =====
    triggers_tool = is_human and any(k in last_content.lower() for k in [
        "计算", "搜索", "rag", "代码", "math", "search", "python", "求", "多少",
        "github", "git", "仓库", "repo",
        "最新", "新闻", "资料", "信息", "什么", "介绍"
    ])
    triggers_tot = is_human and any(k in last_content.lower() for k in ["最优", "最好", "方案", "策略", "对比", "哪个", "路线", "比较", "选择"])
    
    if iteration == 0 and triggers_tot:
        return {
            "messages": [AIMessage(content="这个问题涉及多个可能的路径，我将启动 Tree-of-Thought 模式进行深度探索。")],
            "need_tot": True,
            "iteration": iteration + 1,
        }
    
    if iteration == 0 and triggers_tool:
        return {
            "messages": [AIMessage(
                content="",
                tool_calls=[{
                    "id": f"call_{iteration}",
                    "name": "search_tool",
                    "args": {"query": last_content},
                }]
            )],
            "iteration": iteration + 1,
        }
    
    # 模拟最终回答
    content = "[模拟模式回答] 基于当前上下文信息：\n\n"
    if state.get("thoughts"):
        content += "推理过程（CoT）：\n" + "\n".join(f"  {i+1}. {t}" for i, t in enumerate(state["thoughts"])) + "\n\n"
    if state.get("candidates"):
        content += f"经过 Tree-of-Thought 评估，从 {len(state['candidates'])} 个候选方案中选择了最优解。\n\n"
    if tool_results:
        content += "工具调用结果已纳入考量。\n\n"
    content += "最终结论：这是一个演示输出。请配置 OPENAI_API_KEY 获取真实 LLM 推理能力。"
    
    return {
        "messages": [AIMessage(content=content)],
        "iteration": iteration + 1,
    }


# ---------------------------------------------------------------------------
# 2. CoT 思考节点（Chain-of-Thought）
# ---------------------------------------------------------------------------
COT_PROMPT = """请对以下问题进行 Chain-of-Thought（思维链）拆解。

要求：
1. 将问题分解为 2-4 个关键子问题
2. 每个子问题写出你的初步分析
3. 指出哪些问题需要调用工具才能解决
4. 最后给出你的整体解题策略

请用中文回答，格式如下：
【子问题1】...
【分析】...
【子问题2】...
【分析】...
...
【整体策略】...
"""


def cot_node(state: AgentState) -> Dict[str, Any]:
    """CoT 链式思考节点
    
    对应书中第5章的 Thinker（思考模块），但升级为 LLM 驱动的显式推理。
    """
    user_msg = state["messages"][-1].content if state["messages"] else ""
    
    if _llm is None:
        # 模拟模式
        thoughts = [
            f"理解用户意图：{user_msg[:30]}...",
            "拆解为子问题并分析约束条件",
            "判断需要调用外部工具获取信息",
            "制定分步求解策略"
        ]
        return {
            "thoughts": thoughts,
            "messages": [AIMessage(content="[CoT] 已完成思维链拆解：\n" + "\n".join(f"{i+1}. {t}" for i, t in enumerate(thoughts)))],
        }
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", COT_PROMPT),
        ("human", "用户问题：{question}"),
    ])
    chain = prompt | _llm
    response = chain.invoke({"question": user_msg})
    
    # 提取思考内容
    thoughts = [line.strip() for line in response.content.split("\n") if line.strip() and not line.startswith("【")]
    if not thoughts:
        thoughts = [response.content]
    
    return {
        "thoughts": thoughts,
        "messages": [AIMessage(content=f"[CoT 思考]\n{response.content}")],
    }


# ---------------------------------------------------------------------------
# 3. ToT 生成节点（Tree-of-Thought：生成多个候选方案）
# ---------------------------------------------------------------------------
TOT_GENERATE_PROMPT = """你是一个 Tree-of-Thought 生成器。针对用户问题，请生成 3 个不同的解决方案/思路。

要求：
1. 每个方案必须有明确的名称和核心逻辑
2. 方案之间要有显著差异（不同角度、不同方法）
3. 每个方案需列出优势和潜在风险
4. 输出为结构化 JSON 数组格式

输出格式示例：
[
  {"name": "方案A-xxx", "logic": "...", "pros": "...", "cons": "..."},
  {"name": "方案B-xxx", "logic": "...", "pros": "...", "cons": "..."},
  {"name": "方案C-xxx", "logic": "...", "pros": "...", "cons": "..."}
]
"""


def tot_generate_node(state: AgentState) -> Dict[str, Any]:
    """ToT 候选方案生成节点
    
    对标 Tree-of-Thought 论文中的候选生成步骤。
    """
    user_msg = state["messages"][-1].content if state["messages"] else ""
    
    if _llm is None:
        # 模拟模式：生成固定候选
        candidates = [
            {"name": "方案A-直接求解", "logic": "基于已有知识直接给出答案", "pros": "快速、简洁", "cons": "可能忽略边界情况", "score": 0.0},
            {"name": "方案B-分步验证", "logic": "将问题拆解为多个步骤，逐一验证", "pros": "可靠性高、可回溯", "cons": "耗时较长", "score": 0.0},
            {"name": "方案C-工具增强", "logic": "调用外部工具获取实时数据辅助决策", "pros": "信息最新、准确度高", "cons": "依赖工具可用性", "score": 0.0},
        ]
        return {
            "candidates": candidates,
            "messages": [AIMessage(content=f"[ToT] 已生成 {len(candidates)} 个候选方案：{', '.join(c['name'] for c in candidates)}")],
        }
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", TOT_GENERATE_PROMPT),
        ("human", "用户问题：{question}"),
    ])
    chain = prompt | _llm
    response = chain.invoke({"question": user_msg})
    
    # 尝试解析 JSON
    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        candidates = json.loads(content.strip())
        for c in candidates:
            c["score"] = 0.0
    except Exception:
        candidates = [{"name": "方案1", "logic": response.content, "pros": "LLM 生成", "cons": "解析失败", "score": 0.0}]
    
    return {
        "candidates": candidates,
        "messages": [AIMessage(content=f"[ToT] 已生成 {len(candidates)} 个候选方案")],
    }


# ---------------------------------------------------------------------------
# 4. 工具执行节点（对标 Claude Code 的 runTools / StreamingToolExecutor）
# ---------------------------------------------------------------------------
from langgraph.prebuilt import ToolNode

tool_executor = ToolNode(ALL_TOOLS)


def tool_executor_node(state: AgentState) -> Dict[str, Any]:
    """工具执行节点
    
    直接复用 LangGraph 的 ToolNode（生产级工具执行器）。
    对标 Claude Code 中并行执行多个工具并收集 tool_result 的逻辑。
    """
    result = tool_executor.invoke(state)
    
    # 记录工具结果到状态
    tool_results = state.get("tool_results", {})
    for msg in result.get("messages", []):
        if isinstance(msg, ToolMessage):
            tool_results[msg.name] = msg.content
    
    result["tool_results"] = tool_results
    return result


# ---------------------------------------------------------------------------
# 5. 评估节点（复用书中第9章语义相似度评估思想）
# ---------------------------------------------------------------------------
def evaluate_node(state: AgentState) -> Dict[str, Any]:
    """候选方案评估节点
    
    复用书中第9章的语义评估思想：
    - 用简单的启发式评分（无 sentence-transformers 时）
    - 或用向量相似度计算方案与问题/目标的匹配度
    """
    candidates = state.get("candidates", [])
    thoughts = state.get("thoughts", [])
    tool_results = state.get("tool_results", {})
    
    if not candidates:
        return {"best_candidate_idx": 0}
    
    # 评分策略（启发式 + 工具结果加权）
    scores = []
    for i, cand in enumerate(candidates):
        score = 0.5  # 基础分
        
        # 如果有工具结果，优先选择提及工具的候选
        if tool_results and "工具" in cand.get("name", "") + cand.get("logic", ""):
            score += 0.3
        
        # 如果已经过 CoT，优先选择分步验证类方案
        if thoughts and ("分步" in cand.get("name", "") or "验证" in cand.get("logic", "")):
            score += 0.2
        
        # 随机扰动（模拟真实评估的不确定性）
        score += __import__("random").uniform(-0.05, 0.05)
        scores.append(score)
    
    best_idx = int(__import__("numpy").argmax(scores)) if __import__("numpy") else scores.index(max(scores))
    
    # 更新候选分数
    for i, cand in enumerate(candidates):
        cand["score"] = round(scores[i], 3)
    
    best = candidates[best_idx]
    summary = f"[ToT 评估] 最佳方案：{best['name']}（得分: {best['score']}）\n逻辑: {best['logic'][:100]}..."
    
    return {
        "best_candidate_idx": best_idx,
        "candidates": candidates,
        "messages": [AIMessage(content=summary)],
    }


# ---------------------------------------------------------------------------
# 6. 反思节点（Reflection）
# ---------------------------------------------------------------------------
def reflect_node(state: AgentState) -> Dict[str, Any]:
    """反思节点：判断当前答案是否足够好，还是需要重新思考
    
    对标 Claude Code 的停止条件判断和上下文回溯机制。
    """
    iteration = state.get("iteration", 0)
    max_iter = state.get("max_iterations", 5)
    candidates = state.get("candidates", [])
    best_idx = state.get("best_candidate_idx", 0)
    tot_rounds = state.get("tot_rounds", 0)
    
    # 停止条件1：总迭代超限
    if iteration >= max_iter:
        return {
            "messages": [AIMessage(content="[反思] 已达最大迭代次数，输出当前最佳答案。")],
            "need_tot": False,
            "tot_rounds": tot_rounds,
        }
    
    # 停止条件2：ToT 轮次超限（最多2轮深度探索）
    if tot_rounds >= 2:
        return {
            "messages": [AIMessage(content="[反思] ToT 深度探索已完成两轮，输出当前最佳答案。")],
            "need_tot": False,
            "tot_rounds": tot_rounds,
        }
    
    # 停止条件3：得分足够高
    if candidates and candidates[best_idx].get("score", 0) >= 0.8:
        return {
            "messages": [AIMessage(content=f"[反思] 方案 '{candidates[best_idx]['name']}' 得分足够高，可以输出最终答案。")],
            "need_tot": False,
            "tot_rounds": tot_rounds,
        }
    
    # 需要继续思考
    return {
        "messages": [AIMessage(content="[反思] 当前方案评分不够理想，需要补充信息或重新生成候选方案。")],
        "need_tot": True,
        "tot_rounds": tot_rounds + 1,
    }


# ---------------------------------------------------------------------------
# 7. 最终答案节点
# ---------------------------------------------------------------------------
def final_answer_node(state: AgentState) -> Dict[str, Any]:
    """最终答案生成节点"""
    thoughts = state.get("thoughts", [])
    candidates = state.get("candidates", [])
    best_idx = state.get("best_candidate_idx", 0)
    tool_results = state.get("tool_results", {})
    
    if _llm is None:
        # 模拟模式：组装最终输出
        parts = ["## 最终回答\n"]
        if thoughts:
            parts.append("### 推理过程（CoT）\n" + "\n".join(f"- {t}" for t in thoughts) + "\n")
        if candidates and 0 <= best_idx < len(candidates):
            best = candidates[best_idx]
            parts.append(f"### 选定方案（ToT）\n**{best['name']}**\n- 逻辑: {best['logic']}\n- 优势: {best['pros']}\n- 风险: {best['cons']}\n")
        if tool_results:
            parts.append("### 工具调用结果\n" + "\n".join(f"- {k}: {v[:100]}..." for k, v in tool_results.items()) + "\n")
        parts.append("\n*注：当前为模拟模式，配置 OPENAI_API_KEY 后可获得真实 LLM 生成的深度回答。*")
        
        return {"messages": [AIMessage(content="\n".join(parts))]}
    
    # 真实 LLM 模式：组装上下文并生成最终答案
    context = ""
    if thoughts:
        context += "思考过程:\n" + "\n".join(thoughts) + "\n\n"
    if candidates and 0 <= best_idx < len(candidates):
        context += f"选定方案: {json.dumps(candidates[best_idx], ensure_ascii=False)}\n\n"
    if tool_results:
        context += "工具结果:\n" + json.dumps(tool_results, ensure_ascii=False) + "\n\n"
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "基于以下分析和工具结果，给出清晰、完整的最终答案。用中文回答。"),
        ("human", "分析上下文:\n{context}\n\n请给出最终回答。"),
    ])
    chain = prompt | _llm
    response = chain.invoke({"context": context})
    
    return {"messages": [AIMessage(content=response.content)]}


# ---------------------------------------------------------------------------
# 路由函数（条件边）
# ---------------------------------------------------------------------------
def route_after_agent(state: AgentState) -> str:
    """Agent 节点后的路由决策
    
    对标 Claude Code 中判断 stop_reason == "tool_use" 的核心逻辑。
    """
    last_msg = state["messages"][-1] if state["messages"] else None
    
    # 如果最后一条是 AI 消息且包含 tool_calls，则去执行工具
    if isinstance(last_msg, AIMessage) and getattr(last_msg, "tool_calls", None):
        return "tools"
    
    # 如果标记了 need_tot 且还没有生成候选，去 ToT
    if state.get("need_tot") and not state.get("candidates"):
        return "tot"
    
    # 如果标记了 need_tot 且已有候选，去反思/评估
    if state.get("need_tot") and state.get("candidates"):
        return "evaluate"
    
    # 如果已有思考但还没最终输出，去最终答案
    if state.get("thoughts") or state.get("candidates"):
        return "final"
    
    # 否则直接结束
    return "end"


def route_after_reflect(state: AgentState) -> str:
    """反思节点后的路由"""
    if state.get("need_tot"):
        return "tot"
    return "final"


def route_after_cot(state: AgentState) -> str:
    """CoT 后的路由：返回 Agent 进行下一步决策"""
    return "agent"
