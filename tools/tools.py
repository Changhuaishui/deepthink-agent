"""
工具定义模块
复用书中第4章 RAG 技术（FAISS + Sentence-Transformers）
对标 Claude Code 的 40+ 工具注册体系（Tool.ts + tools.ts）

本模块遵循 LangChain Tool 规范：
- 每个工具使用 @tool 装饰器注册
- 包含 name、description、args_schema
- 返回 str 类型结果
"""
import os
import math
import random
import subprocess
import json
from typing import List, Dict, Any, Optional
from pathlib import Path
from langchain_core.tools import tool
import numpy as np

from config import Config

# ---------------------------------------------------------------------------
# 0. 工具结果格式化辅助
# ---------------------------------------------------------------------------
def _fmt_result(ok: bool, data: Any, error: str = "") -> str:
    """统一工具返回格式（JSON）"""
    return json.dumps({
        "ok": ok,
        "data": data,
        "error": error,
    }, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# 1. 联网搜索工具（DuckDuckGo）
# ---------------------------------------------------------------------------
try:
    from ddgs import DDGS
    _DDGS_AVAILABLE = True
except ImportError:
    _DDGS_AVAILABLE = False


@tool
def search_tool(query: str, max_results: int = 5) -> str:
    """联网搜索工具。输入搜索关键词，通过 DuckDuckGo 搜索互联网，返回搜索结果摘要。
    
    无需 API Key，免费使用。支持中英文搜索。
    """
    if not _DDGS_AVAILABLE:
        return _fmt_result(False, None, "ddgs 未安装，请运行: pip install ddgs")
    
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        
        if not results:
            return _fmt_result(False, None, f"未找到与 '{query}' 相关的网页结果。")
        
        simplified = []
        for i, r in enumerate(results, 1):
            simplified.append({
                "index": i,
                "title": r.get("title", "无标题"),
                "summary": r.get("body", "")[:300],
                "url": r.get("href", ""),
            })
        
        return _fmt_result(True, {"query": query, "results": simplified})
    except Exception as e:
        return _fmt_result(False, None, f"搜索异常: {str(e)}")


# ---------------------------------------------------------------------------
# 2. 计算工具
# ---------------------------------------------------------------------------
@tool
def calc_tool(expression: str) -> str:
    """数学计算器。输入数学表达式字符串，返回计算结果。
    
    支持 +, -, *, /, **, 以及 math 模块函数（sqrt, sin, cos, log 等）。
    """
    try:
        allowed_names = {
            "math": math,
            "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos,
            "tan": math.tan, "log": math.log, "exp": math.exp,
            "pi": math.pi, "e": math.e,
            "abs": abs, "round": round, "max": max, "min": min,
            "sum": sum, "len": len,
        }
        code = compile(expression, "<string>", "eval")
        for name in code.co_names:
            if name not in allowed_names:
                return _fmt_result(False, None, f"不允许使用 '{name}'，仅支持基础数学运算。")
        result = eval(code, {"__builtins__": {}}, allowed_names)
        return _fmt_result(True, {"expression": expression, "result": result})
    except Exception as e:
        return _fmt_result(False, None, f"计算错误: {str(e)}")


# ---------------------------------------------------------------------------
# 3. Python 代码执行工具（沙箱版）
# ---------------------------------------------------------------------------
@tool
def python_tool(code: str, timeout: int = 10) -> str:
    """执行 Python 代码片段并返回输出。用于数据分析、算法验证、快速原型。
    
    注意：此工具在受限环境中运行，禁止文件 IO、网络、系统调用。
    生产环境建议在 Docker 沙箱中运行。
    """
    import io
    import sys
    
    forbidden = ["import os", "import sys", "open(", "exec(", "eval(", "__import__", "subprocess", "socket"]
    for f in forbidden:
        if f in code.lower():
            return _fmt_result(False, None, f"安全阻止: 检测到禁止模式 '{f}'")
    
    stdout = io.StringIO()
    stderr = io.StringIO()
    old_stdout, old_stderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = stdout, stderr
    
    try:
        safe_globals = {
            "__builtins__": {
                "print": print, "range": range, "len": len,
                "enumerate": enumerate, "zip": zip, "list": list,
                "dict": dict, "set": set, "str": str, "int": int,
                "float": float, "sum": sum, "max": max, "min": min,
                "abs": abs, "round": round, "sorted": sorted,
                "map": map, "filter": filter, "all": all, "any": any,
            },
            "math": math, "random": random, "json": json,
            "numpy": __import__("numpy") if "numpy" in globals() else None,
        }
        exec(code, safe_globals, {})
        output = stdout.getvalue()
        error = stderr.getvalue()
        sys.stdout, sys.stderr = old_stdout, old_stderr
        
        if error:
            return _fmt_result(False, {"stdout": output}, error)
        return _fmt_result(True, {"stdout": output or "执行成功，无输出。"})
    except Exception as e:
        sys.stdout, sys.stderr = old_stdout, old_stderr
        return _fmt_result(False, None, f"运行异常: {str(e)}")


# ---------------------------------------------------------------------------
# 4. Git 克隆工具
# ---------------------------------------------------------------------------
@tool
def git_clone_tool(repo_url: str, target_dir: str = "") -> str:
    """Git 克隆工具。输入远程仓库地址，执行 git clone 拉取到本地。
    
    如果未指定 target_dir，默认保存到项目 data/repos/ 目录下。
    支持 https 协议。
    """
    repos_dir = Config.DATA_DIR / "repos"
    repos_dir.mkdir(parents=True, exist_ok=True)
    
    if not target_dir:
        repo_name = repo_url.rstrip("/").split("/")[-1].replace(".git", "")
        target_dir = str(repos_dir / repo_name)
    else:
        target_dir = str(repos_dir / target_dir)
    
    if os.path.exists(target_dir):
        return _fmt_result(False, {"path": target_dir}, "目标目录已存在，跳过克隆。")
    
    try:
        result = subprocess.run(
            ["git", "clone", repo_url, target_dir],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode == 0:
            return _fmt_result(True, {"path": target_dir, "url": repo_url})
        return _fmt_result(False, {"stderr": result.stderr}, "git clone 失败")
    except Exception as e:
        return _fmt_result(False, None, f"异常: {str(e)}")


# ---------------------------------------------------------------------------
# 5. 文件操作工具集（对标 Claude Code 核心文件工具）
# ---------------------------------------------------------------------------
ALLOWED_ROOT = Config.PROJECT_ROOT


def _safe_path(filepath: str) -> Path:
    """确保文件路径在允许范围内，防止目录遍历攻击"""
    target = (ALLOWED_ROOT / filepath).resolve()
    if not str(target).startswith(str(ALLOWED_ROOT)):
        raise ValueError(f"路径越界: {filepath}")
    return target


@tool
def read_file_tool(filepath: str, offset: int = 0, limit: int = 100) -> str:
    """读取本地文件内容。输入相对路径（如 'notes.txt'），返回文本内容。
    
    支持 offset 和 limit 参数用于大文件分页读取。
    """
    try:
        path = _safe_path(filepath)
        if not path.exists():
            return _fmt_result(False, None, f"文件不存在: {filepath}")
        
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        
        total = len(lines)
        slice_lines = lines[offset:offset + limit]
        content = "".join(slice_lines)
        
        return _fmt_result(True, {
            "filepath": filepath,
            "total_lines": total,
            "offset": offset,
            "limit": limit,
            "content": content,
        })
    except Exception as e:
        return _fmt_result(False, None, f"读取失败: {str(e)}")


@tool
def write_file_tool(filepath: str, content: str, append: bool = False) -> str:
    """写入内容到本地文件。输入相对路径和文本内容。
    
    append=true 时为追加模式，false 为覆盖模式。
    """
    try:
        path = _safe_path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        mode = "a" if append else "w"
        with open(path, mode, encoding="utf-8") as f:
            f.write(content)
        return _fmt_result(True, {"filepath": filepath, "mode": "append" if append else "overwrite"})
    except Exception as e:
        return _fmt_result(False, None, f"写入失败: {str(e)}")


@tool
def list_dir_tool(dirpath: str = ".") -> str:
    """列出目录内容。输入相对路径（默认当前目录），返回文件和子目录列表。"""
    try:
        path = _safe_path(dirpath)
        if not path.exists():
            return _fmt_result(False, None, f"目录不存在: {dirpath}")
        
        items = []
        for item in path.iterdir():
            items.append({
                "name": item.name,
                "type": "dir" if item.is_dir() else "file",
                "size": item.stat().st_size if item.is_file() else None,
            })
        return _fmt_result(True, {"dirpath": dirpath, "items": items})
    except Exception as e:
        return _fmt_result(False, None, f"列出失败: {str(e)}")


@tool
def bash_tool(command: str, cwd: str = ".", timeout: int = 60) -> str:
    """执行 Bash/PowerShell 命令。输入命令字符串，返回标准输出和错误。
    
    危险命令会被拦截（rm -rf /, mkfs, dd 等）。
    timeout 默认 60 秒。
    """
    dangerous = ["rm -rf /", "mkfs", "dd if=/dev/zero", ":(){ :|:& };:", "> /dev/sda"]
    for d in dangerous:
        if d in command.lower():
            return _fmt_result(False, None, f"安全拦截: 检测到危险命令 '{d}'")
    
    try:
        work_dir = _safe_path(cwd)
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True,
            cwd=str(work_dir), timeout=timeout
        )
        return _fmt_result(True, {
            "command": command,
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        })
    except subprocess.TimeoutExpired:
        return _fmt_result(False, None, f"命令超时 (> {timeout}s)")
    except Exception as e:
        return _fmt_result(False, None, f"执行异常: {str(e)}")


# ---------------------------------------------------------------------------
# 6. RAG 知识库检索工具（复用书中第4章技术）
# ---------------------------------------------------------------------------
class RAGKnowledgeBase:
    """基于 FAISS + Sentence-Transformers 的本地知识库"""
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.docs: List[str] = []
        self.index = None
        self.model = None
        self.dimension = 384
        
        try:
            from sentence_transformers import SentenceTransformer
            import faiss
            self._init_kb()
        except ImportError:
            pass
    
    def _init_kb(self):
        from sentence_transformers import SentenceTransformer
        import faiss
        
        self.docs = [
            "LangGraph 的状态图由节点（Node）和边（Edge）组成，节点代表操作，边代表状态流转。",
            "CoT（Chain-of-Thought）通过在提示中要求模型逐步推理，能显著提升复杂任务准确率。",
            "ToT（Tree-of-Thought）将推理过程建模为树结构，每个节点是一个思维步骤，通过搜索找到最优路径。",
            "Claude Code 的核心是一个 Agent 循环：用户输入 -> 构建消息 -> 调用 LLM -> 判断是否需要工具 -> 执行工具 -> 循环。",
            "工具调用（Tool Calling）让 LLM 能够生成结构化输出（JSON）来触发外部函数，是现代 Agent 的基础能力。",
            "RAG（检索增强生成）结合了信息检索和文本生成，通过向量相似度检索相关知识片段，再输入 LLM 生成答案。",
            "FAISS 是 Facebook AI Similarity Search 的缩写，支持高效的最近邻搜索，常用于大规模向量检索。",
            "Embedding 模型将文本转换为高维向量，语义相似的文本在向量空间中的距离更近。",
            "Agent 的 ReAct 模式结合了推理（Reasoning）和行动（Acting），通过交替进行思考和工具调用完成任务。",
            "上下文压缩（Context Compression）是生产级 Agent 的关键技术，用于在窗口溢出前保留最重要的信息。",
        ]
        try:
            self.model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
            embeddings = self.model.encode(self.docs, convert_to_numpy=True).astype('float32')
            self.index = faiss.IndexFlatL2(self.dimension)
            self.index.add(embeddings)
        except Exception:
            self.model = None
            self.index = None
    
    def search(self, query: str, top_k: int = 3) -> str:
        if self.index is None:
            return _fmt_result(False, None, "RAG 未就绪（模型下载失败或未安装 faiss-cpu / sentence-transformers）")
        query_embedding = self.model.encode([query], convert_to_numpy=True).astype('float32')
        distances, indices = self.index.search(query_embedding, top_k)
        results = []
        for i, idx in enumerate(indices[0]):
            if idx < len(self.docs):
                results.append({
                    "rank": i + 1,
                    "content": self.docs[idx],
                    "distance": float(distances[0][i]),
                })
        return _fmt_result(True, {"query": query, "results": results})


_kb: Optional[RAGKnowledgeBase] = None


@tool
def rag_tool(query: str) -> str:
    """本地知识库检索工具。输入问题，返回基于向量相似度检索的相关知识片段。
    技术实现：Sentence-Transformers 编码 + FAISS 向量检索（复用书中第4章代码模式）。
    """
    global _kb
    if _kb is None:
        _kb = RAGKnowledgeBase()
    return _kb.search(query)


# ---------------------------------------------------------------------------
# 工具列表导出
# ---------------------------------------------------------------------------
ALL_TOOLS = [
    search_tool, calc_tool, python_tool, git_clone_tool,
    read_file_tool, write_file_tool, list_dir_tool, bash_tool,
    rag_tool,
]
