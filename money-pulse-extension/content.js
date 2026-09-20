// Money Pulse — on-page purchase risk badge, backed by the real API.
// Selectors are best-effort and layered: known price containers per host,
// then a generic fallback that scans for a large ₹-prefixed number near the
// top of the page. Sites change markup often — this is deliberately
// redundant rather than relying on one class name.

const MP_PRICE_SELECTORS = {
  "amazon.": [
    "#corePrice_feature_div .a-price .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
    "#apex_desktop .a-price .a-offscreen",
    ".a-price .a-offscreen",
    "#priceblock_dealprice",
    "#priceblock_ourprice",
    "#corePrice_feature_div .a-price-whole"
  ],
  "flipkart.": [
    "._30jeq3._16Jk6d",
    "._30jeq3",
    "._1_WHN1",
    ".Nx9bqj",
    ".CxhGGd"
  ],
  "myntra.": [
    ".pdp-price strong",
    ".pdp-discount-container .pdp-price strong",
    ".pdp-price"
  ]
};

function mpHostKey() {
  const host = location.hostname;
  return Object.keys(MP_PRICE_SELECTORS).find((k) => host.includes(k));
}

function mpParsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.]/g, "");
  const value = parseFloat(cleaned);
  return isNaN(value) || value <= 0 ? null : value;
}

function mpFindPriceGeneric() {
  const candidates = Array.from(document.querySelectorAll("span, div"))
    .filter((el) => el.children.length === 0)
    .filter((el) => /^\s*(₹|Rs\.?)\s?[\d,]+(\.\d+)?\s*$/.test(el.textContent || ""))
    .filter((el) => el.getBoundingClientRect().top < 1600);

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const sizeA = parseFloat(getComputedStyle(a).fontSize) || 0;
    const sizeB = parseFloat(getComputedStyle(b).fontSize) || 0;
    return sizeB - sizeA;
  });
  return candidates[0];
}

function mpFindPriceElement() {
  const key = mpHostKey();
  const selectors = key ? MP_PRICE_SELECTORS[key] : [];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && mpParsePrice(el.textContent)) return el;
  }
  return mpFindPriceGeneric();
}

function mpProductTitle() {
  const titleEl = document.querySelector("#productTitle, .B_NuCI, .pdp-name, h1");
  return (titleEl && titleEl.textContent.trim()) || document.title.split(" - ")[0].slice(0, 80);
}

function mpRiskColor(risk) {
  return risk === "Low" ? "#33E6C9" : risk === "Medium" ? "#FFB454" : "#FF5470";
}

function mpBuildSignedOutBadge() {
  const badge = document.createElement("span");
  badge.className = "mp-badge mp-badge-muted";
  badge.innerHTML = `
    <svg width="13" height="10" viewBox="0 0 18 14" fill="none">
      <path d="M0 7H4L5.5 2L8.5 12L10.5 5L12 9H18" stroke="#8B98B0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>Sign in to see purchase risk</span>
  `;
  badge.addEventListener("click", () => chrome.runtime.sendMessage({ type: "MP_OPEN_LOGIN" }));
  return badge;
}

function mpBuildBadge(result, amount) {
  const badge = document.createElement("span");
  badge.className = "mp-badge";
  const color = mpRiskColor(result.afterNow.risk);
  badge.style.setProperty("--mp-color", color);
  badge.innerHTML = `
    <svg width="13" height="10" viewBox="0 0 18 14" fill="none">
      <path d="M0 7H4L5.5 2L8.5 12L10.5 5L12 9H18" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>${result.afterNow.risk} purchase risk</span>
  `;

  const popover = document.createElement("div");
  popover.className = "mp-popover";
  popover.innerHTML = `
    <div class="mp-pop-title">Money Pulse — ${amount ? "₹" + amount.toLocaleString("en-IN") : ""} purchase</div>
    <div class="mp-pop-row"><span>Stability without buying</span><b>${result.before}</b></div>
    <div class="mp-pop-row"><span>Stability if you buy now</span><b style="color:${color}">${result.afterNow.score}</b></div>
    <div class="mp-pop-row"><span>Projected balance, 21 days</span><b>₹${Math.round(result.afterNow.projectedBalance).toLocaleString("en-IN")}</b></div>
    <div class="mp-pop-divider"></div>
    <div class="mp-pop-opt"><span>Buy now</span><b>${result.afterNow.risk} risk</b></div>
    <div class="mp-pop-opt"><span>Wait ~3 months</span><b>${result.afterWait90.risk} risk</b></div>
    <div class="mp-pop-opt"><span>Save up first</span><b>${result.saveUp.monthlyAmount ? "₹" + result.saveUp.monthlyAmount.toLocaleString("en-IN") + "/mo × " + result.saveUp.months : "—"}</b></div>
    <button class="mp-add-btn" type="button">+ Add to Money Pulse</button>
    <div class="mp-pop-note">Synced to your Money Pulse account.</div>
  `;

  const addBtn = popover.querySelector(".mp-add-btn");
  addBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await mpApiAddTracked({ url: location.href, title: mpProductTitle(), amount });
      addBtn.textContent = "Added ✓";
      addBtn.disabled = true;
    } catch (err) {
      addBtn.textContent = "Couldn't save — try again";
    }
  });

  badge.appendChild(popover);
  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    popover.classList.toggle("mp-open");
  });
  document.addEventListener("click", () => popover.classList.remove("mp-open"));

  return badge;
}

async function mpInjectBadge() {
  const priceEl = mpFindPriceElement();
  if (!priceEl || priceEl.dataset.mpBadged) return;

  const amount = mpParsePrice(priceEl.textContent);
  if (!amount) return;

  priceEl.dataset.mpBadged = "1";

  const token = await mpGetToken();
  if (!token) {
    priceEl.insertAdjacentElement("afterend", mpBuildSignedOutBadge());
    return;
  }

  try {
    const result = await mpApiWhatIf(amount, 0);
    priceEl.insertAdjacentElement("afterend", mpBuildBadge(result, amount));
  } catch (e) {
    priceEl.insertAdjacentElement("afterend", mpBuildSignedOutBadge());
  }
}

function mpRescan() {
  clearTimeout(window.__mpDebounce);
  window.__mpDebounce = setTimeout(mpInjectBadge, 400);
}

const mpObserver = new MutationObserver(mpRescan);
mpObserver.observe(document.body, { childList: true, subtree: true });

let mpLastUrl = location.href;
setInterval(() => {
  if (location.href !== mpLastUrl) {
    mpLastUrl = location.href;
    mpRescan();
  }
}, 800);

mpInjectBadge();
