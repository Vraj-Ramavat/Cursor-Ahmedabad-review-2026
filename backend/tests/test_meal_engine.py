"""Tests for the Eatvisor-ported deterministic meal engine."""

from app.services.meal_engine import calculate_daily_calories, recommend_meals


def test_calorie_target_is_in_safe_range():
    cal = calculate_daily_calories(
        {"age": 30, "gender": "female", "weight_kg": 60, "height_cm": 160}
    )
    assert 1200 <= cal <= 3200


def test_plan_respects_vegetarian_diet():
    plan = recommend_meals(
        {
            "age": 28,
            "gender": "female",
            "weight_kg": 55,
            "height_cm": 158,
            "diet_type": "vegetarian",
            "conditions": ["diabetes"],
            "allergies": [],
        },
        days=2,
        include_videos=False,
    )
    assert plan["diet"] == "vegetarian"
    assert len(plan["days"]) == 2
    # Every meal should be present for the core slots.
    for day in plan["days"]:
        assert day["meals"]["breakfast"] is not None
        assert day["meals"]["lunch"] is not None
        assert day["meals"]["breakfast"]["recipe"]["ingredients"]


def test_nut_allergy_excludes_nut_meals():
    plan = recommend_meals(
        {
            "age": 40,
            "gender": "male",
            "diet_type": "vegetarian",
            "allergies": ["nuts"],
            "conditions": [],
        },
        days=3,
        include_videos=False,
    )
    for day in plan["days"]:
        for meal in day["meals"].values():
            if meal:
                assert "nut" not in meal["name"].lower()


def test_fever_complaint_enters_recovery_mode():
    plan = recommend_meals(
        {
            "age": 35,
            "gender": "male",
            "diet_type": "non-vegetarian",
            "current_complaint": "high fever for two days",
        },
        days=1,
        include_videos=False,
    )
    assert plan["recovery_mode"] is True
    assert "Recovery (current visit)" in plan["foods_to_avoid"]


def test_fifteen_day_plan_shape():
    plan = recommend_meals(
        {
            "age": 25,
            "gender": "female",
            "diet_type": "vegetarian",
            "weight_kg": 58,
            "height_cm": 162,
            "goal": "maintain",
        },
        days=15,
        include_videos=False,
    )
    assert len(plan["days"]) == 15
    assert "morning_snack" in plan["days"][0]["meals"]
    assert "evening_snack" in plan["days"][0]["meals"]
