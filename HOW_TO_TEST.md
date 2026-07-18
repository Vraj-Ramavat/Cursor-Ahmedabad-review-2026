# How to test Clinic Prep (patient + doctor)

## URLs

| App | URL |
|---|---|
| Patient portal | http://localhost:8090 |
| Doctor dashboard | http://localhost:5173 |
| API docs | http://localhost:8000/docs |

## Start everything

```powershell
# Backend
cd C:\Users\YUVRAJ\Projects\ai-hospital-visit-prep\backend
..\ .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Doctor dashboard
cd ..\doctor-dashboard
npm run dev

# Patient app (web)
cd ..\patient-app
npx expo start --web --port 8090
```

## End-to-end test (accounts connected)

1. Open **Patient portal** → Create account (name + phone).
2. **Visit** tab → describe complaint (try `chest pain`) → answer AI questions.
3. Watch severity pill turn **RED** for cardiac red flags.
4. Open **Doctor dashboard** → same patient appears in priority queue with name/age.
5. Click patient → see **conversation**, profile, symptoms, escalations.
6. **Docs** tab on patient app → Scan / Gallery upload (needs active visit).
7. **Meals** tab → set diet/conditions → Generate 3-day Eatvisor plan.
8. Doctor can approve self-care notes when LLM key is set; otherwise briefing shows `pending — retry`.

## Demo accounts (after seeding)

- Phone `9876543210` — Asha Patel (chest pain → red)
- Phone `9812345678` — Ravi Kumar (fever → amber)
