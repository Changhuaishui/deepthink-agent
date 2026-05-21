"""
LangGraph 节点定义
实现 CoT + ToT + 工具调用的完整推理流程
对标 Claude Code 的 query.ts 主循环 + 书中第5章的感知-思考-行动架构
"""
import json
import random
import time
from typing import Dict, Any, List, Literal

import numpy as np
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

from config import Config
from state import AgentState
from tools import ALL_TOOLS
from utils.usage_db import usage_db
from utils.model_router import model_router, ModelRouter


# ---------------------------------------------------------------------------
# LLM 初始化（双模型路由：Pro + Flash）
# ---------------------------------------------------------------------------
_llm_pro = model_router.pro_llm
_llm_flash = model_router.flash_llm

if _llm_pro is not None:
    _llm_pro_with_tools = _llm_pro.bind_tools(ALL_TOOLS)
else:
    _llm_pro_with_tools = None

if _llm_flash is not None:
    _llm_flash_with_tools = _llm_flash.bind_tools(ALL_TOOLS)
else:
    _llm_flash_with_tools = None


def get_llm(model_type: str = "auto") -> ChatOpenAI:
    """获取指定类型的 LLM 实例
    
    Args:
        model_type: "auto" | "pro" | "flash"
    """
    return model_router.get_llm(model_type)


def get_llm_with_tools(model_type: str = "auto") -> ChatOpenAI:
    """获取带工具绑定的 LLM 实例"""
    if model_type == "pro":
        return _llm_pro_with_tools
    if model_type == "flash":
        return _llm_flash_with_tools
    # auto 默认返回 Flash（成本低）
    return _llm_flash_with_tools


# ---------------------------------------------------------------------------
# System Prompt 管理（对标 Claude Code 的系统提示词组装）
# ---------------------------------------------------------------------------
AGENT_SYSTEM_PROMPT = """你是一个深度思考型 AI Agent（DeepThink Agent）。你的任务是通过推理和工具调用解决用户问题。

## 可用工具
- search_tool: 联网搜索（DuckDuckGo）
- calc_tool: 数学计算
- python_tool: Python 代码执行（受限沙箱）
- git_clone_tool: Git 克隆远程仓库
- read_file_tool: 读取本地文件
- write_file_tool: 写入本地文件
- list_dir_tool: 列出目录内容
- bash_tool: 执行命令行（受安全限制）
- rag_tool: 本地向量知识库检索

## 工作模式
1. **简单问题**：直接回答，不需要工具。
2. **复杂问题**：启动深度思考：
   - 先拆解问题（Chain-of-Thought）
   - 调用工具获取外部信息或执行操作
   - 对多路径问题探索多个方案并评估

## 输出规则
- 如需调用工具，直接输出 tool_calls
- 如已完成推理，直接给出最终答案（包含推理过程）
- 对文件操作类请求，优先使用 read/write/list 工具
- 对代码/计算类请求，优先使用 python_tool / calc_tool
- 对信息检索类请求，优先使用 search_tool / rag_tool
"""


def _record_usage(response, node_name: str, thread_id: str, latency_ms: int, model_type: str = "unknown") -> None:
    """记录 LLM 调用用量到数据库
    
    LangChain 的 AIMessage 将 token usage 放在 response_metadata 中。
    """
    try:
        # 尝试从 response_metadata 提取 usage
        meta = getattr(response, "response_metadata", {}) or {}
        token_usage = meta.get("token_usage", {})
        
        # OpenAI 兼容格式
        prompt_tokens = token_usage.get("prompt_tokens", 0)
        completion_tokens = token_usage.get("completion_tokens", 0)
        
        # 备选：直接从 response 对象的 usage_metadata 读取（LangChain 新版本）
        if not prompt_tokens and hasattr(response, "usage_metadata"):
            um = response.usage_metadata or {}
            prompt_tokens = um.get("input_tokens", 0)
            completion_tokens = um.get("output_tokens", 0)
        
        # 确定实际使用的模型名
        model_name = Config.LLM_PRO_MODEL if model_type == "pro" else Config.LLM_FLASH_MODEL
        
        if prompt_tokens or completion_tokens:
            usage_db.record(
                model=model_name,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                node_name=f"{node_name}({model_type})",
                thread_id=thread_id,
                latency_ms=latency_ms,
            )
    except Exception:
        pass  # 记录失败不影响主流程


