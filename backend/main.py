from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import tests, features, experiments, methodology

load_dotenv(Path(__file__).parent / ".env")


def _migrate(engine):
    """Add columns that may be missing from older databases."""
    import sqlalchemy
    with engine.connect() as conn:
        result = conn.execute(sqlalchemy.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'experiments'"
        ))
        columns = [row[0] for row in result]

        if columns:  # table exists
            if "test_size" not in columns:
                conn.execute(sqlalchemy.text("ALTER TABLE experiments ADD COLUMN test_size REAL DEFAULT 0.2"))
                conn.commit()
            if "eval_mode" not in columns:
                conn.execute(sqlalchemy.text("ALTER TABLE experiments ADD COLUMN eval_mode TEXT DEFAULT 'single_split'"))
                conn.commit()
            if "cv_folds" not in columns:
                conn.execute(sqlalchemy.text("ALTER TABLE experiments ADD COLUMN cv_folds INTEGER DEFAULT 5"))
                conn.commit()
            if "account_effect" not in columns:
                conn.execute(sqlalchemy.text("ALTER TABLE experiments ADD COLUMN account_effect TEXT DEFAULT 'none'"))
                conn.execute(sqlalchemy.text(
                    "UPDATE experiments SET account_effect = 'fixed' WHERE include_account_fixed_effect = 1"
                ))
                conn.commit()

        result = conn.execute(sqlalchemy.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'experiment_predictions'"
        ))
        pred_columns = [row[0] for row in result]

        if pred_columns and "fold" not in pred_columns:
            conn.execute(sqlalchemy.text("ALTER TABLE experiment_predictions ADD COLUMN fold INTEGER"))
            conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import os
    if not os.environ.get("RENDER"):
        # Only run migrations locally; prod DB is already set up
        try:
            Base.metadata.create_all(engine)
            _migrate(engine)
        except Exception as e:
            import logging
            logging.getLogger("uvicorn.error").warning(f"DB init deferred: {e}")
    yield


app = FastAPI(title="A/B Test Winner Predictor", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tests.router)
app.include_router(features.router)
app.include_router(experiments.router)
app.include_router(methodology.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
