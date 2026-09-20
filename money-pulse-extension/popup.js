const STATUS_COLOR = {
  Stable: "#33E6C9",
  Pressure: "#FFB454",
  Critical: "#FF5470"
};

function mpOverallLabel(score) {
  if (score >= 70) return "Stable";
  if (score >= 45) return "Pressure";
  return "Critical";
}

function inr(n) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function mpRiskFg(risk) { return risk === "Low" ? "#33E6C9" : risk === "Medium" ? "#FFB454" : "#FF5470"; }
function mpRiskBg(risk) { return risk === "Low" ? "#33E6C920" : risk === "Medium" ? "#FFB45420" : "#FF547020"; }

function timeAgo(ts) {
  const mins = Math.round((Date.now() / 1000 - ts) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// ---- Auth gating ----
async function checkAuthAndBoot() {
  const token = await mpGetToken();
  if (!token) return showLoginScreen();

  try {
    const me = await mpApiMe();
    showDashboard(me);
  } catch (e) {
    showLoginScreen();
  }
}

function showLoginScreen() {
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("settingsBtn").classList.add("hidden");
  document.getElementById("logoutBtn").classList.add("hidden");
  document.getElementById("userChip").classList.add("hidden");
}

function showDashboard(me) {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  document.getElementById("settingsBtn").classList.remove("hidden");
  document.getElementById("logoutBtn").classList.remove("hidden");
  const chip = document.getElementById("userChip");
  chip.textContent = me.name || me.email;
  chip.classList.remove("hidden");
  loadAll();
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  chrome.tabs.create({ url: await mpLoginUrl() });
});

// ---- Backend URL box ----
// Pings the backend's health endpoint so you find out immediately whether the
// URL is right, instead of only discovering it when login silently fails.
async function testServer(base) {
  const status = document.getElementById("serverStatus");
  status.className = "server-status";
  status.textContent = "Checking…";
  try {
    const res = await fetch(`${base}/`, { method: "GET" });
    const data = await res.json();
    if (data.status === "ok") {
      if (!data.googleConfigured) {
        status.className = "server-status bad";
        status.textContent = "Reachable, but Google keys are missing on the server.";
      } else if (data.baseUrl && data.baseUrl.replace(/\/+$/, "") !== base) {
        status.className = "server-status bad";
        status.textContent = `Server's BASE_URL is ${data.baseUrl} — login will fail until it matches.`;
      } else {
        status.className = "server-status ok";
        status.textContent = "Connected ✓";
      }
    } else {
      status.className = "server-status bad";
      status.textContent = "Responded, but not a Money Pulse server.";
    }
  } catch (e) {
    status.className = "server-status bad";
    status.textContent = "Couldn't reach it. Check the URL, or that the server is awake.";
  }
}

document.getElementById("serverSave").addEventListener("click", async () => {
  const raw = document.getElementById("serverInput").value;
  const clean = await mpSetApiBase(raw);
  document.getElementById("serverInput").value = clean;
  testServer(clean);
});

mpGetApiBase().then((base) => {
  document.getElementById("serverInput").value = base;
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await mpClearToken();
  showLoginScreen();
});

// Refresh once if the login tab (elsewhere) just wrote a token while the
// popup was already open.
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === "local" && changes.authToken?.newValue) {
    checkAuthAndBoot();
  }
});

function loadAll() {
  renderDashboard();
  renderTracked();
  renderHistory();
}

// Renders the actual projected-balance series as the pulse line — the sharp
// jumps on salary/rent/EMI days are what give it the "vitals monitor" look,
// so this is real data, not a decorative waveform.
function renderChart(series) {
  const W = 320, H = 100, padTop = 14, padBottom = 10;
  const values = series.map((p) => p.balance);
  let yMin = Math.min(0, ...values);
  let yMax = Math.max(...values);
  if (yMax === yMin) yMax = yMin + 1;
  const spanPad = (yMax - yMin) * 0.12;
  yMin -= spanPad; yMax += spanPad;

  const usableH = H - padTop - padBottom;
  const x = (i) => (i / (series.length - 1)) * W;
  const y = (val) => padTop + usableH - ((val - yMin) / (yMax - yMin)) * usableH;

  let linePath = "";
  series.forEach((p, i) => {
    linePath += (i === 0 ? "M" : "L") + x(i).toFixed(1) + " " + y(p.balance).toFixed(1) + " ";
  });

  const fillPath = linePath + `L${x(series.length - 1).toFixed(1)} ${H} L0 ${H} Z`;

  document.getElementById("pulsePath").setAttribute("d", linePath);
  document.getElementById("pulseFill").setAttribute("d", fillPath);

  const markerColors = { isSalary: "#8B98B0", isRent: "#FFB454", isEmi: "#FF5470" };
  const markersG = document.getElementById("pulseMarkers");
  markersG.innerHTML = "";

  if (yMin < 0 && yMax > 0) {
    const zy = y(0).toFixed(1);
    const zline = document.createElementNS("http://www.w3.org/2000/svg", "line");
    zline.setAttribute("x1", "0"); zline.setAttribute("x2", String(W));
    zline.setAttribute("y1", zy); zline.setAttribute("y2", zy);
    zline.setAttribute("stroke", "#4E5D77");
    zline.setAttribute("stroke-width", "1");
    zline.setAttribute("stroke-dasharray", "3,3");
    markersG.appendChild(zline);
  }

  series.forEach((p, i) => {
    ["isSalary", "isRent", "isEmi"].forEach((key) => {
      if (p[key]) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", x(i).toFixed(1));
        c.setAttribute("cy", y(p.balance).toFixed(1));
        c.setAttribute("r", "3.5");
        c.setAttribute("fill", markerColors[key]);
        c.setAttribute("stroke", "#0B1220");
        c.setAttribute("stroke-width", "1.5");
        markersG.appendChild(c);
      }
    });
  });
}

