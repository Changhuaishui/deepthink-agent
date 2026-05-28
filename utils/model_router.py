"""
模型路由模块
根据任务复杂度自动选择 Pro（重模型）或 Flash（轻模型）
对标 Claude Code 的 fast/slow 模式 + Kimi 的 Orchestrator/Sub-Agent 分工
"""
import os
from typing import Literal, Optional
from langchain_openai import ChatOpenAI

from config import Config


class ModelRouter:
    """模型路由器：根据任务类型选择最优模型
    
    设计原则：
    - Flash 默认：成本低（Pro 的 1/12）、速度快，覆盖 80% 日常任务
    - Pro 兜底：复杂推理、错误诊断、任务分解时自动升级
    - 手动指定：调用方可以强制使用某个模型
    """
    
    def __init__(self):
        self._pro_llm: Optional[ChatOpenAI] = None
        self._flash_llm: Optional[ChatOpenAI] = None
        self._init_models()
    
    def _init_models(self) -> None:
        """初始化 Pro 和 Flash 两个 LLM 实例"""
        if not Config.is_api_ready():
            return
        
        common_kwargs = {
            "api_key": Config.OPENAI_API_KEY,
            "base_url": Config.OPENAI_BASE_URL,
            "temperature": Config.LLM_TEMPERATURE,
            "max_tokens": Config.LLM_MAX_TOKENS,
        }
        
        self._pro_llm = ChatOpenAI(
            model=Config.LLM_PRO_MODEL,
            **common_kwargs,
        )
        
        self._flash_llm = ChatOpenAI(
            model=Config.LLM_FLASH_MODEL,
            **common_kwargs,
        )
    
    def get_llm(self, model_type: Literal["auto", "pro", "flash"] = "auto", query: str = "") -> ChatOpenAI:
        """获取指定类型的 LLM 实例
        
        Args:
            model_type: 
                - "auto": 根据任务自动判断（默认）
                - "pro": 强制使用主模型
                - "flash": 强制使用子模型
            query: auto 模式下用于复杂度分类的用户问题
        
        Returns:
            ChatOpenAI 实例
        """
        if model_type == "pro":
            return self._pro_llm
        if model_type == "flash":
            return self._flash_llm
        routed_type = self.classify_task(query) if query else "flash"
        return self._pro_llm if routed_type == "pro" else self._flash_llm
    
    @staticmethod
    def classify_task(query: str) -> Literal["pro", "flash"]:
        """任务复杂度分类：判断用 Pro 还是 Flash
        
        规则基于关键词匹配，后续可升级为 LLM 自动分类。
        """
        query_lower = query.lower()
        
        # Pro 触发词：复杂推理、架构分析、任务分解、错误诊断
        pro_triggers = [
            "分析", "架构", "重构", "设计", "规划", "分解",
            "诊断", "调试", "排查", "优化", "对比", "评估",
            "architecture", "refactor", "design", "plan", "debug",
            "optimize", "compare", "evaluate", "orchestrate",
        ]
        
        # Flash 触发词：简单查询、格式化、单步操作
        flash_triggers = [
            "计算", "求", "多少", "列出", "读取", "查看",
            "搜索", "查找", "执行", "运行", "画", "生成",
            "calc", "list", "read", "search", "run", "execute",
        ]
        
        pro_score = sum(1 for t in pro_triggers if t in query_lower)
        flash_score = sum(1 for t in flash_triggers if t in query_lower)
        
        # 如果同时命中两类，Pro 优先级更高（保守策略）
        if pro_score > 0 and pro_score >= flash_score:
            return "pro"
        if flash_score > 0:
            return "flash"
        
        # 默认走 Flash（成本低）
        return "flash"
    
    @property
    def pro_llm(self) -> Optional[ChatOpenAI]:
        return self._pro_llm
    
    @property
    def flash_llm(self) -> Optional[ChatOpenAI]:
        return self._flash_llm


# 全局单例
model_router = ModelRouter()
