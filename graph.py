"""
LangGraph 状态图构建
将 CoT + ToT + 工具调用组装为可运行的状态机
对标 Claude Code 的 QueryEngine 生命周期 + 书中第5章 Agent 循环
"""
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from state import AgentState
from nodes import (
    agent_node,
    cot_node,
    tot_generate_node,
    tool_executor_node,
    evaluate_node,
    reflect_node,
    final_answer_node,
    route_after_agent,
    route_after_reflect,
    route_after_cot,
)


def build_graph() -> StateGraph:
    """构建 DeepThink Agent 的状态图
    
    图结构说明：
    
        用户输入
           │
           ▼
       ┌─────────┐
       │ agent   │ ←── 主决策节点（LLM 判断是否调用工具/CoT/ToT/直接回答）
       └────┬────┘
            │
      ┌─────┼─────┬──────────┐
      ▼     ▼     ▼          ▼
   tools   cot   tot    evaluate (如果已有候选)
      │     │     │          │
      │     │     ▼          ▼
      │     │  tool_exec  reflect
      │     │     │          │
      └─────┴─────┴──────────┘
            │
            ▼
        final_answer
            │
            ▼
           END
    
    核心循环（对标 Claude Code）：
    agent -> tools -> agent -> tools -> ... -> final
    """
    
    # 初始化状态图
    workflow = StateGraph(AgentState)
    
    # 注册节点
    workflow.add_node("agent", agent_node)
    workflow.add_node("cot", cot_node)
    workflow.add_node("tot", tot_generate_node)
    workflow.add_node("tools", tool_executor_node)
    workflow.add_node("evaluate", evaluate_node)
    workflow.add_node("reflect", reflect_node)
    workflow.add_node("final", final_answer_node)
    
    # 设置入口点
    workflow.set_entry_point("agent")
    
    # Agent 节点的条件路由（核心决策逻辑）
    workflow.add_conditional_edges(
        "agent",
        route_after_agent,
        {
            "tools": "tools",
            "tot": "tot",
            "evaluate": "evaluate",
            "final": "final",
            "end": END,
        }
    )
    
    # 工具执行后返回 Agent（核心循环）
    workflow.add_edge("tools", "agent")
    
    # CoT 思考后返回 Agent（让 Agent 基于思考结果再决策）
    workflow.add_conditional_edges(
        "cot",
        route_after_cot,
        {
            "agent": "agent",
        }
    )
    
    # ToT 生成后执行工具（并行验证候选方案）
    workflow.add_edge("tot", "tools")
    
    # 评估后进入反思
    workflow.add_edge("evaluate", "reflect")
    
    # 反思后的条件路由
    workflow.add_conditional_edges(
        "reflect",
        route_after_reflect,
        {
            "tot": "tot",      # 需要重新生成候选
            "final": "final",  # 输出最终答案
        }
    )
    
    # 最终答案后结束
    workflow.add_edge("final", END)
    
    # 编译图（加入内存持久化 checkpoint，对标 Claude Code 的会话状态）
    memory = MemorySaver()
    app = workflow.compile(checkpointer=memory)
    
    return app


# 全局图实例
graph_app = build_graph()
