// Runs only on http://localhost:8000/auth/success — reads the token the
// backend put in the URL fragment and passes it to the extension's
// background worker, which is the only place allowed to write it to storage.
(function () {
  const match = location.hash.match(/token=([^&]+)/);
  if (!match) return;
  const token = decodeURIComponent(match[1]);

  chrome.runtime.sendMessage({ type: "MP_AUTH_TOKEN", token }, () => {
    document.body.innerHTML = `
      <div style="background:#0B1220;color:#E7ECF3;font-family:sans-serif;
      display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <div style="text-align:center;">
          <h2 style="color:#33E6C9;">Signed in ✓</h2>
          <p>This tab will close in a moment.</p>
        </div>
      </div>`;
    setTimeout(() => window.close(), 900);
  });
})();
