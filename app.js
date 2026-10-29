// 网站的功能（查会员、记账、积分规则、设置密码、店员账号）。
// 网站上的文字在 i18n.js，颜色和版面在 index.html。
(function(){
'use strict';

const LANGS = [['zh','中文'],['th','ไทย'],['en','EN']];
const LOC = {zh:'zh-CN', th:'th-TH', en:'en-GB'};
const DEFAULTS = {shopName:'', bahtPerPoint:500, pointValue:5, minRedeem:10, bdayPct:10, bdayCap:0};

const S = {
  lang:'zh', tab:'counter', sb:null, phase:'boot',
  role:null, email:'', hasOwner:true, hasPw:false,
  settings:{...DEFAULTS}, customers:[], customersLoaded:false, listErr:false,
  phone:'', view:'idle', cur:null, curPhone:'', log:[], lookupSeq:0,
  form:null, receipt:null, busy:false, mQuery:'', mFilter:'all', setDirty:false,
  rPeriod:'today', report:null, reportErr:false,
  unlocked:false, pw:null, staff:[], channel:null,
  mUnlocked:false, mPw:null, today:null, todayDay:'', todayErr:false
};

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function t(k, v){ const d = I18N[S.lang] || I18N.en; let s = d[k]; if (s == null) s = I18N.en[k]; if (s == null) s = k; if (v) s = s.replace(/\{(\w+)\}/g, (m, n) => v[n] != null ? String(v[n]) : m); return s; }
const T = (k, v) => esc(t(k, v));
const r2 = n => { const x = Number(n) || 0; return Math.round(parseFloat((x * 100).toPrecision(12))) / 100; };
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
function digits(s){ return String(s || '').replace(/\D/g, ''); }
function validPhone(p){ return /^0\d{8,9}$/.test(p || ''); }
function fmtPhone(p){
  p = digits(p);
  if (p.startsWith('02')) { if (p.length > 5) return p.slice(0,2)+'-'+p.slice(2,5)+'-'+p.slice(5); if (p.length > 2) return p.slice(0,2)+'-'+p.slice(2); return p; }
  if (p.length > 6) return p.slice(0,3)+'-'+p.slice(3,6)+'-'+p.slice(6);
  if (p.length > 3) return p.slice(0,3)+'-'+p.slice(3);
  return p;
}
function parseMoney(s){ const n = parseFloat(String(s || '').replace(/[,\s฿]/g, '')); return isFinite(n) && n > 0 ? r2(n) : 0; }
function fmtB(n){ n = r2(n); return '฿' + n.toLocaleString('en-US', {minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2}); }
function fmtInt(n){ return Math.round(num(n)).toLocaleString('en-US'); }
function fmtNum(n){ return String(r2(n)); }
function fmtDate(iso, withTime){
  if (!iso) return '—'; const d = new Date(iso); if (isNaN(d)) return '—';
  const o = {day:'numeric', month:'short', year:'numeric'}; if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; }
  try { return new Intl.DateTimeFormat(LOC[S.lang], o).format(d); } catch (e) { return d.toLocaleDateString(); }
}
function fmtTime(iso){ const d = new Date(iso); if (isNaN(d)) return ''; try { return new Intl.DateTimeFormat(LOC[S.lang], {hour:'2-digit', minute:'2-digit'}).format(d); } catch (e) { return ''; } }
function fmtBday(mmdd){
  if (!mmdd || !/^\d\d-\d\d$/.test(mmdd)) return '—';
  const [m, d] = mmdd.split('-').map(Number);
  try { return new Intl.DateTimeFormat(LOC[S.lang], {day:'numeric', month:'short'}).format(new Date(2000, m - 1, d)); } catch (e) { return mmdd; }
}
function monthNames(){ return Array.from({length:12}, (_, i) => { try { return new Intl.DateTimeFormat(LOC[S.lang], {month:'long'}).format(new Date(2000, i, 1)); } catch (e) { return String(i + 1); } }); }
function bdayMonth(c){ return c && typeof c.bday === 'string' && c.bday.length === 5 ? parseInt(c.bday.slice(0, 2), 10) : 0; }
function isBdayMonth(c){ return bdayMonth(c) === new Date().getMonth() + 1; }
function isBdayToday(c){ if (!c || !c.bday) return false; const n = new Date(); return c.bday === String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
function bdayUsedThisYear(c){ return !!c && c.bdayUsedYear === new Date().getFullYear(); }
function bdayEligible(c){ return isBdayMonth(c) && !bdayUsedThisYear(c) && S.settings.bdayPct > 0; }
function readOnly(){ return S.phase !== 'app'; }
function emptyForm(c){ return {amount:'', useBday: c ? bdayEligible(c) : false, usePts:false, pts:'', ptsAuto:false}; }
function emailName(e){ return String(e || '').split('@')[0]; }
function normSettings(o){
  o = {...DEFAULTS, ...(o || {})};
  const pos = (v, def) => Number(v) > 0 ? Number(v) : def;
  o.bahtPerPoint = pos(o.bahtPerPoint, DEFAULTS.bahtPerPoint);
  o.pointValue = pos(o.pointValue, DEFAULTS.pointValue);
  o.minRedeem = Math.max(1, Math.floor(Number(o.minRedeem) || DEFAULTS.minRedeem));
  o.bdayPct = Math.min(100, Math.max(0, num(o.bdayPct)));
  o.bdayCap = Math.max(0, num(o.bdayCap));
  o.shopName = String(o.shopName || '').slice(0, 60);
  return o;
}
function mapCust(r){
  if (!r) return null;
  return {phone: r.phone, name: r.name || '', bday: r.bday || '', byear: r.byear == null ? null : Number(r.byear), note: r.note || '',
    points: num(r.points), totalSpent: num(r.total_spent), visits: num(r.visits),
    bdayUsedYear: r.bday_used_year == null ? null : Number(r.bday_used_year), joinedAt: r.joined_at, lastVisit: r.last_visit};
}
function mapTxn(r){
  return {t: r.kind, at: r.at, a: num(r.amount), b: num(r.bday_disc), p: num(r.pts_used), d: num(r.pts_disc), n: num(r.net), e: num(r.earned),
    delta: num(r.delta), reason: r.reason || '', bal: r.balance == null ? null : num(r.balance), by: r.staff_email || ''};
}
function mapSettings(r){
  if (!r) return {...DEFAULTS};
  return normSettings({shopName: r.shop_name, bahtPerPoint: r.baht_per_point, pointValue: r.point_value, minRedeem: r.min_redeem, bdayPct: r.bday_pct, bdayCap: r.bday_cap});
}

let toastTimer = null;
function toast(msg, err){ const el = $('toast'); el.textContent = msg; el.classList.toggle('err', !!err); el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, err ? 5200 : 2600); }
function showErr(id, msg){ const el = $(id); if (!el) return; el.textContent = msg || ''; el.hidden = !msg; }

/* ---------- database calls ---------- */
async function rpc(name, args){
  const res = await S.sb.rpc(name, args || {});
  if (res.error) throw {code: 'net', message: res.error.message};
  return res.data || {ok: false, code: 'unknown'};
}
async function q(builder){
  const res = await builder;
  if (res.error) throw {code: 'net', message: res.error.message};
  return res.data;
}
const custQuery = () => S.sb.from('customers').select('*').order('last_visit', {ascending: false}).limit(1000);
const txnQuery = p => S.sb.from('txns').select('*').eq('phone', p).order('at', {ascending: false}).limit(30);
function codeMsg(r){
  const c = r && r.code;
  const M = {not_staff:'errPerm', owner_only:'pwOwnerOnly', exists:'alreadyMember', bad_phone:'phoneInvalid', bad_name:'needName',
    bad_bday:'badDate', no_consent:'needConsent', not_enough:'errNotEnough', over_bill:'errOverBill', bday_not_eligible:'errBday',
    not_found:'notFoundMember', bad_adjust:'adjNeed', wrong:'pwWrong', member_owner_only:'mOwnerOnly', bad_values:'setInvalid', bad_password:'pwShort', net:'netErr'};
  if (c === 'below_min') return t('errMin', {n: r.min || S.settings.minRedeem});
  if (c === 'too_many') return t('pwWait', {s: r.wait || 300});
  return t(M[c] || 'errSave');
}
function setBusy(on){
  S.busy = on;
  document.querySelectorAll('[data-act]').forEach(b => { b.disabled = on || readOnly(); });
  if (!on) updateSummary();
}

/* ---------- calculation (preview; the server recalculates) ---------- */
function calc(c, f){
  const s = S.settings; const bal = Math.max(0, Math.floor(num(c && c.points)));
  const A = parseMoney(f.amount);
  const elig = !!c && bdayEligible(c);
  let B = 0;
  if (A > 0 && f.useBday && elig) { B = r2(A * s.bdayPct / 100); if (s.bdayCap > 0) B = Math.min(B, s.bdayCap); }
  const A1 = Math.max(0, r2(A - B));
  const maxPts = s.pointValue > 0 ? Math.max(0, Math.min(bal, Math.floor(A1 / s.pointValue + 1e-9))) : 0;
  const P0 = f.usePts ? Math.max(0, parseInt(f.pts, 10) || 0) : 0;
  let err = '';
  if (P0 > 0) {
    if (P0 > bal) err = t('errNotEnough');
    else if (P0 < s.minRedeem) err = t('errMin', {n: s.minRedeem});
    else if (r2(P0 * s.pointValue) > A1 + 1e-9) err = t('errOverBill');
  }
  const P = err ? 0 : P0;
  const D = r2(P * s.pointValue);
  const N = Math.max(0, r2(A1 - D));
  const E = s.bahtPerPoint > 0 ? Math.floor(N / s.bahtPerPoint + 1e-9) : 0;
  return {A, B, A1, P, D, N, E, maxPts, elig, err, bal, newBal: bal - P + E};
}

/* ---------- shell ---------- */
function langBtns(){ return LANGS.map(([k, l]) => `<button type="button" data-lang="${k}" aria-pressed="${S.lang === k}">${l}</button>`).join(''); }
const BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/></svg>';
function buildKeypad(el, onKey){
  const keys = ['1','2','3','4','5','6','7','8','9','C','0','B'];
  el.innerHTML = keys.map(k => {
    if (k === 'C') return `<button type="button" class="key key-fn" data-k="C">${T('clear')}</button>`;
    if (k === 'B') return `<button type="button" class="key key-fn" data-k="B" aria-label="${T('backspace')}">${BACK_SVG}</button>`;
    return `<button type="button" class="key" data-k="${k}">${k}</button>`;
  }).join('');
  el.onclick = e => { const b = e.target.closest('[data-k]'); if (b) onKey(b.dataset.k); };
}
function applyI18n(){
  document.documentElement.lang = {zh:'zh-CN', th:'th', en:'en'}[S.lang];
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $('langs').innerHTML = langBtns(); $('langs').setAttribute('aria-label', t('langLabel'));
}
function renderHeader(){
  const nm = (S.settings.shopName || 'Lébelle Nails House').trim(), sp = nm.indexOf(' ');
  $('shopName').innerHTML = sp > 0 ? `${esc(nm.slice(0, sp))}<span class="brand-house">${esc(nm.slice(sp + 1))}</span>` : esc(nm);
  $('brandSub').textContent = t('appName');
  $('whoEmail').textContent = S.email;
  $('who').hidden = !(S.phase === 'app' || S.phase === 'pending');
}
function renderBanner(){
  const b = $('banner'); const msg = S.phase === 'app' && !S.customersLoaded ? t('connecting') : '';
  b.hidden = !msg; b.textContent = msg;
}
function updatePhoneMsg(err){ const m = $('phoneMsg'); m.textContent = err ? t('phoneInvalid') : t('phoneHint'); m.classList.toggle('err-text', !!err); }
function setTab(name){
  if (name !== 'settings' && S.unlocked) relock(true);
  S.tab = name;
  ['counter','members','report','settings'].forEach(n => { $('view-' + n).hidden = n !== name; $('tab-' + n).setAttribute('aria-selected', String(n === name)); });
  if (name === 'members') renderMembers();
  if (name === 'report') loadReport();
  if (name === 'counter') renderMLock();
  if (name === 'settings') { renderLock(); fillSettings(); if (S.role === 'owner') loadStaff(); }
}
function showPhase(p){
  S.phase = p; document.body.dataset.phase = p;
  $('appMain').hidden = p !== 'app';
  $('view-auth').hidden = p === 'app' || p === 'boot';
  renderAll();
}
function renderAll(){
  applyI18n(); renderHeader(); renderBanner(); renderAuth();
  if (S.phase !== 'app') return;
  buildKeypad($('keypad'), counterKey); updatePhoneMsg(false);
  renderPanel(); renderMembers(); renderReport(); renderLock(); fillSettings(); updateRuleEx(); renderStaff();
}

/* ---------- sign-in ---------- */
function renderAuth(){
  const el = $('authCard'); const p = S.phase;
  if (p === 'app' || p === 'boot') { el.innerHTML = ''; return; }
  if (p === 'noconfig') { el.innerHTML = `<h2 class="sheet-title">${T('appName')}</h2><p class="lead">${T('noConfig')}</p>`; return; }
  if (p === 'neterr') {
    el.innerHTML = `<h2 class="sheet-title">${T('appName')}</h2><p class="lead">${T('netErr')}</p><div><button type="button" class="btn primary" id="reloadBtn">${T('refresh')}</button></div>`;
    $('reloadBtn').onclick = () => location.reload(); return;
  }
  if (p === 'login') {
    el.innerHTML = `<h2 class="sheet-title">${T('loginTitle')}</h2><p class="fine">${T('loginBody')}</p>
      <form class="stack" id="loginForm" novalidate>
        <label class="field"><span class="lbl">${T('email')}</span><input class="inp" id="lEmail" type="email" autocomplete="username" inputmode="email"></label>
        <label class="field"><span class="lbl">${T('password')}</span><input class="inp" id="lPass" type="password" autocomplete="current-password"></label>
        <div class="err" id="loginErr" role="alert" hidden></div>
        <button type="submit" class="btn primary big" id="loginBtn">${T('login')}</button>
        <p class="fine">${T('loginHelp')}</p>
      </form>`;
    $('loginForm').addEventListener('submit', e => { e.preventDefault(); doLogin(); });
    return;
  }
  if (p === 'pending') {
    if (!S.hasOwner) {
      el.innerHTML = `<h2 class="sheet-title">${T('claimTitle')}</h2><p class="lead">${T('claimBody')}</p><p class="eyebrow">${esc(S.email)}</p><div class="err" id="claimErr" role="alert" hidden></div><button type="button" class="btn primary big" id="claimBtn">${T('claimBtn')}</button>`;
      $('claimBtn').onclick = doClaim;
    } else {
      el.innerHTML = `<h2 class="sheet-title">${T('pendingTitle')}</h2><p class="lead">${T('pendingBody')}</p><p class="eyebrow">${esc(S.email)}</p><div><button type="button" class="btn" id="recheckBtn">${T('refresh')}</button></div>`;
      $('recheckBtn').onclick = enter;
    }
  }
}
async function doLogin(){
  const email = $('lEmail').value.trim(), pw = $('lPass').value;
  if (!email || !pw) return showErr('loginErr', t('loginFail'));
  const btn = $('loginBtn'); btn.disabled = true; btn.textContent = t('loggingIn');
  try {
    const res = await S.sb.auth.signInWithPassword({email, password: pw});
    if (res.error) { showErr('loginErr', /fetch|network/i.test(res.error.message || '') ? t('netErr') : t('loginFail')); return; }
    await enter();
  } catch (e) { showErr('loginErr', t('netErr')); }
  finally { const b = $('loginBtn'); if (b) { b.disabled = false; b.textContent = t('login'); } }
}
async function doClaim(){
  const b = $('claimBtn'); b.disabled = true;
  try { const r = await rpc('claim_owner'); if (!r.ok && r.code !== 'owner_exists') { showErr('claimErr', codeMsg(r)); b.disabled = false; return; } await enter(); }
  catch (e) { showErr('claimErr', t('netErr')); b.disabled = false; }
}
async function doLogout(){
  try { await S.sb.auth.signOut(); } catch (e) {}
  resetData(); showPhase('login');
}
function resetData(){
  if (S.channel) { try { S.sb.removeChannel(S.channel); } catch (e) {} S.channel = null; }
  Object.assign(S, {role: null, email: '', customers: [], customersLoaded: false, today: null, todayDay: '', todayErr: false, report: null, reportErr: false, staff: [], unlocked: false, pw: null, setDirty: false, settings: {...DEFAULTS}});
  S.lookupSeq++; closeCustomer(); S.view = 'idle'; S.phone = '';
}
async function enter(){
  let st;
  try { st = await rpc('app_status'); } catch (e) { showPhase('neterr'); return; }
  S.role = st.role; S.email = st.email || ''; S.hasOwner = !!st.has_owner; S.hasPw = !!st.has_password;
  if (S.role === 'owner' || S.role === 'staff') { showPhase('app'); await loadAll(); subscribe(); }
  else showPhase('pending');
}
async function loadAll(){
  try {
    const [setRow, rows] = await Promise.all([q(S.sb.from('settings').select('*').eq('id', 1).maybeSingle()), q(custQuery())]);
    S.settings = mapSettings(setRow); S.customers = (rows || []).map(mapCust); S.listErr = false;
  } catch (e) { S.listErr = true; toast(t('netErr'), true); }
  S.customersLoaded = true;
  renderAll();
  if (S.role === 'owner') loadStaff();
}
let reloadTimer = null;
function scheduleReload(){ clearTimeout(reloadTimer); reloadTimer = setTimeout(reloadCustomers, 400); }
async function reloadCustomers(){
  try { S.customers = (await q(custQuery())).map(mapCust); S.listErr = false; S.customersLoaded = true; } catch (e) { return; }
  renderMembers(); refreshQuick();
  if (S.tab === 'report') loadReport();
}
async function reloadSettings(){
  try { S.settings = mapSettings(await q(S.sb.from('settings').select('*').eq('id', 1).maybeSingle())); } catch (e) { return; }
  renderHeader(); fillSettings(); renderCard(); updateSummary();
}
async function refreshCurrent(){
  const p = S.curPhone; if (!p) return;
  try {
    const [row, tx] = await Promise.all([q(S.sb.from('customers').select('*').eq('phone', p).maybeSingle()), q(txnQuery(p))]);
    if (S.curPhone !== p || S.busy) return;
    if (!row) { closeCustomer(); S.view = 'idle'; renderPanel(); return; }
    S.cur = mapCust(row); S.log = (tx || []).map(mapTxn); renderCard(); updateSummary(); renderHist();
  } catch (e) {}
}
function subscribe(){
  if (S.channel || !S.sb.channel) return;
  try {
    S.channel = S.sb.channel('points-live')
      .on('postgres_changes', {event: '*', schema: 'public', table: 'customers'}, payload => {
        scheduleReload();
        const ph = (payload.new && payload.new.phone) || (payload.old && payload.old.phone);
        if (ph && ph === S.curPhone && !S.busy) refreshCurrent();
      })
      .on('postgres_changes', {event: '*', schema: 'public', table: 'settings'}, () => reloadSettings())
      .subscribe();
  } catch (e) { S.channel = null; }
}

/* ---------- counter: lookup ---------- */
function setPhone(p){ S.phone = p; $('phone').value = fmtPhone(p); updatePhoneMsg(false); }
function counterKey(key){
  let p = S.phone;
  if (key === 'C') p = ''; else if (key === 'B') p = p.slice(0, -1); else if (p.length < 10) p += key;
  setPhone(p);
  if (p.length === 10) doLookup(p);
}
async function doLookup(raw){
  const p = digits(raw);
  if (!validPhone(p)) { updatePhoneMsg(true); return; }
  if (S.view === 'cust' && S.curPhone === p) return;
  setPhone(p);
  if (S.phase !== 'app') return;
  closeCustomer(); S.view = 'loading'; renderPanel();
  const seq = ++S.lookupSeq;
  try {
    const row = await q(S.sb.from('customers').select('*').eq('phone', p).maybeSingle());
    if (seq !== S.lookupSeq) return;
    if (row) openCustomer(mapCust(row)); else { S.view = 'new'; renderPanel(); }
  } catch (e) {
    if (seq !== S.lookupSeq) return;
    S.view = 'idle'; renderPanel(); toast(t('netErr'), true);
  }
}
function closeCustomer(){ S.cur = null; S.curPhone = ''; S.log = []; S.receipt = null; S.form = null; S.mUnlocked = false; S.mPw = null; }
function openCustomer(c){
  closeCustomer();
  S.view = 'cust'; S.cur = c; S.curPhone = c.phone; S.form = emptyForm(c);
  renderPanel(); loadLog(c.phone);
}
async function loadLog(p){
  try { const tx = await q(txnQuery(p)); if (S.curPhone !== p) return; S.log = (tx || []).map(mapTxn); renderHist(); } catch (e) {}
}

/* ---------- counter: panel ---------- */
function renderPanel(){
  const p = $('panel');
  $('view-counter').classList.toggle('has-cust', S.view === 'cust' || S.view === 'new');
  $('newCustBtn').hidden = !(S.view === 'cust' || S.view === 'new');
  if (S.view === 'idle') { p.innerHTML = idleHTML(); return; }
  if (S.view === 'loading') { p.innerHTML = `<div class="sheet"><p class="lead">${T('searching')}</p></div>`; return; }
  if (S.view === 'new') { p.innerHTML = regHTML(); wireReg(); return; }
  if (S.view === 'cust') {
    p.innerHTML = '<div id="card"></div><div class="done" id="receipt" hidden></div><div id="checkoutBox"></div><section class="sheet" id="histBox"></section><div id="moreBox"></div>';
    renderCard(); renderReceipt(); renderCheckout(); renderHist(); renderMore();
  }
}
/* ---------- counter: today's ledger (shown when no customer is open) ---------- */
function bkkDay(d){
  d = d || new Date();
  try { return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'}).format(d); }
  catch (e) { return new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10); }
}
const todayQuery = day => S.sb.from('txns').select('*').gte('at', new Date(day + 'T00:00:00+07:00').toISOString()).order('at', {ascending: false}).limit(300);
async function loadToday(){
  const day = bkkDay();
  try { const rows = await q(todayQuery(day)); S.today = (rows || []).map(r => ({...mapTxn(r), phone: r.phone})); S.todayDay = day; S.todayErr = false; }
  catch (e) { S.todayErr = true; }
  if (S.tab === 'report') renderReport();
}
function ledgerItem(h, names){
  let what = '', delta = 0;
  if (h.t === 'sale') {
    const parts = [t('hSaleDetail', {n: fmtB(h.n)})];
    if (h.b > 0) parts.push(t('hBdayDetail', {v: fmtB(h.b)}));
    if (h.p > 0) parts.push(t('hPtsDetail', {p: fmtInt(h.p), v: fmtB(h.d)}));
    what = parts.join(' · '); delta = h.e - h.p;
  } else if (h.t === 'adj') { what = t('hAdj') + (h.reason ? ' · ' + h.reason : ''); delta = h.delta; }
  else what = t('hJoin');
  if (h.by) what += ' · ' + t('byStaff', {e: emailName(h.by)});
  const d = h.t === 'join' ? '<span></span>' : `<span class="delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''}">${delta > 0 ? '+' : delta < 0 ? '−' : ''}${fmtInt(Math.abs(delta))}</span>`;
  return `<li><button type="button" class="led" data-phone="${esc(h.phone)}"><span class="led-time">${esc(fmtTime(h.at))}</span><span class="led-main"><span class="led-name">${esc(names.get(h.phone) || fmtPhone(h.phone))}</span><span class="led-what">${esc(what)}</span></span>${d}</button></li>`;
}
function quickItems(){
  if (!S.customersLoaded) return `<p class="muted q-msg">${T('loadingList')}</p>`;
  if (S.listErr) return `<p class="muted q-msg">${T('netErr')}</p>`;
  if (!S.customers.length) return `<p class="muted q-msg">${T('emptyMembers')}</p>`;
  return S.customers.slice(0, 30).map(c => `<button type="button" class="qitem" data-phone="${esc(c.phone)}"><span class="q-name">${esc(c.name)}</span><span class="q-sub">${esc(fmtPhone(c.phone))} · ${fmtInt(c.points)} ${T('pts')}</span></button>`).join('');
}
function idleHTML(){
  return `<div class="sheet quick"><div class="today-head"><h3 class="sheet-title">${T('qTitle')}</h3><span class="muted small">${T('qHint')}</span></div>
    <div class="qgrid" id="qGrid">${quickItems()}</div></div>`;
}
function refreshQuick(){ const g = $('qGrid'); if (g && S.view === 'idle') g.innerHTML = quickItems(); else if (S.view === 'idle') renderPanel(); }
function bdayFields(px, mmdd, yr){
  const parts = mmdd && /^\d\d-\d\d$/.test(mmdd) ? mmdd.split('-').map(Number) : [0, 0];
  const m = parts[0], d = parts[1];
  const days = `<option value="">${T('day')}</option>` + Array.from({length:31}, (_, i) => `<option value="${i + 1}"${d === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('');
  const months = `<option value="">${T('month')}</option>` + monthNames().map((nm, i) => `<option value="${i + 1}"${m === i + 1 ? ' selected' : ''}>${esc(nm)}</option>`).join('');
  return `<div class="field"><span class="lbl">${T('birthday')}</span><div class="bday-row"><select class="inp" id="${px}Day" aria-label="${T('day')}">${days}</select><select class="inp" id="${px}Month" aria-label="${T('month')}">${months}</select><input class="inp" id="${px}Year" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="${T('yearPh')}" aria-label="${T('byear')}" value="${yr ? esc(yr) : ''}"></div><span class="fine">${T('bdayOptional')}</span></div>`;
}
function readBday(px){
  const d = parseInt($(px + 'Day').value, 10) || 0, m = parseInt($(px + 'Month').value, 10) || 0;
  let y = parseInt(digits($(px + 'Year').value), 10);
  if (y > 2400) y -= 543;
  if (!(y >= 1900 && y <= new Date().getFullYear())) y = null;
  if (!d && !m) return {bday: '', byear: y};
  if (!d || !m) return {err: t('needBoth')};
  if (d > [31,29,31,30,31,30,31,31,30,31,30,31][m - 1]) return {err: t('badDate')};
  return {bday: String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'), byear: y};
}
function regHTML(){
  return `<div class="sheet stack">
    <div><div class="eyebrow">${T('notMember', {p: fmtPhone(S.phone)})}</div><h2 class="sheet-title" style="margin:4px 0 0">${T('registerTitle')}</h2></div>
    <form class="stack" id="regForm" novalidate>
      <label class="field"><span class="lbl">${T('name')}</span><input class="inp" id="rName" maxlength="60" autocomplete="off" placeholder="${T('namePh')}"></label>
      ${bdayFields('r', '', null)}
      <label class="field"><span class="lbl">${T('note')}</span><input class="inp" id="rNote" maxlength="120" autocomplete="off"></label>
      <label class="check"><input type="checkbox" id="rConsent"><span>${T('consent')}</span></label>
      <div class="err" id="regErr" role="alert" hidden></div>
      <div class="row-btns"><button type="button" class="btn" id="regCancel">${T('cancel')}</button><button type="submit" class="btn primary" id="regSave" data-act>${T('saveMember')}</button></div>
    </form></div>`;
}
function wireReg(){
  $('regForm').addEventListener('submit', e => { e.preventDefault(); doReg(); });
  $('regCancel').addEventListener('click', nextCustomer);
  if (matchMedia('(pointer:fine)').matches) setTimeout(() => { const n = $('rName'); if (n) n.focus(); }, 0);
}
async function doReg(){
  if (S.busy || readOnly()) return;
  const p = S.phone; const name = $('rName').value.trim().slice(0, 60);
  if (!name) return showErr('regErr', t('needName'));
  const b = readBday('r'); if (b.err) return showErr('regErr', b.err);
  if (!$('rConsent').checked) return showErr('regErr', t('needConsent'));
  showErr('regErr', '');
  setBusy(true);
  try {
    const r = await rpc('register_customer', {p_phone: p, p_name: name, p_bday: b.bday || null, p_byear: b.byear, p_note: $('rNote').value.trim().slice(0, 120), p_consent: true});
    setBusy(false);
    if (r.ok) { toast(t('toastJoined', {n: name})); openCustomer(mapCust(r.customer)); scheduleReload(); }
    else if (r.code === 'exists') { toast(t('alreadyMember')); S.view = 'idle'; doLookup(p); }
    else showErr('regErr', codeMsg(r));
  } catch (e) { setBusy(false); showErr('regErr', codeMsg(e)); }
}
function nextCustomer(){
  S.lookupSeq++; closeCustomer(); S.view = 'idle'; setPhone(''); renderPanel();
  if (matchMedia('(pointer:fine)').matches) $('phone').focus();
}

/* ---------- counter: member card ---------- */
function renderCard(){
  const el = $('card'); if (!el || !S.cur) return;
  const c = S.cur, s = S.settings, pts = Math.max(0, Math.floor(num(c.points)));
  const pills = [];
  if (isBdayToday(c)) pills.push(`<span class="pill gold">${T('bdayToday')}</span>`);
  else if (isBdayMonth(c)) pills.push(`<span class="pill gold">${T('bdayMonth')}</span>`);
  if (isBdayMonth(c) && bdayUsedThisYear(c)) pills.push(`<span class="pill soft">${T('bdayUsed')}</span>`);
  const min = s.minRedeem, stampN = Math.min(min, 20);
  const filled = Math.round(Math.min(pts, min) / min * stampN);
  const prog = pts >= min ? t('stampReady') : t('stampMore', {n: fmtInt(min - pts)});
  const worth = pts >= min ? t('worth', {v: fmtB(pts * s.pointValue)}) : '';
  el.innerHTML = `<article class="mcard" aria-label="${esc(c.name)}">
    <div class="mcard-top"><div><div class="mcard-name">${esc(c.name)}</div><div class="mcard-phone">${esc(fmtPhone(c.phone))}</div></div><div class="mcard-pills">${pills.join('')}</div></div>
    <div class="mcard-mid"><div class="mcard-pts"><span class="num">${fmtInt(pts)}</span><span class="unit">${T('pts')}</span></div>${worth ? `<div class="mcard-worth">${esc(worth)}</div>` : ''}</div>
    <div class="stamps" role="img" aria-label="${esc(prog)}">${Array.from({length: stampN}, (_, i) => `<i class="stamp${i < filled ? ' on' : ''}"></i>`).join('')}<span class="stamp-txt" aria-hidden="true">${esc(prog)}</span></div>
    <div class="mcard-foot"><span>${T('since', {d: fmtDate(c.joinedAt)})}</span><span>${T('visits', {n: fmtInt(c.visits)})}</span><span>${T('spent', {v: fmtB(c.totalSpent)})}</span>${c.bday ? `<span>${T('bdayLabel', {d: fmtBday(c.bday)})}</span>` : ''}</div>
    ${c.note ? `<div class="mcard-note">${esc(c.note)}</div>` : ''}
  </article>`;
}
function renderReceipt(){
  const el = $('receipt'); if (!el) return; const r = S.receipt; el.hidden = !r; if (!r) return;
  el.innerHTML = `<div class="done-head"><span class="pill gold-soft">${T('lastSale')}</span><span class="muted small">${esc(fmtTime(r.at))}</span></div>
    <div class="done-grid"><div><span class="k">${T('rcPaid')}</span><span class="v">${esc(fmtB(r.N))}</span></div><div><span class="k">${T('rcEarn')}</span><span class="v gold">+${fmtInt(r.E)}</span></div><div><span class="k">${T('rcBal')}</span><span class="v">${fmtInt(r.newBal)}</span></div></div>`;
}

/* ---------- counter: checkout ---------- */
function renderCheckout(){
  const box = $('checkoutBox'); if (!box) return; const f = S.form;
  box.innerHTML = `<form class="sheet checkout" id="coForm" novalidate>
    <h3 class="sheet-title" style="margin:0">${T('checkoutTitle')}</h3>
    <label class="field"><span class="lbl">${T('amount')}</span><span class="money"><span class="cur">฿</span><input id="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(f.amount)}"></span></label>
    <label class="toggle gold" id="bdayRow" hidden><input type="checkbox" id="useBday"><span class="toggle-t" id="bdayLabel"></span></label>
    <div class="pts-wrap">
      <label class="toggle" id="ptsRow"><input type="checkbox" id="usePts"><span class="toggle-t">${T('usePts')}</span><span class="muted small push" id="ptsAvail"></span></label>
      <div class="pts-box" id="ptsBox" hidden><label class="field"><span class="lbl">${T('ptsToUse')}</span><input class="inp" id="ptsUse" inputmode="numeric" autocomplete="off" value="${esc(f.pts)}"></label><button type="button" class="btn" id="ptsMax"></button></div>
    </div>
    <div class="lines" id="summary"></div>
    <div class="err" id="coErr" role="alert" hidden></div>
    <button type="button" class="btn primary big" id="confirmBtn">${T('confirm')}</button>
    <p class="fine" id="earnRule"></p>
  </form>`;
  const am = $('amount');
  am.addEventListener('input', () => { const v = am.value.replace(/[^\d.,]/g, ''); if (v !== am.value) am.value = v; S.form.amount = v; updateSummary(); });
  am.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  $('useBday').addEventListener('change', e => { S.form.useBday = e.target.checked; updateSummary(); });
  $('usePts').addEventListener('change', e => { S.form.usePts = e.target.checked; if (S.form.usePts) S.form.ptsAuto = true; updateSummary(); });
  const pu = $('ptsUse');
  pu.addEventListener('input', () => { const v = digits(pu.value); if (v !== pu.value) pu.value = v; S.form.pts = v; S.form.ptsAuto = false; updateSummary(); });
  pu.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  $('ptsMax').addEventListener('click', () => { S.form.ptsAuto = true; updateSummary(); });
  $('confirmBtn').addEventListener('click', doSale);
  $('coForm').addEventListener('submit', e => e.preventDefault());
  updateSummary();
}
function line(label, value, cls){ return `<div class="line ${cls || ''}"><span>${esc(label)}</span><span class="v">${esc(value)}</span></div>`; }
function updateSummary(){
  if (S.view !== 'cust' || !S.cur || !S.form || !$('summary')) return;
  const s = S.settings, c = S.cur, f = S.form;
  if (f.usePts && f.ptsAuto) {
    const mp = calc(c, {...f, usePts: false}).maxPts;
    f.pts = mp >= s.minRedeem ? String(mp) : '';
    $('ptsUse').value = f.pts;
  }
  const k = calc(c, f);
  $('bdayRow').hidden = !k.elig;
  if (k.elig) { $('bdayLabel').textContent = t('useBday', {p: fmtNum(s.bdayPct)}) + (s.bdayCap > 0 ? t('useBdayCap', {c: fmtB(s.bdayCap)}) : ''); $('useBday').checked = !!f.useBday; }
  const can = k.bal >= s.minRedeem;
  if (!can && f.usePts) f.usePts = false;
  $('usePts').disabled = !can; $('usePts').checked = !!f.usePts; $('ptsRow').classList.toggle('off', !can);
  $('ptsAvail').textContent = can ? t('ptsHave', {n: fmtInt(k.bal)}) : t('ptsTooFew', {n: s.minRedeem});
  $('ptsBox').hidden = !f.usePts;
  $('ptsMax').textContent = t('maxBtn', {n: fmtInt(k.maxPts)}); $('ptsMax').disabled = k.maxPts < s.minRedeem;
  let html = line(t('lineBill'), fmtB(k.A));
  if (k.B > 0) html += line(t('lineBday'), '−' + fmtB(k.B), 'disc');
  if (k.P > 0) html += line(t('linePts', {n: fmtInt(k.P)}), '−' + fmtB(k.D), 'disc');
  html += line(t('lineNet'), fmtB(k.N), 'net');
  html += line(t('lineEarn'), '+' + fmtInt(k.E) + ' ' + t('pts'), 'earn');
  html += line(t('lineBal'), fmtInt(k.newBal) + ' ' + t('pts'), 'bal');
  $('summary').innerHTML = html;
  showErr('coErr', k.err);
  $('confirmBtn').disabled = !(k.A > 0) || !!k.err || readOnly() || S.busy;
  $('earnRule').textContent = t('earnRule', {b: fmtB(s.bahtPerPoint)});
}
async function doSale(){
  if (!S.cur || !S.form || S.busy) return;
  const k = calc(S.cur, S.form);
  if (!(k.A > 0) || k.err) return;
  const p = S.curPhone;
  setBusy(true);
  try {
    const r = await rpc('record_sale', {p_phone: p, p_amount: k.A, p_use_bday: k.B > 0, p_points: k.P});
    setBusy(false);
    if (!r.ok) { showErr('coErr', codeMsg(r)); refreshCurrent(); return; }
    if (S.curPhone !== p) return;
    S.receipt = {N: num(r.net), E: num(r.earned), newBal: num(r.balance), at: new Date().toISOString()};
    S.cur = mapCust(r.customer); S.form = emptyForm(S.cur);
    renderCard(); renderReceipt(); renderCheckout(); loadLog(p); scheduleReload();
    toast(t('toastSale', {e: fmtInt(r.earned)}));
  } catch (e) { setBusy(false); toast(codeMsg(e), true); }
}

/* ---------- counter: history + more ---------- */
function histItem(h){
  let title = '', sub = '', delta = 0;
  if (h.t === 'sale') {
    title = t('hSale', {a: fmtB(h.a)});
    const parts = [t('hSaleDetail', {n: fmtB(h.n)})];
    if (h.b > 0) parts.push(t('hBdayDetail', {v: fmtB(h.b)}));
    if (h.p > 0) parts.push(t('hPtsDetail', {p: fmtInt(h.p), v: fmtB(h.d)}));
    sub = parts.join(' · '); delta = h.e - h.p;
  } else if (h.t === 'adj') { title = t('hAdj'); sub = h.reason; delta = h.delta; }
  else title = t('hJoin');
  if (h.by) sub = (sub ? sub + ' · ' : '') + t('byStaff', {e: emailName(h.by)});
  const right = h.t === 'join' ? '' : `<div class="h-right"><span class="delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''}">${delta > 0 ? '+' : delta < 0 ? '−' : ''}${fmtInt(Math.abs(delta))}</span>${h.bal != null ? `<span class="h-bal">${T('balShort', {b: fmtInt(h.bal)})}</span>` : ''}</div>`;
  return `<li><div><div class="h-title">${esc(title)}</div><div class="h-sub">${esc(fmtDate(h.at, true))}${sub ? ' · ' + esc(sub) : ''}</div></div>${right}</li>`;
}
function renderHist(){
  const el = $('histBox'); if (!el) return;
  const items = (S.log || []).slice(0, 30);
  el.innerHTML = `<h3 class="sheet-title">${T('history')}</h3>` + (items.length ? `<ul class="hist">${items.map(histItem).join('')}</ul>` : `<p class="muted" style="margin:0">${T('noHistory')}</p>`);
}
function renderMore(){
  const box = $('moreBox'); if (!box || !S.cur) return; const c = S.cur;
  box.innerHTML = `<details class="sheet more" id="more"><summary>${T('moreTitle')}</summary><div class="m-lock" id="mLock"></div><fieldset class="more-grid m-fs" id="mFs">
    <form class="stack" id="editForm" novalidate><h4>${T('editTitle')}</h4>
      <label class="field"><span class="lbl">${T('name')}</span><input class="inp" id="eName" maxlength="60" autocomplete="off" value="${esc(c.name)}"></label>
      ${bdayFields('e', c.bday, c.byear)}
      <label class="field"><span class="lbl">${T('note')}</span><input class="inp" id="eNote" maxlength="120" autocomplete="off" value="${esc(c.note || '')}"></label>
      <div class="err" id="editErr" role="alert" hidden></div>
      <div class="row-btns"><button type="submit" class="btn primary" data-act>${T('saveEdit')}</button></div>
    </form>
    <form class="stack" id="adjForm" novalidate><h4>${T('adjTitle')}</h4>
      <label class="field"><span class="lbl">${T('adjDelta')}</span><input class="inp" id="aDelta" inputmode="text" autocomplete="off" maxlength="7"></label>
      <label class="field"><span class="lbl">${T('adjReason')}</span><input class="inp" id="aReason" maxlength="80" autocomplete="off"></label>
      <div class="err" id="adjErr" role="alert" hidden></div>
      <div class="row-btns"><button type="submit" class="btn" data-act>${T('adjApply')}</button></div>
    </form>
    <div class="stack"><h4>${T('delTitle')}</h4>
      <div><button type="button" class="btn danger" id="delBtn" data-act>${T('delBtn')}</button></div>
      <div class="stack" id="delConfirm" hidden><p class="err" style="margin:0">${T('delConfirm', {n: c.name})}</p><div class="row-btns"><button type="button" class="btn" id="delNo">${T('cancel')}</button><button type="button" class="btn danger-solid" id="delYes" data-act>${T('delYes')}</button></div></div>
    </div>
  </fieldset></details>`;
  $('editForm').addEventListener('submit', e => { e.preventDefault(); doEdit(); });
  $('adjForm').addEventListener('submit', e => { e.preventDefault(); doAdj(); });
  $('delBtn').addEventListener('click', () => { $('delConfirm').hidden = false; $('delBtn').hidden = true; });
  $('delNo').addEventListener('click', () => { $('delConfirm').hidden = true; $('delBtn').hidden = false; });
  $('delYes').addEventListener('click', doDelete);
  renderMLock();
}

/* ---------- counter: password for editing / deleting members ---------- */
function canEditMember(){ return S.phase === 'app' && (S.hasPw ? S.mUnlocked : S.role === 'owner'); }
function renderMLock(){
  const el = $('mLock'), fs = $('mFs'); if (!el || !fs) return;
  if (S.hasPw && !S.mUnlocked) {
    el.innerHTML = `<div class="lock-head">${LOCK_SVG}<div><h4 class="sheet-title">${T('mLockedTitle')}</h4><p class="fine">${T('mLockedBody')}</p></div></div>
      <form class="lock-form" id="mUnlockForm" novalidate><label class="field"><span class="lbl">${T('pwLabel')}</span><input class="inp" id="mPwIn" type="password" autocomplete="off"></label><button type="submit" class="btn primary" id="mUnlockBtn">${T('unlock')}</button></form>
      <div class="err" id="mPwErr" role="alert" hidden></div>`;
    $('mUnlockForm').addEventListener('submit', e => { e.preventDefault(); doMUnlock(); });
  } else if (S.hasPw) {
    el.innerHTML = `<div class="lock-head">${OPEN_SVG}<div><h4 class="sheet-title">${T('mUnlockedTitle')}</h4><p class="fine">${T('mUnlockedBody')}</p></div><button type="button" class="btn small push" id="mLockBtn">${T('lockNow')}</button></div>`;
    $('mLockBtn').onclick = () => mRelock();
  } else {
    el.innerHTML = `<div class="lock-head">${S.role === 'owner' ? OPEN_SVG : LOCK_SVG}<div><p class="fine">${T(S.role === 'owner' ? 'mNoPwOwner' : 'mNoPwStaff')}</p></div></div>`;
  }
  fs.disabled = !canEditMember();
}
function mRelock(msg){
  S.mUnlocked = false; S.mPw = null; renderMLock();
  if (msg) showErr('mPwErr', msg);
}
async function doMUnlock(){
  const pw = $('mPwIn').value; if (!pw) return;
  const b = $('mUnlockBtn'); b.disabled = true;
  try {
    const r = await rpc('check_settings_password', {p_password: pw});
    if (r.ok) { S.mUnlocked = true; S.mPw = pw; renderMLock(); return; }
    if (r.code === 'no_password') { S.hasPw = false; renderMLock(); return; }
    showErr('mPwErr', codeMsg(r)); $('mPwIn').value = ''; $('mPwIn').focus();
  } catch (e) { showErr('mPwErr', codeMsg(e)); }
  const bb = $('mUnlockBtn'); if (bb) bb.disabled = false;
}
const memberPw = () => S.hasPw ? S.mPw : null;
const pwRefused = r => r && ['wrong', 'too_many', 'member_owner_only'].includes(r.code);
async function doEdit(){
  if (S.busy || !canEditMember()) return;
  const name = $('eName').value.trim().slice(0, 60);
  if (!name) return showErr('editErr', t('needName'));
  const b = readBday('e'); if (b.err) return showErr('editErr', b.err);
  showErr('editErr', ''); setBusy(true);
  try {
    const r = await rpc('update_customer', {p_password: memberPw(), p_phone: S.curPhone, p_name: name, p_bday: b.bday || null, p_byear: b.byear, p_note: $('eNote').value.trim().slice(0, 120)});
    setBusy(false);
    if (pwRefused(r)) return mRelock(codeMsg(r));
    if (!r.ok) return showErr('editErr', codeMsg(r));
    S.cur = mapCust(r.customer); renderCard(); updateSummary(); scheduleReload(); toast(t('toastSaved'));
  } catch (e) { setBusy(false); showErr('editErr', codeMsg(e)); }
}
async function doAdj(){
  if (S.busy || !canEditMember()) return;
  const raw = $('aDelta').value.replace(/[\s,]/g, '');
  const d = /^[+-]?\d+$/.test(raw) ? parseInt(raw, 10) : 0;
  const reason = $('aReason').value.trim().slice(0, 80);
  if (!d || !reason) return showErr('adjErr', t('adjNeed'));
  showErr('adjErr', ''); setBusy(true);
  const p = S.curPhone;
  try {
    const r = await rpc('adjust_points', {p_password: memberPw(), p_phone: p, p_delta: d, p_reason: reason});
    setBusy(false);
    if (pwRefused(r)) return mRelock(codeMsg(r));
    if (!r.ok) return showErr('adjErr', codeMsg(r));
    $('aDelta').value = ''; $('aReason').value = '';
    S.cur = mapCust(r.customer); renderCard(); updateSummary(); loadLog(p); scheduleReload(); toast(t('toastAdj'));
  } catch (e) { setBusy(false); showErr('adjErr', codeMsg(e)); }
}
async function doDelete(){
  if (S.busy || !S.curPhone || !canEditMember()) return;
  setBusy(true);
  try {
    const r = await rpc('delete_customer', {p_password: memberPw(), p_phone: S.curPhone});
    setBusy(false);
    if (pwRefused(r)) { $('delConfirm').hidden = true; $('delBtn').hidden = false; return mRelock(codeMsg(r)); }
    if (!r.ok && r.code !== 'not_found') return toast(codeMsg(r), true);
    nextCustomer(); scheduleReload(); toast(t('toastDeleted'));
  } catch (e) { setBusy(false); toast(codeMsg(e), true); }
}

/* ---------- members ---------- */
function renderMembers(){
  const ch = $('chips'), box = $('mList');
  if (!S.customersLoaded) { ch.innerHTML = ''; box.innerHTML = `<div class="list"><div class="empty">${T('loadingList')}</div></div>`; return; }
  const all = S.customers, m = new Date().getMonth() + 1;
  const bdays = all.filter(c => bdayMonth(c) === m).sort((a, b) => a.bday.localeCompare(b.bday));
  ch.innerHTML = `<button type="button" class="chip" data-f="all" aria-pressed="${S.mFilter === 'all'}">${T('fAll', {n: all.length})}</button><button type="button" class="chip" data-f="bday" aria-pressed="${S.mFilter === 'bday'}">${T('fBday', {n: bdays.length})}</button>${S.mFilter === 'bday' && bdays.length ? `<button type="button" class="btn small" id="copyBtn">${T('copyList')}</button>` : ''}`;
  let rows = S.mFilter === 'bday' ? bdays : all;
  const qs = S.mQuery.trim().toLowerCase(), qd = digits(qs);
  if (qs) rows = rows.filter(c => String(c.name || '').toLowerCase().includes(qs) || (qd && String(c.phone).includes(qd)));
  if (S.listErr) { box.innerHTML = `<div class="list"><div class="empty">${T('netErr')}</div></div>`; return; }
  if (!all.length) { box.innerHTML = `<div class="list"><div class="empty">${T('emptyMembers')}</div></div>`; return; }
  if (!rows.length) { box.innerHTML = `<div class="list"><div class="empty">${T('noMatch')}</div></div>`; return; }
  box.innerHTML = `<div class="list"><div class="mrow mhead"><span>${T('colName')}</span><span>${T('colPts')}</span><span>${T('colBday')}</span><span>${T('colLast')}</span></div>${rows.map(mRow).join('')}</div>`;
  const cb = $('copyBtn'); if (cb) cb.onclick = () => copyList(bdays);
}
function mRow(c){
  const bm = isBdayMonth(c), used = bdayUsedThisYear(c), bd = c.bday ? fmtBday(c.bday) : '—', lv = fmtDate(c.lastVisit);
  return `<button type="button" class="mrow" data-phone="${esc(c.phone)}">
    <span class="c-name"><span class="nm">${esc(c.name)}</span>${bm ? `<span class="pill ${used ? 'muted' : 'gold-soft'}">${used ? T('bdayUsed') : T('bdayMonth')}</span>` : ''}<span class="ph">${esc(fmtPhone(c.phone))}</span><span class="sub-n">${T('colBday')} ${esc(bd)} · ${T('colLast')} ${esc(lv)}</span></span>
    <span class="c-pts"><b>${fmtInt(c.points)}</b> <span class="muted small">${T('pts')}</span></span>
    <span class="c-bday">${esc(bd)}</span>
    <span class="c-last">${esc(lv)}</span>
  </button>`;
}
function copyList(rows){
  const text = rows.map(c => `${c.name}\t${fmtPhone(c.phone)}\t${fmtBday(c.bday)}`).join('\n');
  const fb = $('copyFallback');
  const fallback = () => { fb.hidden = false; fb.value = text; fb.focus(); fb.select(); toast(t('copyFail'), true); };
  try { navigator.clipboard.writeText(text).then(() => { fb.hidden = true; toast(t('copied')); }, fallback); } catch (e) { fallback(); }
}

/* ---------- summary (营业概况) ---------- */
function periodRange(k){
  const [y, m, d] = bkkDay().split('-').map(Number);
  const iso = (Y, M, D) => new Date(Date.UTC(Y, M - 1, D)).toISOString().slice(0, 10);
  if (k === 'week') { const back = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; return [iso(y, m, d - back), iso(y, m, d)]; }
  if (k === 'month') return [iso(y, m, 1), iso(y, m, d)];
  if (k === 'last') return [iso(y, m - 1, 1), iso(y, m, 0)];
  return [iso(y, m, d), iso(y, m, d)];
}
let reportSeq = 0;
async function loadReport(){
  if (S.phase !== 'app') return;
  const k = S.rPeriod, [from, to] = periodRange(k), seq = ++reportSeq;
  if (k === 'today') loadToday();
  if (!S.report || S.report.key !== k) { S.report = null; renderReport(); }
  try {
    const r = await rpc('sales_summary', {p_from: from, p_to: to});
    if (seq !== reportSeq) return;
    if (!r.ok) throw r;
    S.report = {key: k, from, to, days: r.days || [], staff: r.staff || []}; S.reportErr = false;
  } catch (e) { if (seq !== reportSeq) return; S.reportErr = true; }
  renderReport();
}
const dayLabel = iso => fmtDate(iso + 'T12:00:00+07:00');
function isoAdd(iso, n){ const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
function bkkHour(iso){ try { return parseInt(new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Bangkok', hour: '2-digit', hourCycle: 'h23'}).format(new Date(iso)), 10); } catch (e) { return (new Date(iso).getUTCHours() + 7) % 24; } }
function weekdayShort(iso){ try { return new Intl.DateTimeFormat(LOC[S.lang], {weekday: 'short', timeZone: 'UTC'}).format(new Date(iso + 'T00:00:00Z')); } catch (e) { return iso.slice(8); } }
// 图表的每一根柱子：今天按小时，其余按天（本周一到周日、本月 1 号到月底）
function chartData(){
  const k = S.rPeriod, [from] = periodRange(k), today = bkkDay();
  if (k === 'today') {
    if (!S.today) return null;
    const by = new Map();
    for (const h of S.today) if (h.t === 'sale') { const hr = bkkHour(h.at), b = by.get(hr) || {v: 0, n: 0}; b.v += h.n; b.n++; by.set(hr, b); }
    const hrs = [...by.keys()], lo = Math.min(10, ...hrs), hi = Math.max(20, ...hrs), pad = x => String(x).padStart(2, '0');
    const items = [];
    for (let h = lo; h <= hi; h++) { const b = by.get(h) || {v: 0, n: 0}; items.push({label: pad(h), show: true, tip: `${pad(h)}:00–${pad(h + 1)}:00`, v: b.v, n: b.n}); }
    return {title: t('chHour'), items};
  }
  const end = k === 'week' ? isoAdd(from, 6) : k === 'month' ? (() => { const [y, m] = from.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); })() : periodRange(k)[1];
  const map = new Map((S.report.days || []).map(d => [String(d.day).slice(0, 10), d]));
  const items = [];
  for (let iso = from, i = 0; iso <= end && i < 62; iso = isoAdd(iso, 1), i++) {
    const d = map.get(iso), day = parseInt(iso.slice(8), 10), last = isoAdd(iso, 1) > end;
    items.push({label: k === 'week' ? weekdayShort(iso) : String(day), show: k === 'week' || day === 1 || day % 5 === 0 || (last && day % 5 >= 3),
      tip: dayLabel(iso) + (k === 'week' ? '' : ' ' + weekdayShort(iso)), v: num(d && d.net), n: num(d && d.sales), future: iso > today});
  }
  return {title: t('chDay'), items};
}
function niceTop(max){
  if (!(max > 0)) return {top: 1000, step: 250};
  const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(x => x >= raw);
  return {top: step * Math.ceil(max / step), step};
}
function fmtCompactB(v){ return v >= 1000 ? '฿' + (Math.round(v / 100) / 10).toLocaleString('en-US') + 'K' : '฿' + fmtInt(v); }
function chartSVG(c, W){
  const H = 210, L = 52, R = 8, T = 26, B = 28, pw = W - L - R, ph = H - T - B, n = c.items.length;
  const max = Math.max(0, ...c.items.map(i => i.v)), {top, step} = niceTop(max), slot = pw / n, bw = Math.max(4, Math.min(24, slot * 0.62));
  const y = v => T + ph - v / top * ph;
  let g = '';
  for (let v = 0; v <= top + 1e-9; v += step) g += `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="ch-axis" x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(fmtCompactB(v))}</text>`;
  let bars = '', hits = '', xl = '', maxLabel = '';
  const iMax = max > 0 ? c.items.findIndex(i => i.v === max) : -1;
  c.items.forEach((it, i) => {
    const cx = L + slot * i + slot / 2, x = cx - bw / 2;
    if (it.v > 0) {
      const h = Math.max(1, it.v / top * ph), yt = T + ph - h, r = Math.min(4, h, bw / 2);
      bars += `<path class="ch-bar" data-i="${i}" d="M${x.toFixed(1)},${(T + ph).toFixed(1)}V${(yt + r).toFixed(1)}Q${x.toFixed(1)},${yt.toFixed(1)} ${(x + r).toFixed(1)},${yt.toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)},${yt.toFixed(1)} ${(x + bw).toFixed(1)},${(yt + r).toFixed(1)}V${(T + ph).toFixed(1)}Z"/>`;
      if (i === iMax) { const tx = Math.min(Math.max(cx, L + 30), W - R - 30); maxLabel = `<text class="ch-max" x="${tx.toFixed(1)}" y="${(yt - 7).toFixed(1)}" text-anchor="middle">${esc(fmtB(it.v))}</text>`; }
    }
    if (it.show) xl += `<text class="ch-axis${it.future ? ' ch-future' : ''}" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(it.label)}</text>`;
    hits += `<rect class="ch-hit" data-i="${i}" x="${(L + slot * i).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ph}" tabindex="0" role="img" aria-label="${esc(it.tip + ': ' + fmtB(it.v) + ', ' + t('chCount', {n: it.n}))}"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="${esc(c.title)}">${g}<line class="ch-base" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/>${bars}${maxLabel}${xl}${hits}</svg><div class="ch-tip" id="chTip" hidden></div>`;
}
function wireChart(c){
  const box = $('rChart'); if (!box) return;
  const tip = $('chTip');
  const show = el => {
    const i = +el.dataset.i, it = c.items[i]; if (!it) return;
    box.querySelectorAll('.ch-bar.on').forEach(b => b.classList.remove('on'));
    const bar = box.querySelector(`.ch-bar[data-i="${i}"]`); if (bar) bar.classList.add('on');
    tip.replaceChildren();
    const b = document.createElement('b'); b.textContent = fmtB(it.v);
    const l1 = document.createElement('span'); l1.textContent = it.tip;
    const l2 = document.createElement('span'); l2.textContent = t('chCount', {n: it.n});
    tip.append(b, l1, l2); tip.hidden = false;
    const r = el.getBoundingClientRect(), br = box.getBoundingClientRect(), bb = bar ? bar.getBoundingClientRect() : null;
    const x = Math.min(Math.max(r.left + r.width / 2 - br.left, 70), br.width - 70);
    tip.style.left = x + 'px'; tip.style.top = ((bb ? bb.top : r.bottom - 10) - br.top - 8) + 'px';
  };
  const hide = () => { tip.hidden = true; box.querySelectorAll('.ch-bar.on').forEach(b => b.classList.remove('on')); };
  box.querySelectorAll('.ch-hit').forEach(h => { h.addEventListener('pointerenter', () => show(h)); h.addEventListener('focus', () => show(h)); h.addEventListener('blur', hide); });
  box.addEventListener('pointerleave', hide);
}
function renderReport(){
  const ch = $('rChips'), box = $('rBody'); if (!ch || !box || S.phase !== 'app') return;
  const k = S.rPeriod, [from, to] = periodRange(k);
  ch.innerHTML = [['today', 'todayTitle'], ['week', 'rWeek'], ['month', 'rMonth'], ['last', 'rLast']].map(([p, key]) => `<button type="button" class="chip" data-rp="${p}" aria-pressed="${k === p}">${T(key)}</button>`).join('')
    + `<span class="r-range">${esc(from === to ? dayLabel(from) : dayLabel(from) + ' – ' + dayLabel(to))}</span>`;
  if (S.reportErr && !S.report) { box.innerHTML = `<div class="sheet"><p class="muted today-empty">${T('netErr')}</p></div>`; return; }
  if (!S.report) { box.innerHTML = `<div class="sheet"><p class="muted today-empty">${T('rLoading')}</p></div>`; return; }
  const D = S.report.days, tot = f => D.reduce((a, x) => a + num(x[f]), 0), used = tot('used');
  const stats = [[t('tSales'), fmtInt(tot('sales'))], [t('tNet'), fmtB(tot('net'))], [t('tEarned'), '+' + fmtInt(tot('earned'))],
    [t('tUsed'), (used ? '−' : '') + fmtInt(used)], [t('tJoined'), fmtInt(tot('joined'))]];
  let html = `<div class="sheet"><dl class="today-stats r-stats">${stats.map(([a, v]) => `<div><dt>${esc(a)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  if (!D.length) html += `<p class="muted today-empty">${T('rEmpty')}</p>`;
  html += `</div>`;
  const cd = chartData();
  if (cd && D.length) html += `<section class="sheet"><h3 class="sheet-title">${esc(cd.title)}</h3><div class="chart" id="rChart">${chartSVG(cd, Math.max(280, (box.clientWidth || 700) - 42))}</div></section>`;
  if (k === 'today' && S.today && S.today.length) {
    const names = new Map(S.customers.map(c => [c.phone, c.name]));
    html += `<section class="sheet"><h3 class="sheet-title">${T('todayRecords')}</h3><ul class="ledger">${S.today.map(h => ledgerItem(h, names)).join('')}</ul></section>`;
  }
  if (D.length && from !== to) {
    html += `<section class="sheet"><h3 class="sheet-title">${T('rByDay')}</h3><div class="rtable-wrap"><table class="rtable"><thead><tr><th>${T('rColDate')}</th><th>${T('tSales')}</th><th>${T('tNet')}</th><th>${T('tEarned')}</th><th>${T('tUsed')}</th><th>${T('tJoined')}</th></tr></thead><tbody>`
      + D.map(x => `<tr><td>${esc(dayLabel(x.day))}</td><td>${fmtInt(x.sales)}</td><td>${esc(fmtB(x.net))}</td><td>+${fmtInt(x.earned)}</td><td>${num(x.used) ? '−' : ''}${fmtInt(x.used)}</td><td>${fmtInt(x.joined)}</td></tr>`).join('')
      + `</tbody></table></div></section>`;
  }
  if (S.report.staff.length) {
    html += `<section class="sheet"><h3 class="sheet-title">${T('rByStaff')}</h3><div class="rtable-wrap"><table class="rtable"><thead><tr><th>${T('rColStaff')}</th><th>${T('tSales')}</th><th>${T('tNet')}</th></tr></thead><tbody>`
      + S.report.staff.map(x => `<tr><td>${esc(x.email ? emailName(x.email) : '—')}</td><td>${fmtInt(x.sales)}</td><td>${esc(fmtB(x.net))}</td></tr>`).join('')
      + `</tbody></table></div></section>`;
  }
  box.innerHTML = html;
  if (cd && D.length) wireChart(cd);
}

/* ---------- settings: password ---------- */
const LOCK_SVG = '<span class="lock-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>';
const OPEN_SVG = '<span class="lock-ico open" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.8"/></svg></span>';
function canEditSettings(){ return S.phase === 'app' && (S.hasPw ? S.unlocked : S.role === 'owner'); }
function pwFormHTML(btnKey){
  return `<form class="lock-form" id="pwForm" novalidate><label class="field"><span class="lbl">${T('pwNew')}</span><input class="inp" id="pwNew" type="password" autocomplete="new-password"></label><label class="field"><span class="lbl">${T('pwConfirm')}</span><input class="inp" id="pwNew2" type="password" autocomplete="new-password"></label><button type="submit" class="btn primary" id="pwSaveBtn">${T(btnKey)}</button></form>${S.role !== 'owner' ? `<p class="fine">${T('pwHint')}</p>` : ''}<div class="err" id="pwFormErr" role="alert" hidden></div>`;
}
function ownerPwHTML(){
  return S.role === 'owner' && S.hasPw ? `<div class="pw-view"><button type="button" class="btn small" id="pwViewBtn">${T('pwView')}</button><span class="pw-out" id="pwViewOut" hidden></span></div>` : '';
}
const changePwHTML = () => `<details class="pw-more"><summary>${T('pwChange')}</summary>${pwFormHTML('pwSave')}</details>`;
const delPwHTML = () => `<div class="pw-del"><button type="button" class="btn small danger" id="pwDelBtn">${T('pwDel')}</button><div class="stack" id="pwDelConfirm" hidden><p class="fine">${T('pwDelConfirm')}</p><div class="row-btns left"><button type="button" class="btn small" id="pwDelNo">${T('cancel')}</button><button type="button" class="btn small danger-solid" id="pwDelYes">${T('pwDelYes')}</button></div></div></div>`;
function renderLock(){
  const el = $('lockBox'); el.hidden = S.phase !== 'app'; if (S.phase !== 'app') return;
  if (S.hasPw && !S.unlocked) {
    el.innerHTML = `<div class="lock-head">${LOCK_SVG}<div><h3 class="sheet-title">${T('lockedTitle')}</h3><p class="fine">${T('lockedBody')}</p></div></div>
      <form class="lock-form" id="unlockForm" novalidate><label class="field"><span class="lbl">${T('pwLabel')}</span><input class="inp" id="pwIn" type="password" autocomplete="current-password"></label><button type="submit" class="btn primary" id="unlockBtn">${T('unlock')}</button></form>
      <div class="err" id="pwErr" role="alert" hidden></div>${ownerPwHTML()}${S.role === 'owner' ? changePwHTML() + delPwHTML() : ''}`;
    $('unlockForm').addEventListener('submit', e => { e.preventDefault(); doUnlock(); });
  } else if (S.hasPw) {
    el.innerHTML = `<div class="lock-head">${OPEN_SVG}<div><h3 class="sheet-title">${T('unlockedTitle')}</h3><p class="fine">${T('unlockedBody')}</p></div><button type="button" class="btn small push" id="lockBtn">${T('lockNow')}</button></div>
      ${ownerPwHTML()}${changePwHTML()}${delPwHTML()}`;
    $('lockBtn').onclick = () => relock();
  } else {
    el.innerHTML = `<div class="lock-head">${OPEN_SVG}<div><h3 class="sheet-title">${T('noPwTitle')}</h3><p class="fine">${T(S.role === 'owner' ? 'noPwOwner' : 'noPwOther')}</p></div></div>${pwFormHTML('pwSet')}`;
  }
  const pf = $('pwForm'); if (pf) pf.addEventListener('submit', e => { e.preventDefault(); savePw(); });
  const vb = $('pwViewBtn'); if (vb) vb.onclick = doViewPw;
  const db = $('pwDelBtn');
  if (db) {
    db.onclick = () => { db.hidden = true; $('pwDelConfirm').hidden = false; };
    $('pwDelNo').onclick = () => { db.hidden = false; $('pwDelConfirm').hidden = true; };
    $('pwDelYes').onclick = doDelPw;
  }
}
async function doDelPw(){
  const b = $('pwDelYes'); b.disabled = true;
  try {
    const r = await rpc('clear_settings_password', {p_old: S.role === 'owner' ? null : S.pw});
    if (!r.ok) { toast(codeMsg(r), true); b.disabled = false; return; }
    S.hasPw = false; S.pw = null; S.unlocked = false; S.setDirty = false;
    toast(t('pwDeleted')); renderLock(); fillSettings();
  } catch (e) { toast(codeMsg(e), true); b.disabled = false; }
}
async function doViewPw(){
  const out = $('pwViewOut'), btn = $('pwViewBtn');
  if (!out.hidden) { out.hidden = true; out.textContent = ''; btn.textContent = t('pwView'); return; }
  btn.disabled = true;
  try {
    const r = await rpc('get_settings_password');
    if (!r.ok) { toast(codeMsg(r), true); return; }
    out.textContent = r.password ? t('pwIs', {p: r.password}) + ' · ' + t('pwSetBy', {e: emailName(r.set_by), d: fmtDate(r.set_at, true)}) : t('pwOld');
    out.hidden = false; btn.textContent = t('pwHide');
  } catch (e) { toast(codeMsg(e), true); }
  finally { btn.disabled = false; }
}
function relock(quiet){ S.unlocked = false; S.pw = null; S.setDirty = false; if (!quiet) setMsg(''); renderLock(); fillSettings(); }
async function doUnlock(){
  const pw = $('pwIn').value; if (!pw) return;
  const b = $('unlockBtn'); b.disabled = true;
  try {
    const r = await rpc('check_settings_password', {p_password: pw});
    if (r.ok) { S.unlocked = true; S.pw = pw; S.setDirty = false; setMsg(''); renderLock(); fillSettings(); return; }
    if (r.code === 'no_password') { S.hasPw = false; renderLock(); fillSettings(); return; }
    showErr('pwErr', codeMsg(r)); $('pwIn').value = ''; $('pwIn').focus();
  } catch (e) { showErr('pwErr', codeMsg(e)); }
  const bb = $('unlockBtn'); if (bb) bb.disabled = false;
}
async function savePw(){
  const a = $('pwNew').value, b = $('pwNew2').value;
  if (a.length < 4) return showErr('pwFormErr', t('pwShort'));
  if (a !== b) return showErr('pwFormErr', t('pwMismatch'));
  showErr('pwFormErr', ''); $('pwSaveBtn').disabled = true;
  try {
    const r = await rpc('set_settings_password', {p_old: S.hasPw && S.role !== 'owner' ? S.pw : null, p_new: a});
    if (!r.ok) { showErr('pwFormErr', codeMsg(r)); $('pwSaveBtn').disabled = false; return; }
    S.hasPw = true; S.pw = a; S.unlocked = true; toast(t('pwSaved')); renderLock(); fillSettings();
  } catch (e) { showErr('pwFormErr', codeMsg(e)); $('pwSaveBtn').disabled = false; }
}

/* ---------- settings: rules ---------- */
function fillSettings(){
  if (S.phase !== 'app') return;
  const ro = !canEditSettings();
  ['sShop','sBaht','sValue','sMin','sBdayPct','sBdayCap','setSave'].forEach(id => { $(id).disabled = ro; });
  if (S.setDirty) return;
  const s = S.settings;
  $('sShop').value = s.shopName; $('sBaht').value = s.bahtPerPoint; $('sValue').value = s.pointValue; $('sMin').value = s.minRedeem;
  $('sBdayPct').value = s.bdayPct; $('sBdayCap').value = s.bdayCap;
  updateRuleEx();
}
function updateRuleEx(){
  const b = parseFloat($('sBaht').value) || S.settings.bahtPerPoint, v = parseFloat($('sValue').value) || S.settings.pointValue, p = parseInt($('sMin').value, 10) || S.settings.minRedeem;
  $('ruleEx').textContent = t('ruleEx', {a: fmtB(b * 4), e: 4, p: p, v: fmtB(p * v), r: fmtNum(v / b * 100)});
}
function setMsg(msg, err){ const m = $('setMsg'); m.textContent = msg; m.classList.toggle('err-text', !!err); }
async function saveSettings(){
  if (!canEditSettings()) return;
  const f = id => parseFloat(String($(id).value).replace(/,/g, ''));
  const baht = f('sBaht'), val = f('sValue'), min = parseInt($('sMin').value, 10), pct = f('sBdayPct'), capRaw = String($('sBdayCap').value).trim(), cap = capRaw === '' ? 0 : f('sBdayCap');
  if (!(baht > 0) || !(val > 0) || !(min >= 1) || !(pct >= 0 && pct <= 100) || !(cap >= 0)) return setMsg(t('setInvalid'), true);
  $('setSave').disabled = true;
  try {
    const r = await rpc('update_settings', {p_password: S.hasPw ? S.pw : null, p_shop_name: $('sShop').value.trim().slice(0, 60), p_baht_per_point: r2(baht), p_point_value: r2(val), p_min_redeem: min, p_bday_pct: r2(pct), p_bday_cap: r2(cap)});
    if (r.ok) { S.settings = mapSettings(r.settings); S.setDirty = false; setMsg(t('settingsSaved')); toast(t('settingsSaved')); renderHeader(); fillSettings(); }
    else { setMsg(codeMsg(r), true); if (r.code === 'wrong') relock(true); }
  } catch (e) { setMsg(codeMsg(e), true); }
  finally { $('setSave').disabled = !canEditSettings(); }
}

/* ---------- settings: staff accounts ---------- */
async function loadStaff(){
  if (S.role !== 'owner') return;
  try { S.staff = await q(S.sb.from('staff').select('user_id,email,role,created_at').order('created_at', {ascending: true})); } catch (e) { S.staff = []; }
  renderStaff();
}
function renderStaff(){
  const el = $('staffBox');
  if (S.role !== 'owner' || S.phase !== 'app') { el.hidden = true; return; }
  el.hidden = false;
  const label = r => T(r === 'owner' ? 'roleOwner' : r === 'staff' ? 'roleStaff' : 'rolePending');
  el.innerHTML = `<h3 class="sheet-title">${T('staffTitle')}</h3><p class="fine">${T('staffBody')}</p><ul class="staff-list">${(S.staff || []).map(r => `<li>
      <span class="st-email">${esc(r.email || '—')}${r.email === S.email ? ` <span class="muted small">(${T('you')})</span>` : ''}</span>
      <span class="pill ${r.role === 'pending' ? 'gold-soft' : 'muted'}">${label(r.role)}</span>
      ${r.role === 'owner' ? '' : `<button type="button" class="btn small ${r.role === 'pending' ? 'primary' : ''}" data-staff="${esc(r.user_id)}" data-role="${r.role === 'pending' ? 'staff' : 'pending'}">${T(r.role === 'pending' ? 'approve' : 'revoke')}</button>`}
    </li>`).join('')}</ul>`;
}
async function setStaffRole(id, role, btn){
  btn.disabled = true;
  try { const r = await rpc('set_staff_role', {p_user: id, p_role: role}); if (!r.ok) toast(codeMsg(r), true); }
  catch (e) { toast(codeMsg(e), true); }
  loadStaff();
}

/* ---------- wiring ---------- */
function wireStatic(){
  document.addEventListener('click', e => {
    const lb = e.target.closest('[data-lang]');
    if (lb) { S.lang = lb.dataset.lang; try { localStorage.setItem('lp-lang', S.lang); } catch (er) {} renderAll(); return; }
    const tb = e.target.closest('[data-tab]'); if (tb) { setTab(tb.dataset.tab); return; }
    const rc = e.target.closest('.qitem,.led'); if (rc) { setTab('counter'); doLookup(rc.dataset.phone); window.scrollTo(0, 0); return; }
    const mr = e.target.closest('button.mrow'); if (mr) { setTab('counter'); doLookup(mr.dataset.phone); window.scrollTo(0, 0); return; }
    const chp = e.target.closest('.chip[data-f]'); if (chp) { S.mFilter = chp.dataset.f; $('copyFallback').hidden = true; renderMembers(); return; }
    const rp = e.target.closest('.chip[data-rp]'); if (rp) { S.rPeriod = rp.dataset.rp; loadReport(); return; }
    const sb = e.target.closest('[data-staff]'); if (sb) { setStaffRole(sb.dataset.staff, sb.dataset.role, sb); }
  });
  const ph = $('phone');
  ph.addEventListener('input', () => { const p = digits(ph.value).slice(0, 10); setPhone(p); if (p.length === 10) doLookup(p); });
  ph.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doLookup(S.phone); } });
  $('findBtn').addEventListener('click', () => doLookup(S.phone));
  $('newCustBtn').addEventListener('click', nextCustomer);
  $('mSearch').addEventListener('input', e => { S.mQuery = e.target.value; renderMembers(); });
  $('setForm').addEventListener('submit', e => { e.preventDefault(); saveSettings(); });
  $('setForm').addEventListener('input', () => { S.setDirty = true; setMsg(''); updateRuleEx(); });
  $('logoutBtn').addEventListener('click', doLogout);
}
let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (S.tab === 'report' && S.report) renderReport(); }, 150); });
function initLang(){
  let l = null; try { l = localStorage.getItem('lp-lang'); } catch (e) {}
  if (!I18N[l]) { const n = (navigator.language || 'en').toLowerCase(); l = n.startsWith('zh') ? 'zh' : n.startsWith('th') ? 'th' : 'en'; }
  S.lang = l;
}

async function boot(){
  initLang(); wireStatic(); renderAll();
  const cfg = window.POINTS_CONFIG || {};
  const url = String(cfg.supabaseUrl || '').trim(), key = String(cfg.supabaseKey || '').trim();
  if (!/^https:\/\/.+/.test(url) || key.length < 20) { showPhase('noconfig'); return; }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') { showPhase('neterr'); return; }
  S.sb = window.supabase.createClient(url, key, {auth: {persistSession: true, autoRefreshToken: true}});
  S.sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && S.phase !== 'login') { resetData(); showPhase('login'); } });
  let session = null;
  try { const r = await S.sb.auth.getSession(); session = r && r.data && r.data.session; } catch (e) {}
  if (!session) { showPhase('login'); return; }
  await enter();
}
boot();
})();
