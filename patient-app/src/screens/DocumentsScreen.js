import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadDocument } from "../api";
import { cardShadow, colors, radius, spacing } from "../theme";

const DOC_TYPES = [
  { key: "prescription", label: "Prescription" },
  { key: "lab_report", label: "Lab report" },
  { key: "imaging", label: "Imaging" },
];

export default function DocumentsScreen({ sessionId }) {
  const [docType, setDocType] = useState("prescription");
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to upload documents.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) {
      await doUpload(result.assets[0]);
    }
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access to scan documents.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) {
      await doUpload(result.assets[0]);
    }
  }

  async function doUpload(asset) {
    if (!sessionId) return;
    setErr("");
    setBusy(true);
    try {
      const uploaded = await uploadDocument(
        sessionId,
        {
          uri: asset.uri,
          name: asset.fileName || `scan-${Date.now()}.jpg`,
          mimeType: asset.mimeType || "image/jpeg",
        },
        docType,
      );
      setDocs((d) => [...d, uploaded]);
      if (!uploaded.fields?.length) {
        setErr(
          "No fields extracted yet — handwritten scripts can be hard to read. Try a brighter photo, crop close to the writing, or ask the doctor to correct fields on their dashboard.",
        );
      }
    } catch (e) {
      setErr(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  if (!sessionId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No active visit</Text>
          <Text style={styles.emptySub}>
            Start a visit on the Visit tab first, then upload prescriptions or reports here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>Documents</Text>
        <Text style={styles.sub}>Upload prescriptions, lab reports, or imaging for your visit.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Document type</Text>
          <View style={styles.typeRow}>
            {DOC_TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.typeChip, docType === t.key && styles.typeChipOn]}
                onPress={() => setDocType(t.key)}
              >
                <Text style={[styles.typeChipText, docType === t.key && styles.typeChipTextOn]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btn} onPress={pickFromGallery} disabled={busy}>
              <Text style={styles.btnText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnOutline} onPress={pickFromCamera} disabled={busy}>
              <Text style={styles.btnOutlineText}>
                {Platform.OS === "web" ? "Scan / Camera" : "Camera"}
              </Text>
            </TouchableOpacity>
          </View>

          {busy && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />}
          {!!err && <Text style={styles.err}>{err}</Text>}
        </View>

        {docs.length > 0 && (
          <>
            <Text style={styles.section}>Uploaded ({docs.length})</Text>
            {docs.map((d) => (
              <View key={d.id} style={styles.docCard}>
                <Text style={styles.docName}>{d.filename}</Text>
                <Text style={styles.docMeta}>
                  {d.doc_type} · {d.fields?.length || 0} fields extracted
                  {d.low_confidence_count ? ` · ${d.low_confidence_count} to verify` : ""}
                </Text>
                {d.fields?.length > 0 && (
                  <View style={styles.fields}>
                    {d.fields.map((f, i) => (
                      <View key={i} style={styles.fieldRow}>
                        <Text style={styles.fieldName}>{f.name}</Text>
                        <Text style={[styles.fieldValue, f.low_confidence && styles.fieldWarn]}>
                          {f.value}
                          {f.low_confidence ? " ⚠" : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  sub: { color: colors.muted, marginTop: 4, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600", marginBottom: spacing.sm },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  typeChipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  typeChipText: { color: colors.muted, fontWeight: "600", fontSize: 13 },
  typeChipTextOn: { color: colors.primary },
  btnRow: { flexDirection: "row", gap: spacing.sm },
  btn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700" },
  btnOutline: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnOutlineText: { color: colors.primary, fontWeight: "700" },
  err: { color: colors.red, marginTop: spacing.sm, fontSize: 13 },
  section: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  docCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  docName: { fontWeight: "700", color: colors.text, fontSize: 15 },
  docMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  fields: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  fieldRow: { marginBottom: 6 },
  fieldName: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  fieldValue: { color: colors.text, fontSize: 14 },
  fieldWarn: { color: colors.amber },
  emptyWrap: { flex: 1, justifyContent: "center", padding: spacing.xl, alignItems: "center" },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  emptySub: { color: colors.muted, textAlign: "center", marginTop: spacing.sm, lineHeight: 22 },
});
