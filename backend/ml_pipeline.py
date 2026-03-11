"""sklearn model training and evaluation for A/B test winner prediction."""

from __future__ import annotations

import json
import numpy as np
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sqlalchemy.orm import Session

from models import ABTest, Variant, Experiment, ExperimentPrediction
from feature_engineering import build_feature_vector


def _build_dataset(db: Session, experiment: Experiment):
    """Build feature matrix and labels from the database.

    Returns X, y, test_ids, account_ids, feature_names.
    """
    feature_columns = json.loads(experiment.feature_columns)
    feature_mode = experiment.feature_mode or "difference"
    account_effect = experiment.account_effect or (
        "fixed" if experiment.include_account_fixed_effect else "none"
    )

    tests = db.query(ABTest).all()
    X_rows = []
    y = []
    test_ids = []
    account_ids = []

    for test in tests:
        variants = db.query(Variant).filter(
            Variant.ab_test_id == test.ab_test_id
        ).order_by(Variant.variant_id).all()

        if len(variants) != 2:
            continue

        a_features = json.loads(variants[0].features_json) if variants[0].features_json else {}
        b_features = json.loads(variants[1].features_json) if variants[1].features_json else {}

        # Skip tests where display method differs between variants
        display_method_keys = [k for k in a_features if k.startswith("DISPLAY_METHOD_")]
        if any(a_features.get(k) != b_features.get(k) for k in display_method_keys):
            continue

        vec = build_feature_vector(a_features, b_features, feature_columns, feature_mode)
        X_rows.append(vec)
        y.append(test.winner_is_b)
        test_ids.append(test.ab_test_id)
        account_ids.append(test.account_id)

    # Build feature names
    if feature_mode == "concatenated":
        feature_names = [f"a_{c}" for c in feature_columns] + [f"b_{c}" for c in feature_columns]
    else:
        feature_names = list(feature_columns)

    X = np.array(X_rows)
    y = np.array(y)
    account_ids = np.array(account_ids)

    # Add account fixed effects (one-hot, drop_first)
    if account_effect == "fixed":
        unique_accounts = sorted(set(account_ids))
        if len(unique_accounts) > 1:
            # Drop first account as reference category
            account_dummies = []
            for acc_id in account_ids:
                row = [1.0 if acc_id == ua else 0.0 for ua in unique_accounts[1:]]
                account_dummies.append(row)
            account_matrix = np.array(account_dummies)
            X = np.hstack([X, account_matrix])
            feature_names += [f"account_{ua[:12]}" for ua in unique_accounts[1:]]

    # Replace NaN with 0
    X = np.nan_to_num(X, nan=0.0)

    return X, y, test_ids, account_ids, feature_names


def run_experiment(db: Session, experiment: Experiment, api_key: str | None = None):
    """Run both methods of an experiment and store results."""
    try:
        experiment.status = "running"
        db.commit()

        X, y, test_ids, account_ids, feature_names = _build_dataset(db, experiment)
        seed = experiment.random_seed or 42
        eval_mode = experiment.eval_mode or "single_split"

        if eval_mode == "cross_validation":
            _run_cross_validation(db, experiment, X, y, test_ids, account_ids, feature_names, seed, api_key)
        else:
            _run_single_split(db, experiment, X, y, test_ids, account_ids, feature_names, seed, api_key)

        experiment.status = "completed"
        db.commit()

    except Exception as e:
        experiment.status = "failed"
        experiment.error_message = str(e)
        db.commit()
        raise


def _apply_random_account_effect(X_train, X_test, y_train, accts_train, accts_test, feature_names):
    """Apply account random effect via target encoding.

    Computes per-account mean of y from training data only, then appends
    that as a feature to both train and test. Unseen accounts in test get
    the global training mean. This acts like a random intercept — it
    captures account-level baseline variation in a single feature without
    the dimensionality explosion of one-hot encoding.
    """
    # Compute per-account mean target from training data
    account_means = {}
    account_counts = {}
    for acc, label in zip(accts_train, y_train):
        account_means[acc] = account_means.get(acc, 0.0) + float(label)
        account_counts[acc] = account_counts.get(acc, 0) + 1
    for acc in account_means:
        account_means[acc] /= account_counts[acc]

    global_mean = float(y_train.mean()) if len(y_train) > 0 else 0.5

    # Encode train and test
    train_enc = np.array([account_means.get(a, global_mean) for a in accts_train]).reshape(-1, 1)
    test_enc = np.array([account_means.get(a, global_mean) for a in accts_test]).reshape(-1, 1)

    X_train_out = np.hstack([X_train, train_enc])
    X_test_out = np.hstack([X_test, test_enc])
    feature_names_out = list(feature_names) + ["account_random_effect"]

    return X_train_out, X_test_out, feature_names_out