# ---------------------------------------------------------------------------
# 1. Agent 主节点（对标 Claude Code query.ts 核心循环）
# ---------------------------------------------------------------------------
def agent_node(state: AgentState) -> Dict[str, Any]:
    """Agent 主决策节点：接收用户输入或工具结果，决定下一步行动
    
    模型路由逻辑：
    1. 用 Flash 快速分类任务复杂度
    2. 简单任务走 Flash，复杂任务升级到 Pro
    """
    messages = state["messages"]
    thread_id = state.get("thread_id", "default")
    
    # 提取用户最新输入用于分类
    last_user_msg = ""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            last_user_msg = msg.content
            break
    
    # 任务分类
    model_type = ModelRouter.classify_task(last_user_msg)
    llm_with_tools = get_llm_with_tools(model_type)
    
    if llm_with_tools is None:
        raise RuntimeError(f"LLM ({model_type}) 未初始化，请检查 API 配置")
    
    # 上下文压缩（生产级特性，对标 Claude Code autoCompact）
    if Config.AGENT_ENABLE_CONTEXT_COMPACT and len(messages) > Config.AGENT_CONTEXT_COMPACT_THRESHOLD:
        messages = _compact_context(messages)
    
    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content=AGENT_SYSTEM_PROMPT),
        MessagesPlaceholder(variable_name="messages"),
    ])
    
    chain = prompt | llm_with_tools
    start = time.time()
    response = chain.invoke({"messages": messages})
    latency = int((time.time() - start) * 1000)
    
    _record_usage(response, "agent", thread_id, latency, model_type)
    
    # 在响应中注入模型类型信息（用于前端展示）
    response.additional_kwargs["model_type"] = model_type
    
    return {"messages": [response]}


def _compact_context(messages: List) -> List:
    """上下文压缩：保留系统提示、最近完整对话轮次，压缩中间历史
    
    关键约束：AIMessage 的 tool_calls 与其对应的 ToolMessage 必须成对保留，
    否则 API 会报错 "Messages with role 'tool' must be a response to a 
    preceding message with 'tool_calls'".
    """
    system_msgs = [m for m in messages if isinstance(m, SystemMessage)]
    other = [m for m in messages if not isinstance(m, SystemMessage)]
    
    # 将消息按"轮次"分组，确保 tool_call 和 ToolMessage 不被拆散
    groups: List[List] = []
    i = 0
    while i < len(other):
        msg = other[i]
        group = [msg]
        i += 1
        # 如果当前是带 tool_calls 的 AIMessage，后续 ToolMessage 都属于同一轮
        if isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
            while i < len(other) and isinstance(other[i], ToolMessage):
                group.append(other[i])
                i += 1
        groups.append(group)
    
    # 保留最近的几组（默认最近 3 组 ≈ 6-8 条消息，但保证完整性）
    keep_groups = 3
    if len(groups) <= keep_groups:
        return messages
    
    preserved_groups = groups[-keep_groups:]
    preserved = [msg for group in preserved_groups for msg in group]
    compressed_count = len(other) - len(preserved)
    
    if compressed_count > 0:
        compact_msg = SystemMessage(
            content=f"[上下文压缩] 中间 {compressed_count} 条消息已摘要。"
                    f"保留最近 {len(preserved_groups)} 轮对话（共 {len(preserved)} 条消息）。"
        )
        return system_msgs + [compact_msg] + preserved
    return messages


# ---------------------------------------------------------------------------
# 2. 权限检查节点（Human-in-the-loop，对标 Claude Code 权限系统）
# ---------------------------------------------------------------------------
def permission_node(state: AgentState) -> Dict[str, Any]:
    """权限检查节点：对危险操作进行确认
    
    对标 Claude Code 的权限弹窗：危险变更弹出阻塞对话框，拒绝 = 程序退出。
    在当前实现中，我们通过状态标记 `permission_granted` 控制。
    """
    if not Config.AGENT_ENABLE_PERMISSION_CHECK:
        return {"permission_granted": True}
    
    last_msg = state["messages"][-1] if state["messages"] else None
    if not (isinstance(last_msg, AIMessage) and getattr(last_msg, "tool_calls", None)):
        return {"permission_granted": True}
    
    # 判断是否需要权限确认
    sensitive_tools = {"bash_tool", "write_file_tool", "git_clone_tool", "python_tool"}
    needs_confirm = any(
        tc.get("name") in sensitive_tools for tc in last_msg.tool_calls
    )
    
    if not needs_confirm:
        return {"permission_granted": True}
    
    # 检查是否已有权限标记
    if state.get("permission_granted"):
        return {"permission_granted": True}
    
    # 生成权限请求消息
    tool_names = [tc.get("name") for tc in last_msg.tool_calls if tc.get("name") in sensitive_tools]
    confirm_msg = AIMessage(
        content=f"[权限确认] Agent 请求执行敏感操作: {', '.join(tool_names)}。"
                f"请在状态中设置 permission_granted=true 以继续，或终止任务。"
    )
    return {
        "messages": [confirm_msg],
        "permission_granted": False,
    }


