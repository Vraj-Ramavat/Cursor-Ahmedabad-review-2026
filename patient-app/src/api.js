// Point this at your machine's LAN IP when testing on a physical device.
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || "http://localhost:8000";

export async function startIntake(profile, chiefComplaint) {
  const res = await fetch(`${API_BASE}/api/intake/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patient_name: profile.name,
      age: profile.age ? Number(profile.age) : null,
      gender: profile.gender || null,
      phone: profile.phone || null,
      chief_complaint: chiefComplaint,
    }),
  });
  return res.json();
}

export async function answerIntake(sessionId, nodeId, answer) {
  const res = await fetch(`${API_BASE}/api/intake/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, node_id: nodeId, answer }),
  });
  return res.json();
}

export async function getQueueStatus() {
  const res = await fetch(`${API_BASE}/api/queue/status`);
  return res.json();
}

export async function getSelfCareNote(sessionId) {
  const res = await fetch(`${API_BASE}/api/self-care/session/${sessionId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function uploadDocument(sessionId, file, docType = "prescription") {
  const form = new FormData();
  form.append("session_id", sessionId);
  form.append("doc_type", docType);
  if (file.file) {
    // Web: DocumentPicker gives us a real File object.
    form.append("file", file.file, file.name || "upload.jpg");
  } else {
    form.append("file", {
      uri: file.uri,
      name: file.name || "upload.jpg",
      type: file.mimeType || "image/jpeg",
    });
  }
  const res = await fetch(`${API_BASE}/api/documents/upload`, {
    method: "POST",
    body: form,
  });
  return res.json();
}