def _run_single_split(db, experiment, X, y, test_ids, account_ids, feature_names, seed, api_key):
    """Run experiment with a single train/test split."""
    test_size = experiment.test_size or 0.2
    X_train, X_test, y_train, y_test, ids_train, ids_test, accts_train, accts_test = train_test_split(
        X, y, test_ids, account_ids, test_size=test_size, random_state=seed, stratify=y
    )

    account_effect = experiment.account_effect or (
        "fixed" if experiment.include_account_fixed_effect else "none"
    )
    if account_effect == "random":
        X_train, X_test, feature_names = _apply_random_account_effect(
            X_train, X_test, y_train, accts_train, accts_test, feature_names
        )

    experiment.num_train = len(X_train)
    experiment.num_test = len(X_test)

    for method, model_type, model_config_raw in [
        ("a", experiment.model_type_a, experiment.model_config_a),
        ("b", experiment.model_type_b, experiment.model_config_b),
    ]:
        model_config = json.loads(model_config_raw) if model_config_raw else {}
        _run_single_method(
            db, experiment, method, model_type, model_config,
            X_train, X_test, y_train, y_test, ids_train, ids_test,
            feature_names, seed, api_key,
        )


def _run_cross_validation(db, experiment, X, y, test_ids, account_ids, feature_names, seed, api_key):
    """Run experiment with stratified k-fold cross-validation."""
    cv_folds = experiment.cv_folds or 5
    skf = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=seed)
    test_ids = np.array(test_ids)

    experiment.num_train = len(X)
    experiment.num_test = len(X)

    account_effect = experiment.account_effect or (
        "fixed" if experiment.include_account_fixed_effect else "none"
    )

    for method, model_type, model_config_raw in [
        ("a", experiment.model_type_a, experiment.model_config_a),
        ("b", experiment.model_type_b, experiment.model_config_b),
    ]:
        model_config = json.loads(model_config_raw) if model_config_raw else {}

        if model_type == "llm":
            _run_cv_llm(db, experiment, method, model_config, X, y, test_ids, skf, seed, api_key)
        else:
            _run_cv_sklearn(db, experiment, method, model_type, model_config, X, y, test_ids, account_ids, feature_names, skf, seed, account_effect)


def _run_cv_sklearn(db, experiment, method, model_type, model_config, X, y, test_ids, account_ids, feature_names, skf, seed, account_effect="none"):
    """Run cross-validated sklearn method, aggregate predictions and importances."""
    all_preds = []
    all_actual = []
    all_ids = []
    all_folds = []
    all_probas = []
    all_importances = []

    for fold_idx, (train_idx, test_idx) in enumerate(skf.split(X, y)):
        X_fold_train, X_fold_test = X[train_idx], X[test_idx]
        fold_feature_names = list(feature_names)

        if account_effect == "random":
            X_fold_train, X_fold_test, fold_feature_names = _apply_random_account_effect(
                X_fold_train, X_fold_test, y[train_idx],
                account_ids[train_idx], account_ids[test_idx], fold_feature_names
            )

        model = _build_model(model_type, model_config, seed)
        model.fit(X_fold_train, y[train_idx])

        y_pred = model.predict(X_fold_test)
        y_proba = model.predict_proba(X_fold_test) if hasattr(model, "predict_proba") else None

        for i, ti in enumerate(test_idx):
            all_preds.append(int(y_pred[i]))
            all_actual.append(int(y[ti]))
            all_ids.append(test_ids[ti])
            all_folds.append(fold_idx)
            all_probas.append(float(y_proba[i][1]) if y_proba is not None else None)

        imp = _extract_feature_importances(model, fold_feature_names)
        if imp:
            all_importances.append(imp)

    # Use the feature names from the last fold (they're the same shape each fold)
    final_feature_names = fold_feature_names

    # Compute metrics over all CV predictions
    all_preds_arr = np.array(all_preds)
    all_actual_arr = np.array(all_actual)
    acc = float(accuracy_score(all_actual_arr, all_preds_arr))
    prec = float(precision_score(all_actual_arr, all_preds_arr, zero_division=0))
    rec = float(recall_score(all_actual_arr, all_preds_arr, zero_division=0))
    f1 = float(f1_score(all_actual_arr, all_preds_arr, zero_division=0))

    if method == "a":
        experiment.accuracy_a, experiment.precision_a, experiment.recall_a, experiment.f1_a = acc, prec, rec, f1
    else:
        experiment.accuracy_b, experiment.precision_b, experiment.recall_b, experiment.f1_b = acc, prec, rec, f1

    # Store predictions
    for i in range(len(all_preds)):
        db.add(ExperimentPrediction(
            experiment_id=experiment.id,
            method=method,
            ab_test_id=all_ids[i],
            predicted_winner_is_b=all_preds[i],
            actual_winner_is_b=all_actual[i],
            correct=1 if all_preds[i] == all_actual[i] else 0,
            confidence=all_probas[i],
            fold=all_folds[i],
        ))

    # Average feature importances across folds
    if all_importances:
        avg_imp = {}
        for name in final_feature_names:
            vals = [imp[name] for imp in all_importances if name in imp]
            avg_imp[name] = float(np.mean(vals)) if vals else 0.0
        config_key = "model_config_a" if method == "a" else "model_config_b"
        config = json.loads(getattr(experiment, config_key)) if getattr(experiment, config_key) else {}
        config["feature_importances"] = avg_imp
        setattr(experiment, config_key, json.dumps(config))


