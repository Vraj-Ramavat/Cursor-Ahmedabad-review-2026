import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getQueueStatus } from "../api";
import { cardShadow, colors, radius, sevColor, sevText, spacing } from "../theme";

export default function HomeScreen({ account, visit, onNavigate }) {
  const [position, setPosition] = useState(null);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(false);

  const firstName = account?.name?.split(" ")[0] || "there";
  const hasActiveVisit = visit?.sessionId && !visit?.complete;

  useEffect(() => {
    if (!visit?.sessionId) return;
    let cancelled = false;

    async function poll() {
      setLoading(true);
      try {
        const q = await getQueueStatus();
        if (cancelled) return;
        setLive(q.live);
        const idx = q.entries.findIndex((e) => e.session_id === visit.sessionId);
        setPosition(idx >= 0 ? idx + 1 : null);
      } catch {
        /* queue may be empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    poll();
    const id = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [visit?.sessionId]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.greeting}>Hello, {firstName}</Text>
        <Text style={styles.sub}>Welcome to your clinic visit portal</Text>

        {visit?.sessionId ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Active visit</Text>
              <View style={[styles.pill, { backgroundColor: sevColor[visit.severity] || colors.green }]}>
                <Text style={styles.pillText}>{(visit.severity || "green").toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.complaint}>{visit.complaint || "Visit in progress"}</Text>
            {visit.complete ? (
              <>
                <Text style={styles.queueMain}>
                  {loading && position == null
                    ? "Checking queue…"
                    : position
                      ? `#${position} in queue`
                      : "In queue — position updating"}
                </Text>
                <Text style={[styles.queueSub, { color: sevColor[visit.severity] }]}>
                  {sevText[visit.severity] || sevText.green}
                </Text>
                {!live && (
                  <Text style={styles.paused}>Live updates paused — position may lag.</Text>
                )}
              </>
            ) : (
              <Text style={styles.hint}>Intake in progress — finish questions on the Visit tab.</Text>
            )}
          </View>
        ) : (
          <View style={[styles.card, styles.emptyCard]}>
            <Text style={styles.cardTitle}>No active visit</Text>
            <Text style={styles.hint}>Start a visit to check in and join the queue.</Text>
          </View>
        )}

        <Text style={styles.section}>Quick actions</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.action} onPress={() => onNavigate("visit")}>
            <Text style={styles.actionIcon}>🏥</Text>
            <Text style={styles.actionLabel}>Start visit</Text>
            <Text style={styles.actionSub}>Begin intake chat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.action, !visit?.sessionId && styles.actionDisabled]}
            onPress={() => visit?.sessionId && onNavigate("documents")}
            disabled={!visit?.sessionId}
          >
            <Text style={styles.actionIcon}>📄</Text>
            <Text style={styles.actionLabel}>Scan Rx</Text>
            <Text style={styles.actionSub}>Upload prescription</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.action} onPress={() => onNavigate("meals")}>
            <Text style={styles.actionIcon}>🥗</Text>
            <Text style={styles.actionLabel}>Meal plan</Text>
            <Text style={styles.actionSub}>Personalized meals</Text>
          </TouchableOpacity>
        </View>

        {hasActiveVisit && loading && (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { padding: spacing.lg, paddingBottom: spacing.xl },
  greeting: { fontSize: 28, fontWeight: "700", color: colors.text },
  sub: { color: colors.muted, marginTop: 4, marginBottom: spacing.lg },
  section: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  emptyCard: { borderStyle: "dashed" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  complaint: { color: colors.text, marginTop: spacing.sm, fontSize: 15, lineHeight: 22 },
  queueMain: { fontSize: 20, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  queueSub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  paused: { color: colors.amber, fontSize: 12, marginTop: spacing.sm },
  hint: { color: colors.muted, marginTop: spacing.sm, lineHeight: 20 },
  actions: { gap: spacing.sm },
  action: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  actionDisabled: { opacity: 0.5 },
  actionIcon: { fontSize: 24, marginBottom: 4 },
  actionLabel: { fontSize: 16, fontWeight: "700", color: colors.text },
  actionSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