async function renderDashboard() {
  let profile, forecastData;
  try {
    [profile, forecastData] = await Promise.all([mpApiGetProfile(), mpApiForecast()]);
  } catch (e) {
    if (e.code === "SESSION_EXPIRED" || e.code === "NOT_AUTHENTICATED") return showLoginScreen();
    console.error(e);
    return;
  }

  document.getElementById("inBalance").value = profile.balance;
  document.getElementById("inSalary").value = profile.salaryAmount;
  document.getElementById("inSalaryDays").value = profile.salaryInDays;
  document.getElementById("inRent").value = profile.rentAmount;
  document.getElementById("inRentDays").value = profile.rentInDays;
  document.getElementById("inEmi").value = profile.emiAmount;
  document.getElementById("inEmiDays").value = profile.emiInDays;
  document.getElementById("inAvgExpense").value = profile.avgMonthlyExpense;

  const stress = forecastData.stressIndex;
  const overallLabel = mpOverallLabel(stress.overall);
  const color = STATUS_COLOR[overallLabel];

  document.getElementById("overallScore").textContent = stress.overall;
  document.getElementById("overallStatus").textContent = overallLabel;
  document.getElementById("overallStatus").style.color = color;
  document.getElementById("overallStatus").style.borderColor = color + "55";

  document.getElementById("pulsePath").style.stroke = color;
  document.getElementById("pulseFillStop1").setAttribute("stop-color", color);
  renderChart(forecastData.series);

  forecastData.windows.forEach((w) => {
    const col = document.querySelector(`.forecast-col[data-day="${w.day}"]`);
    col.querySelector(".forecast-word").textContent = w.label;
    col.querySelector(".forecast-word").style.color = STATUS_COLOR[w.label];
    col.querySelector(".forecast-dot").style.background = STATUS_COLOR[w.label];
  });

  document.getElementById("shortageProb").textContent = forecastData.shortageProbability + "%";
  document.getElementById("shortageAmt").textContent = forecastData.expectedShortage > 0 ? inr(forecastData.expectedShortage) : "₹0";

  const indexMap = {
    incomeStability: stress.incomeStability,
    expensePredictability: stress.expensePredictability,
    emergencyReserve: stress.emergencyReserve,
    debtPressure: stress.debtPressure,
    cashFlowStability: stress.cashFlowStability
  };
  Object.entries(indexMap).forEach(([key, val]) => {
    const row = document.querySelector(`.index-row[data-key="${key}"]`);
    row.querySelector(".index-fill").style.width = val + "%";
    row.querySelector(".index-fill").style.background = val >= 70 ? STATUS_COLOR.Stable : val >= 45 ? STATUS_COLOR.Pressure : STATUS_COLOR.Critical;
    row.querySelector(".index-num").textContent = val;
  });
}

function applyWhatIfResult(result) {
  document.getElementById("whatifResult").classList.remove("hidden");
  document.getElementById("beforeScore").textContent = result.before;
  document.getElementById("afterScore").textContent = result.afterNow.score;
  document.getElementById("afterScore").style.color = STATUS_COLOR[mpOverallLabel(result.afterNow.score)];

  document.getElementById("whatifRiskLine").textContent =
    `Purchase risk: ${result.afterNow.risk.toUpperCase()} — projected balance in 21 days: ${inr(result.afterNow.projectedBalance)}`;

  document.getElementById("optNowDetail").textContent = `${result.afterNow.risk} risk`;
  document.getElementById("optWaitDetail").textContent = `${result.afterWait90.risk} risk · score ${result.afterWait90.score}`;
  document.getElementById("optSaveDetail").textContent = result.saveUp.monthlyAmount
    ? `${inr(result.saveUp.monthlyAmount)}/mo for ${result.saveUp.months} mo`
    : "Increase surplus first";
}

