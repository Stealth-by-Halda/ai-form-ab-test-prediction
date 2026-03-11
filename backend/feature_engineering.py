"""Column classification and feature vector construction for A/B test prediction."""

from __future__ import annotations

import json
import numpy as np
import pandas as pd

# --- Identifier / metadata columns (excluded from features) ---
IDENTIFIER_COLUMNS = {
    "ACCOUNT_ID", "AB_TEST_ID", "FORM_ID", "FORM_NAME",
    "VARIANT_ID", "VARIANT_NAME", "VARIANT_PREVIEW_URL",
}

# --- Outcome columns (excluded — would be leakage) ---
OUTCOME_COLUMNS = {
    "CONVERSION_RATE", "P_VALUE", "TOTAL_LEAD_COUNT", "TOTAL_VISIT_COUNT",
}

# --- Text / URL / color / font columns at top level (not per-question) ---
TEXT_URL_COLUMNS_PREFIXES = (
    "billboard_hero_image_url", "billboard_logo_image_url",
    "account_hero_logo_url", "image_url_",
)
TEXT_URL_COLUMNS_EXACT = {
    "name",  # account name
    "VARIANT_PREVIEW_URL",
    "BILLBOARD_HERO_IMAGE_URL", "BILLBOARD_LOGO_IMAGE_URL",
    "BILLBOARD_HEADING_TEXT", "BILLBOARD_SUBHEADING_TEXT",
    "BILLBOARD_BUTTON_TEXT", "SCREEN_NEXT_BUTTON_TEXT",
}

# Top-level suffixes to exclude (NOT applied to question columns)
TOP_LEVEL_EXCLUDED_SUFFIXES = (
    "_COLOR_HEX", "_FONT",
)

# --- Demographic columns ---
DEMOGRAPHIC_COLUMNS = [
    "Domestic: In-State", "Domestic: Out-of-State",
    "Market 1: Local (<25mi)", "Market 2: Regional (25-150mi)",
    "Market 3: National (>150mi)", "Market 4: International",
    "Grad", "Undergraduate", "PhD",
    "Male", "Female",
    "Traditional Age", "Adult Learner",
    "Low Income", "Mid Income", "High Income",
    "First-Generation", "Is Transfer",
    "Seeking Online Only", "Seeking Hybrid", "Seeking In-Person Only",
]

# --- Per-question suffixes we want as ML features (numeric/boolean) ---
QUESTION_NUMERIC_SUFFIXES = (
    "_EXISTS", "_SCREEN_NUMBER", "_ORDER_IN_SCREEN", "_ORDER_IN_FORM",
    "_IS_REQUIRED", "_HAS_OTHER_OPTION", "_OPTION_COUNT",
    "_LISTLIKE_OPTION_COUNT", "_SLIDER_MIN", "_SLIDER_MAX",
    "_SLIDER_STEP", "_SLIDER_DEFAULT",
    # Question type booleans
    "_TYPE_FIRST_NAME", "_TYPE_LAST_NAME", "_TYPE_EMAIL_ADDRESS",
    "_TYPE_PHONE_NUMBER", "_TYPE_DROPDOWN", "_TYPE_RADIO_BUTTON",
    "_TYPE_LIST", "_TYPE_CHECKBOX", "_TYPE_SHORT_ANSWER",
    "_TYPE_SLIDER", "_TYPE_HIGH_SCHOOL", "_TYPE_ZIP_CODE",
    "_TYPE_PROGRAM_START", "_TYPE_DATE_OF_BIRTH", "_TYPE_DATE_PICKER",
    "_TYPE_PARAGRAPH", "_TYPE_STATEMENT", "_TYPE_QUESTION_GROUP",
)

# --- Per-question text suffixes (stored for LLM use, not numeric features) ---
QUESTION_TEXT_SUFFIXES = (
    "_TEXT", "_PLACEHOLDER", "_DISCLAIMER", "_FIELD_NAME", "_FIELD_VALUE",
)


