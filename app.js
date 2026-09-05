// tclk sandbox — vanilla JS, no framework, no build step.
// Protocol shape modelled after flop-labs/tclk SPEC.md, run on a simulated
// PaperRail: it records the offer/accept/lock/reveal/refund lifecycle and
// moves no real funds. Everything below is local to this browser tab.

const STORAGE_KEY = "tclk_sandbox_deals_v1";

const STATUS_LABEL = {
  open: "Open",
  accepted: "Accepted",
  locked: "Locked",
  claimed: "Claimed",
  refunded: "Refunded",
  cancelled: "Cancelled",
  expired: "Expired",
};

// ---------- state ----------

function loadDeals() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDeals() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
}

let deals = loadDeals();
let selectedId = deals[0]?.id ?? null;

// ---------- crypto (hash lock) ----------

async function generateHashLock() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const preimage = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(preimage));
  const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return { preimage, hash };
}

// ---------- helpers ----------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function randomDid() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `did:key:z6Mk${hex}`;
}

function shortHex(s, n = 10) {
  if (!s) return "—";
  return s.length <= n * 2 ? s : `${s.slice(0, n)}…${s.slice(-4)}`;
}

function fmtRemaining(ms) {
  if (ms <= 0) return "now";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function dealStatus(deal, now) {
  if (deal.status === "open" && now > deal.expiresAt) return "expired";
  return deal.status;
}

function pillClass(status) {
  return `pill pill-${status}`;
}

function rowLine(deal, now, status) {
  if (status === "open") return `Expires in ${fmtRemaining(deal.expiresAt - now)}`;
  if (status === "accepted") return `Claim by ${fmtRemaining(deal.claimByAt - now)}`;
  if (status === "locked") return `Refund opens in ${fmtRemaining(deal.refundAfterAt - now)}`;
  return STATUS_LABEL[status] ?? "";
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("visible"), 1800);
}

// ---------- mutations ----------

function createOffer(form) {
  const t = Date.now();
  const deal = {
    id: "deal_" + Math.random().toString(36).slice(2, 9),
    description: form.description,
    amount: form.amount,
    asset: form.asset,
    rail: "PaperRail",
    createdAt: t,
    expiresAt: t + form.expireMin * 60000,
    claimByAt: t + form.claimMin * 60000,
    refundAfterAt: t + form.refundMin * 60000,
    status: "open",
    hash: null,
    preimage: null,
    payerDid: randomDid(),
    payeeDid: null,
    frames: [{ type: "offer", at: t }],
  };
  deals.unshift(deal);
  selectedId = deal.id;
  saveDeals();
  showToast("Offer posted to the room");
  render();
}

async function acceptDeal(id) {
  const { preimage, hash } = await generateHashLock();
  const deal = deals.find((d) => d.id === id);
  if (!deal) return;
  deal.status = "accepted";
  deal.hash = hash;
  deal.preimage = preimage;
  deal.payeeDid = randomDid();
  deal.frames.push({ type: "accept", at: Date.now(), data: { statement: hash } });
  saveDeals();
  showToast("Accepted — secret minted, only the hash was published");
  render();
}

function lockDeal(id) {
  const deal = deals.find((d) => d.id === id);
  if (!deal) return;
  deal.status = "locked";
  deal.frames.push({ type: "lock", at: Date.now() });
  saveDeals();
  showToast("Funds locked on PaperRail under the hash");
  render();
}

function revealDeal(id) {
  const deal = deals.find((d) => d.id === id);
  if (!deal) return;
  deal.status = "claimed";
  deal.frames.push({ type: "reveal", at: Date.now(), data: { preimage: deal.preimage } });
  saveDeals();
  showToast("Secret revealed — payee claims the funds");
  render();
}

function refundDeal(id) {
  const deal = deals.find((d) => d.id === id);
  if (!deal) return;
  deal.status = "refunded";
  deal.frames.push({ type: "refund", at: Date.now() });
  saveDeals();
  showToast("Refund window passed — payer reclaimed the funds");
  render();
}

function cancelDeal(id) {
  const deal = deals.find((d) => d.id === id);
  if (!deal) return;
  deal.status = "cancelled";
  deal.frames.push({ type: "cancel", at: Date.now() });
  saveDeals();
  showToast("Deal cancelled before any lock existed");
  render();
}

function removeDeal(id) {
  deals = deals.filter((d) => d.id !== id);
  if (selectedId === id) selectedId = deals[0]?.id ?? null;
  saveDeals();
  showToast("Deal closed and removed from the ledger");
  render();
}

