// Money Pulse API client.
// The backend URL is NOT hardcoded — you paste it into the extension's own
// "Server" box once (popup -> Server), and it's stored in chrome.storage.
// Falls back to localhost so the local setup still works with no config.
const MP_DEFAULT_API_BASE = "http://localhost:8000";

function mpNormalizeBase(url) {
  if (!url) return MP_DEFAULT_API_BASE;
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;   // tolerate a pasted bare domain
  return u.replace(/\/+$/, "");                        // drop any trailing slash
}

function mpGetApiBase() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ apiBase: MP_DEFAULT_API_BASE }, (data) => {
      resolve(mpNormalizeBase(data.apiBase));
    });
  });
}

function mpSetApiBase(url) {
  const clean = mpNormalizeBase(url);
  return new Promise((resolve) => chrome.storage.local.set({ apiBase: clean }, () => resolve(clean)));
}

function mpGetToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ authToken: null }, (data) => resolve(data.authToken));
  });
}

function mpSetToken(token) {
  return new Promise((resolve) => chrome.storage.local.set({ authToken: token }, resolve));
}

function mpClearToken() {
  return new Promise((resolve) => chrome.storage.local.remove("authToken", resolve));
}

async function mpLoginUrl() {
  const base = await mpGetApiBase();
  return `${base}/auth/google/login`;
}

// Core fetch wrapper: attaches the bearer token, and clears it on a 401 so the
// UI can fall back to the sign-in screen instead of showing stale/broken data.
async function mpApi(path, options = {}) {
  const token = await mpGetToken();
  if (!token) {
    const err = new Error("not_authenticated");
    err.code = "NOT_AUTHENTICATED";
    throw err;
  }

  const base = await mpGetApiBase();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    await mpClearToken();
    const err = new Error("session_expired");
    err.code = "SESSION_EXPIRED";
    throw err;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const mpApiMe = () => mpApi("/api/me");
const mpApiGetProfile = () => mpApi("/api/profile");
const mpApiUpdateProfile = (profile) => mpApi("/api/profile", { method: "PUT", body: JSON.stringify(profile) });
const mpApiForecast = () => mpApi("/api/forecast");
const mpApiWhatIf = (amount, buyInDays = 0) =>
  mpApi("/api/whatif", { method: "POST", body: JSON.stringify({ amount, buyInDays }) });

const mpApiGetTracked = () => mpApi("/api/tracked");
const mpApiAddTracked = (item) => mpApi("/api/tracked", { method: "POST", body: JSON.stringify(item) });
const mpApiRemoveTracked = (id) => mpApi(`/api/tracked/${id}`, { method: "DELETE" });
const mpApiClearTracked = () => mpApi("/api/tracked", { method: "DELETE" });

const mpApiGetHistory = () => mpApi("/api/history");
const mpApiAddHistory = (entry) => mpApi("/api/history", { method: "POST", body: JSON.stringify(entry) });
const mpApiClearHistory = () => mpApi("/api/history", { method: "DELETE" });
