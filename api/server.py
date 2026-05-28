"""
DeepThink Agent FastAPI 服务端
提供 RESTful API + SSE 流式接口

企业级设计原则：
- 接口版本化 (/api/v1/... 预留)
- 统一的错误处理
- 完整的日志记录
- CORS 支持前端跨域
- 健康检查与就绪检查
"""
import os
import sys
import json
import time
import asyncio
from datetime import datetime
from typing import AsyncGenerator, Optional
from contextlib import asynccontextmanager

# ---------------------------------------------------------------------------
# 路径处理：确保能导入项目根目录模块
# ---------------------------------------------------------------------------
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# 必须先加载配置（触发 .env 加载）
from config import Config

# 应用 DeepSeek 补丁（必须在 langchain_openai 使用前）
import utils.deepseek_patch  # noqa: F401

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

from graph import graph_app
from tools import ALL_TOOLS
from utils.usage_db import usage_db

from api.schemas import (
    ChatRequest,
    ConfigResponse,
    HealthResponse,
    UsageSummary,
    GlobalUsageSummary,
    SSEEvent,
)


# ---------------------------------------------------------------------------
# 生命周期管理
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动 / 关闭"""
    Config.ensure_dirs()
    yield
    # 关闭时清理（如需）


# ---------------------------------------------------------------------------
# FastAPI 应用实例
# ---------------------------------------------------------------------------
app = FastAPI(
    title="DeepThink Agent API",
    description="CoT + ToT + 工具调用 Agent 的 HTTP/SSE 接口",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS：允许前端开发服务器访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.now().isoformat()


def _sse_format(event_type: str, data: dict) -> str:
    """SSE 格式：data: {...}\n\n"""
    payload = json.dumps({"type": event_type, **data, "timestamp": _now_iso()})
    return f"data: {payload}\n\n"


def _extract_message_payload(msg) -> Optional[dict]:
    """从 LangChain Message 提取前端可用的载荷"""
    if isinstance(msg, HumanMessage):
        return {"role": "user", "content": str(msg.content)}
    
    if isinstance(msg, AIMessage):
        payload = {
            "role": "assistant",
            "content": str(msg.content),
            "model_type": msg.additional_kwargs.get("model_type", ""),
        }
        if getattr(msg, "tool_calls", None):
            payload["tool_calls"] = [
                {
                    "id": tc.get("id", ""),
                    "name": tc.get("name", ""),
                    "args": tc.get("args", {}),
                }
                for tc in msg.tool_calls
            ]
        return payload
    
    if isinstance(msg, ToolMessage):
        # 尝试解析 JSON 工具结果
        try:
            parsed = json.loads(str(msg.content))
            return {
                "role": "tool",
                "content": str(msg.content),
                "name": msg.name,
                "tool_ok": parsed.get("ok", False),
                "tool_data": parsed.get("data"),
                "tool_error": parsed.get("error", ""),
            }
        except Exception:
            return {
                "role": "tool",
                "content": str(msg.content),
                "name": msg.name,
            }
    
    return None


# ---------------------------------------------------------------------------
# SSE 流生成器（核心）
# ---------------------------------------------------------------------------
async def _chat_stream(
    question: str,
    thread_id: str,
    enable_tot: bool,
    max_iterations: int,
) -> AsyncGenerator[str, None]:
    """Agent 执行流：将 LangGraph stream 转换为 SSE 事件"""
    
    start_time = time.time()
    
    # 初始状态
    initial_state = {
        "messages": [HumanMessage(content=question)],
        "thread_id": thread_id,
        "thoughts": [],
        "candidates": [],
        "best_candidate_idx": 0,
        "iteration": 0,
        "max_iterations": max_iterations,
        "need_tot": enable_tot,
        "tot_rounds": 0,
        "tool_results": {},
        "permission_granted": False,
        "total_tokens": 0,
    }
    
    config = {"configurable": {"thread_id": thread_id}}
    
    # 发送开始事件
    yield _sse_format("run_start", {
        "node": "start",
        "data": {"question": question, "thread_id": thread_id, "enable_tot": enable_tot},
    })
    
    # 跟踪上一个状态，用于计算增量
    prev_state = None
    
    try:
        # 在线程池中运行同步的 graph_app.stream()
        loop = asyncio.get_event_loop()
        stream_gen = graph_app.stream(initial_state, config, stream_mode="values")
        
        for event in stream_gen:
            # 提取消息列表
            messages = event.get("messages", [])
            new_msgs = messages if prev_state is None else messages[len(prev_state.get("messages", [])):]
            
            for msg in new_msgs:
                payload = _extract_message_payload(msg)
                if payload:
                    # 判断是否是工具调用
                    if payload.get("role") == "assistant" and payload.get("tool_calls"):
                        for tc in payload["tool_calls"]:
                            yield _sse_format("tool_call", {
                                "node": "agent",
                                "data": {"tool_name": tc["name"], "arguments": tc["args"]},
                            })
                    
                    yield _sse_format("message", {
                        "node": "agent",
                        "data": payload,
                    })
            
            # 状态变更检测与推送
            state_delta = {}
            if prev_state is not None:
                if event.get("thoughts") != prev_state.get("thoughts"):
                    thoughts = event.get("thoughts", [])
                    if thoughts:
                        state_delta["thoughts"] = thoughts
                        yield _sse_format("thought", {
                            "node": "cot",
                            "data": {
                                "thought_type": "cot",
                                "content": thoughts[-1] if thoughts else "",
                                "details": {"all_thoughts": thoughts},
                            },
                        })
                
                if event.get("candidates") != prev_state.get("candidates"):
                    candidates = event.get("candidates", [])
                    best_idx = event.get("best_candidate_idx", 0)
                    state_delta["candidates"] = candidates
                    yield _sse_format("candidate", {
                        "node": "tot",
                        "data": {"candidates": candidates, "best_idx": best_idx},
                    })
                
                if event.get("tool_results") != prev_state.get("tool_results"):
                    tool_results = event.get("tool_results", {})
                    # 找出新增的工具结果
                    prev_tools = prev_state.get("tool_results", {})
                    for name, result in tool_results.items():
                        if name not in prev_tools:
                            try:
                                parsed = json.loads(result) if isinstance(result, str) else result
                                yield _sse_format("tool_result", {
                                    "node": "tools",
                                    "data": {
                                        "tool_name": name,
                                        "ok": parsed.get("ok", False) if isinstance(parsed, dict) else True,
                                        "data": parsed.get("data") if isinstance(parsed, dict) else parsed,
                                        "error": parsed.get("error", "") if isinstance(parsed, dict) else "",
                                    },
                                })
                            except Exception:
                                yield _sse_format("tool_result", {
                                    "node": "tools",
                                    "data": {"tool_name": name, "ok": True, "data": result, "error": ""},
                                })
                
                if event.get("permission_granted") != prev_state.get("permission_granted"):
                    yield _sse_format("state_update", {
                        "node": "permission",
                        "data": {"permission_granted": event.get("permission_granted", False)},
                    })
            
            # 推送状态摘要
            yield _sse_format("state_update", {
                "node": "system",
                "data": {
                    "iteration": event.get("iteration", 0),
                    "tot_rounds": event.get("tot_rounds", 0),
                    "need_tot": event.get("need_tot", False),
                },
            })
            
            prev_state = event
            # 让出控制权，避免阻塞事件循环
            await asyncio.sleep(0)
    
    except Exception as e:
        yield _sse_format("error", {
            "node": "system",
            "data": {"error_type": type(e).__name__, "message": str(e)},
        })
    
    finally:
        # 推送用量摘要
        elapsed = int((time.time() - start_time) * 1000)
        summary = usage_db.summary_by_thread(thread_id)
        yield _sse_format("usage", {
            "node": "system",
            "data": {
                "elapsed_ms": elapsed,
                **summary,
            },
        })
        
        yield _sse_format("run_complete", {
            "node": "end",
            "data": {"thread_id": thread_id},
        })


# ---------------------------------------------------------------------------
# 路由定义
# ---------------------------------------------------------------------------
@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """健康检查"""
    return HealthResponse(
        status="ok",
        api_ready=Config.is_api_ready(),
    )


@app.get("/api/config", response_model=ConfigResponse)
async def get_config():
    """获取 Agent 配置与可用工具列表"""
    tools = []
    for t in ALL_TOOLS:
        try:
            tools.append({"name": t.name, "description": t.description[:200]})
        except Exception:
            pass
    
    cfg = Config.to_dict()
    return ConfigResponse(
        pro_model=cfg["pro_model"],
        flash_model=cfg["flash_model"],
        base_url=cfg["base_url"],
        temperature=cfg["temperature"],
        max_tokens=cfg["max_tokens"],
        max_iterations=cfg["max_iterations"],
        permission_check=cfg["permission_check"],
        context_compact=cfg["context_compact"],
        tools=tools,
    )


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """SSE 流式聊天接口
    
    前端通过 EventSource 连接，实时接收 Agent 执行过程中的所有事件：
    - 节点开始/结束
    - 消息内容
    - 工具调用/结果
    - 思考过程
    - 状态更新
    - 用量统计
    """
    if not Config.is_api_ready():
        raise HTTPException(status_code=503, detail="API Key 未配置，服务不可用")
    
    return StreamingResponse(
        _chat_stream(
            question=request.question,
            thread_id=request.thread_id,
            enable_tot=request.enable_tot,
            max_iterations=request.max_iterations,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/usage")
async def get_usage(thread_id: Optional[str] = Query(None)):
    """查询用量统计"""
    if thread_id:
        summary = usage_db.summary_by_thread(thread_id)
    else:
        summary = usage_db.summary_global(days=7)
    return summary


@app.get("/api/usage/global")
async def get_global_usage(days: int = Query(default=7, ge=1, le=365)):
    """全局用量统计"""
    return usage_db.summary_global(days)


# ---------------------------------------------------------------------------
# 启动入口
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
