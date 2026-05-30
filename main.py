"""
DeepThink Agent 入口文件

环境配置（推荐写入 .env 文件）：
    OPENAI_API_KEY=sk-xxx
    OPENAI_BASE_URL=https://api.deepseek.com/v1
    LLM_PRO_MODEL=deepseek-v4-pro
    LLM_FLASH_MODEL=deepseek-v4-flash

本书对照学习指南：
- 第1-2章：LangChain Tool 定义与 ReAct 概念
- 第4章：RAG 工具中的 FAISS + Embedding
- 第5章：Sensor→Thinker→Actuator 映射到 Node 结构
- 第10章：iteration / max_iterations 性能控制

Claude Code 源码对照：
- src/query.ts          → agent_node 循环逻辑
- src/services/tools/   → tool_executor_node
- src/services/compact/ → _compact_context
- src/QueryEngine.ts    → build_graph() 状态机
"""
import os
import sys
import argparse
from langchain_core.messages import HumanMessage

# 将项目根目录加入路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 必须先导入 config 以加载 .env
from config import Config

# 应用 DeepSeek reasoning_content 兼容性补丁（必须在 langchain_openai 被使用前）
import utils.deepseek_patch  # noqa: F401

from graph import graph_app
from state import AgentState
from utils.usage_db import usage_db


def run_agent(question: str, thread_id: str = "demo") -> None:
    """运行 DeepThink Agent 回答单个问题"""
    
    # 检查 API 配置
    if not Config.is_api_ready():
        print("❌ 错误: API Key 未配置")
        print("   请在 .env 文件中设置 OPENAI_API_KEY，或执行:")
        print("   $env:OPENAI_API_KEY='sk-xxx'")
        return
    
    initial_state: AgentState = {
        "messages": [HumanMessage(content=question)],
        "thread_id": thread_id,
        "thoughts": [],
        "iteration": 0,
        "max_iterations": Config.AGENT_MAX_ITERATIONS,
        "need_deep_thinking": False,
        "tool_results": {},
        "permission_granted": False,
        "total_tokens": 0,
    }
    
    config = {"configurable": {"thread_id": thread_id}}
    
    print("=" * 60)
    print(f"🧠 DeepThink Agent 启动")
    print(f"📨 问题: {question}")
    print(f"🔧 模型: Pro={Config.LLM_PRO_MODEL} | Flash={Config.LLM_FLASH_MODEL}")
    print(f"   地址: {Config.OPENAI_BASE_URL}")
    print("=" * 60)
    
    printed_count = 0
    for event in graph_app.stream(initial_state, config, stream_mode="values"):
        messages = event.get("messages", [])
        new_messages = messages[printed_count:]
        printed_count = len(messages)
        
        for msg in new_messages:
            msg_type = type(msg).__name__
            
            # 获取模型类型（Pro/Flash）
            model_type = msg.additional_kwargs.get("model_type", "")
            model_tag = f"[{model_type.upper()}] " if model_type else ""
            
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    print(f"\n🔧 [工具调用] {tc['name']}")
                    print(f"   参数: {tc['args']}")
            elif hasattr(msg, "name") and msg.name:
                # 解析 JSON 工具结果，格式化输出
                try:
                    import json
                    payload = json.loads(msg.content)
                    ok = payload.get("ok", False)
                    data = payload.get("data")
                    error = payload.get("error", "")
                    icon = "✅" if ok else "❌"
                    print(f"\n{icon} [工具结果-{msg.name}]")
                    if data and isinstance(data, dict):
                        for k, v in data.items():
                            if isinstance(v, str) and len(v) > 200:
                                v = v[:200] + "..."
                            print(f"   {k}: {v}")
                    if error:
                        print(f"   错误: {error}")
                except Exception:
                    print(f"\n📋 [工具结果-{msg.name}] {msg.content[:200]}...")
            elif msg_type == "HumanMessage":
                pass
            else:
                prefix = "🤖"
                content = msg.content
                if "[CoT" in content:
                    prefix = "🧩"
                elif "[反思" in content:
                    prefix = "🪞"
                elif "[权限确认" in content:
                    prefix = "🔒"
                print(f"\n{prefix} {model_tag}{content}")
        
    # 打印会话用量摘要
    summary = usage_db.summary_by_thread(thread_id)
    print("\n" + "=" * 60)
    print(f"🏁 Agent 执行完毕")
    if summary["calls"] > 0:
        print(f"📊 本次调用: {summary['calls']} 次 | "
              f"Token: {summary['total_tokens']} | "
              f"成本: ${summary['total_cost_usd']:.6f} | "
              f"平均延迟: {summary['avg_latency_ms']:.0f}ms")
        
        # 区分 Pro/Flash 用量
        records = usage_db.query_recent(limit=50)
        pro_calls = [r for r in records if r.thread_id == thread_id and "(pro)" in r.node_name]
        flash_calls = [r for r in records if r.thread_id == thread_id and "(flash)" in r.node_name]
        if pro_calls or flash_calls:
            pro_cost = sum(r.cost_usd for r in pro_calls)
            flash_cost = sum(r.cost_usd for r in flash_calls)
            pro_tokens = sum(r.total_tokens for r in pro_calls)
            flash_tokens = sum(r.total_tokens for r in flash_calls)
            print(f"   Pro:  {len(pro_calls)}次 {pro_tokens}tokens ${pro_cost:.6f}")
            print(f"   Flash:{len(flash_calls)}次 {flash_tokens}tokens ${flash_cost:.6f}")
    print("=" * 60)