def _run_cv_llm(db, experiment, method, model_config, X, y, test_ids, skf, seed, api_key):
    """Run cross-validated LLM method."""
    from llm_pipeline import run_llm_on_tests

    all_preds = []
    all_actual = []

    for fold_idx, (train_idx, test_idx) in enumerate(skf.split(X, y)):
        fold_test_ids = list(test_ids[test_idx])
        fold_y_test = y[test_idx]

        results = run_llm_on_tests(
            db, experiment, model_config,
            fold_test_ids, fold_y_test, api_key,
        )

        for pred in results["predictions"]:
            db.add(ExperimentPrediction(
                experiment_id=experiment.id,
                method=method,
                fold=fold_idx,
                **pred,
            ))
            all_preds.append(pred["predicted_winner_is_b"])
            all_actual.append(pred["actual_winner_is_b"])

    # Compute metrics over all CV predictions
    all_preds_arr = np.array(all_preds)
    all_actual_arr = np.array(all_actual)
    acc = float(accuracy_score(all_actual_arr, all_preds_arr))
    prec = float(precision_score(all_actual_arr, all_preds_arr, zero_division=0))
    rec = float(recall_score(all_actual_arr, all_preds_arr, zero_division=0))
    f1 = float(f1_score(all_actual_arr, all_preds_arr, zero_division=0))

    if method == "a":
        experiment.accuracy_a, experiment.precision_a, experiment.recall_a, experiment.f1_a = acc, prec, rec, f1
    else:
        experiment.accuracy_b, experiment.precision_b, experiment.recall_b, experiment.f1_b = acc, prec, rec, f1


def _run_single_method(
    db: Session, experiment: Experiment, method: str,
    model_type: str, model_config: dict,
    X_train, X_test, y_train, y_test, ids_train, ids_test,
    feature_names: list[str], seed: int, api_key: str | None,
):
    """Run a single method (a or b) and store its predictions and metrics."""
    if model_type == "llm":
        _run_llm_method(
            db, experiment, method, model_config,
            y_test, ids_test, seed, api_key,
        )
        return

    model = _build_model(model_type, model_config, seed)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test) if hasattr(model, "predict_proba") else None

    # Store metrics
    acc = float(accuracy_score(y_test, y_pred))
    prec = float(precision_score(y_test, y_pred, zero_division=0))
    rec = float(recall_score(y_test, y_pred, zero_division=0))
    f1 = float(f1_score(y_test, y_pred, zero_division=0))

    if method == "a":
        experiment.accuracy_a = acc
        experiment.precision_a = prec
        experiment.recall_a = rec
        experiment.f1_a = f1
    else:
        experiment.accuracy_b = acc
        experiment.precision_b = prec
        experiment.recall_b = rec
        experiment.f1_b = f1

    # Store predictions
    for i, test_id in enumerate(ids_test):
        pred = int(y_pred[i])
        actual = int(y_test[i])
        conf = float(y_proba[i][1]) if y_proba is not None else None
        db.add(ExperimentPrediction(
            experiment_id=experiment.id,
            method=method,
            ab_test_id=test_id,
            predicted_winner_is_b=pred,
            actual_winner_is_b=actual,
            correct=1 if pred == actual else 0,
            confidence=conf,
        ))

    # Store feature importances
    imp_dict = _extract_feature_importances(model, feature_names)
    if imp_dict:
        config_key = "model_config_a" if method == "a" else "model_config_b"
        config = json.loads(getattr(experiment, config_key)) if getattr(experiment, config_key) else {}
        config["feature_importances"] = imp_dict
        setattr(experiment, config_key, json.dumps(config))


