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
    transcript.innerHTML = `<div class="feed-empty">Pilih deal dulu buat lihat contoh percakapan room-nya.</div>`;
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
    lines.push(`<div class="feed-empty" style="padding:16px 0;">Menunggu payee accept…</div>`);
  } else if (deal.status === "accepted") {
    lines.push(`<div class="feed-empty" style="padding:16px 0;">Menunggu payer lock funds…</div>`);
  } else if (deal.status === "locked") {
    lines.push(`<div class="feed-empty" style="padding:16px 0;">Menunggu payee reveal, atau payer refund setelah window-nya kebuka…</div>`);
  }

  transcript.innerHTML = lines.join("");
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
    document.getElementById("offer-status").textContent = "Isi dulu deskripsi kerjaannya.";
    document.getElementById("offer-status").dataset.kind = "error";
    return;
  }
  document.getElementById("offer-status").textContent = "";
  createOffer({ description, amount, asset, expireMin, claimMin, refundMin });
});

// live countdowns
setInterval(render, 1000);
render();