def _is_question_col(col: str) -> bool:
    """Check if column matches Q{N}_* pattern."""
    if col.startswith("Q") and "_" in col:
        prefix = col.split("_")[0]
        if prefix[1:].isdigit():
            return True
    return False


def classify_columns(all_columns: list[str]) -> dict[str, list[str]]:
    """Classify CSV columns into categories, returning feature column lists.

    Categories:
      demographics: demographic percentage columns
      form_config: top-level form config booleans/numerics
      question_structure: per-question numeric/boolean fields (order, type, etc.)
      question_text: per-question text fields (for LLM prompts, not ML features)
    """
    demographics = []
    form_config = []
    question_structure = []
    question_text = []

    excluded_exact_upper = {c.upper() for c in IDENTIFIER_COLUMNS | OUTCOME_COLUMNS | TEXT_URL_COLUMNS_EXACT}

    for col in all_columns:
        col_upper = col.upper()

        # Skip identifiers, outcomes, text/url exact matches
        if col_upper in excluded_exact_upper:
            continue

        # Skip URL-like prefix columns
        if any(col.lower().startswith(p) for p in TEXT_URL_COLUMNS_PREFIXES):
            continue

        # Demographic columns
        if col in DEMOGRAPHIC_COLUMNS:
            demographics.append(col)
            continue

        # Question columns: Q{N}_* pattern
        if _is_question_col(col):
            if any(col_upper.endswith(s) for s in QUESTION_TEXT_SUFFIXES):
                question_text.append(col)
            else:
                question_structure.append(col)
            continue

        # Skip top-level color/font suffixes
        if any(col_upper.endswith(s) for s in TOP_LEVEL_EXCLUDED_SUFFIXES):
            continue

        # Top-level text columns (heading text, button text, etc.)
        if col_upper.endswith("_TEXT"):
            continue

        # Remaining numeric/boolean columns → form config
        form_config.append(col)

    return {
        "demographics": demographics,
        "form_config": form_config,
        "question_structure": question_structure,
        "question_text": question_text,
    }


def build_features_json(row: pd.Series, feature_cols: list[str]) -> str:
    """Build a JSON string of feature values from a DataFrame row.

    For text columns, stores the string value. For numeric, stores numbers.
    """
    features = {}
    for col in feature_cols:
        val = row.get(col)
        if pd.isna(val):
            features[col] = None
        elif isinstance(val, (np.integer,)):
            features[col] = int(val)
        elif isinstance(val, (np.floating,)):
            features[col] = float(val)
        elif isinstance(val, (np.bool_,)):
            features[col] = bool(val)
        elif isinstance(val, str):
            # Keep strings for text columns (question text, etc.)
            features[col] = val
        else:
            try:
                features[col] = float(val)
            except (ValueError, TypeError):
                features[col] = str(val) if val is not None else None
    return json.dumps(features)


def get_default_feature_columns(classified: dict[str, list[str]]) -> list[str]:
    """Return the default feature set (demographics + form_config, no question cols)."""
    return classified["demographics"] + classified["form_config"]


def build_feature_vector(
    variant_a_features: dict,
    variant_b_features: dict,
    feature_columns: list[str],
    mode: str = "difference",
) -> list[float]:
    """Build a feature vector from two variant feature dicts.

    mode='concatenated': [a_features | b_features]
    mode='difference': [b - a for each feature]

    String values are mapped to 0.0 (they're for LLM use, not ML).
    """
    a_vals = []
    b_vals = []
    for col in feature_columns:
        a_val = variant_a_features.get(col)
        b_val = variant_b_features.get(col)
        a_vals.append(_to_float(a_val))
        b_vals.append(_to_float(b_val))

    if mode == "concatenated":
        return a_vals + b_vals
    else:  # difference
        return [b - a for a, b in zip(a_vals, b_vals)]


def _to_float(val) -> float:
    """Convert a value to float for feature vectors. Strings → 0.0."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0
