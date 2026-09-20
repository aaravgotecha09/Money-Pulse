# Money Pulse — Chrome extension

Now talks to the `money-pulse-backend` server for everything — see the
top-level README for run order. This folder is just the client.

## Load it
1. Get the backend running first (`../money-pulse-backend/README.md`).
2. Go to `chrome://extensions`, turn on **Developer mode** (top right).
3. Click **Load unpacked** → select this `money-pulse-extension` folder.
4. Click the Money Pulse icon → **Continue with Google**.

## What's real vs. simulated
- Your numbers, tracked items, and history are stored in the backend's database once you sign in — not in the browser. No bank is connected; you still enter balance/salary/rent/EMI/expense yourself under "Edit numbers".
- The pulse line in the hero card is a **real chart** of your actual projected daily balance over the next 21 days, with dots marking salary/rent/EMI days and a dashed line at ₹0.
- The on-page badge works on Amazon, Flipkart, and Myntra product pages: it finds the price, calls the backend's what-if model, and shows a Low/Medium/High risk pill. Click it for the breakdown, and "+ Add to Money Pulse" saves the item to **Tracked items** in the popup. If you're not signed in, the badge says so instead of guessing.
- **Tracked items** lets you collect several products and "Simulate buying all" for their combined risk.
- **Recent simulations** keeps your last few what-if checks.
- Price detection layers several known selectors per site plus a generic ₹-text scan as a fallback, and re-scans on DOM and URL changes so it survives Flipkart/Amazon's client-side navigation. Still best-effort — sites redesign often.

## Files
- `api.js` — talks to the backend (`MP_API_BASE`, currently `http://localhost:8000`)
- `popup.js` / `popup.html` / `popup.css` — the dashboard
- `content.js` / `content.css` — the on-page badge
- `auth-bridge.js` — runs only on the backend's post-login page to hand the session token to the extension
- `background.js` — service worker that stores the token and opens the login tab

## Where the real version would still differ
Swap the manual "Edit numbers" form for India's Account Aggregator flow
(Setu/Finvu/OneMoney) — consent-based bank data pull, no passwords, solves
the cold-start problem from day one. The forecast math in
`app/forecasting.py` on the backend is a transparent heuristic for the demo;
a real build replaces it with the time-series/regression model from your doc.
