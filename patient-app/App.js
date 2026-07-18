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
import * as DocumentPicker from "expo-document-picker";
import {
  startIntake,
  answerIntake,
  getQueueStatus,
  getSelfCareNote,
  uploadDocument,
} from "./src/api";

const SEV_COLOR = { red: "#f04438", amber: "#f79009", green: "#12b76a" };
const SEV_TEXT = {
  red: "URGENT — please tell the reception desk you've been flagged RED.",
  amber: "Priority — the doctor will see you soon.",
  green: "You're checked in. We'll keep you updated.",
};

// Registration steps the AI receptionist walks through before the medical part.
const REG_STEPS = [
  { key: "name", prompt: "Welcome to the clinic! I'm your intake assistant — I'll get you registered and make sure the doctor has everything ready. What's your full name?" },
  { key: "age", prompt: "Nice to meet you. How old are you?", keyboard: "numeric" },
  { key: "gender", prompt: "And how do you describe your gender? (male / female / other — whatever you prefer)" },
  { key: "phone", prompt: "What's a phone number we can reach you on? You can type 'skip' if you'd rather not share.", keyboard: "phone-pad" },
  { key: "complaint", prompt: "Thanks, you're all set. Now — what brings you in today? Describe it in your own words." },
];

export default function App() {
  const [messages, setMessages] = useState([{ role: "assistant", text: REG_STEPS[0].prompt }]);
  const [input, setInput] = useState("");
  const [regStep, setRegStep] = useState(0);
  const [profile, setProfile] = useState({});
  const [session, setSession] = useState(null);
  const [nodeId, setNodeId] = useState(null);
  const [severity, setSeverity] = useState("green");
  const [done, setDone] = useState(false);
  const [position, setPosition] = useState(null);
  const [live, setLive] = useState(true);
  const [docs, setDocs] = useState([]);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef(null);
  const recogRef = useRef(null);

  const say = (text) => setMessages((m) => [...m, { role: "assistant", text }]);
  const heard = (text) => setMessages((m) => [...m, { role: "patient", text }]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, done]);

  // Live queue position + doctor-approved note polling once intake completes.
  useEffect(() => {
    if (!done || !session) return;
    const poll = setInterval(async () => {
      try {
        const q = await getQueueStatus();
        setLive(q.live);
        const idx = q.entries.findIndex((e) => e.session_id === session);
        setPosition(idx >= 0 ? idx + 1 : null);
        if (!note) {
          const n = await getSelfCareNote(session);
          if (n && n.sent_to_patient) {
            setNote(n);
            say("Your doctor has approved a self-care note for you — it's shown below.");
          }
        }
      } catch {}
    }, 5000);
    return () => clearInterval(poll);
  }, [done, session, note]);

  async function handleSend(textOverride) {
    const text = (textOverride ?? input).trim();
    if (!text || busy) return;
    setInput("");
    heard(text);
    setBusy(true);
    try {
      if (regStep < REG_STEPS.length) {
        await handleRegistration(text);
      } else if (session && nodeId) {
        const r = await answerIntake(session, nodeId, text);
        setSeverity(r.severity);
        if (r.complete) {
          setDone(true);
          setNodeId(null);
          say("Thank you — that's everything I need. You're in the queue now. You can upload any prescriptions or reports below while you wait.");
        } else {
          setNodeId(r.node_id);
          say(r.question);
        }
      }
    } catch {
      say("Sorry, I couldn't reach the clinic server just now. Please try that again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegistration(text) {
    const step = REG_STEPS[regStep];
    const updated = { ...profile };
    if (step.key === "phone" && text.toLowerCase() === "skip") {
      updated.phone = null;
    } else if (step.key !== "complaint") {
      updated[step.key] = text;
    }
    setProfile(updated);

    if (step.key === "complaint") {
      const res = await startIntake(updated, text);
      setSession(res.session_id);
      setSeverity(res.severity);
      say(res.greeting);
      if (res.complete) {
        setDone(true);
        say("You're checked in and in the queue — details below.");
      } else {
        setNodeId(res.node_id);
        say(res.question);
      }
      setRegStep(regStep + 1);
      return;
    }

    const next = REG_STEPS[regStep + 1];
    setRegStep(regStep + 1);
    say(next.prompt);
  }

  // Voice input via the Web Speech API (available in Expo web / Chrome).
  function toggleVoice() {
    const SR = typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      say("Voice input isn't supported in this browser — please type instead.");
      return;
    }
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    const recog = new SR();
    recog.lang = "en-IN";
    recog.interimResults = false;
    recog.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setListening(false);
      handleSend(text);
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    setListening(true);
    recog.start();
  }

  async function pickAndUpload() {
    const res = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"] });
    if (res.canceled) return;
    const file = res.assets[0];
    setBusy(true);
    try {
      const uploaded = await uploadDocument(session, file);
      setDocs((d) => [...d, uploaded]);
      const pendingMsg = uploaded.fields?.length
        ? `I extracted ${uploaded.fields.length} fields from "${uploaded.filename}"${uploaded.low_confidence_count ? ` (${uploaded.low_confidence_count} flagged for the doctor to verify)` : ""}. It's been added to your record for the doctor.`
        : `"${uploaded.filename}" is uploaded and attached to your record — text extraction will finish shortly.`;
      say(pendingMsg);
    } catch {
      say("The upload didn't go through — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const voiceAvailable =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Hospital Visit Prep</Text>
        {session && (
          <View style={[styles.sevPill, { backgroundColor: SEV_COLOR[severity] }]}>
            <Text style={styles.sevPillText}>{severity.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {done && (
        <View style={styles.statusCard}>
          <Text style={styles.statusMain}>
            {position ? `#${position} in queue` : "Finding your place in the queue…"}
          </Text>
          <Text style={[styles.statusSub, { color: SEV_COLOR[severity] }]}>
            {SEV_TEXT[severity]}
          </Text>
          {!live && (
            <Text style={styles.paused}>Live updates paused — position shown may lag.</Text>
          )}
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView ref={scrollRef} style={styles.chat} contentContainerStyle={{ padding: 14 }}>
          {messages.map((m, i) => (
            <View
              key={i}
              style={[styles.bubble, m.role === "assistant" ? styles.aiBubble : styles.userBubble]}
            >
              <Text style={styles.bubbleWho}>
                {m.role === "assistant" ? "Clinic Assistant" : "You"}
              </Text>
              <Text style={styles.bubbleText}>{m.text}</Text>
            </View>
          ))}

          {done && (
            <View style={styles.uploadArea}>
              <TouchableOpacity style={styles.uploadBtn} onPress={pickAndUpload} disabled={busy}>
                <Text style={styles.btnText}>Upload prescription / report</Text>
              </TouchableOpacity>
              {docs.map((d) => (
                <View key={d.id} style={styles.docRow}>
                  <Text style={styles.docName}>{d.filename}</Text>
                  <Text style={styles.docMeta}>
                    {d.fields?.length || 0} fields · {d.low_confidence_count || 0} to verify
                  </Text>
                </View>
              ))}
              {note && (
                <View style={styles.noteCard}>
                  <Text style={styles.noteTitle}>Self-care note (doctor approved)</Text>
                  <Text style={styles.bubbleText}>{note.final_text || note.draft_text}</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {!done && (
          <View style={styles.inputRow}>
            {voiceAvailable ? (
              <TouchableOpacity
                style={[styles.micBtn, listening && styles.micOn]}
                onPress={toggleVoice}
              >
                <Text style={styles.btnText}>{listening ? "…" : "🎤"}</Text>
              </TouchableOpacity>
            ) : null}
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={listening ? "Listening…" : "Type your answer"}
              placeholderTextColor="#94969c"
              onSubmitEditing={() => handleSend()}
              editable={!busy}
              keyboardType={REG_STEPS[regStep]?.keyboard || "default"}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={() => handleSend()} disabled={busy}>
              <Text style={styles.btnText}>Send</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0c111d" },
  flex: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: "#f0f1f5", fontSize: 20, fontWeight: "700" },
  sevPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  sevPillText: { color: "white", fontWeight: "700", fontSize: 12 },
  statusCard: { backgroundColor: "#161b26", marginHorizontal: 14, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: "#333741" },
  statusMain: { color: "#f0f1f5", fontSize: 18, fontWeight: "700" },
  statusSub: { fontSize: 13, marginTop: 4 },
  paused: { color: "#f79009", fontSize: 12, marginTop: 6 },
  chat: { flex: 1 },
  bubble: { maxWidth: "82%", borderRadius: 14, padding: 10, marginBottom: 8 },
  aiBubble: { backgroundColor: "#1f242f", alignSelf: "flex-start" },
  userBubble: { backgroundColor: "#2e90fa", alignSelf: "flex-end" },
  bubbleWho: { color: "#94969c", fontSize: 11, fontWeight: "600", marginBottom: 2 },
  bubbleText: { color: "#f0f1f5", fontSize: 15, lineHeight: 21 },
  inputRow: { flexDirection: "row", padding: 10, gap: 8, alignItems: "center" },
  input: { flex: 1, backgroundColor: "#161b26", color: "#f0f1f5", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#333741" },
  sendBtn: { backgroundColor: "#2e90fa", borderRadius: 10, paddingHorizontal: 18,
    paddingVertical: 11 },
  micBtn: { backgroundColor: "#1f242f", borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, borderWidth: 1, borderColor: "#333741" },
  micOn: { backgroundColor: "#f04438" },
  btnText: { color: "white", fontWeight: "700" },
  uploadArea: { marginTop: 10 },
  uploadBtn: { backgroundColor: "#344054", borderRadius: 10, padding: 13, alignItems: "center" },
  docRow: { backgroundColor: "#161b26", borderRadius: 10, padding: 10, marginTop: 8 },
  docName: { color: "#f0f1f5", fontWeight: "600" },
  docMeta: { color: "#94969c", fontSize: 12, marginTop: 2 },
  noteCard: { backgroundColor: "#0f2b1d", borderColor: "#12b76a", borderWidth: 1,
    borderRadius: 10, padding: 12, marginTop: 10 },
  noteTitle: { color: "#12b76a", fontWeight: "700", marginBottom: 4 },
});
