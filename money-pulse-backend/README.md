# Money Pulse — backend

FastAPI + SQLite, with Google login. This is what the extension now talks to
for everything: your financial numbers, tracked items, and simulation history
are stored here instead of only in the browser, so they follow you across
devices once you're signed in.

## 1. Get a Google OAuth client (one-time, ~2 minutes)

1. Go to https://console.cloud.google.com/apis/credentials (create a project if you don't have one).
2. **Create Credentials → OAuth client ID → Application type: Web application**.
3. Under **Authorized redirect URIs**, add: `http://localhost:8000/auth/google/callback`
4. Copy the generated **Client ID** and **Client secret**.
5. If prompted to configure the OAuth consent screen, choose **External**, fill in the app name, and add your own Google account as a test user (this keeps it free and out of Google's review process while you're just demoing).

## 2. Configure the server

```bash
cd money-pulse-backend
cp .env.example .env
# open .env and paste in GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, set JWT_SECRET to any random string
```

## 3. Install and run

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The first run creates `money_pulse.db` (SQLite) next to the app — that's your
"memory": user accounts, financial profile, tracked items, and simulation
history all live there. Delete the file to reset everything.

## 4. Point the extension at it

The extension is already configured to call `http://localhost:8000`. Load it
unpacked, click the Money Pulse icon, and hit **Continue with Google** — it
opens this server's login page, and once you approve, the extension picks up
a session automatically.

## API surface

| Method | Path | What it does |
|---|---|---|
| GET | `/auth/google/login` | Starts the Google OAuth flow |
| GET | `/auth/google/callback` | Google redirects here; issues a session token |
| GET | `/api/me` | Current signed-in user |
| GET/PUT | `/api/profile` | Your balance/salary/rent/EMI/expense numbers |
| GET | `/api/forecast` | 7/14/21-day forecast, stress index, balance series |
| POST | `/api/whatif` | Purchase risk simulation |
| GET/POST/DELETE | `/api/tracked` | Tracked product items |
| GET/POST/DELETE | `/api/history` | Recent simulation log |

All `/api/*` routes require `Authorization: Bearer <token>`, the token you
get back from the login flow.

## Deploying beyond localhost

If you host this somewhere (Render, Railway, a VM), update:
- `BASE_URL` in `.env` to your real domain
- The Google Cloud OAuth client's Authorized redirect URI to match
- `MP_API_BASE` in the extension's `api.js` to point at the new URL
- `DATABASE_URL` to a real Postgres instance if you want it to survive redeploys (SQLite is fine for a demo)
