"""
成本追踪模块
对标 Claude Code 的 cost-tracker.ts
"""
from typing import Dict


class CostTracker:
    """追踪 API 调用成本"""
    
    # 模型单价（每 1K tokens，单位：美元）
    PRICING = {
        "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
        "gpt-4o": {"input": 0.0025, "output": 0.01},
        "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    }
    
    def __init__(self):
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.calls = 0
    
    def record_call(self, model: str, input_tokens: int, output_tokens: int):
        """记录一次 API 调用"""
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        self.calls += 1
        
        pricing = self.PRICING.get(model, self.PRICING["gpt-4o-mini"])
        cost = (input_tokens / 1000) * pricing["input"] + (output_tokens / 1000) * pricing["output"]
        return cost
    
    def summary(self) -> Dict:
        """返回成本摘要"""
        return {
            "calls": self.calls,
            "input_tokens": self.total_input_tokens,
            "output_tokens": self.total_output_tokens,
            "total_tokens": self.total_input_tokens + self.total_output_tokens,
        }
