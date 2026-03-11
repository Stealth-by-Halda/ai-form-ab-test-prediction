from pathlib import Path
from fastapi import APIRouter

router = APIRouter(prefix="/api/methodology", tags=["methodology"])

BACKEND_DIR = Path(__file__).resolve().parent.parent


@router.get("/sources")
def get_sources():
    """Return the source code of the core pipeline files."""
    files = {
        "ml_pipeline": "ml_pipeline.py",
        "llm_pipeline": "llm_pipeline.py",
        "feature_engineering": "feature_engineering.py",
    }
    result = {}
    for key, filename in files.items():
        path = BACKEND_DIR / filename
        result[key] = path.read_text() if path.exists() else ""
    return result