function copyTranscript(id) {
  const deal = deals.find((d) => d.id === id);
  if (!deal) return;
  navigator.clipboard?.writeText(JSON.stringify(deal, null, 2));
  showToast("Transcript copied as JSON");
}

// ---------- rendering ----------

function render() {
  const now = Date.now();
  renderRing(now);
  renderLedger(now);
  renderDetail(now);
  renderTranscript(now);
}

function renderRing(now) {
  const openCount = deals.filter((d) => dealStatus(d, now) === "open").length;
  document.getElementById("ring-count").textContent = String(openCount);
  const circumference = 113;
  const frac = Math.min(openCount / 6, 1);
  document.getElementById("ring-fill").style.strokeDashoffset = String(circumference * (1 - frac));
}

// Signature of what actually needs a full row rebuild (not just the
// live countdown text) — ids, order, selection and status. Rebuilding the
// whole ledger every second (for the countdown) was replaying every row's
// entrance animation, which is what read as "blinking".
let ledgerSignature = "";

function renderLedger(now) {
  document.getElementById("ledger-count").textContent = `${deals.length} deal${deals.length === 1 ? "" : "s"}`;
  const ledger = document.getElementById("ledger");

  if (deals.length === 0) {
    ledgerSignature = "empty";
    ledger.innerHTML = `<div class="feed-empty">No deals yet. Post an offer to open the first room.</div>`;
    return;
  }

  const signature = deals.map((d) => `${d.id}:${dealStatus(d, now)}:${d.id === selectedId}`).join("|");
  const structureChanged = signature !== ledgerSignature;
  ledgerSignature = signature;

  if (structureChanged) {
    ledger.innerHTML = deals
      .map((deal) => {
        const status = dealStatus(deal, now);
        const selected = deal.id === selectedId ? "selected" : "";
        const closable = ["claimed", "refunded", "cancelled", "expired"].includes(status);
        return `
          <div class="deal-row ${selected}" data-id="${deal.id}">
            <span class="pill ${pillClass(status)}"><span class="tick"></span>${STATUS_LABEL[status]}</span>
            <button class="deal-row-main" data-select="${deal.id}" style="all:unset; display:block; width:100%; text-align:left; font:inherit; color:inherit; cursor:pointer; min-width:0;">
              <div class="deal-row-desc">${escapeHtml(deal.description)}</div>
              <div class="deal-row-sub">
                <span>${escapeHtml(deal.amount)} ${escapeHtml(deal.asset)}</span>
                <span>·</span>
                <span class="deal-row-line" data-line="${deal.id}">${rowLine(deal, now, status)}</span>
              </div>
            </button>
            ${closable ? `<button class="deal-row-close" data-close="${deal.id}" title="Close deal">×</button>` : `<span class="deal-row-chevron">›</span>`}
          </div>`;
      })
      .join("");

    ledger.querySelectorAll("[data-select]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedId = btn.dataset.select;
        render();
      });
    });
    ledger.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeDeal(btn.dataset.close);
      });
    });
  } else {
    // same rows, same statuses — just refresh the countdown text in place
    deals.forEach((deal) => {
      const line = ledger.querySelector(`[data-line="${deal.id}"]`);
      if (line) line.textContent = rowLine(deal, now, dealStatus(deal, now));
    });
  }
}

function tlStep({ icon, title, done, current, time, desc }) {
  return `
    <div class="tl-step">
      <div class="tl-marker">
        <div class="tl-dot ${done ? "done" : ""} ${current ? "current" : ""}">${icon}</div>
        <div class="tl-line"></div>
      </div>
      <div class="tl-body">
        <div class="tl-title-row ${done || current ? "active" : ""}">
          <span>${title}</span>
          ${time ? `<span class="tl-time">${new Date(time).toLocaleTimeString()}</span>` : ""}
        </div>
        <div class="tl-desc">${desc}</div>
      </div>
    </div>`;
}

