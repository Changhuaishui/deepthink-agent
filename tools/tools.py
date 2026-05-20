"""
工具定义模块
复用书中第4章 RAG 技术（FAISS + Sentence-Transformers）
对标 Claude Code 的 40+ 工具注册体系（Tool.ts + tools.ts）
"""
import os
import math
import random
from typing import List, Dict, Any
from langchain_core.tools import tool
import numpy as np

# 尝试导入 sentence-transformers 和 faiss，用于 RAG 工具
try:
    from sentence_transformers import SentenceTransformer, util
    import faiss
    _RAG_AVAILABLE = True
except ImportError:
    _RAG_AVAILABLE = False


# ---------------------------------------------------------------------------
# 1. 搜索工具（真实联网搜索：DuckDuckGo）
# ---------------------------------------------------------------------------
try:
    from ddgs import DDGS
    _DDGS_AVAILABLE = True
except ImportError:
    _DDGS_AVAILABLE = False


@tool
def search_tool(query: str) -> str:
    """联网搜索工具。输入搜索关键词，通过 DuckDuckGo 搜索互联网，返回搜索结果摘要。
    
    对标 Claude Code 的 WebSearch 工具。
    无需 API Key，免费使用。
    """
    if not _DDGS_AVAILABLE:
        return "[错误] duckduckgo-search 未安装，请运行: pip install duckduckgo-search"
    
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
        
        if not results:
            return f"[搜索结果] 未找到与 '{query}' 相关的网页结果。"
        
        formatted = []
        for i, r in enumerate(results, 1):
            title = r.get("title", "无标题")
            body = r.get("body", "无摘要")
            href = r.get("href", "")
            formatted.append(f"[{i}] {title}\n    {body[:200]}...\n    链接: {href}")
        
        return "\n\n".join(formatted)
    except Exception as e:
        return f"[搜索异常] {str(e)}。可能是网络限制或 DuckDuckGo 服务暂时不可用。"


# ---------------------------------------------------------------------------
# 2. 计算工具
# ---------------------------------------------------------------------------
@tool
def calc_tool(expression: str) -> str:
    """数学计算器。输入数学表达式字符串，返回计算结果。
    
    支持 +, -, *, /, **, math 模块函数。
    对标 Claude Code 的计算/分析工具。
    """
    try:
        # 安全求值：只允许数学运算
        allowed_names = {
            "math": math,
            "sqrt": math.sqrt,
            "sin": math.sin,
            "cos": math.cos,
            "tan": math.tan,
            "log": math.log,
            "exp": math.exp,
            "pi": math.pi,
            "e": math.e,
        }
        code = compile(expression, "<string>", "eval")
        for name in code.co_names:
            if name not in allowed_names:
                return f"错误: 不允许使用 '{name}'。仅支持基础数学运算。"
        result = eval(code, {"__builtins__": {}}, allowed_names)
        return f"计算结果: {result}"
    except Exception as e:
        return f"计算错误: {str(e)}"


# ---------------------------------------------------------------------------
# 3. Python 代码执行工具（受限制版）
# ---------------------------------------------------------------------------
@tool
def python_tool(code: str) -> str:
    """执行 Python 代码片段并返回输出。用于数据分析、算法验证等。
    
    对标 Claude Code 的代码执行/分析能力。
    注意：此为教学演示版本，生产环境应在沙箱中运行。
    """
    import io
    import sys
    
    # 禁止危险操作的关键词检查
    forbidden = ["import os", "import sys", "open(", "exec(", "eval(", "__import__", "subprocess"]
    for f in forbidden:
        if f in code.lower():
            return f"安全阻止: 检测到禁止使用的模式 '{f}'。"
    
    stdout = io.StringIO()
    stderr = io.StringIO()
    old_stdout, old_stderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = stdout, stderr
    
    try:
        # 创建受限执行环境
        safe_globals = {
            "__builtins__": {
                "print": print,
                "range": range,
                "len": len,
                "enumerate": enumerate,
                "zip": zip,
                "list": list,
                "dict": dict,
                "set": set,
                "str": str,
                "int": int,
                "float": float,
                "sum": sum,
                "max": max,
                "min": min,
                "abs": abs,
                "round": round,
                "sorted": sorted,
                "map": map,
                "filter": filter,
            },
            "math": math,
            "random": random,
            "numpy": __import__("numpy") if "numpy" in globals() else None,
        }
        exec(code, safe_globals, {})
        output = stdout.getvalue()
        error = stderr.getvalue()
        sys.stdout, sys.stderr = old_stdout, old_stderr
        
        if error:
            return f"执行输出:\n{output}\n错误:\n{error}"
        return f"执行输出:\n{output}" if output else "代码执行成功，无输出。"
    except Exception as e:
        sys.stdout, sys.stderr = old_stdout, old_stderr
        return f"运行异常: {str(e)}"


