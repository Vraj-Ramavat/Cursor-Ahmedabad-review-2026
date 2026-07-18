import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getMealPlan, setToken, updateHealth } from "../api";
import { colors } from "../theme";

/** Same questionnaire as Eatvisor OnboardingScreen — deterministic, no LLM. */
const STEPS = ["Body", "Goal", "Health", "Diet", "Allergies"];

const GOALS = [
  { id: "weight_loss", label: "Lose Weight" },
  { id: "weight_gain", label: "Gain Weight" },
  { id: "maintain", label: "Maintain Weight" },
  { id: "general_wellness", label: "General Wellness" },
  { id: "manage_condition", label: "Manage Condition" },
];

const CONDITIONS = [
  "Diabetes / Pre-diabetic",
  "PCOS / PCOD",
  "Thyroid (Hypo/Hyper)",
  "High Cholesterol",
  "High Blood Pressure",
  "Heart Disease",
  "Kidney Issues",
  "Digestive Issues (IBS/Acidity)",
  "None",
];

const DIETS = [
  { id: "vegetarian", label: "Vegetarian" },
  { id: "non-vegetarian", label: "Non-Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "eggetarian", label: "Eggetarian" },
  { id: "jain", label: "Jain" },
];

const ALLERGIES = [
  { id: "nuts", label: "Nuts" },
  { id: "dairy", label: "Dairy" },
  { id: "gluten", label: "Gluten" },
  { id: "soy", label: "Soy" },
  { id: "eggs", label: "Eggs" },
  { id: "seafood", label: "Seafood" },
];

const ACTIVITIES = [
  { id: "sedentary", label: "Sedentary" },
  { id: "lightly_active", label: "Lightly Active" },
  { id: "moderately_active", label: "Moderately Active" },
  { id: "very_active", label: "Very Active" },
  { id: "extra_active", label: "Extra Active" },
];

function mapCondition(c) {
  const m = {
    "Diabetes / Pre-diabetic": "diabetes",
    "PCOS / PCOD": "pcos",
    "Thyroid (Hypo/Hyper)": "thyroid",
    "High Cholesterol": "cholesterol",
    "High Blood Pressure": "bp",
    "Heart Disease": "heart",
    "Kidney Issues": "kidney",
    "Digestive Issues (IBS/Acidity)": "digestive",
  };
  return m[c] || c.toLowerCase();
}

export default function MealsScreen({ account, onAccountUpdate, sessionId, setAccount, session }) {
  const updateAccount = onAccountUpdate || setAccount;
  const activeSession = sessionId || session;
  const [step, setStep] = useState(0);
  const [weight, setWeight] = useState(String(account?.weight_kg || ""));
  const [height, setHeight] = useState(String(account?.height_cm || ""));
  const [activity, setActivity] = useState(account?.activity_level || "");
  const [goal, setGoal] = useState(account?.goal || "");
  const [conditions, setConditions] = useState([]);
  const [diet, setDiet] = useState(account?.diet_type || "");
  const [allergies, setAllergies] = useState([]);
  const [dislikes, setDislikes] = useState("");
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function toggle(list, setList, item) {
    if (item === "None") return setList(["None"]);
    const without = list.filter((i) => i !== "None");
    if (without.includes(item)) setList(without.filter((i) => i !== item));
    else setList([...without, item]);
  }

  function toggleId(list, setList, id) {
    if (list.includes(id)) setList(list.filter((i) => i !== id));
    else setList([...list, id]);
  }

  function canNext() {
    if (step === 0) return weight && height && activity;
    if (step === 1) return !!goal;
    if (step === 2) return conditions.length > 0;
    if (step === 3) return !!diet;
    return true;
  }

  async function generate() {
    setBusy(true);
    setErr("");
    try {
      const conds = conditions.filter((c) => c !== "None").map(mapCondition);
      const updated = await updateHealth({
        weight_kg: weight ? Number(weight) : null,
        height_cm: height ? Number(height) : null,
        diet_type: diet,
        conditions: conds,
        allergies,
        goal,
        activity_level: activity,
        dislikes: dislikes.split(",").map((s) => s.trim()).filter(Boolean),
      });
      if (updated?.token) setToken(updated.token);
      updateAccount?.(updated);
      const p = await getMealPlan(15, activeSession);
      setPlan(p);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={styles.title}>Meal plan</Text>
      <Text style={styles.sub}>
        Eatvisor-style plan: 15 days × meals + recipes + cooking video recommendations. Same questionnaire as your app.
      </Text>

      <View style={styles.stepRow}>
        {STEPS.map((s, i) => (
          <TouchableOpacity key={s} onPress={() => setStep(i)} style={[styles.stepChip, step === i && styles.stepOn]}>
            <Text style={[styles.stepText, step === i && styles.stepTextOn]}>{i + 1}. {s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!plan && (
        <View style={styles.card}>
          {step === 0 && (
            <>
              <Text style={styles.label}>Weight (kg)</Text>
              <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="numeric" placeholderTextColor={colors.muted} />
              <Text style={styles.label}>Height (cm)</Text>
              <TextInput style={styles.input} value={height} onChangeText={setHeight} keyboardType="numeric" placeholderTextColor={colors.muted} />
              <Text style={styles.label}>Activity level</Text>
              <View style={styles.chips}>
                {ACTIVITIES.map((a) => (
                  <Chip key={a.id} label={a.label} on={activity === a.id} onPress={() => setActivity(a.id)} />
                ))}
              </View>
            </>
          )}
          {step === 1 && (
            <View style={styles.chips}>
              {GOALS.map((g) => (
                <Chip key={g.id} label={g.label} on={goal === g.id} onPress={() => setGoal(g.id)} />
              ))}
            </View>
          )}
          {step === 2 && (
            <View style={styles.chips}>
              {CONDITIONS.map((c) => (
                <Chip key={c} label={c} on={conditions.includes(c)} onPress={() => toggle(conditions, setConditions, c)} />
              ))}
            </View>
          )}
          {step === 3 && (
            <View style={styles.chips}>
              {DIETS.map((d) => (
                <Chip key={d.id} label={d.label} on={diet === d.id} onPress={() => setDiet(d.id)} />
              ))}
            </View>
          )}
          {step === 4 && (
            <>
              <View style={styles.chips}>
                {ALLERGIES.map((a) => (
                  <Chip key={a.id} label={a.label} on={allergies.includes(a.id)} onPress={() => toggleId(allergies, setAllergies, a.id)} />
                ))}
              </View>
              <Text style={styles.label}>Foods you dislike (comma-separated)</Text>
              <TextInput style={styles.input} value={dislikes} onChangeText={setDislikes} placeholder="e.g. mushroom, bitter gourd" placeholderTextColor={colors.muted} />
            </>
          )}

          <View style={styles.navRow}>
            {step > 0 && (
              <TouchableOpacity style={styles.btnAlt} onPress={() => setStep(step - 1)}>
                <Text style={styles.btnAltText}>Back</Text>
              </TouchableOpacity>
            )}
            {step < STEPS.length - 1 ? (
              <TouchableOpacity
                style={[styles.btn, !canNext() && styles.btnDisabled]}
                disabled={!canNext()}
                onPress={() => setStep(step + 1)}
              >
                <Text style={styles.btnText}>Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.btn} onPress={generate} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Generate 15-day plan</Text>}
              </TouchableOpacity>
            )}
          </View>
          {!!err && <Text style={styles.err}>{err}</Text>}
        </View>
      )}

      {plan && (
        <>
          <TouchableOpacity style={styles.btnAlt} onPress={() => setPlan(null)}>
            <Text style={styles.btnAltText}>Edit questionnaire & regenerate</Text>
          </TouchableOpacity>
          <Text style={styles.kcal}>
            {plan.plan_days || plan.days?.length || 15}-day plan · ~{plan.daily_calorie_target} kcal/day · {plan.diet}
          </Text>
          {plan.recovery_mode && <Text style={styles.recover}>Recovery mode — light meals for current visit.</Text>}

          {(plan.video_recommendations || []).length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recommended videos</Text>
              {plan.video_recommendations.map((v) => (
                <View key={v.videoId || v.url} style={styles.mealRow}>
                  <Text style={styles.mealName}>{v.title}</Text>
                  <Text style={styles.meta}>{v.channel}</Text>
                  <Text
                    style={styles.link}
                    onPress={() => {
                      const url = v.url || `https://www.youtube.com/watch?v=${v.videoId}`;
                      if (typeof window !== "undefined") window.open(url, "_blank");
                    }}
                  >
                    Watch on YouTube →
                  </Text>
                </View>
              ))}
            </View>
          )}

          {plan.days.map((d) => (
            <View key={d.day || d.day_number} style={styles.card}>
              <Text style={styles.cardTitle}>
                Day {d.day || d.day_number} · {d.totals?.calories || 0} kcal
              </Text>
              {d.morning_drink && (
                <Text style={styles.meta}>Morning drink: {d.morning_drink.name}</Text>
              )}
              {Object.values(d.meals || {}).filter(Boolean).map((m, i) => (
                <View key={i} style={styles.mealRow}>
                  <Text style={styles.slot}>{m.slot || m.meal_slot}</Text>
                  <Text style={styles.mealName}>{m.name}</Text>
                  <Text style={styles.meta}>{m.calories} kcal · {m.serving_size}</Text>
                  {m.recipe?.ingredients?.length > 0 && (
                    <Text style={styles.meta}>
                      Ingredients: {m.recipe.ingredients.slice(0, 6).join(", ")}
                      {m.recipe.ingredients.length > 6 ? "…" : ""}
                    </Text>
                  )}
                  {m.recipe?.steps?.length > 0 && (
                    <Text style={styles.meta}>How: {m.recipe.steps[0]}</Text>
                  )}
                  {(m.videos || []).slice(0, 1).map((v) => (
                    <Text
                      key={v.videoId || v.title}
                      style={styles.link}
                      onPress={() => {
                        const url = v.url || `https://www.youtube.com/watch?v=${v.videoId}`;
                        if (typeof window !== "undefined") window.open(url, "_blank");
                      }}
                    >
                      ▶ {v.title || "Recipe video"}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
          {Object.entries(plan.foods_to_avoid || {}).map(([k, items]) => (
            <View key={k} style={styles.card}>
              <Text style={styles.cardTitle}>Avoid — {k}</Text>
              {items.map((it, i) => (
                <Text key={i} style={styles.meta}>• {it.food}: {it.reason}</Text>
              ))}
            </View>
          ))}
          <Text style={styles.disclaimer}>{plan.disclaimer}</Text>
        </>
      )}
    </ScrollView>
  );
}

function Chip({ label, on, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  sub: { color: colors.muted, marginTop: 4, marginBottom: 12, lineHeight: 18 },
  stepRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  stepChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  stepOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  stepText: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  stepTextOn: { color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  chipTextOn: { color: colors.primary },
  navRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  btn: { flex: 1, backgroundColor: colors.primary, borderRadius: 24, padding: 13, alignItems: "center" },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: "#fff", fontWeight: "700" },
  btnAlt: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: 13, alignItems: "center", marginBottom: 10, backgroundColor: "#fff" },
  btnAltText: { color: colors.primary, fontWeight: "700" },
  err: { color: colors.red, marginTop: 8 },
  kcal: { fontWeight: "700", color: colors.text, marginBottom: 8 },
  recover: { color: colors.amber, marginBottom: 8, fontWeight: "600" },
  cardTitle: { fontWeight: "700", color: colors.text, marginBottom: 8 },
  mealRow: { marginBottom: 10 },
  slot: { fontSize: 11, color: colors.primary, fontWeight: "700" },
  mealName: { color: colors.text, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  link: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 4 },
  disclaimer: { color: colors.muted, fontSize: 12, fontStyle: "italic", marginBottom: 20 },
});