function renderDetail(now) {
  const detail = document.getElementById("detail");
  const deal = deals.find((d) => d.id === selectedId);

  if (!deal) {
    detail.innerHTML = `<div class="feed-empty">Select a deal from the ledger, or post one to see its lifecycle here.</div>`;
    return;
  }

  const status = dealStatus(deal, now);
  const has = (t) => deal.frames.some((f) => f.type === t);
  const frameAt = (t) => deal.frames.find((f) => f.type === t)?.at;
  const canRefund = status === "locked" && now >= deal.refundAfterAt;

  const settleIcon = has("refund") ? "↺" : has("cancel") ? "×" : "✓";
  let settleTitle = "Reveal & claim";
  if (status === "refunded") settleTitle = "Refund";
  if (status === "cancelled") settleTitle = "Cancel";

  let settleDesc = "Not reached.";
  if (has("reveal")) settleDesc = `Payee revealed the secret: <code>${shortHex(deal.preimage)}</code> and claimed the funds.`;
  else if (has("refund")) settleDesc = "Refund window passed — payer reclaimed the funds.";
  else if (has("cancel")) settleDesc = "Cancelled before any lock existed — nothing was ever at risk.";
  else if (status === "locked") settleDesc = "Payee can reveal to claim, or payer can refund once the window opens.";

  const timeline = [
    tlStep({
      icon: "◆",
      title: "Offer",
      done: true,
      time: frameAt("offer"),
      desc: `Payer states the terms. Claim by ${new Date(deal.claimByAt).toLocaleTimeString()}, refund opens ${new Date(deal.refundAfterAt).toLocaleTimeString()}.`,
    }),
    tlStep({
      icon: "🔑",
      title: "Accept",
      done: has("accept"),
      current: status === "open",
      time: frameAt("accept"),
      desc: has("accept")
        ? `Payee minted a secret, published only its hash: <code>${shortHex(deal.hash)}</code>`
        : status === "open"
        ? "Waiting for the payee to accept."
        : "Not reached.",
    }),
    tlStep({
      icon: "🔒",
      title: "Lock",
      done: has("lock"),
      current: status === "accepted",
      time: frameAt("lock"),
      desc: has("lock") ? "Payer escrowed the funds on the named rail, under the hash." : status === "accepted" ? "Waiting for the payer to lock funds." : "Not reached.",
    }),
    tlStep({
      icon: settleIcon,
      title: settleTitle,
      done: has("reveal") || has("refund") || has("cancel"),
      current: status === "locked",
      time: frameAt("reveal") || frameAt("refund") || frameAt("cancel"),
      desc: settleDesc,
    }),
  ].join("");

  let actions = "";
  if (status === "open") {
    actions = `
      <button class="btn btn-primary" data-action="accept">Accept (as payee)</button>
      <button class="btn btn-ghost" data-action="cancel">Withdraw offer</button>`;
  } else if (status === "accepted") {
    actions = `
      <button class="btn btn-primary" data-action="lock">Lock funds (as payer)</button>
      <button class="btn btn-ghost" data-action="cancel">Cancel</button>`;
  } else if (status === "locked") {
    actions = `
      <button class="btn btn-primary" data-action="reveal">Reveal &amp; claim (as payee)</button>
      <button class="btn ${canRefund ? "btn-danger" : "btn-ghost"}" data-action="refund" ${canRefund ? "" : "disabled"}>
        ${canRefund ? "Refund (as payer)" : `Refund opens in ${fmtRemaining(deal.refundAfterAt - now)}`}
      </button>`;
  } else {
    actions = `
      <span class="detail-closed">✓ Deal closed.</span>
      <button class="btn btn-danger" data-action="close">Close &amp; remove from ledger</button>`;
  }
  actions += `<button class="btn btn-ghost" data-action="copy">Copy transcript</button>`;

  detail.innerHTML = `
    <div class="detail-header">
      <span class="detail-title">${escapeHtml(deal.description)}</span>
      <span class="pill ${pillClass(status)}"><span class="tick"></span>${STATUS_LABEL[status]}</span>
    </div>
    <div class="detail-sub">
      <code>${escapeHtml(deal.amount)} ${escapeHtml(deal.asset)}</code>
      <span>·</span>
      <span>rail: ${deal.rail}</span>
      <span>·</span>
      <code>${deal.id}</code>
    </div>
    <div class="timeline">${timeline}</div>
    <div class="detail-actions">${actions}</div>
  `;

  detail.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "accept") acceptDeal(deal.id);
      if (action === "lock") lockDeal(deal.id);
      if (action === "reveal") revealDeal(deal.id);
      if (action === "refund") refundDeal(deal.id);
      if (action === "cancel") cancelDeal(deal.id);
      if (action === "copy") copyTranscript(deal.id);
      if (action === "close") removeDeal(deal.id);
    });
  });
}

function txRow(time, id, role, text) {
  return `
    <div class="tx-row">
      <span class="tx-time">${new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
      <span class="tx-id ${role}"><span class="tick"></span>${shortHex(id, 6)}</span>
      <span class="tx-text">${text}</span>
    </div>`;
}

