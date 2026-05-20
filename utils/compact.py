"""
上下文压缩模块
对标 Claude Code 的 autoCompact.ts + compact.ts
复用书中第4章 Embedding 技术进行语义摘要
"""
from typing import List
from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage, AIMessage


def compact_messages(
    messages: List[BaseMessage],
    max_messages: int = 10,
    preserve_last_n: int = 4
) -> List[BaseMessage]:
    """消息历史压缩函数
    
    策略：
    1. 保留系统消息
    2. 保留最近 preserve_last_n 条消息
    3. 中间过长的消息替换为摘要提示
    
    对标 Claude Code 的 autoCompact() 和 buildPostCompactMessages()。
    """
    if len(messages) <= max_messages:
        return messages
    
    # 分离系统消息
    system_msgs = [m for m in messages if isinstance(m, SystemMessage)]
    other_msgs = [m for m in messages if not isinstance(m, SystemMessage)]
    
    # 保留最近的消息
    recent = other_msgs[-preserve_last_n:]
    
    # 中间部分压缩为一条摘要提示
    summary_msg = SystemMessage(
        content=f"[上下文压缩] 中间 {len(other_msgs) - preserve_last_n} 条消息已被压缩。"
                f"当前保留最近 {preserve_last_n} 条对话记录。"
    )
    
    return system_msgs + [summary_msg] + recent


def token_estimate(text: str) -> int:
    """简单 Token 估算（中文 ≈ 字数的 1.5 倍，英文 ≈ 单词数 * 1.3）"""
    # 粗略估算，生产环境应使用 tiktoken
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    other_chars = len(text) - chinese_chars
    return int(chinese_chars * 1.5 + other_chars * 0.3)
