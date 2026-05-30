"""
Agent 状态定义
对应 Claude Code 中的消息状态管理和书中第5章的 Agent 环境状态概念
"""
from typing import TypedDict, Annotated, List, Dict, Any
from langchain_core.messages import BaseMessage
import operator


class AgentState(TypedDict):
    """DeepThink Agent 的状态容器
    
    对照 Claude Code 的 messages[] 循环状态 + 书中第5章的感知-思考-行动状态
    """
    # 消息历史（核心循环状态，对标 Claude Code 的 messages[]）
    messages: Annotated[List[BaseMessage], operator.add]
    
    # 会话 ID（用于用量追踪和状态隔离）
    thread_id: str
    
    # CoT 思考链记录
    thoughts: List[str]
    
    # 当前迭代计数（防止无限循环，对标 Claude Code 的上下文压缩阈值）
    iteration: int
    
    # 最大迭代次数
    max_iterations: int
    
    # 是否需要启动轻量分步分析
    need_deep_thinking: bool
    
    # 工具执行结果缓存
    tool_results: Dict[str, Any]
    
    # 权限确认标记（Human-in-the-loop，对标 Claude Code 权限系统）
    permission_granted: bool
    
    # Token 成本追踪（对标 Claude Code 的 cost-tracker.ts）
    total_tokens: int
