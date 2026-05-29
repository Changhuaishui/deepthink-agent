import importlib
import json
import unittest

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from pydantic import ValidationError

from api.schemas import ChatRequest
from config import Config
import nodes.nodes as nodes_module
from nodes.nodes import (
    _compact_context,
    get_llm_with_tools,
    permission_node,
    route_after_agent,
    route_after_permission,
)
from tools.tools import _safe_artifact_path, write_file_tool


def _state(**overrides):
    state = {
        "messages": [HumanMessage(content="hello")],
        "thread_id": "test",
        "thoughts": [],
        "candidates": [],
        "best_candidate_idx": 0,
        "iteration": 0,
        "max_iterations": Config.AGENT_MAX_ITERATIONS,
        "need_tot": False,
        "tot_rounds": 0,
        "tool_results": {},
        "permission_granted": False,
        "total_tokens": 0,
    }
    state.update(overrides)
    return state


class CoreBehaviorTest(unittest.TestCase):
    def test_chat_request_validates_question_and_iterations(self):
        with self.assertRaises(ValidationError):
            ChatRequest(question="")
        with self.assertRaises(ValidationError):
            ChatRequest(question="ok", max_iterations=0)
        self.assertEqual(ChatRequest(question="ok").thread_id, "frontend")

    def test_route_after_agent_enters_cot_before_tot(self):
        state = _state(
            messages=[HumanMessage(content="compare options"), AIMessage(content="thinking")],
            need_tot=True,
        )
        self.assertEqual(route_after_agent(state), "cot")

    def test_route_after_agent_stops_at_max_iterations(self):
        state = _state(
            messages=[HumanMessage(content="hello"), AIMessage(content="done")],
            iteration=3,
            max_iterations=3,
        )
        self.assertEqual(route_after_agent(state), "end")

    def test_route_after_agent_finalizes_at_max_iterations_with_context(self):
        state = _state(
            messages=[HumanMessage(content="hello"), AIMessage(content="done")],
            iteration=3,
            max_iterations=3,
            thoughts=["some thought"],
        )
        self.assertEqual(route_after_agent(state), "final")

    def test_get_llm_with_tools_auto_routes_by_query(self):
        old_pro = nodes_module._llm_pro_with_tools
        old_flash = nodes_module._llm_flash_with_tools
        pro = object()
        flash = object()
        try:
            nodes_module._llm_pro_with_tools = pro
            nodes_module._llm_flash_with_tools = flash
            self.assertIs(get_llm_with_tools("auto", query="请分析系统架构"), pro)
            self.assertIs(get_llm_with_tools("auto", query="列出当前文件"), flash)
            self.assertIs(get_llm_with_tools("auto"), flash)
        finally:
            nodes_module._llm_pro_with_tools = old_pro
            nodes_module._llm_flash_with_tools = old_flash

    def test_permission_routes_sensitive_tool_to_end_without_grant(self):
        message = AIMessage(
            content="",
            tool_calls=[{"name": "write_file_tool", "args": {"filepath": "x"}, "id": "call_1"}],
        )
        result = permission_node(_state(messages=[message]))
        self.assertFalse(result["permission_granted"])
        routed_state = _state(messages=[message, *result["messages"]], permission_granted=False)
        self.assertEqual(route_after_permission(routed_state), "end")

    def test_compact_context_keeps_tool_messages_with_call(self):
        tool_call = {"name": "calc_tool", "args": {"expression": "1+1"}, "id": "call_1"}
        messages = [
            HumanMessage(content="start"),
            HumanMessage(content="middle 1"),
            HumanMessage(content="middle 2"),
            AIMessage(content="", tool_calls=[tool_call]),
            ToolMessage(content="2", name="calc_tool", tool_call_id="call_1"),
            HumanMessage(content="next"),
            AIMessage(content="answer"),
        ]
        compacted = _compact_context(messages)
        self.assertTrue(any(isinstance(msg, ToolMessage) for msg in compacted))
        tool_index = next(i for i, msg in enumerate(compacted) if isinstance(msg, ToolMessage))
        self.assertIsInstance(compacted[tool_index - 1], AIMessage)

    def test_import_tools_does_not_initialize_rag(self):
        tools_module = importlib.import_module("tools.tools")
        self.assertIsNone(tools_module._kb)

    def test_write_file_tool_is_limited_to_artifacts(self):
        normalized = _safe_artifact_path("data/artifacts/output.html")
        self.assertTrue(str(normalized).endswith("data\\artifacts\\output.html"))

        result = write_file_tool.invoke({"filepath": "../bad.txt", "content": "x"})
        payload = json.loads(result)
        self.assertFalse(payload["ok"])
        self.assertIn("写入路径越界", payload["error"])

    def test_graph_builds(self):
        from graph import build_graph

        self.assertIsNotNone(build_graph())


if __name__ == "__main__":
    unittest.main()
