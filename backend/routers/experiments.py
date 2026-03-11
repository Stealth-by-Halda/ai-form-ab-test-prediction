import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Experiment, ExperimentPrediction
from schemas import (
    ExperimentCreate, ExperimentSummary, ExperimentDetail,
    MethodMetrics, PredictionDetail,
)
from ml_pipeline import run_experiment

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


def _experiment_to_summary(exp: Experiment) -> ExperimentSummary:
    config_a = json.loads(exp.model_config_a) if exp.model_config_a else {}
    config_b = json.loads(exp.model_config_b) if exp.model_config_b else {}
    # Remove feature_importances from config display
    config_a.pop("feature_importances", None)
    config_b.pop("feature_importances", None)

    return ExperimentSummary(
        id=exp.id,
        name=exp.name,
        method_a=MethodMetrics(
            model_type=exp.model_type_a or "",
            config=config_a,
            accuracy=exp.accuracy_a,
            precision=exp.precision_a,
            recall=exp.recall_a,
            f1=exp.f1_a,
        ),
        method_b=MethodMetrics(
            model_type=exp.model_type_b or "",
            config=config_b,
            accuracy=exp.accuracy_b,
            precision=exp.precision_b,
            recall=exp.recall_b,
            f1=exp.f1_b,
        ),
        feature_mode=exp.feature_mode or "difference",
        feature_columns=json.loads(exp.feature_columns) if exp.feature_columns else [],
        random_seed=exp.random_seed or 42,
        account_effect=exp.account_effect or ("fixed" if exp.include_account_fixed_effect else "none"),
        test_size=exp.test_size or 0.2,
        eval_mode=exp.eval_mode or "single_split",
        cv_folds=exp.cv_folds or 5,
        num_train=exp.num_train,
        num_test=exp.num_test,
        status=exp.status,
        error_message=exp.error_message,
        created_at=exp.created_at or "",
    )


@router.post("", response_model=ExperimentSummary)
def create_experiment(req: ExperimentCreate, db: Session = Depends(get_db)):
    experiment = Experiment(
        name=req.name,
        model_type_a=req.method_a.model_type,
        model_config_a=json.dumps(req.method_a.config),
        model_type_b=req.method_b.model_type,
        model_config_b=json.dumps(req.method_b.config),
        feature_columns=json.dumps(req.feature_columns),
        feature_mode=req.feature_mode,
        random_seed=req.random_seed,
        test_size=req.test_size,
        eval_mode=req.eval_mode,
        cv_folds=req.cv_folds,
        account_effect=req.account_effect,
        include_account_fixed_effect=1 if req.account_effect == "fixed" else 0,
        status="pending",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(experiment)
    db.commit()
    db.refresh(experiment)

    try:
        run_experiment(db, experiment, req.api_key)
    except Exception:
        pass  # status is already set to "failed" with error_message by run_experiment

    db.refresh(experiment)
    return _experiment_to_summary(experiment)


@router.get("", response_model=list[ExperimentSummary])
def list_experiments(db: Session = Depends(get_db)):
    experiments = db.query(Experiment).order_by(Experiment.id.desc()).all()
    return [_experiment_to_summary(exp) for exp in experiments]


@router.get("/{experiment_id}", response_model=ExperimentDetail)
def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    preds = db.query(ExperimentPrediction).filter(
        ExperimentPrediction.experiment_id == experiment_id
    ).all()

    preds_a = [p for p in preds if p.method == "a"]
    preds_b = [p for p in preds if p.method == "b"]

    def to_pred_detail(p):
        return PredictionDetail(
            ab_test_id=p.ab_test_id,
            method=p.method,
            predicted_winner_is_b=p.predicted_winner_is_b,
            actual_winner_is_b=p.actual_winner_is_b,
            correct=p.correct,
            confidence=p.confidence,
            raw_output=p.raw_output,
            fold=p.fold,
        )

    # Extract feature importances
    config_a = json.loads(experiment.model_config_a) if experiment.model_config_a else {}
    config_b = json.loads(experiment.model_config_b) if experiment.model_config_b else {}
    fi_a = config_a.pop("feature_importances", None)
    fi_b = config_b.pop("feature_importances", None)

    summary = _experiment_to_summary(experiment)
    return ExperimentDetail(
        **summary.model_dump(),
        predictions_a=[to_pred_detail(p) for p in preds_a],
        predictions_b=[to_pred_detail(p) for p in preds_b],
        feature_importances_a=fi_a,
        feature_importances_b=fi_b,
    )


@router.delete("/{experiment_id}")
def delete_experiment(experiment_id: int, db: Session = Depends(get_db)):
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    db.query(ExperimentPrediction).filter(
        ExperimentPrediction.experiment_id == experiment_id
    ).delete()
    db.delete(experiment)
    db.commit()
    return {"status": "deleted"}
