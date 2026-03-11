from pydantic import BaseModel
from typing import Optional


# --- Test schemas ---
class VariantSummary(BaseModel):
    variant_id: str
    variant_name: str
    total_visit_count: int
    total_lead_count: int
    conversion_rate: float


class VariantDetail(VariantSummary):
    features: dict


class TestSummary(BaseModel):
    ab_test_id: str
    account_id: str
    form_name: str
    p_value: float
    winner_variant_id: str
    variant_a_id: str
    variant_b_id: str
    winner_is_b: int


class TestDetail(TestSummary):
    variant_a: VariantDetail
    variant_b: VariantDetail


class TestStats(BaseModel):
    total_tests: int
    a_wins: int
    b_wins: int
    avg_p_value: float
    min_p_value: float
    max_p_value: float


# --- Feature schemas ---
class FeatureGroup(BaseModel):
    category: str
    columns: list[str]


# --- Experiment schemas ---
class MethodConfig(BaseModel):
    model_type: str  # logistic_regression, random_forest, gradient_boosting, neural_network, llm
    config: dict = {}


class ExperimentCreate(BaseModel):
    name: str
    method_a: MethodConfig
    method_b: MethodConfig
    feature_columns: list[str] = []
    feature_mode: str = "difference"
    random_seed: int = 42
    test_size: float = 0.2
    account_effect: str = "none"
    eval_mode: str = "single_split"
    cv_folds: int = 5
    api_key: Optional[str] = None  # for LLM methods, not stored


class MethodMetrics(BaseModel):
    model_type: str
    config: dict = {}
    accuracy: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1: Optional[float] = None


class ExperimentSummary(BaseModel):
    id: int
    name: str
    method_a: MethodMetrics
    method_b: MethodMetrics
    feature_mode: str
    feature_columns: list[str] = []
    random_seed: int = 42
    account_effect: str = "none"
    test_size: float = 0.2
    eval_mode: str = "single_split"
    cv_folds: int = 5
    num_train: Optional[int] = None
    num_test: Optional[int] = None
    status: str
    error_message: Optional[str] = None
    created_at: str


class PredictionDetail(BaseModel):
    ab_test_id: str
    method: str  # 'a' or 'b'
    predicted_winner_is_b: int
    actual_winner_is_b: int
    correct: int
    confidence: Optional[float] = None
    raw_output: Optional[str] = None
    fold: Optional[int] = None


class ExperimentDetail(ExperimentSummary):
    predictions_a: list[PredictionDetail]
    predictions_b: list[PredictionDetail]
    feature_importances_a: Optional[dict] = None
    feature_importances_b: Optional[dict] = None