function renderTranscript(now) {
  const transcript = document.getElementById("transcript");
  const deal = deals.find((d) => d.id === selectedId);

  if (!deal) {
    transcript.innerHTML = `<div class="feed-empty">Select a deal to see an example of its room conversation.</div>`;
    return;
  }

  const lines = [];
  for (const frame of deal.frames) {
    if (frame.type === "offer") {
      lines.push(
        txRow(
          frame.at,
          deal.payerDid,
          "payer",
          `<span class="tx-cmd">tclk1 offer</span> amount=${escapeHtml(deal.amount)} asset=${escapeHtml(deal.asset)} lock=hash claimBy=${new Date(deal.claimByAt).toLocaleTimeString()} refundAfter=${new Date(deal.refundAfterAt).toLocaleTimeString()} expires=${new Date(deal.expiresAt).toLocaleTimeString()}`
        )
      );
    } else if (frame.type === "accept") {
      lines.push(txRow(frame.at, deal.payeeDid, "payee", `<span class="tx-cmd">tclk1 accept</span> statement=${shortHex(frame.data.statement, 10)}`));
    } else if (frame.type === "lock") {
      lines.push(txRow(frame.at, deal.payerDid, "payer", `<span class="tx-cmd">tclk1 lock</span> rail=PaperRail hash=${shortHex(deal.hash, 10)}`));
    } else if (frame.type === "reveal") {
      lines.push(txRow(frame.at, deal.payeeDid, "payee", `<span class="tx-cmd">tclk1 reveal</span> preimage=${shortHex(frame.data.preimage, 10)}`));
    } else if (frame.type === "refund") {
      lines.push(txRow(frame.at, deal.payerDid, "payer", `<span class="tx-cmd">tclk1 refund</span> hash=${shortHex(deal.hash, 10)}`));
    } else if (frame.type === "cancel") {
      const who = deal.payeeDid && deal.frames.some((f) => f.type === "accept") ? deal.payeeDid : deal.payerDid;
      const role = who === deal.payeeDid ? "payee" : "payer";
      lines.push(txRow(frame.at, who, role, `<span class="tx-cmd">tclk1 cancel</span>`));
    }
  }

  if (deal.status === "open") {
    lines.push(`<div class="feed-empty" style="padding:16px 0;">Waiting for the payee to accept…</div>`);
  } else if (deal.status === "accepted") {
    lines.push(`<div class="feed-empty" style="padding:16px 0;">Waiting for the payer to lock funds…</div>`);
  } else if (deal.status === "locked") {
    lines.push(`<div class="feed-empty" style="padding:16px 0;">Waiting for the payee to reveal, or the payer to refund once the window opens…</div>`);
  }

  transcript.innerHTML = lines.join("");
}

// ---------------------------------------------------------------------------
// Live tab — reads the real technocore.chat network (read-only) through the
// /api/room serverless proxy, and scans recent messages for genuine, signed
// tclk1 offer frames. This only works once deployed on Vercel (or run with
// `vercel dev`) — a plain static file:// open has no /api route to call.
// ---------------------------------------------------------------------------

let liveMessages = [];
let liveBusy = false;
let liveRoom = "lobby";

function shortId(from) {
  if (typeof from !== "string") return { label: "?", verified: false };
  if (from.startsWith("did:key:")) {
    const key = from.slice("did:key:".length);
    const short = key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : key;
    return { label: short, verified: true };
  }
  return { label: from, verified: false };
}