# ---------------------------------------------------------------------------
# 3. CoT 思考节点（Chain-of-Thought）
# ---------------------------------------------------------------------------
COT_PROMPT = """请对以下问题进行 Chain-of-Thought（思维链）拆解。

要求：
1. 将问题分解为 2-4 个关键子问题
2. 每个子问题写出初步分析
3. 指出哪些问题需要调用工具
4. 给出整体解题策略

格式：
【子问题1】...
【分析】...
【整体策略】...
"""


def cot_node(state: AgentState) -> Dict[str, Any]:
    """CoT 链式思考节点"""
    user_msg = state["messages"][-1].content if state["messages"] else ""
    thread_id = state.get("thread_id", "default")
    
    llm = get_llm("pro")
    if llm is None:
        raise RuntimeError("LLM 未初始化")
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", COT_PROMPT),
        ("human", "问题: {question}"),
    ])
    chain = prompt | llm
    
    start = time.time()
    response = chain.invoke({"question": user_msg})
    latency = int((time.time() - start) * 1000)
    
    _record_usage(response, "cot", thread_id, latency, "pro")
    
    thoughts = [line.strip() for line in response.content.split("\n") if line.strip()]
    return {
        "thoughts": thoughts,
        "messages": [AIMessage(content=f"[CoT] {response.content}")],
    }


# ---------------------------------------------------------------------------
# 4. ToT 生成节点（Tree-of-Thought）
# ---------------------------------------------------------------------------
TOT_PROMPT = """你是一个 Tree-of-Thought 生成器。针对用户问题，生成 3 个不同的解决方案。

要求：
1. 每个方案有明确名称和核心逻辑
2. 方案之间有显著差异
3. 列出优势和潜在风险
4. 输出 JSON 数组格式

格式示例：
[
  {"name": "方案A-xxx", "logic": "...", "pros": "...", "cons": "..."},
  ...
]"""


def tot_generate_node(state: AgentState) -> Dict[str, Any]:
    """ToT 候选方案生成节点"""
    user_msg = state["messages"][-1].content if state["messages"] else ""
    thread_id = state.get("thread_id", "default")
    
    llm = get_llm("pro")
    if llm is None:
        raise RuntimeError("LLM 未初始化")
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", TOT_PROMPT),
        ("human", "问题: {question}"),
    ])
    chain = prompt | llm
    
    start = time.time()
    response = chain.invoke({"question": user_msg})
    latency = int((time.time() - start) * 1000)
    
    _record_usage(response, "tot_generate", thread_id, latency, "pro")
    
    # 解析 JSON
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
        candidates = [{"name": "默认方案", "logic": response.content, "pros": "LLM 生成", "cons": "解析失败", "score": 0.0}]
    
    return {
        "candidates": candidates,
        "messages": [AIMessage(content=f"[ToT] 已生成 {len(candidates)} 个候选方案")],
    }


# ---------------------------------------------------------------------------
# 5. 工具执行节点（生产级工具编排）
# ---------------------------------------------------------------------------
from langgraph.prebuilt import ToolNode

tool_executor = ToolNode(ALL_TOOLS)


def tool_executor_node(state: AgentState) -> Dict[str, Any]:
    """工具执行节点：并行执行 LLM 请求的所有工具"""
    result = tool_executor.invoke(state)
    
    # 记录工具结果到状态
    tool_results = state.get("tool_results", {}).copy()
    for msg in result.get("messages", []):
        if isinstance(msg, ToolMessage):
            tool_results[msg.name] = msg.content
    
    result["tool_results"] = tool_results
    return result


# ---------------------------------------------------------------------------
# 6. 评估节点（复用书中第9章语义评估思想）
# ---------------------------------------------------------------------------
def evaluate_node(state: AgentState) -> Dict[str, Any]:
    """候选方案评估节点"""
    candidates = state.get("candidates", [])
    thoughts = state.get("thoughts", [])
    tool_results = state.get("tool_results", {})
    
    if not candidates:
        return {"best_candidate_idx": 0}
    
    scores = []
    for i, cand in enumerate(candidates):
        score = 0.5
        if tool_results and "工具" in cand.get("name", "") + cand.get("logic", ""):
            score += 0.3
        if thoughts and ("分步" in cand.get("name", "") or "验证" in cand.get("logic", "")):
            score += 0.2
        score += random.uniform(-0.05, 0.05)
        scores.append(score)
    
    best_idx = int(np.argmax(scores))
    for i, cand in enumerate(candidates):
        cand["score"] = round(scores[i], 3)
    
    best = candidates[best_idx]
    return {
        "best_candidate_idx": best_idx,
        "candidates": candidates,
        "messages": [AIMessage(content=f"[ToT 评估] 最佳: {best['name']} (得分: {best['score']})")],
    }


