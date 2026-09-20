# Money Pulse — full stack

Two folders:
- **money-pulse-backend/** — FastAPI server: Google login, and permanent storage for your financial numbers, tracked items, and simulation history.
- **money-pulse-extension/** — the Chrome extension, now backed entirely by that server instead of local browser storage.

## Run order

1. **Backend first.** Follow `money-pulse-backend/README.md` — get a Google OAuth client, fill `.env`, then:
   ```bash
   cd money-pulse-backend
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```
   Leave this running.

2. **Then the extension.** `chrome://extensions` → Developer mode → **Load unpacked** → select `money-pulse-extension`.

3. Click the Money Pulse icon → **Continue with Google**. A tab opens for the login, and the extension picks up the session automatically once you approve.

## What changed from the local-only build

- Your numbers, tracked items, and simulation history now live in the backend's SQLite database, tied to your Google account — reinstall the extension, or use it from a different Chrome profile signed into the same backend, and it's all still there.
- The pulse chart, forecast, and what-if simulator are computed server-side (`app/forecasting.py`) rather than in the browser — this also matches the architecture in your original concept doc (client → API → forecasting engine).
- The on-page badge now shows "Sign in to see purchase risk" instead of a real number until you're logged in.

## Hosting it on Render (so you don't need a terminal open)

See **DEPLOY-RENDER.md**. The extension needs no file edits — you paste your
Render URL into its "Backend URL" box and hit Save, which also tests the
connection for you.

## Known limits, worth stating upfront if you're pitching this

- `GOOGLE_CLIENT_ID`/`SECRET` are yours to create — nothing works until you do the 2-minute Google Cloud Console setup in the backend README.
- The backend runs on `localhost:8000` by default. For a real deploy (so it's not tied to your laptop being on), it needs hosting — see "Deploying beyond localhost" in the backend README.
- Still no real bank connection — the numbers are what you type into "Edit numbers", not a live account balance.