function formatTime(ts) {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? String(ts) : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// A real tclk frame is `tclk1 ` followed by JSON, per SPEC.md §3. Anything
// that doesn't parse that way just isn't a frame — not an error, just chat.
function parseTclkFrame(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("tclk1 ")) return null;
  try {
    const parsed = JSON.parse(trimmed.slice("tclk1 ".length));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function scanRoom(room) {
  if (liveBusy) return;
  liveBusy = true;

  const dot = document.getElementById("live-dot");
  const status = document.getElementById("live-status");
  dot.className = "status-dot loading";
  status.textContent = "Scanning…";
  delete status.dataset.kind;
  document.getElementById("live-room-label").textContent = `/r/${room}`;
  expandedOffers.clear();

  try {
    const res = await fetch(`/api/room?room=${encodeURIComponent(room)}&limit=100`);
    const raw = await res.text();

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      // Upstream (or something in front of it) sent back something that
      // isn't JSON at all — a plain-text error page, an HTML page, etc.
    }

    if (!res.ok) {
      const detail = data?.detail || data?.error || raw.trim().slice(0, 160) || `HTTP ${res.status}`;
      throw new Error(`${res.status} — ${detail}`);
    }
    if (!data) {
      throw new Error(`got a non-JSON reply: "${raw.trim().slice(0, 160)}"`);
    }

    liveMessages = Array.isArray(data.messages) ? data.messages : [];
    liveRoom = room;
    dot.className = "status-dot live";
    status.textContent = `Scanned ${liveMessages.length} recent message${liveMessages.length === 1 ? "" : "s"} in /r/${room}.`;
    status.dataset.kind = "ok";
  } catch (err) {
    dot.className = "status-dot error";
    status.textContent = `Couldn't reach the room (${err.message}). This is usually technocore.chat itself being briefly unavailable (it's a small alpha service) — try Scan room again in a moment.`;
    status.dataset.kind = "error";
    liveMessages = [];
  } finally {
    liveBusy = false;
    renderLive();
  }
}

function formatAmount(v) {
  if (v === undefined || v === null || v === "") return "?";
  const s = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s).toLocaleString();
  return s;
}

function offerLabel(frame) {
  if (frame.job) {
    if (typeof frame.job === "object" && frame.job !== null && frame.job.id) return String(frame.job.id);
    if (typeof frame.job === "string") return frame.job;
  }
  if (frame.ref) return `ref ${shortHex(String(frame.ref), 6)}`;
  return "escrow offer";
}

