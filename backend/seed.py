"""Seed the database from the CSV file.

Run once: python seed.py
"""

import os
import sys
import json
import pandas as pd
from database import engine, Base, SessionLocal
from models import ABTest, Variant
from feature_engineering import classify_columns, build_features_json

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "AB_Test_Research_with_P_Value_full.csv")


def seed():
    print("Loading CSV...")
    df = pd.read_csv(CSV_PATH)
    print(f"  Total rows: {len(df)}, columns: {len(df.columns)}")

    # Classify columns for feature extraction
    classified = classify_columns(list(df.columns))
    all_feature_cols = (
        classified["demographics"] + classified["form_config"]
        + classified["question_structure"] + classified["question_text"]
    )
    print(f"  Feature columns: {len(all_feature_cols)} "
          f"(demographics={len(classified['demographics'])}, "
          f"form_config={len(classified['form_config'])}, "
          f"question_structure={len(classified['question_structure'])}, "
          f"question_text={len(classified['question_text'])})")

    # Filter: exactly 2 variants per AB_TEST_ID
    variant_counts = df.groupby("AB_TEST_ID")["VARIANT_ID"].nunique()
    two_variant_tests = variant_counts[variant_counts == 2].index
    df_filtered = df[df["AB_TEST_ID"].isin(two_variant_tests)].copy()
    print(f"  Tests with exactly 2 variants: {len(two_variant_tests)}")

    # Filter: statistically significant (P_VALUE < 0.05)
    significant_tests = df_filtered.groupby("AB_TEST_ID")["P_VALUE"].first()
    significant_tests = significant_tests[significant_tests < 0.05].index
    df_filtered = df_filtered[df_filtered["AB_TEST_ID"].isin(significant_tests)].copy()
    print(f"  Statistically significant tests (p<0.05): {len(significant_tests)}")

    # Create tables
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    session = SessionLocal()
    test_count = 0
    variant_count = 0

    for ab_test_id, group in df_filtered.groupby("AB_TEST_ID"):
        if len(group) != 2:
            continue

        # Sort by VARIANT_ID lexicographically
        group = group.sort_values("VARIANT_ID")
        row_a = group.iloc[0]
        row_b = group.iloc[1]

        # Determine winner by higher conversion rate
        conv_a = float(row_a["CONVERSION_RATE"])
        conv_b = float(row_b["CONVERSION_RATE"])
        if conv_a == conv_b:
            continue  # skip ties

        winner_is_b = 1 if conv_b > conv_a else 0
        winner_variant_id = str(row_b["VARIANT_ID"]) if winner_is_b else str(row_a["VARIANT_ID"])

        ab_test = ABTest(
            ab_test_id=str(ab_test_id),
            account_id=str(row_a["ACCOUNT_ID"]),
            form_name=str(row_a["FORM_NAME"]),
            p_value=float(row_a["P_VALUE"]),
            winner_variant_id=winner_variant_id,
            variant_a_id=str(row_a["VARIANT_ID"]),
            variant_b_id=str(row_b["VARIANT_ID"]),
            winner_is_b=winner_is_b,
        )
        session.add(ab_test)

        for row in [row_a, row_b]:
            variant = Variant(
                ab_test_id=str(ab_test_id),
                variant_id=str(row["VARIANT_ID"]),
                variant_name=str(row["VARIANT_NAME"]),
                total_visit_count=int(row["TOTAL_VISIT_COUNT"]),
                total_lead_count=int(row["TOTAL_LEAD_COUNT"]),
                conversion_rate=float(row["CONVERSION_RATE"]),
                features_json=build_features_json(row, all_feature_cols),
            )
            session.add(variant)
            variant_count += 1

        test_count += 1

    session.commit()
    session.close()
    print(f"\nSeeded {test_count} tests with {variant_count} variants.")

    # Print label distribution
    session = SessionLocal()
    tests = session.query(ABTest).all()
    b_wins = sum(1 for t in tests if t.winner_is_b == 1)
    a_wins = len(tests) - b_wins
    print(f"Label distribution: A wins={a_wins}, B wins={b_wins}")
    session.close()


if __name__ == "__main__":
    seed()