# ---------------------------------------------------------------------------
# 7. 反思节点（Reflection）
# ---------------------------------------------------------------------------
def reflect_node(state: AgentState) -> Dict[str, Any]:
    """反思节点：判断是否继续 ToT 或输出最终答案"""
    iteration = state.get("iteration", 0)
    max_iter = state.get("max_iterations", Config.AGENT_MAX_ITERATIONS)
    candidates = state.get("candidates", [])
    best_idx = state.get("best_candidate_idx", 0)
    tot_rounds = state.get("tot_rounds", 0)
    
    if iteration >= max_iter:
        return {"messages": [AIMessage(content="[反思] 已达最大迭代次数，输出最佳答案。")], "need_tot": False}
    
    if tot_rounds >= 2:
        return {"messages": [AIMessage(content="[反思] ToT 探索完成，输出最佳答案。")], "need_tot": False}
    
    if candidates and candidates[best_idx].get("score", 0) >= 0.8:
        return {"messages": [AIMessage(content=f"[反思] 方案得分足够高，输出最终答案。")], "need_tot": False}
    
    return {"messages": [AIMessage(content="[反思] 评分不够理想，补充信息后重新生成。")], "need_tot": True, "tot_rounds": tot_rounds + 1}


# ---------------------------------------------------------------------------
# 8. 最终答案节点
# ---------------------------------------------------------------------------
def final_answer_node(state: AgentState) -> Dict[str, Any]:
    """最终答案生成节点"""
    thoughts = state.get("thoughts", [])
    candidates = state.get("candidates", [])
    best_idx = state.get("best_candidate_idx", 0)
    tool_results = state.get("tool_results", {})
    thread_id = state.get("thread_id", "default")
    
    llm = get_llm("pro")
    if llm is None:
        raise RuntimeError("LLM 未初始化")
    
    context_parts = []
    if thoughts:
        context_parts.append("思考过程:\n" + "\n".join(thoughts))
    if candidates and 0 <= best_idx < len(candidates):
        context_parts.append(f"选定方案: {json.dumps(candidates[best_idx], ensure_ascii=False)}")
    if tool_results:
        context_parts.append("工具结果:\n" + json.dumps(tool_results, ensure_ascii=False, indent=2))
    
    context = "\n\n".join(context_parts) or "无额外上下文"
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "基于以下分析和工具结果，给出清晰、完整的最终答案。用中文回答。"),
        ("human", "上下文:\n{context}\n\n请给出最终回答。"),
    ])
    chain = prompt | llm
    
    start = time.time()
    response = chain.invoke({"context": context})
    latency = int((time.time() - start) * 1000)
    
    _record_usage(response, "final", thread_id, latency, "pro")
    
    return {"messages": [AIMessage(content=response.content)]}


# ---------------------------------------------------------------------------
# 路由函数（条件边）
# ---------------------------------------------------------------------------
def route_after_agent(state: AgentState) -> Literal["permission", "tot", "evaluate", "final", "end"]:
    """Agent 节点后的路由决策"""
    last_msg = state["messages"][-1] if state["messages"] else None
    
    if isinstance(last_msg, AIMessage) and getattr(last_msg, "tool_calls", None):
        return "permission"
    
    if state.get("need_tot") and not state.get("candidates"):
        return "tot"
    
    if state.get("need_tot") and state.get("candidates"):
        return "evaluate"
    
    if state.get("thoughts") or state.get("candidates") or state.get("tool_results"):
        return "final"
    
    return "end"


def route_after_permission(state: AgentState) -> Literal["tools", "agent", "end"]:
    """权限节点后的路由"""
    if state.get("permission_granted"):
        last_msg = state["messages"][-1] if state["messages"] else None
        if isinstance(last_msg, AIMessage) and getattr(last_msg, "tool_calls", None):
            return "tools"
        return "agent"
    return "end"


def route_after_reflect(state: AgentState) -> Literal["tot", "final"]:
    """反思节点后的路由"""
    return "final" if not state.get("need_tot") else "tot"
