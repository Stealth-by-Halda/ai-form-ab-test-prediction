"""LLM-based A/B test winner prediction pipeline."""

from __future__ import annotations

import json
import re
from sqlalchemy.orm import Session
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

from models import ABTest, Variant, Experiment


def run_llm_on_tests(
    db: Session,
    experiment: Experiment,
    model_config: dict,
    test_ids: list,
    y_test,
    api_key: str | None,
) -> dict:
    """Run LLM predictions on test set, return metrics and prediction dicts."""
    # api_key can be None — _call_llm will fall back to env vars

    provider = model_config.get("provider", "openai")
    model = model_config.get("model", "gpt-4o-mini")
    prompt_template = model_config.get("prompt_template", "")
    feature_columns = json.loads(experiment.feature_columns) if experiment.feature_columns else []

    if not prompt_template:
        raise ValueError("Prompt template is required for LLM experiments")

    y_true = []
    y_pred = []
    predictions = []

    for i, test_id in enumerate(test_ids):
        test = db.query(ABTest).filter(ABTest.ab_test_id == test_id).first()
        if not test:
            continue

        variants = db.query(Variant).filter(
            Variant.ab_test_id == test.ab_test_id
        ).order_by(Variant.variant_id).all()

        if len(variants) != 2:
            continue

        a_features = json.loads(variants[0].features_json) if variants[0].features_json else {}
        b_features = json.loads(variants[1].features_json) if variants[1].features_json else {}

        # Build template variables — fill ALL available features, not just selected ones
        variables = {
            "form_name": test.form_name or "",
            "variant_a_name": variants[0].variant_name or "",
            "variant_b_name": variants[1].variant_name or "",
        }
        for col in a_features:
            variables[f"variant_a_{col}"] = a_features.get(col, "N/A")
        for col in b_features:
            variables[f"variant_b_{col}"] = b_features.get(col, "N/A")

        # Fill prompt template
        filled_prompt = prompt_template
        for key, val in variables.items():
            filled_prompt = filled_prompt.replace(f"{{{key}}}", str(val))

        actual = int(y_test[i])

        try:
            raw_response = _call_llm(provider, model, filled_prompt, api_key)
            predicted_is_b = _parse_response(raw_response)
            is_correct = 1 if predicted_is_b == actual else 0
            y_true.append(actual)
            y_pred.append(predicted_is_b)

            predictions.append({
                "ab_test_id": test_id,
                "predicted_winner_is_b": predicted_is_b,
                "actual_winner_is_b": actual,
                "correct": is_correct,
                "confidence": None,
                "raw_output": raw_response[:2000],
            })
        except Exception as e:
            # Record the failed prediction so it shows up in results
            predictions.append({
                "ab_test_id": test_id,
                "predicted_winner_is_b": 0,
                "actual_winner_is_b": actual,
                "correct": 0,
                "confidence": None,
                "raw_output": f"ERROR: {str(e)[:1900]}",
            })
            y_true.append(actual)
            y_pred.append(0)  # default to A on failure

    metrics = {}
    if len(y_true) > 0:
        metrics["accuracy"] = float(accuracy_score(y_true, y_pred))
        metrics["precision"] = float(precision_score(y_true, y_pred, zero_division=0))
        metrics["recall"] = float(recall_score(y_true, y_pred, zero_division=0))
        metrics["f1"] = float(f1_score(y_true, y_pred, zero_division=0))
    else:
        metrics = {"accuracy": None, "precision": None, "recall": None, "f1": None}

    return {**metrics, "predictions": predictions}


def _resolve_api_key(provider: str, api_key: str | None) -> str:
    """Return the provided key, or fall back to env var."""
    import os
    if api_key:
        return api_key
    env_key = os.environ.get(
        "OPENAI_API_KEY" if provider == "openai" else "ANTHROPIC_API_KEY"
    )
    if env_key:
        return env_key
    raise ValueError(f"No API key provided and no env var set for {provider}")


def _is_openai_reasoning_model(model: str) -> bool:
    """Check if an OpenAI model is an o-series reasoning model."""
    return bool(re.match(r'^o\d', model))


def _is_anthropic_thinking_model(model: str) -> bool:
    """Check if an Anthropic model supports extended thinking (4.5+ generation)."""
    # Claude 4.5+ models (haiku-4-5, sonnet-4-5, opus-4-5, and newer 4-6 series)
    return bool(re.search(r'-(4-5|4-6|sonnet-4-|opus-4-)', model))


def _call_llm(provider: str, model: str, prompt: str, api_key: str | None = None, max_tokens: int = 4096) -> str:
    """Call an LLM API and return the text response."""
    resolved_key = _resolve_api_key(provider, api_key)

    if provider == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=resolved_key)

        if _is_openai_reasoning_model(model):
            # o-series models: no temperature, use max_completion_tokens
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_completion_tokens=max_tokens,
            )
        else:
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
                temperature=0,
            )
        return response.choices[0].message.content or ""

    elif provider == "anthropic":
        from anthropic import Anthropic
        client = Anthropic(api_key=resolved_key)

        if _is_anthropic_thinking_model(model):
            # Extended thinking models: enable thinking with a budget,
            # and raise max_tokens to accommodate thinking + response
            response = client.messages.create(
                model=model,
                max_tokens=16000,
                thinking={
                    "type": "enabled",
                    "budget_tokens": 10000,
                },
                messages=[{"role": "user", "content": prompt}],
            )
        else:
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
        # Extract text from response — thinking models return thinking + text blocks
        for block in response.content:
            if block.type == "text":
                return block.text
        return ""

    else:
        raise ValueError(f"Unknown provider: {provider}")


def _parse_response(response: str) -> int:
    """Parse LLM response to determine if prediction is A (0) or B (1)."""
    text = response.strip().upper()

    if "VARIANT B" in text or "ANSWER: B" in text or "WINNER: B" in text:
        return 1
    if "VARIANT A" in text or "ANSWER: A" in text or "WINNER: A" in text:
        return 0

    last_line = text.strip().split("\n")[-1].strip()
    if last_line in ("A", "B", "A.", "B."):
        return 1 if last_line.startswith("B") else 0

    match = re.search(r'\b(A|B)\b', text)
    if match:
        return 1 if match.group(1) == "B" else 0

    return 0
