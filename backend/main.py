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
        columns = [row[1] for row in conn.execute(sqlalchemy.text("PRAGMA table_info(experiments)"))]
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
            # Migrate legacy fixed effect boolean
            conn.execute(sqlalchemy.text(
                "UPDATE experiments SET account_effect = 'fixed' WHERE include_account_fixed_effect = 1"
            ))
            conn.commit()

        pred_columns = [row[1] for row in conn.execute(sqlalchemy.text("PRAGMA table_info(experiment_predictions)"))]
        if "fold" not in pred_columns:
            conn.execute(sqlalchemy.text("ALTER TABLE experiment_predictions ADD COLUMN fold INTEGER"))
            conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    _migrate(engine)
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
