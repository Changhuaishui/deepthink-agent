"""
DeepSeek API 兼容性补丁

问题: DeepSeek V4 Pro 在思考模式下会返回 reasoning_content，但 LangChain OpenAI
      集成不提取也不保留该字段。当对话历史被回传时，DeepSeek API 报错：
      "The reasoning_content in the thinking mode must be passed back to the API."

方案: 在 LangChain 的消息转换函数中注入对 reasoning_content 的支持。
"""
from typing import Any, Mapping

from langchain_core.messages import AIMessage, BaseMessage
from langchain_openai.chat_models import base as base_module


# ---------------------------------------------------------------------------
# 保存原始函数
# ---------------------------------------------------------------------------
_original_convert_dict_to_message = base_module._convert_dict_to_message
_original_convert_message_to_dict = base_module._convert_message_to_dict


def _patched_convert_dict_to_message(_dict: Mapping[str, Any]) -> BaseMessage:
    """增强版: 从 API 响应中提取 reasoning_content"""
    msg = _original_convert_dict_to_message(_dict)
    
    # 仅处理 assistant 消息
    if isinstance(msg, AIMessage):
        reasoning_content = _dict.get("reasoning_content")
        if reasoning_content is not None:
            msg.additional_kwargs["reasoning_content"] = reasoning_content
    
    return msg


def _patched_convert_message_to_dict(
    message: BaseMessage,
    api: Any = "chat/completions",
) -> dict:
    """增强版: 回传时将 reasoning_content 写回消息字典"""
    message_dict = _original_convert_message_to_dict(message, api=api)
    
    # 仅处理 assistant 消息
    if isinstance(message, AIMessage):
        reasoning_content = message.additional_kwargs.get("reasoning_content")
        if reasoning_content is not None:
            message_dict["reasoning_content"] = reasoning_content
    
    return message_dict


# ---------------------------------------------------------------------------
# 应用补丁
# ---------------------------------------------------------------------------
base_module._convert_dict_to_message = _patched_convert_dict_to_message
base_module._convert_message_to_dict = _patched_convert_message_to_dict

# 同时更新 langchain_openai.chat_models 命名空间中的导出（如果有）
import langchain_openai.chat_models as cm_module
if hasattr(cm_module, "_convert_dict_to_message"):
    cm_module._convert_dict_to_message = _patched_convert_dict_to_message
if hasattr(cm_module, "_convert_message_to_dict"):
    cm_module._convert_message_to_dict = _patched_convert_message_to_dict
