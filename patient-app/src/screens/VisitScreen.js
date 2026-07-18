import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { answerIntake, getQueueStatus, startIntake } from "../api";
import { cardShadow, colors, radius, sevColor, sevText, spacing } from "../theme";

export default function VisitScreen({ account, visit, onVisitChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(visit?.sessionId || null);
  const [nodeId, setNodeId] = useState(visit?.nodeId || null);
  const [severity, setSeverity] = useState(visit?.severity || "green");
  const [complaint, setComplaint] = useState(visit?.complaint || "");
  const [position, setPosition] = useState(null);
  const [live, setLive] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!visit?.sessionId) return;
    setSessionId(visit.sessionId);
    setNodeId(visit.nodeId);
    setSeverity(visit.severity || "green");
    setComplaint(visit.complaint || "");
    if (visit.complete) {
      setPhase("done");
      if (messages.length === 0 && visit.messages?.length) setMessages(visit.messages);
    } else if (visit.nodeId || visit.complaint) {
      setPhase("intake");
    }
  }, [visit?.sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useEffect(() => {
    if (phase !== "done" || !sessionId) return;
    const poll = setInterval(async () => {
      try {
        const q = await getQueueStatus();
        setLive(q.live);
        const idx = q.entries.findIndex((e) => e.session_id === sessionId);
        setPosition(idx >= 0 ? idx + 1 : null);
      } catch {}
    }, 8000);
    return () => clearInterval(poll);
  }, [phase, sessionId]);

  function say(text) {
    setMessages((m) => [...m, { role: "assistant", text }]);
  }

  function heard(text) {
    setMessages((m) => [...m, { role: "patient", text }]);
  }

  function syncVisit(patch) {
    onVisitChange((prev) => ({
      ...(prev || {}),
      sessionId,
      nodeId,
      severity,
      complaint,
      ...patch,
    }));
  }

  function beginVisit() {
    setMessages([]);
    setPhase("complaint");
    const first = account?.name?.split(/\s+/)[0] || "there";
    say(
      `Hi ${first}, I'm the clinic AI nurse. I'll ask just a few short questions so the doctor is ready — this is not a diagnosis. What brings you in today?`,
    );
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    heard(text);
    setBusy(true);

    try {
      if (phase === "complaint") {
        setComplaint(text);
        const res = await startIntake(account, text);
        setSessionId(res.session_id);
        setSeverity(res.severity);
        setPhase("intake");
        say(res.greeting);
        if (res.complete) {
          setPhase("done");
          setNodeId(null);
          say("Thank you — you're checked in and in the queue.");
          syncVisit({
            sessionId: res.session_id,
            nodeId: null,
            severity: res.severity,
            complaint: text,
            complete: true,
          });
        } else {
          setNodeId(res.node_id);
          say(res.question);
          syncVisit({
            sessionId: res.session_id,
            nodeId: res.node_id,
            severity: res.severity,
            complaint: text,
            complete: false,
          });
        }
      } else if (phase === "intake" && sessionId && nodeId) {
        const res = await answerIntake(sessionId, nodeId, text);
        setSeverity(res.severity);
        if (res.complete) {
          setPhase("done");
          setNodeId(null);
          say("Thank you — that's everything. You're in the queue now.");
          syncVisit({ nodeId: null, severity: res.severity, complete: true });
        } else {
          setNodeId(res.node_id);
          if (res.acknowledgement) say(res.acknowledgement);
          say(res.question);
          syncVisit({ nodeId: res.node_id, severity: res.severity, complete: false });
        }
      }
    } catch (e) {
      say(e.message || "Couldn't reach the clinic server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function resetVisit() {
    setMessages([]);
    setSessionId(null);
    setNodeId(null);
    setSeverity("green");
    setComplaint("");
    setPhase("idle");
    setPosition(null);
    onVisitChange(null);
  }

  const chatting = phase === "complaint" || phase === "intake";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Visit intake</Text>
        {sessionId && (
          <View style={[styles.pill, { backgroundColor: sevColor[severity] }]}>
            <Text style={styles.pillText}>{severity.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {phase === "done" && (
        <View style={styles.statusCard}>
          <Text style={styles.statusMain}>
            {position ? `#${position} in queue` : "Finding your place in the queue…"}
          </Text>
          <Text style={[styles.statusSub, { color: sevColor[severity] }]}>
            {sevText[severity]}
          </Text>
          {!live && <Text style={styles.paused}>Live updates paused.</Text>}
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.chatCard}>
          {phase === "idle" ? (
            <View style={styles.idle}>
              <Text style={styles.idleTitle}>Ready to check in?</Text>
              <Text style={styles.idleSub}>
                We'll ask a few questions so your doctor has everything ready. This is not a
                diagnosis — just visit preparation.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={beginVisit}>
                <Text style={styles.primaryBtnText}>Start new visit</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={styles.chatScroll}
              contentContainerStyle={styles.chatContent}
            >
              {messages.map((m, i) => (
                <View
                  key={i}
                  style={[
                    styles.bubble,
                    m.role === "assistant" ? styles.aiBubble : styles.userBubble,
                  ]}
                >
                  <Text style={[styles.bubbleWho, m.role === "patient" && styles.bubbleWhoLight]}>
                    {m.role === "assistant" ? "Assistant" : "You"}
                  </Text>
                  <Text style={[styles.bubbleText, m.role === "patient" && styles.bubbleTextLight]}>
                    {m.text}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          {chatting && (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Type your answer…"
                placeholderTextColor={colors.muted}
                onSubmitEditing={handleSend}
                editable={!busy}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendBtn, busy && styles.sendDisabled]}
                onPress={handleSend}
                disabled={busy}
              >
                <Text style={styles.sendText}>Send</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === "done" && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={resetVisit}>
              <Text style={styles.secondaryBtnText}>Start another visit</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, padding: spacing.md },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  statusCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  statusMain: { fontSize: 18, fontWeight: "700", color: colors.text },
  statusSub: { fontSize: 13, marginTop: 4 },
  paused: { color: colors.amber, fontSize: 12, marginTop: 6 },
  chatCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...cardShadow,
  },
  idle: { flex: 1, padding: spacing.lg, justifyContent: "center" },
  idleTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  idleSub: { color: colors.muted, marginTop: spacing.sm, lineHeight: 22 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
  },
  secondaryBtnText: { color: colors.primary, fontWeight: "600" },
  chatScroll: { flex: 1 },
  chatContent: { padding: spacing.md },
  bubble: { maxWidth: "85%", borderRadius: radius.md, padding: 10, marginBottom: 8 },
  aiBubble: { backgroundColor: colors.primarySoft, alignSelf: "flex-start" },
  userBubble: { backgroundColor: colors.primary, alignSelf: "flex-end" },
  bubbleWho: { color: colors.muted, fontSize: 10, fontWeight: "600", marginBottom: 2 },
  bubbleWhoLight: { color: "rgba(255,255,255,0.8)" },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  bubbleTextLight: { color: "#fff" },
  inputRow: {
    flexDirection: "row",
    padding: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    maxHeight: 100,
    backgroundColor: colors.bg,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  sendDisabled: { opacity: 0.6 },
  sendText: { color: "#fff", fontWeight: "700" },
});
