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
    
    # CoT 思考链记录
    thoughts: List[str]
    
    # ToT 候选方案列表
    candidates: List[Dict[str, Any]]
    
    # 最佳候选索引
    best_candidate_idx: int
    
    # 当前迭代计数（防止无限循环，对标 Claude Code 的上下文压缩阈值）
    iteration: int
    
    # 最大迭代次数
    max_iterations: int
    
    # 是否需要启动 ToT 深度思考模式
    need_tot: bool
    
    # 工具执行结果缓存
    tool_results: Dict[str, Any]
    
    # ToT 轮次计数（独立的 ToT 循环控制）
    tot_rounds: int
    
    # Token 成本追踪（对标 Claude Code 的 cost-tracker.ts）
    total_tokens: int
