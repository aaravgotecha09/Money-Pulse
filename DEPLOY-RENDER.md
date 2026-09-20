# Deploying the backend on Render (free)

The extension stays exactly as it is — you never edit a file. You paste your
Render URL into the extension's own "Backend URL" box once.

---

## 1. Push the backend to GitHub

Create an empty repo on GitHub, then push **the `money-pulse-backend` folder**
(not the whole project — Render needs `requirements.txt` at the repo root).

```bash
cd money-pulse-backend
git init
git add .
git commit -m "Money Pulse backend"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/money-pulse-backend.git
git push -u origin main
```

`.gitignore` already excludes `.env` and `*.db`. Run `git status` before
committing and confirm `.env` is **not** in the list — that file has your
Google client secret in it.

## 2. Create the Render service

1. Sign up at https://render.com (free, GitHub login is easiest).
2. **New → Web Service** → connect your GitHub account → pick the repo.
3. Render reads `render.yaml` and fills most of it in. Confirm:
   - **Runtime**: Python
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance type**: Free
4. Click **Create Web Service**. First build takes ~2–4 minutes.

Render gives you a URL like `https://money-pulse-api.onrender.com`. Copy it.

## 3. Set environment variables

In the service → **Environment** tab → add:

| Key | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
| `JWT_SECRET` | any long random string (Render can generate one) |
| `BASE_URL` | your Render URL — **no trailing slash** |

Save. Render redeploys automatically.

## 4. Check it worked

Open your Render URL in a browser. You should see:

```json
{"status":"ok","service":"Money Pulse API","googleConfigured":true,"baseUrl":"https://money-pulse-api.onrender.com"}
```

- `googleConfigured: false` → your Google env vars didn't save.
- `baseUrl` showing `localhost` → you forgot `BASE_URL`.

## 5. Tell Google about the new URL

Google Cloud Console → **Google Auth Platform → Clients** → your OAuth client →
**Authorised redirect URIs** → **+ Add URI**:

```
https://YOUR-APP.onrender.com/auth/google/callback
```

Keep the localhost one too if you still want to test locally. Save.

## 6. Point the extension at it

No file editing. In Chrome:

1. Click the Money Pulse icon.
2. In the **Backend URL** box, paste your Render URL.
3. Click **Save** — it pings the server and tells you "Connected ✓" or what's wrong.
4. Click **Continue with Google**.

The manifest already allows any `*.onrender.com` address, so this just works.

---

## Things specific to Render's free tier

**It sleeps.** After ~15 minutes with no traffic, the free instance spins down.
The next request takes 30–60 seconds to wake it. So the first time you open the
extension after a break, it may look broken — hit Save on the Backend URL box,
wait for "Connected ✓", then sign in.

**SQLite resets on redeploy.** The free tier has no persistent disk, so your
data is wiped whenever Render rebuilds (including on every git push). For a few
days of testing that's usually fine. To keep data:

1. Render → **New → Postgres** (free tier available).
2. Copy its **Internal Database URL**.
3. Add it to your web service's environment as `DATABASE_URL`.

No code changes needed — the backend already handles Postgres, including
rewriting Render's `postgres://` prefix to the `postgresql://` form SQLAlchemy
requires.

## Common errors

**`redirect_uri_mismatch`** — the URI in Google Console doesn't exactly match
what the server sends. Check `BASE_URL` has no trailing slash, and that the
Console entry ends in `/auth/google/callback`.

**`Access blocked: app not verified`** — Google Auth Platform → **Audience** →
**Test users** → add your own Gmail.

**Extension says "Couldn't reach it"** — either the URL is wrong, or the free
instance is asleep. Wait a minute and hit Save again.

**Login completes but the extension still shows the sign-in screen** — the tab
that says "Signed in ✓" should close by itself. If it doesn't, your URL isn't
an `onrender.com` address, and the auth-bridge script won't run on it. Custom
domains need adding to `manifest.json` under both `host_permissions` and the
second `content_scripts` entry.
