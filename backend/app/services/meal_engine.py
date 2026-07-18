"""Deterministic meal recommendation engine — Eatvisor 15-day parity.

Pipeline (same as Eatvisor mealEngine.js):
  1. Daily calorie target via Harris-Benedict BMR (+ activity multiplier).
  2. HARD FILTER: diet type, allergies, conditions (never violated).
  3. SCORE 0-100+: condition-tag match, GI, fiber, calorie proximity.
  4. Pick meals for 15 days × 5 slots (breakfast, morning_snack, lunch,
     evening_snack, dinner), preferring no repeats.
  5. Morning drink matched to conditions; foods-to-avoid list.
  6. Recipe card (ingredients + steps) per meal + YouTube cooking videos.

Clinic addition: current visit complaint nudges light/recovery meals.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.services.youtube_service import search_videos

MEALS_FILE = Path(__file__).resolve().parent.parent / "rules" / "meals_db.json"

SLOT_CONFIG = {
    "breakfast": {
        "pct": 0.22,
        "label": "Breakfast",
        "types": ["breakfast", "snack"],
    },
    "morning_snack": {
        "pct": 0.10,
        "label": "Morning Snack",
        "types": ["snack"],
    },
    "lunch": {
        "pct": 0.32,
        "label": "Lunch",
        "types": ["lunch"],
    },
    "evening_snack": {
        "pct": 0.10,
        "label": "Evening Snack",
        "types": ["snack"],
    },
    "dinner": {
        "pct": 0.26,
        "label": "Dinner",
        "types": ["dinner", "lunch"],
    },
}

CONDITION_TAG_MAP = {
    "diabetes": "diabetes_safe", "pre-diabetic": "diabetes_safe",
    "pcos": "pcos_safe", "pcod": "pcos_safe",
    "thyroid": "thyroid_safe", "hypothyroid": "thyroid_safe",
    "cholesterol": "cholesterol_safe", "high cholesterol": "cholesterol_safe",
    "bp": "bp_safe", "hypertension": "bp_safe", "high bp": "bp_safe",
    "heart": "heart_safe", "heart disease": "heart_safe",
    "digestive": "digestive_safe", "ibs": "digestive_safe", "acidity": "digestive_safe",
    "kidney": "kidney_safe",
}

ALLERGY_FILTER_MAP = {
    "nuts": "nut_free", "nut": "nut_free", "peanut": "nut_free",
    "dairy": "dairy_free", "milk": "dairy_free", "lactose": "dairy_free",
    "soy": "soy_free", "gluten": "gluten_free", "wheat": "gluten_free",
    "eggs": "egg_free", "egg": "egg_free",
    "seafood": "seafood_free", "fish": "seafood_free",
}

DIET_MAP = {
    "vegetarian": "vegetarian", "veg": "vegetarian", "pure veg": "vegetarian",
    "non-vegetarian": "non_vegetarian", "non veg": "non_vegetarian",
    "nonveg": "non_vegetarian", "non_vegetarian": "non_vegetarian",
    "vegan": "vegan", "eggetarian": "eggetarian", "jain": "vegetarian",
}

RECOVERY_COMPLAINTS = ("fever", "vomiting", "diarrhea", "abdominal", "stomach", "throat")


def _load_db() -> dict:
    return json.loads(MEALS_FILE.read_text(encoding="utf-8"))


def calculate_daily_calories(profile: dict) -> int:
    weight = profile.get("weight_kg") or 65
    height = profile.get("height_cm") or 165
    age = profile.get("age") or 30
    gender = (profile.get("gender") or "male").lower()
    activity = (profile.get("activity_level") or "moderately_active").lower()
    goal = (profile.get("goal") or "maintain").lower()

    if gender == "female":
        bmr = 447.6 + 9.2 * weight + 3.1 * height - 4.3 * age
    else:
        bmr = 88.36 + 13.4 * weight + 4.8 * height - 5.7 * age

    multipliers = {
        "sedentary": 1.2,
        "lightly_active": 1.375,
        "light": 1.375,
        "moderately_active": 1.55,
        "moderate": 1.55,
        "very_active": 1.725,
        "active": 1.725,
        "extra_active": 1.9,
    }
    tdee = bmr * (multipliers.get(activity) or 1.375)
    if "loss" in goal or goal == "weight_loss":
        tdee -= 500
    elif "gain" in goal or goal in ("weight_gain", "muscle_gain"):
        tdee += 500
    return round(max(1200, min(tdee, 3500)))


def _map_conditions(conditions: list[str]) -> list[str]:
    tags = {
        CONDITION_TAG_MAP[c.lower().strip()]
        for c in (conditions or [])
        if c.lower().strip() in CONDITION_TAG_MAP
    }
    return sorted(tags) if tags else ["general_wellness"]


def _map_allergies(allergies: list[str]) -> list[str]:
    return sorted({
        ALLERGY_FILTER_MAP[a.lower().strip()]
        for a in (allergies or [])
        if a.lower().strip() in ALLERGY_FILTER_MAP
    })


def _filter_meals(meals, condition_tags, allergy_filters, diet, recovery_mode, dislikes=None):
    dislikes = [d.lower().strip() for d in (dislikes or []) if d and d.strip()]
    safe = []
    for meal in meals:
        if diet not in meal["diet_tags"]:
            continue
        if any(req not in meal["allergy_tags"] for req in allergy_filters):
            continue
        name_l = meal["name"].lower()
        if any(d in name_l for d in dislikes):
            continue
        has_health_condition = any(
            t in condition_tags
            for t in ("diabetes_safe", "bp_safe", "heart_safe", "cholesterol_safe", "pcos_safe")
        )
        if has_health_condition and (meal["is_fried"] or meal["is_processed"]):
            continue
        if ("diabetes_safe" in condition_tags or "pcos_safe" in condition_tags) and meal["gi_score"] == "high":
            continue
        if recovery_mode and meal["fat"] > 20:
            continue
        safe.append(meal)
    return safe


def _score_meal(meal, condition_tags, slot_key, daily_cal, recovery_mode) -> float:
    score = 0.0
    for tag in condition_tags:
        if tag in meal["condition_tags"]:
            score += 8
    if "diabetes_safe" in condition_tags or "pcos_safe" in condition_tags:
        if meal["gi_score"] == "low":
            score += 10
    if meal["fiber"] >= 4:
        score += 5
    if meal["fiber"] >= 6:
        score += 3
    if meal["sodium"] > 600:
        score -= 5
    if meal["sugar"] > 10:
        score -= 5
    if recovery_mode and "digestive_safe" in meal["condition_tags"]:
        score += 12
    slot_ideal = daily_cal * SLOT_CONFIG[slot_key]["pct"]
    cal_diff = abs(meal["calories"] - slot_ideal)
    score += max(0.0, 20 - (cal_diff / max(slot_ideal, 1)) * 20)
    return round(score, 1)


def _pick_drink(drinks, condition_tags, conditions, allergies):
    avoid_keys = {c.lower() for c in (conditions or [])} | {a.lower() for a in (allergies or [])}
    best, best_score = None, -1.0
    for d in drinks:
        if any(av in avoid_keys for av in d["avoid_conditions"]):
            continue
        score = sum(5 for t in condition_tags if t in d["condition_tags"])
        if score > best_score:
            best, best_score = d, score
    return best


def _recipe_for(meal: dict) -> dict:
    """Use stored recipe or build a practical home-cook card (Eatvisor-style)."""
    if meal.get("recipe"):
        return meal["recipe"]
    ingredients = meal.get("ingredients") or [
        f"Main ingredients for {meal['name']}",
        "Salt and spices to taste",
        "1 tsp oil (optional)",
    ]
    steps = meal.get("steps") or [
        f"Prep vegetables and ingredients for {meal['name']}.",
        "Cook on medium heat until done; keep oil light.",
        f"Serve as {meal.get('serving_size') or '1 serving'}. Pair with water or buttermilk.",
    ]
    return {
        "ingredients": ingredients,
        "steps": steps,
        "prep_minutes": meal.get("prep_minutes") or 20,
        "cook_minutes": meal.get("cook_minutes") or 25,
    }


def _format_meal(pick: dict, slot_key: str, score: float, include_videos: bool) -> dict:
    recipe = _recipe_for(pick)
    videos = []
    if include_videos:
        videos = search_videos(f"how to make {pick['name']} healthy Indian recipe", max_results=2)
        for v in videos:
            if "url" not in v and v.get("videoId"):
                v["url"] = f"https://www.youtube.com/watch?v={v['videoId']}"
    return {
        "meal_id": pick["id"],
        "name": pick["name"],
        "slot": SLOT_CONFIG[slot_key]["label"],
        "meal_slot": slot_key,
        "calories": pick["calories"],
        "protein": pick["protein"],
        "carbs": pick.get("carbs"),
        "fat": pick.get("fat"),
        "fiber": pick["fiber"],
        "gi_score": pick["gi_score"],
        "region": pick["region"],
        "serving_size": pick["serving_size"],
        "score": score,
        "recipe": recipe,
        "videos": videos,
    }


def recommend_meals(profile: dict, days: int = 15, include_videos: bool = True) -> dict:
    """Generate an Eatvisor-style N-day meal plan (default 15)."""
    days = max(1, min(int(days or 15), 15))
    db = _load_db()
    daily_cal = calculate_daily_calories(profile)
    condition_tags = _map_conditions(profile.get("conditions") or [])
    allergy_filters = _map_allergies(profile.get("allergies") or [])
    diet = DIET_MAP.get((profile.get("diet_type") or "").lower().strip(), "non_vegetarian")

    complaint = (profile.get("current_complaint") or "").lower()
    recovery_mode = any(k in complaint for k in RECOVERY_COMPLAINTS)

    safe = _filter_meals(
        db["meals"], condition_tags, allergy_filters, diet, recovery_mode,
        dislikes=profile.get("dislikes") or [],
    )

    used_ids: set[int] = set()
    plan_days = []
    # Limit YouTube calls: only attach videos for first 3 days to save quota.
    for day in range(1, days + 1):
        day_meals = {}
        for slot_key, cfg in SLOT_CONFIG.items():
            candidates = [
                m for m in safe
                if m["meal_type"] in cfg["types"] and m["id"] not in used_ids
            ]
            if not candidates:
                candidates = [m for m in safe if m["meal_type"] in cfg["types"]]
            if not candidates:
                day_meals[slot_key] = None
                continue
            scored = sorted(
                candidates,
                key=lambda m: _score_meal(m, condition_tags, slot_key, daily_cal, recovery_mode),
                reverse=True,
            )
            pick = scored[day % min(5, len(scored))] if len(scored) > 1 else scored[0]
            # Prefer top score; rotate slightly across days for variety
            if day == 1:
                pick = scored[0]
            used_ids.add(pick["id"])
            score = _score_meal(pick, condition_tags, slot_key, daily_cal, recovery_mode)
            day_meals[slot_key] = _format_meal(
                pick, slot_key, score, include_videos=include_videos and day <= 3,
            )
        drink = _pick_drink(
            db["morning_drinks"], condition_tags,
            profile.get("conditions"), profile.get("allergies"),
        )
        totals = {
            "calories": sum(m["calories"] for m in day_meals.values() if m),
            "protein": round(sum(m["protein"] for m in day_meals.values() if m), 1),
            "carbs": round(sum((m.get("carbs") or 0) for m in day_meals.values() if m), 1),
            "fat": round(sum((m.get("fat") or 0) for m in day_meals.values() if m), 1),
            "fiber": round(sum(m["fiber"] for m in day_meals.values() if m), 1),
        }
        plan_days.append({
            "day": day,
            "day_number": day,
            "meals": day_meals,
            "morning_drink": drink,
            "totals": totals,
        })

    avoid: dict[str, list] = {}
    for cond in profile.get("conditions") or []:
        key = cond.lower().strip()
        for db_key, items in db["foods_to_avoid"].items():
            if db_key in key or key in db_key:
                avoid[cond] = items
    if recovery_mode:
        avoid["Recovery (current visit)"] = db["foods_to_avoid"]["fever_recovery"]

    # Plan-level video recommendations (Eatvisor Content-style)
    plan_videos = []
    if include_videos:
        goal = (profile.get("goal") or "wellness").replace("_", " ")
        plan_videos = search_videos(f"{goal} healthy Indian meal plan recipes", max_results=4)

    return {
        "daily_calorie_target": daily_cal,
        "diet": diet,
        "recovery_mode": recovery_mode,
        "plan_days": days,
        "days": plan_days,
        "morning_drink": plan_days[0]["morning_drink"] if plan_days else None,
        "foods_to_avoid": avoid,
        "video_recommendations": plan_videos,
        "disclaimer": (
            "General wellness guidance generated from your profile — not a "
            "prescription or medical nutrition therapy. Follow your doctor's advice first."
        ),
        "stats": {
            "meals_in_db": len(db["meals"]),
            "safe_after_filter": len(safe),
            "unique_meals_used": len(used_ids),
            "days": days,
        },
    }