function fmtDuration(ms) {
  if (ms <= 0) return "expired";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

let expandedOffers = new Set();

const ACCEPTED_STORAGE_KEY = "tclk_sandbox_accepted_v1";

function loadAccepted() {
  try {
    const raw = localStorage.getItem(ACCEPTED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAccepted() {
  localStorage.setItem(ACCEPTED_STORAGE_KEY, JSON.stringify(acceptedOffers));
}

let acceptedOffers = loadAccepted();

function renderAcceptedOffers() {
  const panel = document.getElementById("accepted-offers");
  document.getElementById("accepted-count").textContent = String(acceptedOffers.length);

  if (acceptedOffers.length === 0) {
    panel.innerHTML = `<div class="feed-empty">You haven't accepted any offers yet.</div>`;
    return;
  }

  panel.innerHTML = acceptedOffers
    .map(
      (a) => `
        <div class="accepted-row">
          <div class="accepted-main">
            <span class="offer-amount">${escapeHtml(formatAmount(a.amount))} ${escapeHtml(String(a.asset ?? ""))}</span>
            <span class="offer-job">${escapeHtml(a.job || "escrow offer")}</span>
          </div>
          <div class="accepted-meta">
            <span>from <b>${escapeHtml(shortId(a.from).label)}</b></span>
            <span>in /r/${escapeHtml(a.room)}</span>
            <span>${formatTime(a.acceptedAt)}</span>
          </div>
          <div class="offer-fields">
            <span class="offer-field"><b>ref</b>=${escapeHtml(shortHex(a.ref, 8))}</span>
            <span class="offer-field"><b>statement</b>=${escapeHtml(shortHex(a.statement, 8))}</span>
          </div>
        </div>`
    )
    .join("");
}

function renderLive() {
  renderLiveFeed();
  renderLiveOffers();
  renderAcceptedOffers();
  tickLiveCountdowns();
}

function tickLiveCountdowns() {
  const now = Date.now();
  document.querySelectorAll(".offer-countdown[data-expires]").forEach((el) => {
    const expiresMs = Number(el.dataset.expires);
    const msLeft = expiresMs - now;
    el.textContent = msLeft <= 0 ? "Expired" : `Expires in ${fmtDuration(msLeft)}`;
    el.classList.toggle("expired", msLeft <= 0);
  });
}

function renderLiveFeed() {
  const feed = document.getElementById("live-feed");
  if (liveMessages.length === 0) {
    feed.innerHTML = `<div class="feed-empty">No messages read yet. Scan a room to see its recent traffic.</div>`;
    return;
  }
  feed.innerHTML = liveMessages
    .map((msg) => {
      const { label, verified } = shortId(msg.from);
      const frame = parseTclkFrame(msg.text);
      const text = frame
        ? `<span class="tx-cmd">tclk1 ${escapeHtml(String(frame.type ?? "?"))}</span> ${escapeHtml(JSON.stringify(frame))}`
        : escapeHtml(String(msg.text ?? ""));
      return `
        <div class="tx-row">
          <span class="tx-time">${formatTime(msg.ts)}</span>
          <span class="tx-id ${verified ? "verified" : "human"}"><span class="tick"></span>${escapeHtml(label)}</span>
          <span class="tx-text">${text}</span>
        </div>`;
    })
    .join("");
}

function randomHexId(n = 8) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "job"
  );
}

let sayNonceCounter = 0;
function nextSayNonce() {
  sayNonceCounter += 1;
  return Date.now() * 1000 + sayNonceCounter;
}

// Signs `text` as the logged-in identity and posts it to `room` for real.
async function postSigned(room, text) {
  const record = window.TechnocoreIdentity.load();
  if (!record) throw new Error("no agent identity — generate or log in first");
  const nonce = nextSayNonce();
  const sig = window.TechnocoreIdentity.sign(record, room, nonce, text);
  const params = new URLSearchParams({ room, did: record.did, sig, nonce: String(nonce), text });
  const res = await fetch(`/api/say?${params.toString()}`);
  const body = await res.text();
  if (!res.ok) throw new Error(body || `HTTP ${res.status}`);
  return body;
}

function renderLiveOffers() {
  const panel = document.getElementById("live-offers");
  const record = window.TechnocoreIdentity.load();
  const offers = [];
  for (const msg of liveMessages) {
    const frame = parseTclkFrame(msg.text);
    if (frame && frame.type === "offer") {
      offers.push({ msg, frame, verified: shortId(msg.from).verified });
    }
  }

  document.getElementById("live-offer-count").textContent = String(offers.length);

  if (offers.length === 0) {
    panel.innerHTML = `<div class="feed-empty">No tclk1 offer frames in this room's recent history.</div>`;
    return;
  }

  panel.innerHTML = offers
    .map(({ msg, frame, verified }, i) => {
      const key = String(msg.seq ?? `${msg.ts}-${i}`);
      const expanded = expandedOffers.has(key);
      const { label } = shortId(msg.from);
      const expiresMs = Number(frame.expiresMs);
      const hasExpiry = Number.isFinite(expiresMs);

      const detailFields = Object.entries(frame)
        .filter(([k]) => !["type", "amount", "asset"].includes(k))
        .map(([k, v]) => `<span class="offer-field"><b>${escapeHtml(k)}</b>=${escapeHtml(typeof v === "string" ? v : JSON.stringify(v))}</span>`)
        .join("");

      const canAccept = verified && record && frame.from !== record.did && frame.nonce;
      const acceptBtn = canAccept
        ? `<button class="btn btn-primary offer-accept-btn" data-accept-ref="${escapeHtml(String(frame.nonce))}" data-accept-room="${escapeHtml(liveRoom)}" data-accept-amount="${escapeHtml(formatAmount(frame.amount))}" data-accept-asset="${escapeHtml(String(frame.asset ?? ""))}" data-accept-job="${escapeHtml(offerLabel(frame))}" data-accept-from="${escapeHtml(String(frame.from ?? ""))}">Accept (reply in room)</button>`
        : !record
        ? `<p class="field-hint">Log in with an agent identity above to accept this offer.</p>`
        : frame.from === record?.did
        ? `<p class="field-hint">This is your own offer.</p>`
        : "";

      return `
        <div class="offer-card ${verified ? "" : "unsigned"} ${expanded ? "expanded" : ""}" data-key="${key}">
          <button class="offer-summary" data-toggle="${key}">
            <span class="offer-chevron">›</span>
            <span class="offer-summary-main">
              <span class="offer-amount">${escapeHtml(formatAmount(frame.amount))} ${escapeHtml(String(frame.asset ?? ""))}${verified ? "" : ` <span class="offer-unsigned-tag">unsigned</span>`}</span>
              <span class="offer-job">${escapeHtml(offerLabel(frame))}</span>
            </span>
            <span class="offer-summary-meta">
              <span class="offer-from">from <b>${escapeHtml(label)}</b></span>
              <span class="offer-time">${formatTime(msg.ts)}</span>
              ${hasExpiry ? `<span class="offer-countdown" data-expires="${expiresMs}">Expires in …</span>` : ""}
            </span>
          </button>
          <div class="offer-detail">
            <div class="offer-fields">${detailFields}</div>
            ${verified ? "" : `<div class="offer-warn">Posted on the unsigned lane — per tclk/1, an unsigned frame is data, not a real commitment. Anyone could have typed this.</div>`}
            <div class="offer-detail-actions">${acceptBtn}</div>
          </div>
        </div>`;
    })
    .join("");

  panel.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.toggle;
      const card = panel.querySelector(`.offer-card[data-key="${CSS.escape(key)}"]`);
      const nowExpanded = card.classList.toggle("expanded");
      if (nowExpanded) expandedOffers.add(key);
      else expandedOffers.delete(key);
    });
  });

  panel.querySelectorAll(".offer-accept-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ref = btn.dataset.acceptRef;
      const room = btn.dataset.acceptRoom;
      const record2 = window.TechnocoreIdentity.load();
      if (!record2) return;

      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = "Signing…";
      try {
        const { hash } = await generateHashLock();
        const frame = {
          type: "accept",
          from: record2.did,
          ref,
          lock: "hash",
          statement: hash,
          note: "posted via tclk-sandbox — accept/lock/reveal wire schema isn't published by flop-labs, so exact interop isn't guaranteed",
        };
        await postSigned(room, `tclk1 ${JSON.stringify(frame)}`);
        btn.textContent = "Accepted ✓";
        showToast(`Posted a real accept frame to /r/${room} — scan again to see it.`);

        acceptedOffers.unshift({
          ref,
          room,
          amount: btn.dataset.acceptAmount,
          asset: btn.dataset.acceptAsset,
          job: btn.dataset.acceptJob,
          from: btn.dataset.acceptFrom,
          statement: hash,
          acceptedAt: Date.now(),
        });
        saveAccepted();
        renderAcceptedOffers();
      } catch (err) {
        btn.textContent = original;
        btn.disabled = false;
        showToast(`Couldn't accept: ${err.message}`);
      }
    });
  });

  tickLiveCountdowns();
}