def interactive_mode():
    """交互式对话模式"""
    if not Config.is_api_ready():
        print("❌ 错误: API Key 未配置。请在 .env 中设置 OPENAI_API_KEY")
        return
    
    print("\n" + "=" * 60)
    print("🧠 DeepThink Agent 交互模式")
    print(f"模型: Pro={Config.LLM_PRO_MODEL} | Flash={Config.LLM_FLASH_MODEL}")
    print("输入问题让 Agent 回答，输入 'quit' 退出，输入 'usage' 查看用量")
    print("=" * 60 + "\n")
    
    thread_id = "interactive_session"
    question_count = 0
    
    while True:
        try:
            user_input = input("你: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n👋 再见！")
            break
        
        if user_input.lower() in ("quit", "exit", "q"):
            print("👋 再见！")
            break
        if not user_input:
            continue
        if user_input.lower() == "usage":
            _print_usage(thread_id)
            continue
        
        question_count += 1
        run_agent(user_input, thread_id=f"{thread_id}_{question_count}")
        print()


def _print_usage(thread_id: str):
    """打印用量统计"""
    summary = usage_db.summary_by_thread(thread_id)
    print("\n📊 用量统计")
    print(f"   会话: {summary['thread_id']}")
    print(f"   调用次数: {summary['calls']}")
    print(f"   Prompt Tokens: {summary['prompt_tokens']}")
    print(f"   Completion Tokens: {summary['completion_tokens']}")
    print(f"   总 Tokens: {summary['total_tokens']}")
    print(f"   总成本: ${summary['total_cost_usd']:.6f}")
    print(f"   平均延迟: {summary['avg_latency_ms']:.0f}ms\n")


def show_global_usage(days: int = 7):
    """展示全局用量"""
    summary = usage_db.summary_global(days)
    print("\n📊 全局用量统计")
    print(f"   统计周期: 最近 {summary['period_days']} 天")
    print(f"   总调用次数: {summary['calls']}")
    print(f"   总 Tokens: {summary['total_tokens']}")
    print(f"   总成本: ${summary['total_cost_usd']:.6f}\n")


def demo_batch():
    """批量演示"""
    demos = [
        "什么是 LangGraph，它和 LangChain 有什么关系？",
        "请计算 1234 * 5678 加上 9999 的结果",
        "搜索最新的 AI Agent 开发框架",
        "用 Python 计算前 10 个质数的和",
    ]
    for i, q in enumerate(demos, 1):
        run_agent(q, thread_id=f"demo_{i}")
        print("\n" + "-" * 60 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DeepThink Agent - CoT + 工具调用")
    parser.add_argument("--question", "-q", type=str, help="单次提问")
    parser.add_argument("--interactive", "-i", action="store_true", help="交互模式")
    parser.add_argument("--demo", "-d", action="store_true", help="批量演示")
    parser.add_argument("--usage", "-u", action="store_true", help="查看全局用量统计")
    parser.add_argument("--usage-days", type=int, default=7, help="用量统计天数 (默认7天)")
    
    args = parser.parse_args()
    
    if args.usage:
        show_global_usage(args.usage_days)
    elif args.question:
        run_agent(args.question)
    elif args.interactive:
        interactive_mode()
    elif args.demo:
        demo_batch()
    else:
        print("=" * 60)
        print("🧠 DeepThink Agent")
        print("=" * 60)
        print("\n用法:")
        print("  python main.py -q '你的问题'       # 单次提问")
        print("  python main.py -i                  # 交互模式")
        print("  python main.py -d                  # 批量演示")
        print("  python main.py -u                  # 查看用量统计")
        print("\n配置: 编辑 .env 文件设置 API Key")
        print()
        
        if Config.is_api_ready():
            run_agent("请介绍一下 DeepThink Agent 的工作原理，并说明 CoT 起什么作用？")
        else:
            print("⚠️ 未检测到 API Key，已跳过默认示例。")
            print("   请编辑 .env 文件或在环境变量中设置 OPENAI_API_KEY")
