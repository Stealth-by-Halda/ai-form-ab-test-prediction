from sqlalchemy import Column, Integer, Text, Float, ForeignKey
from database import Base


class ABTest(Base):
    __tablename__ = "ab_tests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ab_test_id = Column(Text, unique=True, nullable=False)
    account_id = Column(Text)
    form_name = Column(Text)
    p_value = Column(Float)
    winner_variant_id = Column(Text)
    variant_a_id = Column(Text)
    variant_b_id = Column(Text)
    winner_is_b = Column(Integer)


class Variant(Base):
    __tablename__ = "variants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ab_test_id = Column(Text, ForeignKey("ab_tests.ab_test_id"), nullable=False)
    variant_id = Column(Text, nullable=False)
    variant_name = Column(Text)
    total_visit_count = Column(Integer)
    total_lead_count = Column(Integer)
    conversion_rate = Column(Float)
    features_json = Column(Text)


class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text)

    # Method A
    model_type_a = Column(Text)
    model_config_a = Column(Text)  # JSON

    # Method B
    model_type_b = Column(Text)
    model_config_b = Column(Text)  # JSON

    # Shared settings
    feature_columns = Column(Text)  # JSON
    feature_mode = Column(Text)
    random_seed = Column(Integer)
    include_account_fixed_effect = Column(Integer, default=0)  # legacy
    account_effect = Column(Text, default="none")  # "none", "fixed", "random"
    test_size = Column(Float, default=0.2)
    eval_mode = Column(Text, default="single_split")
    cv_folds = Column(Integer, default=5)

    # Method A metrics
    accuracy_a = Column(Float)
    precision_a = Column(Float)
    recall_a = Column(Float)
    f1_a = Column(Float)

    # Method B metrics
    accuracy_b = Column(Float)
    precision_b = Column(Float)
    recall_b = Column(Float)
    f1_b = Column(Float)

    num_train = Column(Integer)
    num_test = Column(Integer)
    status = Column(Text, default="pending")
    error_message = Column(Text)
    created_at = Column(Text)


class ExperimentPrediction(Base):
    __tablename__ = "experiment_predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id"), nullable=False)
    method = Column(Text)  # 'a' or 'b'
    ab_test_id = Column(Text)
    predicted_winner_is_b = Column(Integer)
    actual_winner_is_b = Column(Integer)
    correct = Column(Integer)
    confidence = Column(Float)
    raw_output = Column(Text)
    fold = Column(Integer)