def _run_llm_method(
    db: Session, experiment: Experiment, method: str,
    model_config: dict, y_test, ids_test, seed: int, api_key: str | None,
):
    """Run LLM-based prediction for one method."""
    from llm_pipeline import run_llm_on_tests
    results = run_llm_on_tests(
        db, experiment, model_config,
        ids_test, y_test, api_key,
    )

    if method == "a":
        experiment.accuracy_a = results["accuracy"]
        experiment.precision_a = results["precision"]
        experiment.recall_a = results["recall"]
        experiment.f1_a = results["f1"]
    else:
        experiment.accuracy_b = results["accuracy"]
        experiment.precision_b = results["precision"]
        experiment.recall_b = results["recall"]
        experiment.f1_b = results["f1"]

    for pred in results["predictions"]:
        db.add(ExperimentPrediction(
            experiment_id=experiment.id,
            method=method,
            **pred,
        ))


def _build_model(model_type: str, config: dict, seed: int):
    """Instantiate a sklearn model from type and config."""
    if model_type == "logistic_regression":
        return LogisticRegression(
            C=config.get("C", 1.0),
            max_iter=1000,
            random_state=seed,
        )
    elif model_type == "random_forest":
        return RandomForestClassifier(
            n_estimators=config.get("n_estimators", 100),
            max_depth=config.get("max_depth", None),
            random_state=seed,
        )
    elif model_type == "gradient_boosting":
        return GradientBoostingClassifier(
            n_estimators=config.get("n_estimators", 100),
            max_depth=config.get("max_depth", 3),
            learning_rate=config.get("learning_rate", 0.1),
            random_state=seed,
        )
    elif model_type == "neural_network":
        hidden = config.get("hidden_layer_sizes", [100])
        if isinstance(hidden, list):
            hidden = tuple(hidden)
        return MLPClassifier(
            hidden_layer_sizes=hidden,
            max_iter=config.get("max_iter", 500),
            random_state=seed,
        )
    elif model_type.startswith("ensemble_"):
        return _build_ensemble(model_type, seed)
    else:
        raise ValueError(f"Unknown model type: {model_type}")


def _build_ensemble(model_type: str, seed: int):
    """Build a VotingClassifier ensemble from a predefined combination."""
    lr = ("lr", LogisticRegression(C=1.0, max_iter=1000, random_state=seed))
    rf = ("rf", RandomForestClassifier(n_estimators=100, random_state=seed))
    gb = ("gb", GradientBoostingClassifier(n_estimators=100, max_depth=3, learning_rate=0.1, random_state=seed))
    nn = ("nn", MLPClassifier(hidden_layer_sizes=(100,), max_iter=500, random_state=seed))

    combos = {
        "ensemble_lr_rf": [lr, rf],
        "ensemble_lr_gb": [lr, gb],
        "ensemble_rf_gb": [rf, gb],
        "ensemble_nn_gb": [nn, gb],
        "ensemble_lr_rf_gb": [lr, rf, gb],
        "ensemble_all": [lr, rf, gb, nn],
    }

    estimators = combos.get(model_type)
    if estimators is None:
        raise ValueError(f"Unknown ensemble type: {model_type}")

    return VotingClassifier(estimators=estimators, voting="soft")


def _extract_feature_importances(model, feature_names: list[str]) -> dict | None:
    """Extract feature importances from any fitted sklearn model."""
    if hasattr(model, "feature_importances_"):
        # Tree-based: RF, GB
        return {name: float(v) for name, v in zip(feature_names, model.feature_importances_)}

    if hasattr(model, "coef_"):
        # Linear models: LR
        raw = np.abs(model.coef_[0])
        total = raw.sum()
        normed = raw / total if total > 0 else raw
        return {name: float(v) for name, v in zip(feature_names, normed)}

    if hasattr(model, "coefs_"):
        # Neural network: MLP — sum of absolute first-layer weights per input
        raw = np.abs(model.coefs_[0]).sum(axis=1)
        total = raw.sum()
        normed = raw / total if total > 0 else raw
        return {name: float(v) for name, v in zip(feature_names, normed)}

    if hasattr(model, "estimators_") and isinstance(model.estimators_, list):
        # Ensemble: VotingClassifier — average normalized importances from sub-estimators
        all_imps = []
        for est in model.estimators_:
            sub = _extract_feature_importances(est, feature_names)
            if sub:
                vals = np.array([sub[name] for name in feature_names])
                total = vals.sum()
                if total > 0:
                    vals = vals / total
                all_imps.append(vals)
        if all_imps:
            avg = np.mean(all_imps, axis=0)
            return {name: float(v) for name, v in zip(feature_names, avg)}

    return None
