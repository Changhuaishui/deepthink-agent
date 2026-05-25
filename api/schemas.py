"""
前后端接口契约（Pydantic Schemas）
企业级开发：先定义契约，再实现两端
"""
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 请求模型
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    """聊天请求"""
    question: str = Field(..., min_length=1, description="用户问题")
    thread_id: str = Field(default="frontend", description="会话ID")
    enable_tot: bool = Field(default=False, description="是否启用ToT深度思考")
    max_iterations: int = Field(default=10, ge=1, le=50, description="最大迭代次数")


class UsageQuery(BaseModel):
    """用量查询"""
    thread_id: Optional[str] = None
    days: int = Field(default=7, ge=1, le=365)


# ---------------------------------------------------------------------------
# 响应模型
# ---------------------------------------------------------------------------
class ToolInfo(BaseModel):
    """工具元信息"""
    name: str
    description: str


class ConfigResponse(BaseModel):
    """配置响应"""
    pro_model: str
    flash_model: str
    base_url: str
    temperature: float
    max_tokens: int
    max_iterations: int
    permission_check: bool
    context_compact: bool
    tools: List[ToolInfo]


class HealthResponse(BaseModel):
    """健康检查"""
    status: str
    api_ready: bool
    version: str = "1.0.0"


class UsageRecord(BaseModel):
    """单条用量记录"""
    timestamp: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float
    node_name: str
    latency_ms: int


class UsageSummary(BaseModel):
    """用量统计摘要"""
    thread_id: Optional[str]
    calls: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    total_cost_usd: float
    avg_latency_ms: float


class GlobalUsageSummary(BaseModel):
    """全局用量统计"""
    period_days: int
    calls: int
    total_tokens: int
    total_cost_usd: float


# ---------------------------------------------------------------------------
# SSE 流事件模型（核心契约）
# ---------------------------------------------------------------------------
class SSEEvent(BaseModel):
    """SSE 流事件基类
    
    type 枚举说明：
    - run_start: 运行开始
    - node_start: 节点开始执行
    - node_end: 节点执行结束
    - message: LLM 消息（AI/Human/Tool）
    - tool_call: 工具调用请求
    - tool_result: 工具执行结果
    - thought: CoT/ToT 思考内容
    - candidate: ToT 候选方案更新
    - state_update: 状态变更通知
    - usage: 用量记录
    - error: 错误
    - run_complete: 运行完成
    """
    type: Literal[
        "run_start", "node_start", "node_end", "message",
        "tool_call", "tool_result", "thought", "candidate",
        "state_update", "usage", "error", "run_complete",
    ]
    node: Optional[str] = None  # 关联的节点名
    data: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str


class MessagePayload(BaseModel):
    """消息事件载荷"""
    role: str  # assistant | user | tool
    content: str
    model_type: Optional[str] = None  # pro | flash
    tool_calls: Optional[List[Dict[str, Any]]] = None
    name: Optional[str] = None  # tool name


class ToolCallPayload(BaseModel):
    """工具调用事件载荷"""
    tool_name: str
    arguments: Dict[str, Any]


class ToolResultPayload(BaseModel):
    """工具结果事件载荷"""
    tool_name: str
    ok: bool
    data: Any
    error: str = ""


class ThoughtPayload(BaseModel):
    """思考事件载荷"""
    thought_type: Literal["cot", "tot", "reflect"]
    content: str
    details: Optional[Dict[str, Any]] = None


class CandidatePayload(BaseModel):
    """候选方案事件载荷"""
    candidates: List[Dict[str, Any]]
    best_idx: int


class StateUpdatePayload(BaseModel):
    """状态更新事件载荷"""
    iteration: int
    tot_rounds: int
    need_tot: bool
    permission_granted: Optional[bool] = None
