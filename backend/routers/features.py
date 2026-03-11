from __future__ import annotations

import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from models import Variant
from feature_engineering import DEMOGRAPHIC_COLUMNS, QUESTION_TEXT_SUFFIXES
from schemas import FeatureGroup

router = APIRouter(prefix="/api/features", tags=["features"])


def _get_all_feature_columns(db: Session) -> dict[str, list[str]]:
    """Derive available feature columns from the first variant's features_json."""
    variant = db.query(Variant).first()
    if not variant or not variant.features_json:
        return {"demographics": [], "form_config": [], "question_structure": [], "question_text": []}

    features = json.loads(variant.features_json)
    all_cols = list(features.keys())

    demographics = []
    form_config = []
    question_structure = []
    question_text = []

    for col in all_cols:
        if col in DEMOGRAPHIC_COLUMNS:
            demographics.append(col)
        elif col.startswith("Q") and "_" in col and col.split("_")[0][1:].isdigit():
            if any(col.upper().endswith(s) for s in QUESTION_TEXT_SUFFIXES):
                question_text.append(col)
            else:
                question_structure.append(col)
        else:
            form_config.append(col)

    return {
        "demographics": demographics,
        "form_config": form_config,
        "question_structure": question_structure,
        "question_text": question_text,
    }


@router.get("", response_model=list[FeatureGroup])
def list_features(db: Session = Depends(get_db)):
    classified = _get_all_feature_columns(db)
    return [
        FeatureGroup(category=cat, columns=cols)
        for cat, cols in classified.items()
    ]


@router.get("/template-variables")
def list_template_variables(db: Session = Depends(get_db)):
    """Return available LLM template variables."""
    classified = _get_all_feature_columns(db)
    all_cols = (
        classified["demographics"] + classified["form_config"]
        + classified["question_structure"] + classified["question_text"]
    )

    variables = ["form_name", "variant_a_name", "variant_b_name"]
    for col in all_cols:
        variables.append(f"variant_a_{col}")
        variables.append(f"variant_b_{col}")

    return {"variables": variables}


class PromptBuilderRequest(BaseModel):
    instructions: str
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    api_key: str
    selected_features: list[str] = []


@router.post("/build-prompt")
def build_prompt(req: PromptBuilderRequest, db: Session = Depends(get_db)):
    """Use an LLM to generate a prompt template based on user instructions."""
    classified = _get_all_feature_columns(db)
    all_cols = (
        classified["demographics"] + classified["form_config"]
        + classified["question_structure"] + classified["question_text"]
    )

    # Build available variables list, prioritizing selected features
    available_vars = ["form_name", "variant_a_name", "variant_b_name"]
    selected_vars = []
    other_vars = []
    for col in all_cols:
        if col in req.selected_features:
            selected_vars.append(col)
        else:
            other_vars.append(col)

    for col in selected_vars:
        available_vars.append(f"variant_a_{col}")
        available_vars.append(f"variant_b_{col}")

    for col in other_vars:
        available_vars.append(f"variant_a_{col}")
        available_vars.append(f"variant_b_{col}")

    meta_prompt = f"""You are helping a researcher build a prompt template for predicting A/B test winners.

The researcher is analyzing A/B tests on higher education lead generation forms. Each test has two variants (A and B) and the goal is to predict which variant has a higher conversion rate.

The prompt template will be used to query an LLM for each A/B test in a dataset. Template variables use {{curly_brace}} syntax and will be filled with real data at runtime.

USER'S INSTRUCTIONS:
{req.instructions}

AVAILABLE TEMPLATE VARIABLES (use {{variable_name}} syntax):
Selected features (prioritize these):
{chr(10).join(f"  {{{{variant_a_{col}}}}}  {{{{variant_b_{col}}}}}" for col in selected_vars) if selected_vars else "  (none selected)"}

Always available:
  {{form_name}}  {{variant_a_name}}  {{variant_b_name}}

Other available features (use if relevant):
{chr(10).join(f"  {{{{variant_a_{col}}}}}  {{{{variant_b_{col}}}}}" for col in other_vars)}

REQUIREMENTS:
- Output ONLY the prompt template text, nothing else
- Use {{variable_name}} syntax for template variables
- The prompt must end by asking the model to answer with just "A" or "B"
- Focus on the selected features if any were provided
- Be specific about what data each variable represents
- Structure the prompt clearly with labeled sections for each variant"""

    try:
        from llm_pipeline import _call_llm
        result = _call_llm(req.provider, req.model, meta_prompt, req.api_key, max_tokens=16384)
        return {"prompt_template": result.strip()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