// ---------- wiring ----------

document.getElementById("offer-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const description = document.getElementById("f-desc").value.trim();
  const amount = document.getElementById("f-amount").value.trim() || "0";
  const asset = document.getElementById("f-asset").value.trim() || "FLOP";
  const expireMin = parseFloat(document.getElementById("f-expire").value) || 1;
  const claimMin = parseFloat(document.getElementById("f-claim").value) || 1;
  const refundMin = parseFloat(document.getElementById("f-refund").value) || 1;

  if (!description) {
    document.getElementById("offer-status").textContent = "Add a description of the work first.";
    document.getElementById("offer-status").dataset.kind = "error";
    return;
  }
  document.getElementById("offer-status").textContent = "";
  createOffer({ description, amount, asset, expireMin, claimMin, refundMin });
});

// identity panel wiring

function shortenDidLocal(did) {
  const key = did.replace("did:key:", "");
  return `${key.slice(0, 6)}…${key.slice(-6)}`;
}

function setIdentityStatus(msg, kind) {
  const el = document.getElementById("identity-status");
  el.textContent = msg || "";
  if (kind) el.dataset.kind = kind;
  else delete el.dataset.kind;
}

function renderIdentity(record) {
  document.getElementById("identity-block-none").hidden = !!record;
  document.getElementById("identity-block-active").hidden = !record;
  if (record) {
    const chip = document.getElementById("did-chip");
    chip.textContent = shortenDidLocal(record.did);
    chip.dataset.fullDid = record.did;
    document.getElementById("seed-box").hidden = true;
  }
  // Accept buttons depend on whether we're logged in and whose offer it is.
  if (liveMessages.length > 0) renderLiveOffers();
}

document.getElementById("identity-generate-btn").addEventListener("click", () => {
  const record = window.TechnocoreIdentity.generate();
  renderIdentity(record);
  setIdentityStatus("New identity generated in this browser — a throwaway key for this network only, not a crypto wallet.", "ok");
});

document.getElementById("identity-forget-btn").addEventListener("click", () => {
  if (!confirm("Forget this identity? You won't be able to post as this DID again.")) return;
  window.TechnocoreIdentity.clear();
  renderIdentity(null);
  setIdentityStatus("Identity forgotten.", "");
});

document.getElementById("identity-export-btn").addEventListener("click", () => {
  const record = window.TechnocoreIdentity.load();
  if (!record) return;
  const seedBox = document.getElementById("seed-box");
  if (!seedBox.hidden) {
    seedBox.hidden = true;
    return;
  }
  seedBox.textContent = JSON.stringify(
    { did: record.did, secretKeyHex: record.secretKeyHex, createdAt: record.createdAt, note: "Throwaway technocore.chat identity — keep private." },
    null,
    2
  );
  seedBox.hidden = false;
});

document.getElementById("did-chip").addEventListener("click", async () => {
  const full = document.getElementById("did-chip").dataset.fullDid;
  try {
    await navigator.clipboard.writeText(full);
    setIdentityStatus("DID copied to clipboard.", "ok");
  } catch {
    setIdentityStatus(full, "");
  }
});

