"""
上下文压缩模块
对标 Claude Code 的 autoCompact.ts + compact.ts
保留工具调用配对，避免压缩后破坏 OpenAI tool message 顺序约束
"""
from typing import List
from langchain_core.messages import BaseMessage, SystemMessage, AIMessage, ToolMessage


def compact_messages(
    messages: List[BaseMessage],
    max_messages: int = 10,
    preserve_recent_groups: int = 3,
) -> List[BaseMessage]:
    """消息历史压缩函数
    
    策略：
    1. 保留系统消息
    2. 按轮次保留最近 preserve_recent_groups 组消息
    3. AIMessage.tool_calls 与后续 ToolMessage 必须成组保留
    4. 中间过长的消息替换为摘要提示
    
    对标 Claude Code 的 autoCompact() 和 buildPostCompactMessages()。
    """
    if len(messages) <= max_messages:
        return messages
    
    # 分离系统消息
    system_msgs = [m for m in messages if isinstance(m, SystemMessage)]
    other_msgs = [m for m in messages if not isinstance(m, SystemMessage)]
    
    groups: List[List[BaseMessage]] = []
    i = 0
    while i < len(other_msgs):
        msg = other_msgs[i]
        group = [msg]
        i += 1
        if isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
            while i < len(other_msgs) and isinstance(other_msgs[i], ToolMessage):
                group.append(other_msgs[i])
                i += 1
        groups.append(group)
    
    if len(groups) <= preserve_recent_groups:
        return messages
    
    preserved_groups = groups[-preserve_recent_groups:]
    recent = [msg for group in preserved_groups for msg in group]
    compressed_count = len(other_msgs) - len(recent)
    
    # 中间部分压缩为一条摘要提示
    summary_msg = SystemMessage(
        content=f"[上下文压缩] 中间 {compressed_count} 条消息已摘要。"
                f"保留最近 {len(preserved_groups)} 轮对话（共 {len(recent)} 条消息）。"
    )
    
    return system_msgs + [summary_msg] + recent


def token_estimate(text: str) -> int:
    """简单 Token 估算（中文 ≈ 字数的 1.5 倍，英文 ≈ 单词数 * 1.3）"""
    # 粗略估算，生产环境应使用 tiktoken
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    other_chars = len(text) - chinese_chars
    return int(chinese_chars * 1.5 + other_chars * 0.3)