async function runWhatIf() {
  const amount = Number(document.getElementById("whatifAmount").value || 0);
  const days = Number(document.getElementById("whatifDays").value || 0);
  if (!amount) return;

  try {
    const result = await mpApiWhatIf(amount, days);
    applyWhatIfResult(result);
    await mpApiAddHistory({ amount, days, risk: result.afterNow.risk, score: result.afterNow.score });
    renderHistory();
  } catch (e) {
    if (e.code === "SESSION_EXPIRED" || e.code === "NOT_AUTHENTICATED") showLoginScreen();
  }
}

document.getElementById("whatifBtn").addEventListener("click", runWhatIf);

// ---- Tracked items ----
async function renderTracked() {
  let items;
  try {
    items = await mpApiGetTracked();
  } catch (e) {
    if (e.code === "SESSION_EXPIRED" || e.code === "NOT_AUTHENTICATED") return showLoginScreen();
    return;
  }

  const listEl = document.getElementById("trackedList");
  const emptyEl = document.getElementById("trackedEmpty");
  const totalEl = document.getElementById("trackedTotal");

  if (!items.length) {
    listEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    totalEl.classList.add("hidden");
    return;
  }
  emptyEl.classList.add("hidden");
  listEl.innerHTML = items.map((item) => `
    <div class="tracked-item">
      <span class="tracked-item-name" title="${item.title}">${item.title}</span>
      <span class="tracked-item-price">${inr(item.amount)}</span>
      <button class="tracked-item-remove" data-id="${item.id}" title="Remove">×</button>
    </div>
  `).join("");

  listEl.querySelectorAll(".tracked-item-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await mpApiRemoveTracked(btn.dataset.id);
      renderTracked();
    });
  });

  const total = items.reduce((sum, i) => sum + i.amount, 0);
  document.getElementById("trackedTotalLine").textContent = `${items.length} item${items.length > 1 ? "s" : ""} · ${inr(total)} total`;
  totalEl.classList.remove("hidden");
}

document.getElementById("clearTracked").addEventListener("click", async () => {
  await mpApiClearTracked();
  renderTracked();
});

document.getElementById("simulateAllBtn").addEventListener("click", async () => {
  const items = await mpApiGetTracked();
  if (!items.length) return;
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  document.getElementById("whatifAmount").value = total;
  document.getElementById("whatifDays").value = 0;

  const result = await mpApiWhatIf(total, 0);
  applyWhatIfResult(result);
  await mpApiAddHistory({ amount: total, days: 0, risk: result.afterNow.risk, score: result.afterNow.score, combined: items.length });
  renderHistory();
  document.getElementById("whatif").scrollIntoView?.({ behavior: "smooth" });
});

// ---- History ----
async function renderHistory() {
  let items;
  try {
    items = await mpApiGetHistory();
  } catch (e) {
    if (e.code === "SESSION_EXPIRED" || e.code === "NOT_AUTHENTICATED") return showLoginScreen();
    return;
  }

  const listEl = document.getElementById("historyList");
  const emptyEl = document.getElementById("historyEmpty");

  if (!items.length) {
    listEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");
  listEl.innerHTML = items.map((h) => `
    <div class="history-item">
      <span class="history-item-main">${h.combined ? h.combined + " items" : inr(h.amount)}${h.days ? " in " + h.days + "d" : ""}</span>
      <span class="history-item-badge" style="background:${mpRiskBg(h.risk)};color:${mpRiskFg(h.risk)}">${h.risk}</span>
      <span class="history-item-time">${timeAgo(h.at)}</span>
    </div>
  `).join("");
}

document.getElementById("clearHistory").addEventListener("click", async () => {
  await mpApiClearHistory();
  renderHistory();
});

document.getElementById("settingsBtn").addEventListener("click", () => {
  document.getElementById("settingsPanel").classList.toggle("hidden");
});

document.getElementById("saveSettings").addEventListener("click", async () => {
  const profile = {
    balance: Number(document.getElementById("inBalance").value || 0),
    salaryAmount: Number(document.getElementById("inSalary").value || 0),
    salaryInDays: Number(document.getElementById("inSalaryDays").value || 0),
    rentAmount: Number(document.getElementById("inRent").value || 0),
    rentInDays: Number(document.getElementById("inRentDays").value || 0),
    emiAmount: Number(document.getElementById("inEmi").value || 0),
    emiInDays: Number(document.getElementById("inEmiDays").value || 0),
    avgMonthlyExpense: Number(document.getElementById("inAvgExpense").value || 0)
  };
  await mpApiUpdateProfile(profile);
  document.getElementById("settingsPanel").classList.add("hidden");
  renderDashboard();
});

checkAuthAndBoot();
