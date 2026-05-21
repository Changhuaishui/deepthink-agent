"""
Token / 成本记录模块
对标 cc-switch 的数据库记录风格，持久化每次 LLM 调用的用量
"""
import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass

from config import Config


@dataclass
class UsageRecord:
    """单次 LLM 调用记录"""
    id: Optional[int]
    timestamp: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float
    node_name: str          # 哪个节点触发的（agent/cot/tot/final）
    thread_id: str          # 会话 ID
    latency_ms: int         # 耗时毫秒
    metadata: str           # JSON 附加信息


class UsageDB:
    """SQLite 持久化用量数据库
    
    设计对标 cc-switch 的本地数据库：
    - 单文件 SQLite，轻量无需服务器
    - 按时间顺序记录每次调用
    - 支持会话统计、成本汇总
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (Config.DATA_DIR / "usage.db")
        self._init_table()

    def _init_table(self) -> None:
        """初始化数据表"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS usage_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    model TEXT NOT NULL,
                    prompt_tokens INTEGER NOT NULL DEFAULT 0,
                    completion_tokens INTEGER NOT NULL DEFAULT 0,
                    total_tokens INTEGER NOT NULL DEFAULT 0,
                    cost_usd REAL NOT NULL DEFAULT 0.0,
                    node_name TEXT NOT NULL DEFAULT '',
                    thread_id TEXT NOT NULL DEFAULT '',
                    latency_ms INTEGER NOT NULL DEFAULT 0,
                    metadata TEXT
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_timestamp ON usage_records(timestamp)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_thread ON usage_records(thread_id)
            """)
            conn.commit()

    def record(
        self,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        node_name: str = "",
        thread_id: str = "",
        latency_ms: int = 0,
        metadata: Optional[Dict] = None,
    ) -> UsageRecord:
        """记录一次 LLM 调用"""
        total = prompt_tokens + completion_tokens
        cost = self._estimate_cost(model, prompt_tokens, completion_tokens)
        ts = datetime.now().isoformat()
        meta_str = json.dumps(metadata, ensure_ascii=False) if metadata else "{}"

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO usage_records
                (timestamp, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, node_name, thread_id, latency_ms, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (ts, model, prompt_tokens, completion_tokens, total, cost, node_name, thread_id, latency_ms, meta_str),
            )
            conn.commit()
            record_id = cursor.lastrowid

        return UsageRecord(
            id=record_id,
            timestamp=ts,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total,
            cost_usd=cost,
            node_name=node_name,
            thread_id=thread_id,
            latency_ms=latency_ms,
            metadata=meta_str,
        )

    def query_recent(self, limit: int = 20) -> List[UsageRecord]:
        """查询最近记录"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM usage_records ORDER BY timestamp DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [self._row_to_record(dict(r)) for r in rows]

    def summary_by_thread(self, thread_id: str) -> Dict:
        """按会话统计用量"""
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT 
                    COUNT(*) as calls,
                    SUM(prompt_tokens) as prompt_tokens,
                    SUM(completion_tokens) as completion_tokens,
                    SUM(total_tokens) as total_tokens,
                    SUM(cost_usd) as total_cost,
                    AVG(latency_ms) as avg_latency
                FROM usage_records
                WHERE thread_id = ?
                """,
                (thread_id,),
            ).fetchone()
        return {
            "thread_id": thread_id,
            "calls": row[0] or 0,
            "prompt_tokens": row[1] or 0,
            "completion_tokens": row[2] or 0,
            "total_tokens": row[3] or 0,
            "total_cost_usd": round(row[4] or 0, 6),
            "avg_latency_ms": round(row[5] or 0, 2),
        }

    def summary_global(self, days: int = 7) -> Dict:
        """全局用量统计（最近 N 天）"""
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT 
                    COUNT(*) as calls,
                    SUM(total_tokens) as total_tokens,
                    SUM(cost_usd) as total_cost
                FROM usage_records
                WHERE timestamp >= datetime('now', '-{} days')
                """.format(days),
            ).fetchone()
        return {
            "period_days": days,
            "calls": row[0] or 0,
            "total_tokens": row[1] or 0,
            "total_cost_usd": round(row[2] or 0, 6),
        }

    def _estimate_cost(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
        """估算单次调用成本（USD）"""
        pricing = {
            "deepseek-chat": {"input": 0.00014, "output": 0.00028},        # DeepSeek V3
            "deepseek-v4-pro": {"input": 0.00174, "output": 0.00348},      # DeepSeek V4 Pro
            "deepseek-v4-flash": {"input": 0.00014, "output": 0.00028},    # DeepSeek V4 Flash
            "deepseek-reasoner": {"input": 0.00055, "output": 0.00219},   # DeepSeek R1
            "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
            "gpt-4o": {"input": 0.0025, "output": 0.01},
        }
        p = pricing.get(model, pricing["deepseek-v4-flash"])
        return (prompt_tokens / 1000) * p["input"] + (completion_tokens / 1000) * p["output"]

    def _row_to_record(self, row: dict) -> UsageRecord:
        return UsageRecord(
            id=row.get("id"),
            timestamp=row.get("timestamp", ""),
            model=row.get("model", ""),
            prompt_tokens=row.get("prompt_tokens", 0),
            completion_tokens=row.get("completion_tokens", 0),
            total_tokens=row.get("total_tokens", 0),
            cost_usd=row.get("cost_usd", 0.0),
            node_name=row.get("node_name", ""),
            thread_id=row.get("thread_id", ""),
            latency_ms=row.get("latency_ms", 0),
            metadata=row.get("metadata", ""),
        )


# 全局单例
usage_db = UsageDB()
