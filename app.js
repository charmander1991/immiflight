/* ============================================================
   IMMIFLIGHT — app.js
   Data loader · Gate switching · Flip animation engine · Clock
   ============================================================ */

(function () {
  'use strict';

  let feeData = null;
  let activeGate = 'A';

  // ── Clock ──────────────────────────────────────────────────
  function updateClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // ── Load data ─────────────────────────────────────────────
  async function loadFees() {
    const rows = document.getElementById('board-rows');
    rows.innerHTML = '<div class="loading-row">LOADING BOARD DATA...</div>';

    try {
      // Try fetching from data/fees.json (works when deployed)
      // Falls back to inline seed so the page works from file:// too
      let data;
      try {
        const res = await fetch('data/fees.json');
        if (!res.ok) throw new Error('fetch failed');
        data = await res.json();
      } catch {
        data = SEED_DATA;
      }

      feeData = data;

      // Update last-updated display
      const lu = document.getElementById('last-updated');
      if (lu && data.meta && data.meta.last_updated) {
        lu.textContent = data.meta.last_updated.toUpperCase();
      }

      renderGate(activeGate);

    } catch (err) {
      rows.innerHTML = `<div class="error-row">DATA UNAVAILABLE — CHECK CONNECTION</div>`;
      console.error('[ImmiFlight]', err);
    }
  }

  // ── Render a gate ──────────────────────────────────────────
  function renderGate(gateKey) {
    const rows = document.getElementById('board-rows');
    if (!feeData || !feeData.gates[gateKey]) return;

    const gate = feeData.gates[gateKey];
    const forms = gate.forms;

    rows.innerHTML = '';

    // Stagger each row
    forms.forEach((item, i) => {
      setTimeout(() => {
        const row = buildRow(item);
        row.classList.add('entering');
        rows.appendChild(row);
        // Remove animation class after it fires so re-renders work
        setTimeout(() => row.classList.remove('entering'), 500);
      }, i * 65);
    });

    // Total bar (exclude estimates from total)
    setTimeout(() => {
      appendTotalBar(forms, gateKey);
    }, forms.length * 65 + 100);
  }

  // ── Build a single row ─────────────────────────────────────
  function buildRow(item) {
    const row = document.createElement('div');
    row.className = 'board-row';

    // Fee display
    const feeDisplay = item.fee === 0
      ? `<span class="fee-free">FREE</span>`
      : `<span class="fee-amount">$${item.fee.toLocaleString()}</span>`;

    // Biometrics display
    const bioDisplay = item.biometrics > 0
      ? `<span class="bio-amount">$${item.biometrics}</span>`
      : `<span class="bio-none">—</span>`;

    // Status badge
    const statusClass = statusToClass(item.status);
    const statusBadge = `<span class="status-badge ${statusClass}">${item.status}</span>`;

    row.innerHTML = `
      <div class="cell col-form">
        <div class="cell-inner">
          <span class="form-tag">${escHtml(item.form)}</span>
        </div>
      </div>
      <div class="cell col-desc">
        <div class="cell-inner">
          <span class="desc-text">${escHtml(item.description)}</span>
        </div>
      </div>
      <div class="cell col-fee">
        <div class="cell-inner" style="text-align:right">${feeDisplay}</div>
      </div>
      <div class="cell col-bio">
        <div class="cell-inner" style="text-align:right">${bioDisplay}</div>
      </div>
      <div class="cell col-status">
        <div class="cell-inner" style="text-align:center">${statusBadge}</div>
      </div>
      <div class="cell col-notes">
        <div class="cell-inner">
          <span class="notes-text">${escHtml(item.notes || '')}</span>
        </div>
      </div>
    `;

    return row;
  }

  // ── Total bar ──────────────────────────────────────────────
  function appendTotalBar(forms, gateKey) {
    const rows = document.getElementById('board-rows');

    // Only total confirmed USCIS fees (not estimates)
    const filingTotal = forms
      .filter(f => f.status !== 'ESTIMATE')
      .reduce((sum, f) => sum + f.fee, 0);

    const bioTotal = forms
      .filter(f => f.status !== 'ESTIMATE')
      .reduce((sum, f) => sum + (f.biometrics || 0), 0);

    const grandTotal = filingTotal + bioTotal;

    if (grandTotal === 0) return;

    const bar = document.createElement('div');
    bar.className = 'total-bar';
    bar.innerHTML = `
      <span class="total-note">GATE ${gateKey} CONFIRMED FEES ONLY · EXCLUDES ESTIMATES</span>
      <span class="total-label">FILING SUBTOTAL</span>
      <span class="total-amount">$${filingTotal.toLocaleString()}</span>
      ${bioTotal > 0 ? `
        <span class="total-label">+ BIOMETRICS</span>
        <span class="total-amount">$${bioTotal.toLocaleString()}</span>
        <span class="total-label">= TOTAL</span>
        <span class="total-amount" style="color:#ffcc44">$${grandTotal.toLocaleString()}</span>
      ` : ''}
    `;
    rows.appendChild(bar);
  }

  // ── Gate tab switching ─────────────────────────────────────
  function initGateTabs() {
    document.querySelectorAll('.gate-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.gate-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeGate = tab.dataset.gate;
        renderGate(activeGate);
      });
    });
  }

  // ── Helpers ────────────────────────────────────────────────
  function statusToClass(status) {
    switch ((status || '').toUpperCase()) {
      case 'ON TIME':   return 'status-on-time';
      case 'UPDATED':   return 'status-updated';
      case 'CHECK IN':  return 'status-check-in';
      case 'ESTIMATE':  return 'status-estimate';
      default:          return 'status-on-time';
    }
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Inline seed data (fallback if fetch fails) ─────────────
  // Mirrors data/fees.json — keeps the page functional locally
  const SEED_DATA = {
    "meta": { "last_updated": "2025-04-01", "source": "https://www.uscis.gov/forms/filing-fees" },
    "gates": {
      "A": {
        "label": "Family-Based", "icon": "✈",
        "forms": [
          { "form": "I-130",  "description": "Petition for Alien Relative",                   "fee": 675,  "biometrics": 0,  "status": "ON TIME",  "notes": "Fee waiver available in some cases" },
          { "form": "I-130A", "description": "Supplemental Info for Spouse Beneficiary",      "fee": 0,    "biometrics": 0,  "status": "ON TIME",  "notes": "Filed with I-130, no separate fee" },
          { "form": "I-485",  "description": "Application to Register Permanent Residence",   "fee": 1440, "biometrics": 85, "status": "ON TIME",  "notes": "Includes biometrics for applicants 14–78" },
          { "form": "I-751",  "description": "Petition to Remove Conditions on Residence",    "fee": 595,  "biometrics": 85, "status": "ON TIME",  "notes": "For conditional green card holders" },
          { "form": "I-864",  "description": "Affidavit of Support",                          "fee": 0,    "biometrics": 0,  "status": "ON TIME",  "notes": "No filing fee" },
          { "form": "DS-260", "description": "Immigrant Visa Application (Consular)",         "fee": 325,  "biometrics": 0,  "status": "ON TIME",  "notes": "Paid to NVC, not USCIS" }
        ]
      },
      "B": {
        "label": "Work / Employment", "icon": "⚡",
        "forms": [
          { "form": "I-140", "description": "Immigrant Petition for Alien Workers",           "fee": 715,  "biometrics": 0,  "status": "ON TIME", "notes": "Premium processing available: +$2,805" },
          { "form": "I-765", "description": "Application for Employment Authorization",       "fee": 520,  "biometrics": 0,  "status": "ON TIME", "notes": "EAD — required for many adjustment cases" },
          { "form": "I-539", "description": "Application to Extend/Change Nonimmigrant Status","fee": 370, "biometrics": 85, "status": "ON TIME", "notes": "" },
          { "form": "I-129", "description": "Petition for Nonimmigrant Worker (H/L/O/etc.)", "fee": 730,  "biometrics": 0,  "status": "ON TIME", "notes": "Varies by classification" },
          { "form": "I-131", "description": "Application for Travel Document (Advance Parole)","fee": 630, "biometrics": 85, "status": "ON TIME", "notes": "Required if traveling while I-485 pending" }
        ]
      },
      "C": {
        "label": "Citizenship & Status", "icon": "★",
        "forms": [
          { "form": "N-400",  "description": "Application for Naturalization",                "fee": 760,  "biometrics": 85, "status": "ON TIME", "notes": "Fee waiver available; reduced fee at $380" },
          { "form": "N-600",  "description": "Application for Certificate of Citizenship",    "fee": 1170, "biometrics": 0,  "status": "ON TIME", "notes": "" },
          { "form": "I-90",   "description": "Application to Replace Permanent Resident Card","fee": 540,  "biometrics": 85, "status": "ON TIME", "notes": "Green card replacement" },
          { "form": "I-821D", "description": "Consideration of Deferred Action (DACA)",      "fee": 0,    "biometrics": 85, "status": "ON TIME", "notes": "Filing fee waived; biometrics still required" },
          { "form": "I-589",  "description": "Application for Asylum",                       "fee": 0,    "biometrics": 0,  "status": "ON TIME", "notes": "No filing fee" },
          { "form": "I-693",  "description": "Medical Examination (Civil Surgeon)",           "fee": 0,    "biometrics": 0,  "status": "ON TIME", "notes": "Fee paid to civil surgeon (~$200–$500)" }
        ]
      },
      "D": {
        "label": "State & Attorney Costs", "icon": "◎",
        "forms": [
          { "form": "ATT-FAM",  "description": "Family-Based Immigration Attorney (avg)",    "fee": 1500, "biometrics": 0, "status": "ESTIMATE", "notes": "Range: $1,000–$3,500 depending on complexity" },
          { "form": "ATT-EMP",  "description": "Employment-Based Immigration Attorney (avg)","fee": 2500, "biometrics": 0, "status": "ESTIMATE", "notes": "Range: $1,500–$5,000+" },
          { "form": "ATT-NAT",  "description": "Naturalization Attorney (avg)",              "fee": 800,  "biometrics": 0, "status": "ESTIMATE", "notes": "Range: $500–$1,500" },
          { "form": "TX-STATE", "description": "Texas — State Filing / Notary Costs (avg)", "fee": 45,   "biometrics": 0, "status": "ESTIMATE", "notes": "Translation, notarization, certified copies" },
          { "form": "OK-STATE", "description": "Oklahoma — State Filing / Notary Costs (avg)","fee": 40, "biometrics": 0, "status": "ESTIMATE", "notes": "Translation, notarization, certified copies" },
          { "form": "CA-STATE", "description": "California — State Filing / Notary Costs (avg)","fee": 65,"biometrics": 0, "status": "ESTIMATE", "notes": "Higher cost of living reflects in legal service rates" }
        ]
      }
    }
  };

  // ── Init ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initGateTabs();
    loadFees();
  });

})();