# ---------------------------------------------------------------------------
# 4. Git 克隆工具（拉取远程仓库到本地）
# ---------------------------------------------------------------------------
@tool
def git_clone_tool(repo_url: str, target_dir: str = "") -> str:
    """Git 克隆工具。输入远程仓库地址，自动执行 git clone 拉取到本地。
    
    如果未指定 target_dir，则默认克隆到当前工作目录下，以仓库名命名文件夹。
    对标 Claude Code 的代码获取/项目初始化能力。
    """
    import subprocess
    import os
    
    # 默认保存到桌面下的 LLM大模型学习 文件夹
    base_dir = os.path.join(os.path.expanduser("~"), "Desktop", "LLM大模型学习")
    os.makedirs(base_dir, exist_ok=True)
    
    if not target_dir:
        # 从 URL 提取仓库名
        repo_name = repo_url.rstrip("/").split("/")[-1].replace(".git", "")
        target_dir = os.path.join(base_dir, repo_name)
    else:
        target_dir = os.path.join(base_dir, target_dir)
    
    # 如果目录已存在，先重命名备份
    if os.path.exists(target_dir):
        backup = target_dir + "_backup"
        os.rename(target_dir, backup)
        return f"[提示] 目标目录已存在，已备份为 {backup}。请重新执行克隆。"
    
    cmd = ["git", "clone", repo_url, target_dir]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            return f"[成功] 仓库已克隆到: {target_dir}\n输出: {result.stdout.strip() or '完成'}"
        else:
            return f"[失败] 克隆出错: {result.stderr.strip()}"
    except Exception as e:
        return f"[异常] {str(e)}"


# ---------------------------------------------------------------------------
# 5. RAG 知识库检索工具（复用书中第4章技术）
# ---------------------------------------------------------------------------
class RAGKnowledgeBase:
    """基于 FAISS + Sentence-Transformers 的本地知识库
    
    直接复用书中第4章的 Embedding + FAISS 检索模式。
    """
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
        self.dimension = 384  # all-MiniLM-L6-v2 的维度
        
        if _RAG_AVAILABLE:
            self._init_kb()
    
    def _init_kb(self):
        """初始化知识库文档和向量索引"""
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
            print(f"[RAG] 知识库初始化完成，共 {len(self.docs)} 条文档。")
        except Exception as e:
            print(f"[RAG] 初始化失败（模型下载需要网络）: {e}")
            self.model = None
            self.index = None
    
    def search(self, query: str, top_k: int = 3) -> str:
        """检索与查询最相关的知识片段"""
        if not _RAG_AVAILABLE or self.index is None:
            return "[RAG 未就绪] 请检查 sentence-transformers 和 faiss-cpu 是否安装，或首次运行需要下载模型。"
        
        query_embedding = self.model.encode([query], convert_to_numpy=True).astype('float32')
        distances, indices = self.index.search(query_embedding, top_k)
        
        results = []
        for i, idx in enumerate(indices[0]):
            if idx < len(self.docs):
                results.append(f"[{i+1}] {self.docs[idx]} (距离: {distances[0][i]:.4f})")
        
        return "\n".join(results) if results else "未检索到相关知识。"


# 单例知识库
_kb = RAGKnowledgeBase()


@tool
def rag_tool(query: str) -> str:
    """本地知识库检索工具。输入问题，返回基于向量相似度检索的相关知识片段。
    
    技术实现：Sentence-Transformers 编码 + FAISS 向量检索。
    直接复用书中第4章的 RAG 代码模式。
    """
    return _kb.search(query, top_k=3)


# ---------------------------------------------------------------------------
# 工具列表导出
# ---------------------------------------------------------------------------
ALL_TOOLS = [search_tool, calc_tool, python_tool, rag_tool, git_clone_tool]
