"""
DeepThink Agent 入口文件
运行示例：python main.py

环境变量配置（推荐写入 .env 或系统环境变量）：
    OPENAI_API_KEY=sk-xxxxxxxx
    OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，用于第三方 API 代理

本书对照学习指南：
- 第1-2章：理解 LangChain 工具定义和 ReAct 概念
- 第4章：理解 RAG 工具中的 FAISS + Embedding 实现
- 第5章：将 Sensor→Thinker→Actuator 映射到本代码的 Node 结构
- 第9章：理解 evaluate_node 中的评估逻辑（语义相似度启发式）
- 第10章：理解 iteration/max_iterations 作为性能/安全控制

Claude Code 源码对照学习指南：
- src/query.ts：对照 agent_node 的循环逻辑（messages[] -> LLM -> tool_use? -> 执行 -> 循环）
- src/services/tools/toolOrchestration.ts：对照 tool_executor_node 的工具编排
- src/services/compact/autoCompact.ts：对照 iteration >= 3 时的上下文压缩提示
- src/QueryEngine.ts：对照 build_graph() 中的状态机生命周期管理
"""
import os
import sys
from langchain_core.messages import HumanMessage

# 将项目根目录加入路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from graph import graph_app
from state import AgentState


def run_agent(question: str, thread_id: str = "demo") -> None:
    """运行 DeepThink Agent 回答单个问题"""
    
    # 初始化状态
    initial_state: AgentState = {
        "messages": [HumanMessage(content=question)],
        "thoughts": [],
        "candidates": [],
        "best_candidate_idx": 0,
        "iteration": 0,
        "max_iterations": 5,
        "need_tot": False,
        "tool_results": {},
        "tot_rounds": 0,
        "total_tokens": 0,
    }
    
    # 配置线程（checkpoint 隔离）
    config = {"configurable": {"thread_id": thread_id}}
    
    print("=" * 60)
    print(f"🧠 DeepThink Agent 启动")
    print(f"📨 问题: {question}")
    print(f"🔧 模式: {'真实 LLM' if os.environ.get('OPENAI_API_KEY') else '模拟演示'}")
    print("=" * 60)
    
    # 流式执行图（可观察每个节点的流转，对标 Claude Code 的流式传输）
    printed_count = 0
    for event in graph_app.stream(initial_state, config, stream_mode="values"):
        messages = event.get("messages", [])
        
        # 只打印新增的消息，避免节点无消息更新时重复打印
        new_messages = messages[printed_count:]
        printed_count = len(messages)
        
        for msg in new_messages:
            msg_type = type(msg).__name__
            
            # 根据消息类型打印不同前缀
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                print(f"\n🔧 [工具调用] {msg.tool_calls[0]['name']}")
                print(f"   参数: {msg.tool_calls[0]['args']}")
            elif hasattr(msg, "name") and msg.name:
                print(f"\n📋 [工具结果-{msg.name}] {msg.content[:200]}...")
            elif msg_type == "HumanMessage":
                pass  # 用户消息已在启动时打印，跳过
            else:
                prefix = "🤖"
                content = msg.content
                if "[CoT" in content:
                    prefix = "🧩"
                elif "[ToT" in content:
                    prefix = "🌲"
                elif "[反思" in content:
                    prefix = "🪞"
                elif "最终回答" in content or "[模拟模式回答]" in content:
                    prefix = "✅"
                print(f"\n{prefix} {content}")
        
        # 打印纯状态更新（无新消息时）
        thoughts = event.get("thoughts", [])
        candidates = event.get("candidates", [])
        if not new_messages and thoughts:
            print(f"\n🧩 [CoT 更新] 已记录 {len(thoughts)} 条思考")
        if not new_messages and candidates:
            print(f"\n🌲 [ToT 更新] 候选方案数: {len(candidates)}, 最佳索引: {event.get('best_candidate_idx', 'N/A')}")
    
    print("\n" + "=" * 60)
    print("🏁 Agent 执行完毕")
    print("=" * 60)


def interactive_mode():
    """交互式对话模式"""
    print("\n" + "=" * 60)
    print("🧠 DeepThink Agent 交互模式")
    print("输入问题让 Agent 回答，输入 'quit' 退出")
    print("=" * 60 + "\n")
    
    thread_id = "interactive_session"
    question_count = 0
    
    while True:
        user_input = input("你: ").strip()
        if user_input.lower() in ("quit", "exit", "q"):
            print("👋 再见！")
            break
        if not user_input:
            continue
        
        question_count += 1
        run_agent(user_input, thread_id=f"{thread_id}_{question_count}")
        print()


def demo_batch():
    """批量演示：运行多个典型问题"""
    demo_questions = [
        "什么是 LangGraph，它和 LangChain 有什么关系？",
        "请计算 1234 * 5678 加上 9999 的结果",
        "对比 CoT 和 ToT 两种推理策略，哪个更适合多步骤数学问题？",
        "搜索一下关于 RAG 和 Agent 结合的最新思路",
        "用 Python 计算前100个质数的和",
    ]
    
    for i, q in enumerate(demo_questions, 1):
        run_agent(q, thread_id=f"demo_{i}")
        print("\n" + "-" * 60 + "\n")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="DeepThink Agent - CoT + ToT + 工具调用")
    parser.add_argument("--question", "-q", type=str, help="单次提问模式")
    parser.add_argument("--interactive", "-i", action="store_true", help="交互模式")
    parser.add_argument("--demo", "-d", action="store_true", help="批量演示模式")
    
    args = parser.parse_args()
    
    if args.question:
        run_agent(args.question)
    elif args.interactive:
        interactive_mode()
    elif args.demo:
        demo_batch()
    else:
        # 默认：先运行一个简单示例，然后提示用户
        print("=" * 60)
        print("🧠 DeepThink Agent 启动")
        print("=" * 60)
        print("\n未检测到命令行参数，运行默认示例...\n")
        print("提示：")
        print("  python main.py -q '你的问题'    # 单次提问")
        print("  python main.py -i               # 交互模式")
        print("  python main.py -d               # 批量演示")
        print()
        
        run_agent("请介绍一下 DeepThink Agent 的工作原理，并说明 CoT 和 ToT 分别起什么作用？")
