/* ──────────────────────────────────────────────────────────────
   MRDC Safety — shared shell for review pages
   Restores the login session (handed over from index.html via
   sessionStorage), runs the inactivity timer, and provides api(),
   el(), v(), showToast(). Each review page calls initShell({...}).

   IMPORTANT: review pages must be opened in the SAME TAB as the
   dashboard (normal links, not "open in new tab"), because the
   session lives in sessionStorage which is per-tab. The "Back to
   dashboard" link returns to index.html with the session intact.
   ────────────────────────────────────────────────────────────── */

const API = 'https://facility-safety-api.vercel.app';
const TIMEOUT_MS = 30 * 60 * 1000;
const WARN_MS = 2 * 60 * 1000;
const ACTIVITY = ['mousemove', 'keydown', 'click', 'touchstart'];

let session = null, sessionExpiry = null, timerInterval = null;

function el(id) { return document.getElementById(id); }
function v(id) { const e = el(id); return e ? e.value.trim() : ''; }

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showToast(msg, isErr) {
  const t = el('toast'); if (!t) return;
  t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => t.className = 'toast', 3200);
}

function persistSession() {
  try { if (session) sessionStorage.setItem('mrdc_safety_session', JSON.stringify({ s: session, exp: sessionExpiry })); } catch (_) {}
}
function clearPersisted() {
  try { sessionStorage.removeItem('mrdc_safety_session'); } catch (_) {}
}

function goLogin() { location.href = 'index.html'; }

function signOut() {
  clearInterval(timerInterval);
  ACTIVITY.forEach(e => document.removeEventListener(e, onActivity));
  session = null;
  clearPersisted();
  try { localStorage.removeItem('mrdc_safety_auditor'); } catch (_) {}
  location.href = 'index.html';
}

function staySignedIn() {
  sessionExpiry = Date.now() + TIMEOUT_MS;
  const exp = el('expire'); if (exp) exp.classList.remove('show');
}

function onActivity() {
  if (session) { sessionExpiry = Date.now() + TIMEOUT_MS; }
}

function tick() {
  const rem = sessionExpiry - Date.now();
  if (rem <= 0) { goLogin(); return; }
  persistSession();
  const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000);
  const tt = el('timer-txt'); if (tt) tt.textContent = m + ':' + (s < 10 ? '0' : '') + s;
  const pill = el('timer-pill'), exp = el('expire');
  if (rem <= WARN_MS) { if (pill) pill.className = 'timer-pill warn'; if (exp) exp.classList.add('show'); }
  else { if (pill) pill.className = 'timer-pill'; if (exp) exp.classList.remove('show'); }
}

/* initShell({ subtitle, allow })
   - subtitle: optional text for #hdr-sub
   - allow: optional fn(session) -> bool; if it returns false the page
            shows an "access restricted" panel instead of its content.
   Returns true if the page may proceed (session valid + allowed). */
function initShell(opts) {
  opts = opts || {};
  let raw = null;
  try { raw = sessionStorage.getItem('mrdc_safety_session'); } catch (_) {}
  if (!raw) { goLogin(); return false; }

  let o;
  try { o = JSON.parse(raw); } catch (_) { goLogin(); return false; }
  if (!o || !o.s || !o.exp || Date.now() >= o.exp) { goLogin(); return false; }

  session = o.s;

  if (typeof opts.allow === 'function' && !opts.allow(session)) {
    document.body.innerHTML =
      '<div class="wrap"><a class="back-link" href="index.html"><i class="ti ti-arrow-left"></i> Back to dashboard</a>' +
      '<div class="card" style="text-align:center;padding:2.5rem 1.5rem">' +
      '<div style="font-size:32px;color:#999;margin-bottom:8px"><i class="ti ti-lock"></i></div>' +
      '<div style="font-size:16px;font-weight:600;margin-bottom:6px">Access restricted</div>' +
      '<p style="font-size:14px;color:#666;margin-bottom:16px">Your account doesn\u2019t have access to this review page.</p>' +
      '<a class="btn btn-blue" href="index.html" style="width:auto;display:inline-flex"><i class="ti ti-arrow-left"></i> Back to dashboard</a>' +
      '</div></div>';
    return false;
  }

  // Populate header
  const initials = (session.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (el('hdr-avatar')) el('hdr-avatar').textContent = initials;
  if (el('hdr-name')) el('hdr-name').textContent = session.name || '';
  const rb = el('hdr-role');
  if (rb) { rb.textContent = session.role || ''; rb.className = 'role-badge ' + (session.role === 'Admin' ? 'rb-admin' : session.role === 'Contractor' ? 'rb-contractor' : 'rb-viewer'); }
  if (opts.subtitle && el('hdr-sub')) el('hdr-sub').textContent = opts.subtitle;

  // Treat arriving on the page as activity; start the inactivity timer
  sessionExpiry = Date.now() + TIMEOUT_MS;
  persistSession();
  timerInterval = setInterval(tick, 1000); tick();
  ACTIVITY.forEach(e => document.addEventListener(e, onActivity, { passive: true }));
  return true;
}
