// The service worker can't import api.js, so it reads the same stored value.
const MP_DEFAULT_API_BASE = "http://localhost:8000";

function mpGetApiBase() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ apiBase: MP_DEFAULT_API_BASE }, (data) => {
      const u = (data.apiBase || MP_DEFAULT_API_BASE).trim().replace(/\/+$/, "");
      resolve(u);
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "MP_AUTH_TOKEN" && message.token) {
    chrome.storage.local.set({ authToken: message.token }, () => sendResponse({ ok: true }));
    return true; // keep the message channel open for the async sendResponse
  }
  if (message?.type === "MP_OPEN_LOGIN") {
    mpGetApiBase().then((base) => chrome.tabs.create({ url: `${base}/auth/google/login` }));
  }
});
