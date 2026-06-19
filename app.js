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
      <div class="cell col-add">
        <div class="cell-inner" style="text-align:center">
          <button class="add-to-manifest-btn" type="button" aria-label="Add to manifest">+</button>
        </div>
      </div>
    `;

    const addBtn = row.querySelector('.add-to-manifest-btn');
    addBtn.addEventListener('click', () => {
      addToManifest(item);
      addBtn.classList.add('added');
      addBtn.textContent = '✓';
      setTimeout(() => {
        addBtn.classList.remove('added');
        addBtn.textContent = '+';
      }, 700);
    });

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

  // ── Passenger Manifest (Case Builder) ──────────────────────
  let manifestItems = [];
  let manifestSeq = 0;

  function addToManifest(item) {
    manifestSeq++;
    manifestItems.push({
      id: manifestSeq,
      form: item.form,
      description: item.description,
      fee: item.fee,
      biometrics: item.biometrics || 0
    });
    renderManifest();
  }

  function removeFromManifest(id) {
    manifestItems = manifestItems.filter(i => i.id !== id);
    renderManifest();
  }

  function renderManifest() {
    const list = document.getElementById('manifest-items');
    if (!list) return;

    if (manifestItems.length === 0) {
      list.innerHTML = '<div class="manifest-empty">NO ITEMS BOARDED — SELECT + ON ANY ROW BELOW</div>';
    } else {
      list.innerHTML = '';
      manifestItems.forEach(item => {
        const total = item.fee + item.biometrics;
        const row = document.createElement('div');
        row.className = 'manifest-item';
        row.innerHTML = `
          <span>
            <span class="manifest-item-name">${escHtml(item.form)}</span>
            <span class="manifest-item-desc">${escHtml(item.description)}</span>
          </span>
          <span style="display:flex; align-items:center;">
            <span class="manifest-item-amount">$${total.toLocaleString()}</span>
            <button class="manifest-item-remove" type="button" aria-label="Remove">×</button>
          </span>
        `;
        row.querySelector('.manifest-item-remove').addEventListener('click', () => removeFromManifest(item.id));
        list.appendChild(row);
      });
    }

    const filingSum = manifestItems.reduce((s, i) => s + i.fee, 0);
    const bioSum = manifestItems.reduce((s, i) => s + i.biometrics, 0);

    const elFiling = document.getElementById('manifest-sum-filing');
    const elBio = document.getElementById('manifest-sum-bio');
    const elTotal = document.getElementById('manifest-sum-total');
    if (elFiling) elFiling.textContent = '$' + filingSum.toLocaleString();
    if (elBio) elBio.textContent = '$' + bioSum.toLocaleString();
    if (elTotal) elTotal.textContent = '$' + (filingSum + bioSum).toLocaleString();
  }

  function initManifestControls() {
    const clearBtn = document.getElementById('manifest-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        manifestItems = [];
        renderManifest();
      });
    }
  }

  // ── Case Intake (guided question flow) ─────────────────────
  // Maps answers to a set of {gate, form} lookups against the live feeData,
  // so fee amounts always stay in sync with fees.json / SEED_DATA.
  let intakePath = null;
  let intakeAnswers = {};

  function lookupForm(gateKey, formCode) {
    if (!feeData || !feeData.gates[gateKey]) return null;
    return feeData.gates[gateKey].forms.find(f => f.form === formCode) || null;
  }

  function initIntake() {
    document.querySelectorAll('.intake-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.intake-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        intakePath = btn.dataset.path;
        intakeAnswers = {};
        renderIntakeStep2(intakePath);
      });
    });
  }

  function renderIntakeStep2(path) {
    const step1 = document.getElementById('intake-step-1');
    const step2 = document.getElementById('intake-step-2');
    const resultBox = document.getElementById('intake-result');

    step1.classList.remove('active');
    resultBox.style.display = 'none';
    resultBox.innerHTML = '';

    let html = '<button class="intake-back" id="intake-back-btn">&larr; BACK</button>';

    if (path === 'family') {
      html += questionBlock('relationship', 'RELATIONSHIP TO SPONSOR', [
        ['spouse', 'SPOUSE'], ['parent', 'PARENT'], ['child', 'CHILD'], ['sibling', 'SIBLING']
      ]);
      html += questionBlock('inside', 'BENEFICIARY CURRENTLY INSIDE U.S.?', [
        ['yes', 'YES'], ['no', 'NO']
      ]);
      html += questionBlock('workpermit', 'WORK PERMIT NEEDED WHILE PENDING?', [
        ['yes', 'YES'], ['no', 'NO']
      ]);
    } else if (path === 'work') {
      html += questionBlock('eadtype', 'EAD FILING TYPE', [
        ['initial', 'FIRST-TIME EAD'], ['renewal', 'RENEWAL EAD']
      ]);
      html += questionBlock('sponsor', 'EMPLOYER SPONSORING A PETITION?', [
        ['yes', 'YES — FILE I-140'], ['no', 'NO — EAD ONLY']
      ]);
    } else if (path === 'citizen') {
      html += questionBlock('cittype', 'FILING TYPE', [
        ['naturalize', 'NATURALIZATION (N-400)'],
        ['certificate', 'CERT. OF CITIZENSHIP (N-600)'],
        ['replace', 'REPLACE GREEN CARD (I-90)']
      ]);
    } else if (path === 'court') {
      html += questionBlock('courttype', 'MATTER TYPE', [
        ['appeal', 'APPEAL TO BIA'], ['motion', 'MOTION TO REOPEN/RECONSIDER']
      ]);
    }

    html += '<button class="intake-build-btn" id="intake-build-btn">BUILD MANIFEST</button>';

    step2.innerHTML = html;
    step2.classList.add('active');

    document.getElementById('intake-back-btn').addEventListener('click', () => {
      step2.classList.remove('active');
      step2.innerHTML = '';
      step1.classList.add('active');
      document.querySelectorAll('.intake-option').forEach(b => b.classList.remove('selected'));
    });

    step2.querySelectorAll('.intake-pill').forEach(p => {
      p.addEventListener('click', () => {
        const group = p.dataset.group;
        step2.querySelectorAll('.intake-pill[data-group="' + group + '"]').forEach(o => o.classList.remove('selected'));
        p.classList.add('selected');
        intakeAnswers[group] = p.dataset.value;
      });
    });

    document.getElementById('intake-build-btn').addEventListener('click', () => buildIntakeManifest(path));
  }

  function questionBlock(group, label, options) {
    let html = '<div class="intake-question-block">';
    html += '<div class="intake-question-label">' + label + '</div>';
    html += '<div class="intake-pill-row">';
    options.forEach(([value, text]) => {
      html += '<button type="button" class="intake-pill" data-group="' + group + '" data-value="' + value + '">' + text + '</button>';
    });
    html += '</div></div>';
    return html;
  }

  function buildIntakeManifest(path) {
    const suggestions = [];

    if (path === 'family') {
      const f130 = lookupForm('A', 'I-130');
      if (f130) suggestions.push(f130);

      if (intakeAnswers.inside === 'yes') {
        const f485 = lookupForm('A', 'I-485');
        if (f485) suggestions.push(f485);
      } else {
        const ds260 = lookupForm('A', 'DS-260');
        if (ds260) suggestions.push(ds260);
      }

      const f864 = lookupForm('A', 'I-864');
      if (f864) suggestions.push(f864);

      if (intakeAnswers.workpermit === 'yes' && intakeAnswers.inside === 'yes') {
        const c9 = lookupForm('C', '(c)(9)');
        if (c9) suggestions.push(c9);
      }
    }

    if (path === 'work') {
      if (intakeAnswers.sponsor === 'yes') {
        const f140 = lookupForm('B', 'I-140');
        if (f140) suggestions.push(f140);
      }
      if (intakeAnswers.eadtype === 'renewal') {
        const std = lookupForm('C', 'Standard / Other');
        if (std) suggestions.push({ ...std, form: 'I-765 (renewal)' });
      } else {
        const std = lookupForm('C', 'Standard / Other');
        if (std) suggestions.push({ ...std, form: 'I-765 (initial)' });
      }
    }

    if (path === 'citizen') {
      if (intakeAnswers.cittype === 'naturalize') {
        const n400 = lookupForm('D', 'N-400');
        if (n400) suggestions.push(n400);
      } else if (intakeAnswers.cittype === 'certificate') {
        const n600 = lookupForm('D', 'N-600');
        if (n600) suggestions.push(n600);
      } else if (intakeAnswers.cittype === 'replace') {
        const i90 = lookupForm('D', 'I-90');
        if (i90) suggestions.push(i90);
      }
    }

    if (path === 'court') {
      if (intakeAnswers.courttype === 'appeal') {
        const eoir26 = lookupForm('E', 'EOIR-26');
        if (eoir26) suggestions.push(eoir26);
      } else if (intakeAnswers.courttype === 'motion') {
        const motion = lookupForm('E', 'Motion (IJ)');
        if (motion) suggestions.push(motion);
      }
    }

    renderIntakeResult(suggestions);
  }

  function renderIntakeResult(suggestions) {
    const resultBox = document.getElementById('intake-result');

    if (suggestions.length === 0) {
      resultBox.innerHTML = '<div class="intake-result-note">NO MATCHING FORMS FOUND FOR THESE ANSWERS — TRY BROWSE GATES INSTEAD.</div>';
      resultBox.style.display = 'block';
      return;
    }

    let html = '<div class="intake-result-title">SUGGESTED MANIFEST — REVIEW BEFORE CONFIRMING</div>';

    suggestions.forEach((item, i) => {
      const feeDisplay = item.fee === 0 ? 'FREE' : '$' + item.fee.toLocaleString();
      html += `
        <div class="intake-result-item">
          <span>
            <span class="intake-result-item-name">${escHtml(item.form)}</span>
            <span class="intake-result-item-desc">${escHtml(item.description)}</span>
          </span>
          <span class="intake-result-item-fee">${feeDisplay}</span>
        </div>
      `;
    });

    html += '<button class="intake-build-btn" id="intake-confirm-btn" style="margin-top:16px;">ADD ALL TO MANIFEST</button>';
    html += '<div class="intake-result-note">Each item lands in the manifest below — remove anything that does not apply before treating the total as final.</div>';

    resultBox.innerHTML = html;
    resultBox.style.display = 'block';

    document.getElementById('intake-confirm-btn').addEventListener('click', () => {
      suggestions.forEach(item => addToManifest(item));
      document.getElementById('intake-confirm-btn').textContent = '✓ ADDED TO MANIFEST';
      document.getElementById('intake-confirm-btn').disabled = true;
    });
  }

  function initModeToggle() {
    const modeButtons = document.querySelectorAll('.mode-btn');
    const gateNav = document.getElementById('gate-nav');
    const boardWrap = document.getElementById('board-wrap');
    const intakeWrap = document.getElementById('intake-wrap');

    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;

        if (mode === 'browse') {
          gateNav.style.display = '';
          boardWrap.style.display = '';
          intakeWrap.style.display = 'none';
        } else {
          gateNav.style.display = 'none';
          boardWrap.style.display = 'none';
          intakeWrap.style.display = 'block';
        }
      });
    });
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
  // Auto-synced from data/fees.json — keeps the page functional offline
  const SEED_DATA = {
  "meta": {
    "last_updated": "2026-06-17",
    "source": "https://www.uscis.gov/forms/filing-fees and https://www.justice.gov/eoir",
    "note": "Auto-updated via GitHub Actions scraper. I-765 category fees and EOIR fees added manually — verify against current G-1055 and EOIR fee notices before filing."
  },
  "gates": {
    "A": {
      "label": "Family-Based",
      "icon": "✈",
      "forms": [
        {
          "form": "I-130",
          "description": "Petition for Alien Relative",
          "fee": 675,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Fee waiver available in some cases"
        },
        {
          "form": "I-130A",
          "description": "Supplemental Info for Spouse Beneficiary",
          "fee": 0,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Filed with I-130, no separate fee"
        },
        {
          "form": "I-485",
          "description": "Application to Register Permanent Residence",
          "fee": 1440,
          "biometrics": 85,
          "status": "ON TIME",
          "notes": "Includes biometrics for applicants 14–78"
        },
        {
          "form": "I-751",
          "description": "Petition to Remove Conditions on Residence",
          "fee": 595,
          "biometrics": 85,
          "status": "ON TIME",
          "notes": "For conditional green card holders"
        },
        {
          "form": "I-864",
          "description": "Affidavit of Support",
          "fee": 0,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "No filing fee"
        },
        {
          "form": "DS-260",
          "description": "Immigrant Visa Application (Consular)",
          "fee": 325,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Paid to NVC, not USCIS"
        }
      ]
    },
    "B": {
      "label": "Work / Employment",
      "icon": "⚡",
      "forms": [
        {
          "form": "I-140",
          "description": "Immigrant Petition for Alien Workers",
          "fee": 715,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Premium processing available: +$2,805"
        },
        {
          "form": "I-765",
          "description": "Employment Authorization — see GATE C for category breakdown",
          "fee": 520,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Standard paper fee shown; varies by eligibility category"
        },
        {
          "form": "I-539",
          "description": "Application to Extend/Change Nonimmigrant Status",
          "fee": 370,
          "biometrics": 85,
          "status": "ON TIME",
          "notes": ""
        },
        {
          "form": "I-129",
          "description": "Petition for Nonimmigrant Worker (H/L/O/etc.)",
          "fee": 730,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Varies by classification"
        },
        {
          "form": "I-131",
          "description": "Application for Travel Document (Advance Parole)",
          "fee": 630,
          "biometrics": 85,
          "status": "ON TIME",
          "notes": "Required if traveling while I-485 pending"
        }
      ]
    },
    "C": {
      "label": "I-765 by Category",
      "icon": "⬡",
      "forms": [
        {
          "form": "(a)(3)/(a)(5)",
          "description": "Refugee / Asylee (granted)",
          "fee": 0,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Fee exempt — initial and renewal"
        },
        {
          "form": "(a)(11)",
          "description": "Deferred Enforced Departure (DED)",
          "fee": 0,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Fee exempt"
        },
        {
          "form": "(a)(12)/(c)(19)",
          "description": "TPS — Initial EAD",
          "fee": 550,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "HR-1 statutory fee; no waiver or exemption"
        },
        {
          "form": "(a)(12)/(c)(19)",
          "description": "TPS — Renewal EAD",
          "fee": 275,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "HR-1 statutory renewal rate"
        },
        {
          "form": "(c)(8)",
          "description": "Pending Asylum Application",
          "fee": 550,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Initial; $275 statutory fee applies to renewals"
        },
        {
          "form": "(c)(9)",
          "description": "Pending Adjustment of Status (I-485)",
          "fee": 260,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Half fee if I-485 filed on/after 4/1/2024 and pending"
        },
        {
          "form": "(c)(9) — pre-2024",
          "description": "I-485 filed before 4/1/2024, still pending",
          "fee": 0,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "No separate I-765 fee for interim benefits"
        },
        {
          "form": "(c)(11)",
          "description": "Initial Parole-Based EAD",
          "fee": 275,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "HR-1 statutory initial fee"
        },
        {
          "form": "(c)(11) renewal",
          "description": "Renewal/Re-parole EAD",
          "fee": 275,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Same as initial per current USCIS guidance"
        },
        {
          "form": "(c)(16)",
          "description": "Registry Applicant (since 1/1/1972)",
          "fee": 520,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Standard paper fee; $470 online"
        },
        {
          "form": "(c)(33)",
          "description": "DACA-related, Economic Necessity (I-765WS)",
          "fee": 520,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "No fee waiver available for DACA filings"
        },
        {
          "form": "Standard / Other",
          "description": "General category — paper filing",
          "fee": 520,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "$470 if filed online; most work/student categories"
        }
      ]
    },
    "D": {
      "label": "Citizenship & Status",
      "icon": "★",
      "forms": [
        {
          "form": "N-400",
          "description": "Application for Naturalization",
          "fee": 760,
          "biometrics": 85,
          "status": "ON TIME",
          "notes": "Fee waiver available; reduced fee at $380 for low income"
        },
        {
          "form": "N-600",
          "description": "Application for Certificate of Citizenship",
          "fee": 1170,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": ""
        },
        {
          "form": "I-90",
          "description": "Application to Replace Permanent Resident Card",
          "fee": 540,
          "biometrics": 85,
          "status": "ON TIME",
          "notes": "Green card replacement"
        },
        {
          "form": "I-821D",
          "description": "Consideration of Deferred Action (DACA)",
          "fee": 0,
          "biometrics": 85,
          "status": "ON TIME",
          "notes": "Filing fee waived; biometrics still required"
        },
        {
          "form": "I-589",
          "description": "Application for Asylum",
          "fee": 0,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "No filing fee; Annual Asylum Fee may apply after 1 yr pending"
        },
        {
          "form": "I-693",
          "description": "Medical Examination (Civil Surgeon)",
          "fee": 0,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Fee paid to civil surgeon, not USCIS (~$200–$500)"
        }
      ]
    },
    "E": {
      "label": "EOIR — Immigration Court",
      "icon": "⚖",
      "forms": [
        {
          "form": "EOIR-26",
          "description": "Appeal from Immigration Judge Decision (to BIA)",
          "fee": 1010,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "No fee for bond appeals; inflation-adjusted FY2026"
        },
        {
          "form": "EOIR-29",
          "description": "Appeal from DHS Officer Decision (to BIA)",
          "fee": 1010,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Paid to DHS, not EOIR directly"
        },
        {
          "form": "EOIR-45",
          "description": "Appeal in Practitioner Disciplinary Case",
          "fee": 2000,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Inflation-adjusted FY2026"
        },
        {
          "form": "Motion (IJ)",
          "description": "Motion to Reopen/Reconsider — Immigration Judge",
          "fee": 1045,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "No fee if based solely on asylum or in absentia under INA 240(b)(5)(C)(ii)"
        },
        {
          "form": "Motion (BIA)",
          "description": "Motion to Reopen/Reconsider — Board of Immigration Appeals",
          "fee": 1010,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Inflation-adjusted FY2026; no waiver/reduction permitted"
        },
        {
          "form": "I-601 (EOIR)",
          "description": "Waiver of Grounds of Inadmissibility, filed in Immigration Court",
          "fee": 2100,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Includes FY2025 OBBBA statutory fee component"
        },
        {
          "form": "AAF",
          "description": "Annual Asylum Fee",
          "fee": 102,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Applies after asylum app pending 1+ year; no waiver permitted"
        },
        {
          "form": "EOIR-26A",
          "description": "Fee Waiver Request (the form itself)",
          "fee": 0,
          "biometrics": 0,
          "status": "ON TIME",
          "notes": "Must be filed with the appeal/motion it covers; not automatic"
        }
      ]
    }
  }
};

  // ── Init ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initGateTabs();
    initManifestControls();
    initIntake();
    initModeToggle();
    renderManifest();
    loadFees();
  });

})();
