"""
LangGraph 状态图构建
将 CoT + ToT + 工具调用组装为可运行的状态机
对标 Claude Code 的 QueryEngine 生命周期 + 书中第5章 Agent 循环
"""
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from config import Config
from state import AgentState
from nodes import (
    agent_node,
    permission_node,
    cot_node,
    tot_generate_node,
    tool_executor_node,
    evaluate_node,
    reflect_node,
    final_answer_node,
    route_after_agent,
    route_after_permission,
    route_after_reflect,
)


def build_graph() -> StateGraph:
    """构建 DeepThink Agent 状态图
    
    生产级架构（对标 Claude Code）：
    
        用户输入
           │
           ▼
       ┌─────────┐
       │ agent   │ ← LLM 主决策（带工具绑定 + 上下文压缩）
       └────┬────┘
            │
      ┌─────┼─────┬──────────┐
      ▼     ▼     ▼          ▼
   permission  tot  evaluate  final/end
      │
      ├── 拒绝 → END
      └── 通过
            │
            ▼
        tools（并行执行）
            │
            ▼
        agent（循环回主决策）
    
    核心循环：agent → permission → tools → agent → ...
    """
    workflow = StateGraph(AgentState)
    
    # 注册节点
    workflow.add_node("agent", agent_node)
    workflow.add_node("permission", permission_node)
    workflow.add_node("cot", cot_node)
    workflow.add_node("tot", tot_generate_node)
    workflow.add_node("tools", tool_executor_node)
    workflow.add_node("evaluate", evaluate_node)
    workflow.add_node("reflect", reflect_node)
    workflow.add_node("final", final_answer_node)
    
    # 入口点
    workflow.set_entry_point("agent")
    
    # Agent → 条件路由
    workflow.add_conditional_edges(
        "agent",
        route_after_agent,
        {
            "permission": "permission",
            "tot": "tot",
            "evaluate": "evaluate",
            "final": "final",
            "end": END,
        }
    )
    
    # Permission → 条件路由
    workflow.add_conditional_edges(
        "permission",
        route_after_permission,
        {
            "tools": "tools",
            "agent": "agent",
            "end": END,
        }
    )
    
    # 工具执行后 → 回 Agent（核心循环）
    workflow.add_edge("tools", "agent")
    
    # CoT → 回 Agent（基于思考再决策）
    workflow.add_edge("cot", "agent")
    
    # ToT → 工具（验证候选方案）
    workflow.add_edge("tot", "tools")
    
    # 评估 → 反思
    workflow.add_edge("evaluate", "reflect")
    
    # 反思 → 条件路由
    workflow.add_conditional_edges(
        "reflect",
        route_after_reflect,
        {
            "tot": "tot",
            "final": "final",
        }
    )
    
    # 最终答案 → 结束
    workflow.add_edge("final", END)
    
    # 编译：内存持久化 checkpoint
    memory = MemorySaver()
    app = workflow.compile(checkpointer=memory)
    
    return app


# 全局图实例
graph_app = build_graph()
