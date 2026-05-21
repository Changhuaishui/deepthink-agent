"""
统一配置管理模块
支持 .env 文件和环境变量，对标 Claude Code 的托管设置体系
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载 .env 文件（如果存在）
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path, override=True)


class Config:
    """DeepThink Agent 全局配置"""

    # --- LLM 配置 ---
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.deepseek.com/v1")
    
    # 主模型（高质量、慢、贵）— 用于复杂决策、任务分解、结果聚合
    LLM_PRO_MODEL: str = os.getenv("LLM_PRO_MODEL", "deepseek-v4-pro")
    # 子模型（快、便宜）— 用于简单任务、工具执行、格式化
    LLM_FLASH_MODEL: str = os.getenv("LLM_FLASH_MODEL", "deepseek-v4-flash")
    
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.3"))
    LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "4096"))

    # --- Agent 行为 ---
    AGENT_MAX_ITERATIONS: int = int(os.getenv("AGENT_MAX_ITERATIONS", "10"))
    AGENT_ENABLE_PERMISSION_CHECK: bool = os.getenv("AGENT_ENABLE_PERMISSION_CHECK", "true").lower() == "true"
    AGENT_ENABLE_CONTEXT_COMPACT: bool = os.getenv("AGENT_ENABLE_CONTEXT_COMPACT", "true").lower() == "true"
    AGENT_CONTEXT_COMPACT_THRESHOLD: int = int(os.getenv("AGENT_CONTEXT_COMPACT_THRESHOLD", "8"))

    # --- 路径 ---
    PROJECT_ROOT: Path = Path(__file__).parent.resolve()
    DATA_DIR: Path = PROJECT_ROOT / "data"
    LOG_DIR: Path = PROJECT_ROOT / "logs"

    @classmethod
    def ensure_dirs(cls) -> None:
        """确保数据目录存在"""
        cls.DATA_DIR.mkdir(parents=True, exist_ok=True)
        cls.LOG_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def is_api_ready(cls) -> bool:
        """检查 API 配置是否可用"""
        return bool(cls.OPENAI_API_KEY) and cls.OPENAI_API_KEY != "your-api-key-here"

    @classmethod
    def to_dict(cls) -> dict:
        """导出配置字典（隐藏密钥）"""
        return {
            "pro_model": cls.LLM_PRO_MODEL,
            "flash_model": cls.LLM_FLASH_MODEL,
            "base_url": cls.OPENAI_BASE_URL,
            "temperature": cls.LLM_TEMPERATURE,
            "max_tokens": cls.LLM_MAX_TOKENS,
            "max_iterations": cls.AGENT_MAX_ITERATIONS,
            "permission_check": cls.AGENT_ENABLE_PERMISSION_CHECK,
            "context_compact": cls.AGENT_ENABLE_CONTEXT_COMPACT,
            "compact_threshold": cls.AGENT_CONTEXT_COMPACT_THRESHOLD,
        }


# 启动时确保目录存在
Config.ensure_dirs()
