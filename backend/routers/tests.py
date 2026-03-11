import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import ABTest, Variant
from schemas import TestSummary, TestDetail, TestStats, VariantDetail

router = APIRouter(prefix="/api/tests", tags=["tests"])


@router.get("/stats", response_model=TestStats)
def get_test_stats(db: Session = Depends(get_db)):
    tests = db.query(ABTest).all()
    if not tests:
        return TestStats(total_tests=0, a_wins=0, b_wins=0, avg_p_value=0, min_p_value=0, max_p_value=0)

    b_wins = sum(1 for t in tests if t.winner_is_b == 1)
    p_values = [t.p_value for t in tests]
    return TestStats(
        total_tests=len(tests),
        a_wins=len(tests) - b_wins,
        b_wins=b_wins,
        avg_p_value=sum(p_values) / len(p_values),
        min_p_value=min(p_values),
        max_p_value=max(p_values),
    )


@router.get("", response_model=list[TestSummary])
def list_tests(db: Session = Depends(get_db)):
    tests = db.query(ABTest).order_by(ABTest.ab_test_id).all()
    return [
        TestSummary(
            ab_test_id=t.ab_test_id,
            account_id=t.account_id,
            form_name=t.form_name,
            p_value=t.p_value,
            winner_variant_id=t.winner_variant_id,
            variant_a_id=t.variant_a_id,
            variant_b_id=t.variant_b_id,
            winner_is_b=t.winner_is_b,
        )
        for t in tests
    ]


@router.get("/{ab_test_id}", response_model=TestDetail)
def get_test(ab_test_id: str, db: Session = Depends(get_db)):
    test = db.query(ABTest).filter(ABTest.ab_test_id == ab_test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    variants = db.query(Variant).filter(Variant.ab_test_id == ab_test_id).order_by(Variant.variant_id).all()
    if len(variants) != 2:
        raise HTTPException(status_code=500, detail="Expected 2 variants")

    def make_variant_detail(v: Variant) -> VariantDetail:
        return VariantDetail(
            variant_id=v.variant_id,
            variant_name=v.variant_name,
            total_visit_count=v.total_visit_count,
            total_lead_count=v.total_lead_count,
            conversion_rate=v.conversion_rate,
            features=json.loads(v.features_json) if v.features_json else {},
        )

    return TestDetail(
        ab_test_id=test.ab_test_id,
        account_id=test.account_id,
        form_name=test.form_name,
        p_value=test.p_value,
        winner_variant_id=test.winner_variant_id,
        variant_a_id=test.variant_a_id,
        variant_b_id=test.variant_b_id,
        winner_is_b=test.winner_is_b,
        variant_a=make_variant_detail(variants[0]),
        variant_b=make_variant_detail(variants[1]),
    )
