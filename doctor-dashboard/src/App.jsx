import { useEffect, useState, useCallback } from "react";
import {
  getQueueStatus,
  getSessionDetail,
  getPendingNotes,
  approveNote,
  correctDocumentField,
  openQueueSocket,
} from "./api.js";

const SEV_LABEL = { red: "RED", amber: "AMBER", green: "GREEN" };

export default function App() {
  const [queue, setQueue] = useState({ live: false, banner: null, entries: [] });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState([]);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState("briefing");

  const refresh = useCallback(async () => {
    try {
      setQueue(await getQueueStatus());
      setNotes(await getPendingNotes());
    } catch {
      setQueue((q) => ({ ...q, live: false, banner: "backend unreachable" }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const ws = openQueueSocket((data) => {
      setQueue(data);
      setConnected(true);
    });
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    const poll = setInterval(refresh, 8000);
    return () => {
      ws.close();
      clearInterval(poll);
    };
  }, [refresh]);

  const selectPatient = useCallback(async (sessionId) => {
    setSelected(sessionId);
    setDetail(await getSessionDetail(sessionId));
    setTab("briefing");
  }, []);

  async function onApprove(noteId, edited) {
    await approveNote(noteId, "doctor-demo", edited);
    setNotes(await getPendingNotes());
    if (selected) setDetail(await getSessionDetail(selected));
  }

  async function onCorrectField(docId, name, value) {
    await correctDocumentField(docId, name, value);
    if (selected) setDetail(await getSessionDetail(selected));
  }

  const redCount = queue.entries.filter((e) => e.severity === "red").length;

  return (
    <div className="layout">
      <header>
        <div>
          <h1>Clinic Command — Doctor Dashboard</h1>
          <p className="sub">
            {queue.entries.length} waiting · {redCount} critical ·{" "}
            {notes.length} note{notes.length === 1 ? "" : "s"} awaiting approval
          </p>
        </div>
        <span className={`conn ${connected ? "on" : "off"}`}>
          {connected ? "live" : "polling"}
        </span>
      </header>

      {!queue.live && (
        <div className="banner paused">
          {queue.banner || "background auto-rescore paused — Redis/Celery offline"}
        </div>
      )}
      {redCount > 0 && (
        <div className="banner critical">
          {redCount} patient{redCount > 1 ? "s" : ""} flagged RED — deterministic
          rule engine escalation (cannot be downgraded by AI)
        </div>
      )}

      <div className="grid">
        <section className="queue">
          <h2>Priority Queue</h2>
          {queue.entries.length === 0 && <p className="muted">No patients waiting.</p>}
          {queue.entries.map((e, i) => (
            <button
              key={e.session_id}
              className={`qrow sev-${e.severity} ${selected === e.session_id ? "sel" : ""}`}
              onClick={() => selectPatient(e.session_id)}
            >
              <div className="qtop">
                <span className="rank">#{i + 1}</span>
                <span className="pname">{e.patient_name}</span>
                <span className={`pill sev-${e.severity}`}>{SEV_LABEL[e.severity]}</span>
              </div>
              <div className="qbottom">
                <span>{e.age ? `${e.age}y` : ""} {e.gender || ""}</span>
                <span className="complaint">{e.chief_complaint}</span>
                <span>score {e.priority_score}</span>
                <span>{e.minutes_waited} min</span>
                {e.document_count > 0 && <span className="docs">{e.document_count} doc(s)</span>}
                {e.auto_escalated && <span className="escalated">auto-escalated</span>}
              </div>
            </button>
          ))}
        </section>

        <section className="detail">
          {!detail && (
            <div className="empty">
              <h2>Select a patient</h2>
              <p className="muted">
                Click a queue entry to see their profile, the AI intake conversation,
                uploaded documents, and the pre-visit briefing.
              </p>
            </div>
          )}

          {detail && (
            <div>
              <div className="profile-card">
                <div>
                  <h2>{detail.patient.name}</h2>
                  <p className="muted">
                    {detail.patient.age ? `${detail.patient.age} yrs` : "age n/a"} ·{" "}
                    {detail.patient.gender || "gender n/a"} ·{" "}
                    {detail.patient.phone || "no phone"} ·{" "}
                    ABHA: {detail.patient.abha_id || "not linked"}
                  </p>
                  <p className="muted">
                    Registered {new Date(detail.patient.registered_at + "Z").toLocaleTimeString()} ·
                    Complaint: <b>{detail.chief_complaint}</b> ·
                    Intake {detail.completed ? "complete" : "in progress"}
                  </p>
                </div>
                <span className={`pill big sev-${detail.severity}`}>
                  {SEV_LABEL[detail.severity]}
                </span>
              </div>

              <nav className="tabs">
                {["briefing", "conversation", "documents", "symptoms", "escalations", "self-care"].map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "tab on" : "tab"}
                    onClick={() => setTab(t)}
                  >
                    {t}
                    {t === "documents" && detail.documents.length > 0 && ` (${detail.documents.length})`}
                  </button>
                ))}
              </nav>

              {tab === "briefing" && <BriefingTab briefing={detail.briefing} />}
              {tab === "conversation" && <ConversationTab transcript={detail.transcript} />}
              {tab === "documents" && (
                <DocumentsTab documents={detail.documents} onCorrect={onCorrectField} />
              )}
              {tab === "symptoms" && <SymptomsTab symptoms={detail.symptoms} />}
              {tab === "escalations" && <EscalationsTab escalations={detail.escalations} />}
              {tab === "self-care" && (
                <SelfCareTab note={detail.self_care_note} notes={notes} onApprove={onApprove} />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function BriefingTab({ briefing }) {
  if (!briefing) {
    return <p className="muted">Briefing is generated when the intake conversation completes.</p>;
  }
  return (
    <div>
      <h3>Structured summary (deterministic)</h3>
      <ul>
        {Object.entries(briefing.structured_summary).map(([k, v]) => (
          <li key={k}>
            <b>{k}:</b> {Array.isArray(v) ? v.join(", ") : String(v)}
          </li>
        ))}
      </ul>
      <h3>AI paraphrase for doctor</h3>
      {briefing.paraphrase_status !== "ready" ? (
        <p className="pending">{briefing.paraphrase_status} (LLM unavailable — structured data above is complete)</p>
      ) : (
        <p>{briefing.paraphrased_prose}</p>
      )}
    </div>
  );
}

function ConversationTab({ transcript }) {
  if (!transcript?.length) return <p className="muted">No conversation recorded.</p>;
  return (
    <div className="chat">
      {transcript.map((m, i) => (
        <div key={i} className={`bubble ${m.role}`}>
          <span className="who">{m.role === "assistant" ? "AI Intake" : "Patient"}</span>
          <p>{m.text}</p>
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({ documents, onCorrect }) {
  if (!documents.length) {
    return <p className="muted">No documents uploaded by the patient yet.</p>;
  }
  return (
    <div>
      {documents.map((d) => (
        <div key={d.id} className="doc-card">
          <div className="doc-head">
            <b>{d.filename}</b>
            <span className="muted">{d.doc_type} · source: {d.source}</span>
            {d.low_confidence_count > 0 && (
              <span className="lowconf">{d.low_confidence_count} low-confidence field(s) — verify</span>
            )}
          </div>
          {d.fields.length === 0 && (
            <p className="pending">Extraction pending — OCR provider unavailable.</p>
          )}
          {d.fields.map((f) => (
            <FieldRow key={f.name + f.value} docId={d.id} field={f} onCorrect={onCorrect} />
          ))}
        </div>
      ))}
    </div>
  );
}

function FieldRow({ docId, field, onCorrect }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(field.value);
  return (
    <div className={`field-row ${field.low_confidence ? "low" : ""}`}>
      <span className="fname">{field.name}</span>
      {editing ? (
        <>
          <input value={value} onChange={(e) => setValue(e.target.value)} />
          <button
            className="mini"
            onClick={() => {
              onCorrect(docId, field.name, value);
              setEditing(false);
            }}
          >
            Save
          </button>
        </>
      ) : (
        <>
          <span className="fvalue">{field.value}</span>
          <span className="conf">{Math.round(field.confidence * 100)}%</span>
          {field.low_confidence && (
            <button className="mini" onClick={() => setEditing(true)}>Correct</button>
          )}
        </>
      )}
    </div>
  );
}

function SymptomsTab({ symptoms }) {
  if (!symptoms.length) return <p className="muted">No symptoms recorded yet.</p>;
  return (
    <table className="table">
      <thead>
        <tr><th>Patient said</th><th>Mapped term</th><th>ICD-10</th><th>Source</th></tr>
      </thead>
      <tbody>
        {symptoms.map((s, i) => (
          <tr key={i}>
            <td>{s.raw_phrase}</td>
            <td>{s.canonical_term || "—"}</td>
            <td>{s.icd10_code || "—"}</td>
            <td>
              <span className={`src ${s.source === "local_table" ? "local" : "llm"}`}>
                {s.source || "unmapped"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EscalationsTab({ escalations }) {
  if (!escalations.length) return <p className="muted">No escalations for this visit.</p>;
  return (
    <div>
      {escalations.map((e, i) => (
        <div key={i} className="esc-row">
          <span className={`pill sev-${e.from_severity || "green"}`}>{e.from_severity || "—"}</span>
          <span className="arrow">→</span>
          <span className={`pill sev-${e.to_severity}`}>{e.to_severity}</span>
          <span className="muted">rule: {e.rule_id || "n/a"} · {e.reason}</span>
        </div>
      ))}
      <p className="muted note-line">
        Escalations are one-way by design — no AI output can lower a severity level.
      </p>
    </div>
  );
}

function SelfCareTab({ note, notes, onApprove }) {
  const pendingForSession = note && note.approval_status === "pending" ? note : null;
  return (
    <div>
      {!note && (
        <p className="muted">
          No self-care note drafted for this visit (LLM unavailable, or intake incomplete).
        </p>
      )}
      {note && !pendingForSession && (
        <div>
          <p><b>Status:</b> {note.approval_status} {note.sent_to_patient ? "· sent to patient" : "· not sent"}</p>
          <p>{note.final_text || note.draft_text}</p>
        </div>
      )}
      {pendingForSession && <NoteCard note={pendingForSession} onApprove={onApprove} />}
      {notes.length > 0 && (
        <>
          <h3>All notes awaiting approval ({notes.length})</h3>
          {notes.map((n) => <NoteCard key={n.id} note={n} onApprove={onApprove} />)}
        </>
      )}
    </div>
  );
}

function NoteCard({ note, onApprove }) {
  const [text, setText] = useState(note.draft_text);
  const edited = text !== note.draft_text;
  return (
    <div className="note">
      <p className="muted">session {note.session_id.slice(0, 8)} · drafted by AI, doctor-gated</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      <div className="note-actions">
        <button onClick={() => onApprove(note.id, edited ? text : null)}>
          {edited ? "Save & approve" : "Approve"}
        </button>
      </div>
    </div>
  );
}