document.getElementById("identity-login-btn").addEventListener("click", () => {
  const popover = document.getElementById("login-popover");
  popover.hidden = !popover.hidden;
  if (!popover.hidden) {
    document.getElementById("login-secret").value = "";
    document.getElementById("login-error").hidden = true;
    document.getElementById("login-secret").focus();
  }
});

document.getElementById("login-cancel").addEventListener("click", () => {
  document.getElementById("login-popover").hidden = true;
});

function submitLogin() {
  const errorEl = document.getElementById("login-error");
  const hex = document.getElementById("login-secret").value.trim();
  errorEl.hidden = true;
  if (!hex) {
    errorEl.textContent = "Paste your secretKeyHex or seed first.";
    errorEl.hidden = false;
    return;
  }
  try {
    const record = window.TechnocoreIdentity.importFromSecretKeyHex(hex);
    document.getElementById("login-popover").hidden = true;
    renderIdentity(record);
    setIdentityStatus("Logged in with imported identity.", "ok");
  } catch (err) {
    errorEl.textContent = err.message || "Couldn't import that key.";
    errorEl.hidden = false;
  }
}

document.getElementById("login-submit").addEventListener("click", submitLogin);
document.getElementById("login-secret").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitLogin();
  if (e.key === "Escape") document.getElementById("login-popover").hidden = true;
});

// send-offer wiring

document.getElementById("live-offer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = document.getElementById("live-offer-status");
  const record = window.TechnocoreIdentity.load();
  if (!record) {
    status.textContent = "Generate or log in with an agent identity first.";
    status.dataset.kind = "error";
    return;
  }

  const desc = document.getElementById("lo-desc").value.trim();
  const amount = document.getElementById("lo-amount").value.trim() || "0";
  const asset = document.getElementById("lo-asset").value.trim() || "FLOP";
  const expireMin = parseFloat(document.getElementById("lo-expire").value) || 10;
  const claimMin = parseFloat(document.getElementById("lo-claim").value) || 60;
  const refundMin = parseFloat(document.getElementById("lo-refund").value) || 120;
  const room = document.getElementById("room-input").value.trim().toLowerCase() || "lobby";

  const now = Date.now();
  const frame = {
    type: "offer",
    from: record.did,
    role: "payer",
    lock: "hash",
    amount,
    asset,
    rails: ["paperrail"],
    claimByMs: now + claimMin * 60000,
    refundAfterMs: now + refundMin * 60000,
    expiresMs: now + expireMin * 60000,
    nonce: randomHexId(8),
    ...(desc ? { job: { id: slugify(desc), proto: "a2a" }, note: desc } : {}),
  };

  status.textContent = `Signing and posting to /r/${room}…`;
  delete status.dataset.kind;
  try {
    await postSigned(room, `tclk1 ${JSON.stringify(frame)}`);
    status.textContent = `Posted a real offer to /r/${room}. Scan the room to see it appear.`;
    status.dataset.kind = "ok";
    document.getElementById("lo-desc").value = "";
  } catch (err) {
    status.textContent = `Couldn't post: ${err.message}`;
    status.dataset.kind = "error";
  }
});

renderIdentity(window.TechnocoreIdentity.load());

// live tab wiring

document.getElementById("room-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const room = document.getElementById("room-input").value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(room)) {
    const status = document.getElementById("live-status");
    status.textContent = "Room names can only use lowercase letters, numbers, - and _.";
    status.dataset.kind = "error";
    return;
  }
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.room === room));
  scanRoom(room);
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.getElementById("room-input").value = chip.dataset.room;
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
    scanRoom(chip.dataset.room);
  });
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    const view = btn.dataset.view;
    document.getElementById("view-sandbox").hidden = view !== "sandbox";
    document.getElementById("view-live").hidden = view !== "live";
    document.getElementById("logo-sub").textContent =
      view === "live" ? "reading the real technocore.chat network · read-only" : "hash-locked deal rehearsal · PaperRail";
    document.getElementById("ring-gauge").style.visibility = view === "live" ? "hidden" : "visible";
    if (view === "live" && liveMessages.length === 0) {
      scanRoom(document.getElementById("room-input").value.trim() || "lobby");
    }
  });
});

// live countdowns (sandbox deals + live-tab offer expiries)
setInterval(() => {
  render();
  tickLiveCountdowns();
}, 1000);
render();
renderAcceptedOffers();
