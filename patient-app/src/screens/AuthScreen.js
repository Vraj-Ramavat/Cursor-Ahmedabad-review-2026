import { useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radius, spacing } from "../theme";
import { login, register, setToken } from "../api";

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [abhaId, setAbhaId] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    if (!phone.trim()) return setErr("Phone number is required");
    if (mode === "register" && !name.trim()) return setErr("Name is required");
    setBusy(true);
    try {
      const acc =
        mode === "login"
          ? await login(phone.trim())
          : await register({
              name: name.trim(),
              phone: phone.trim(),
              age: age ? Number(age) : null,
              gender: gender.trim() || null,
              abha_id: abhaId.trim() || null,
            });
      setToken(acc.token);
      onAuthed(acc);
    } catch (e) {
      setErr(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>+</Text>
          </View>
          <Text style={styles.title}>Clinic Prep</Text>
          <Text style={styles.sub}>Your visit portal — register once, prepare every time.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <TouchableOpacity
              onPress={() => setMode("login")}
              style={[styles.tab, mode === "login" && styles.tabOn]}
            >
              <Text style={[styles.tabText, mode === "login" && styles.tabTextOn]}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMode("register")}
              style={[styles.tab, mode === "register" && styles.tabOn]}
            >
              <Text style={[styles.tabText, mode === "register" && styles.tabTextOn]}>
                Create account
              </Text>
            </TouchableOpacity>
          </View>

          {mode === "register" && (
            <>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Asha Patel"
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                keyboardType="numeric"
                placeholder="32"
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.label}>Gender</Text>
              <TextInput
                style={styles.input}
                value={gender}
                onChangeText={setGender}
                placeholder="female / male / other"
                placeholderTextColor={colors.muted}
              />
              <Text style={styles.label}>ABHA ID (optional)</Text>
              <TextInput
                style={styles.input}
                value={abhaId}
                onChangeText={setAbhaId}
                placeholder="14-digit health ID"
                placeholderTextColor={colors.muted}
              />
            </>
          )}

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="9876543210"
            placeholderTextColor={colors.muted}
          />

          {!!err && <Text style={styles.err}>{err}</Text>}

          <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>{mode === "login" ? "Continue" : "Create account"}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { flexGrow: 1, backgroundColor: colors.bg, padding: spacing.lg, justifyContent: "center" },
  brand: { alignItems: "center", marginBottom: spacing.lg },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  logoText: { color: "#fff", fontWeight: "800", fontSize: 28 },
  title: { fontSize: 28, fontWeight: "700", color: colors.text },
  sub: { color: colors.muted, marginTop: spacing.sm, textAlign: "center", lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.md,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: "center" },
  tabOn: { backgroundColor: colors.surface, elevation: 1 },
  tabText: { color: colors.muted, fontWeight: "600" },
  tabTextOn: { color: colors.primary },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.text,
    backgroundColor: "#fff",
    fontSize: 16,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  err: { color: colors.red, marginTop: 10, fontSize: 13 },
});
