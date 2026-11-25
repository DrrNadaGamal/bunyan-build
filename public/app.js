import * as L from './logic.js';
import { STR, SRV } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('bn.' + k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem('bn.' + k, JSON.stringify(v)), del: (k) => localStorage.removeItem('bn.' + k) };
const rid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
const S = { lang: new URLSearchParams(location.search).get('lang') || LS.get('lang', 'en'), token: LS.get('token', null), me: LS.get('me', null), data: null, busy: false, modal: null, pid: '', q: '' };
if (!STR[S.lang]) S.lang = 'en';
const t = (k) => STR[S.lang][k] ?? STR.en[k] ?? k;
const srvErr = (m) => (S.lang === 'ar' && SRV.ar[m]) || m;
const ar = () => S.lang === 'ar';
const nf = (n, d = 0) => Number(n).toLocaleString(ar() ? 'ar-EG' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const egp = (n) => `${nf(n)} ${t('cur')}`;
const dF = (k) => (k ? new Date(k + 'T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : '');
const mLabel = (m) => new Date(m + '-01T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', month: 'short' });
const nm = (o) => (o ? (ar() && o.nameAr ? o.nameAr : o.name) : '');
const D = () => S.data;
const role = () => S.me?.role;
const pOf = (id) => (D()?.projects || []).find((p) => p.id === id);
const bOf = (id) => (D()?.boq || []).find((b) => b.id === id);
const ctOf = (id) => (D()?.contracts || []).find((c) => c.id === id);
const subOf = (id) => (D()?.subs || []).find((s) => s.id === id);
const NAV = {
  owner: ['dashboard', 'projects', 'boq', 'claims', 'subs', 'site', 'snags', 'docs', 'reports', 'settings', 'audit'],
  pm: ['dashboard', 'projects', 'boq', 'claims', 'subs', 'site', 'snags', 'docs', 'reports'],
  engineer: ['dashboard', 'projects', 'boq', 'site', 'snags', 'docs'],
  accountant: ['dashboard', 'boq', 'claims', 'subs', 'reports'],
  client: ['dashboard', 'projects', 'site', 'snags', 'docs'],
};
const route = () => {
  const r = (location.hash.replace(/^#\//, '') || '').split('?')[0];
  if (!S.token || !S.me) return 'login';
  const allowed = NAV[role()] || [];
  return allowed.includes(r) ? r : allowed[0];
};
const canManage = () => ['owner', 'pm'].includes(role());
const canSite = () => ['owner', 'pm', 'engineer'].includes(role());

// ---------- api ----------
async function api(method, op) {
  let r;
  try { r = await fetch('/api/data', { method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: op ? JSON.stringify({ op }) : undefined }); }
  catch { throw new Error('Network error'); }
  const j = await r.json().catch(() => null);
  if (r.status === 401 && !(op && op.type === 'login')) { logout(false); throw new Error(srvErr('Sign in again')); }
  if (!r.ok) { const e = new Error(srvErr(j?.error) || 'Server error'); e.status = r.status; throw e; }
  return j;
}
async function refresh() { S.data = await api('GET'); }
async function doOp(op, msg) {
  if (S.busy) return null;
  S.busy = true;
  try { const j = await api('POST', op); S.data = j; if (msg) toast(msg); return j.result || {}; }
  catch (e) { toast(e.message, true); return null; } finally { S.busy = false; }
}
function toast(msg, bad) {
  const el = $('#toast'); el.innerHTML = `<div class="${bad ? 'err' : ''}">${esc(msg)}</div>`;
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.innerHTML = ''), 4500);
}
function logout(reload = true) {
  LS.del('token'); LS.del('me'); S.token = null; S.me = null; S.data = null; S.modal = null;
  if (reload) { location.hash = '#/'; render(); }
}

// ---------- small views ----------
const pill = (txt, cls = '') => `<span class="pill ${cls}">${esc(txt)}</span>`;
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
const meter = (a, b, cls = '') => `<div class="meter ${cls}" role="progressbar" aria-valuenow="${pct(a, b)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct(a, b)}%"></i></div>`;
const sel = (id, list, cur, extra = '') => `<select id="${id}" ${extra}>${list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const field = (id, label, inner) => `<div class="f"><label for="${id}">${esc(label)}</label>${inner}</div>`;
const inp = (id, label, v = '', attrs = '') => field(id, label, `<input id="${id}" value="${esc(v)}" ${attrs}>`);
const chk = (id, label, on) => `<label class="chk"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${esc(label)}</label>`;
const val = (id) => $(id)?.value?.trim() ?? '';
const num = (id) => (val(id) === '' ? NaN : Number(val(id)));
const checked = (id) => !!$(id)?.checked;
const modalBg = (inner, wide) => `<div class="modal-bg" data-act="bg"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${inner}</div></div>`;
const mhead = (title) => `<div class="bar"><h2>${esc(title)}</h2><span class="sp"></span><button class="btn sm" data-act="close">${esc(t('b.close'))}</button></div>`;
const kpi = (n, l, s = '', cls = '') => `<div class="card kpi ${cls}"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;
const opts = (list, ns) => list.map((x) => [x, t(ns + '.' + x)]);
const tbl = (head, rows, empty) => `<div class="tw"><table><thead><tr>${head.map((h) => `<th${h[1] ? ' class="num"' : ''}>${esc(Array.isArray(h) ? h[0] : h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="empty">${esc(empty || t('noRows'))}</td></tr>`}</tbody></table></div>`;
const projOpts = () => D().projects.map((p) => [p.id, nm(p)]);
const LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#26343f"/><path d="M8 40h32M12 40V20l12-8 12 8v20" stroke="#e2703a" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 40v-8h8v8" fill="#e2703a"/></svg>';
function shell(inner) {
  const tt = D().reports.totals;
  const nav = NAV[role()].map((r) => `<a href="#/${r}" class="${route() === r ? 'on' : ''}">${esc(t('nav.' + r))}${r === 'claims' && tt.submittedClaims ? ` <b class="dot">${tt.submittedClaims}</b>` : ''}${r === 'site' && tt.pendingMaterials ? ` <b class="dot">${tt.pendingMaterials}</b>` : ''}</a>`).join('');
  return `<div class="top"><a class="brand" href="#/${NAV[role()][0]}">${LOGO}<span>Bunyan<small>${esc(t('app.tag'))}</small></span></a>
    <nav class="nav">${nav}</nav><div class="tools"><span class="pill">${esc(t('role.' + role()))} · ${esc(nm(S.me))}</span>
    <button class="btn ghost sm" data-act="lang">${ar() ? 'English' : 'العربية'}</button><button class="btn ghost sm" data-act="logout">${esc(t('signin.out'))}</button></div></div><main>${inner}</main>${modalHtml()}`;
}
function loginPage() {
  return `<div class="login"><div class="logo">${LOGO}<div><h1>Bunyan</h1><p class="sub">${esc(t('app.tag'))}</p></div></div>
    <div class="card"><p class="muted">${esc(t('signin.pick'))}</p>
    <div class="demo-users">${L.DEMO_USERS.map((u) => `<button class="btn" data-act="pin" data-pin="${u.pin}"><span>${esc(ar() ? u.labelAr : u.label)}</span><b>${u.pin}</b></button>`).join('')}</div>
    <div class="f"><label for="pin">${esc(t('signin.pin'))}</label><input id="pin" class="big" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="••••"></div>
    <button class="btn pri big" data-act="login" style="width:100%">${esc(t('signin.go'))}</button>
    <div class="row" style="margin-top:.4rem"><button class="btn sm" data-act="lang">${ar() ? 'English' : 'العربية'}</button></div></div></div>`;
}

// ---------- insights ----------
function insightText(i) {
  const d = D();
  const pname = (id) => nm(pOf(id));
  if (i.kind === 'cost_overrun') return pname(i.projectId) + ': ' + t('ins.cost_overrun').replace('{a}', egp(i.actual)).replace('{b}', egp(i.estimate));
  if (i.kind === 'deadline_risk') return pname(i.projectId) + ': ' + t('ins.deadline_risk').replace('{p}', nf(i.progress)).replace('{q}', nf(i.planned));
  if (i.kind === 'log_missing') return pname(i.projectId) + ': ' + t('ins.log_missing');
  if (i.kind === 'item_low') { const b = bOf(i.boqId); return (b ? nm(pOf(b.projectId)) + ' · ' + esc(b.code) : '') + ' ' + t('ins.item_low').replace('{c}', b ? b.code : '').replace('{p}', nf(i.pct)); }
  if (i.kind === 'milestone_overdue') { const m = d.projects.flatMap((p) => p.phases).flatMap((p) => p.milestones).find((x) => x.id === i.milestoneId); return (m ? nm(m) : '') + ' · ' + t('ins.milestone_overdue').replace('{d}', dF(i.due)); }
  if (i.kind === 'claim_waiting') { const c = (d.claims || []).find((x) => x.id === i.claimId); const ct = c && ctOf(c.contractId); return (ct ? nm(subOf(ct.subId)) : '') + ' · ' + t('ins.claim_waiting').replace('{a}', egp(i.amount)); }
  if (i.kind === 'snag_critical') { const sn = (d.snags || []).find((x) => x.id === i.snagId); return (sn ? nm(pOf(sn.projectId)) + ' · ' + esc(sn.location) : '') + ' · ' + t('ins.snag_critical'); }
  return i.kind;
}
const insPill = (k) => pill(t(k === 'cost_overrun' || k === 'snag_critical' || k === 'milestone_overdue' ? 'sev.critical' : 'sev.major'), k === 'cost_overrun' || k === 'snag_critical' || k === 'milestone_overdue' ? 'bad' : 'off');

// ---------- dashboard ----------
function bars(rows) {
  const mx = Math.max(1, ...rows.map((r) => r.cost));
  return `<div class="bars2" role="img" aria-label="${esc(t('r.byMonth'))}">${rows.map((r) => `<div class="col2" title="${esc(mLabel(r.m) + ': ' + egp(r.cost))}"><div class="pair"><div class="b" style="height:${Math.max(2, Math.round((r.cost / mx) * 100))}%"></div></div><small>${esc(mLabel(r.m))}</small></div>`).join('')}</div>`;
}
function pgDashboard() {
  const d = D(), tt = d.reports.totals;
  if (role() === 'client') {
    const p = d.projects[0];
    return `<div class="bar"><h1>${esc(t('nav.dashboard'))}</h1></div>
    <p class="notice">${esc(t('clientNote'))}</p>
    <div class="grid kpis">${kpi(nf(d.projects.length), t('k.active'))}${kpi(p ? p.progressPct + '%' : '—', t('p.progress'), p ? t('p.planned') + ' ' + p.plannedPct + '%' : '')}${kpi(nf(d.snags.filter((x) => x.status !== 'closed').length), t('nav.snags'))}${kpi(nf(d.docs.length), t('nav.docs'))}</div>
    ${d.projects.map(projectCard).join('')}`;
  }
  return `<div class="bar"><h1>${esc(t('nav.dashboard'))}</h1></div>
  <div class="grid kpis">${kpi(nf(tt.activeProjects), t('k.active'))}${kpi(egp(tt.contractValue), t('k.contract'))}${kpi(tt.avgProgress + '%', t('k.progress'))}${kpi(egp(tt.monthCost), t('k.monthCost'))}${kpi(nf(tt.submittedClaims), t('k.claimsWaiting'), tt.submittedClaims ? egp(tt.submittedAmount) : '', tt.submittedClaims ? 'warn' : 'good')}${kpi(nf(tt.criticalSnags), t('k.snags'), '', tt.criticalSnags ? 'warn' : 'good')}</div>
  <div class="grid two" style="margin-top:1rem">
  <section class="card"><h2>${esc(t('r.byMonth'))}</h2>${bars(d.reports.byMonth)}</section>
  <section class="card"><h2>${esc(t('insights'))}</h2>
  ${d.insights.length ? d.insights.map((i) => `<div class="att-row"><span>${insPill(i.kind)} ${esc(insightText(i))}</span></div>`).join('') : `<p class="empty">${esc(t('none'))}</p>`}</section></div>
  <h2 style="margin:1.2rem 0 .4rem">${esc(t('nav.projects'))}</h2>
  ${d.projects.map(projectCard).join('')}`;
}

// ---------- projects ----------
function projectCard(p) {
  const money = role() !== 'client';
  const st = pill(t('st.' + p.status), p.status === 'active' ? 'ok' : p.status === 'closed' ? 'off' : 'warn');
  return `<section class="card proj"><div class="bar"><h3>${esc(nm(p))} ${st}</h3><span class="sp"></span>
    ${canManage() ? `<button class="btn sm" data-act="editproject" data-id="${p.id}">${esc(t('b.edit'))}</button>` : ''}
    ${role() === 'owner' && p.status === 'active' ? `<button class="btn sm" data-act="holdproject" data-id="${p.id}">${esc(t('b.holdProject'))}</button>` : ''}
    ${role() === 'owner' && p.status !== 'active' ? `<button class="btn sm" data-act="activateproject" data-id="${p.id}">${esc(t('b.activateProject'))}</button>` : ''}
    ${role() === 'owner' && p.status !== 'closed' ? `<button class="btn sm danger" data-act="closeproject" data-id="${p.id}">${esc(t('b.closeProject'))}</button>` : ''}</div>
  <p class="muted small">${esc(t('p.client'))}: ${esc(p.client)} · ${esc(t('p.site'))}: ${esc(p.site)} · ${esc(t('p.start'))}: ${esc(dF(p.startDate))} · ${esc(t('p.deadline'))}: ${esc(dF(p.deadline))}</p>
  <div class="prow"><b>${esc(t('p.progress'))}</b><div class="pbar"><i class="done" style="width:${p.progressPct}%"></i><i class="plan" style="width:${p.plannedPct}%"></i></div><b class="num">${p.progressPct}% / ${p.plannedPct}%</b></div>
  <div class="grid kpis sm">
    ${kpi(egp(p.contractValue), t('p.value'))}${money ? kpi(egp(p.estimate), t('p.estimate')) + kpi(egp(p.actual), t('p.actual'), '', p.actual > p.estimate ? 'warn' : '') + kpi(egp(p.margin), t('p.margin'), '', p.margin < 0 ? 'warn' : 'good') : ''}
    ${kpi(nf(p.openSnags), t('nav.snags'), '', p.criticalSnags ? 'warn' : '')}${role() !== 'client' ? kpi(nf(p.pendingMaterials), t('mats.pending')) : ''}
  </div>
  ${role() === 'client' && p.certificates ? `<div class="certs"><h4>${esc(t('certs.title'))}</h4>${tbl([[t('certs.no')], [t('certs.amount')], [t('certs.status')]], p.certificates.map((c) => `<tr><td><b>${esc(c.certNo)}</b></td><td class="num">${egp(c.certified)}</td><td>${pill(t('cl.' + c.status), c.status === 'paid' ? 'ok' : 'ice')}</td></tr>`))}</div>` : ''}
  <details><summary>${esc(t('ph.name'))} · ${esc(t('nav.docs'))}</summary>
  ${p.phases.map((ph) => `<div class="mrow"><div style="flex:1"><b>${esc(nm(ph))}</b> <span class="small muted">${ph.weight}% · ${esc(dF(ph.plannedStart))} → ${esc(dF(ph.plannedEnd))}</span>
    ${ph.milestones.map((m) => `<div class="small msrow">${m.doneDate ? pill(t('ms.done'), 'ok') : m.due < D().today ? pill(t('sev.major'), 'bad') : pill(dF(m.due), 'off')} ${esc(nm(m))} ${canSite() && p.status === 'active' ? `<button class="btn xs" data-act="milestone" data-id="${m.id}" data-on="${m.doneDate ? '0' : '1'}">${esc(m.doneDate ? t('ms.reopen') : t('ms.mark'))}</button>` : ''}</div>`).join('')}</div>
    ${canManage() && p.status !== 'closed' ? `<button class="btn sm" data-act="addmilestone" data-id="${ph.id}">${esc(t('b.addMilestone'))}</button>` : ''}</div>`).join('')}
  ${canManage() && p.status !== 'closed' ? `<div style="margin-top:.5rem"><button class="btn sm" data-act="addphase" data-id="${p.id}">${esc(t('b.addPhase'))}</button></div>` : ''}
  </details></section>`;
}
function pgProjects() {
  return `<div class="bar"><h1>${esc(t('nav.projects'))}</h1><span class="sp"></span>${role() === 'owner' ? `<button class="btn pri" data-act="newproject">${esc(t('b.addProject'))}</button>` : ''}</div>
  ${D().projects.map(projectCard).join('')}`;
}

// ---------- BOQ and costs ----------
function pgBoq() {
  const d = D();
  const pid = S.pid || d.projects[0]?.id || '';
  const items = d.boq.filter((b) => b.projectId === pid);
  const costs = d.costs.filter((c) => c.projectId === pid).slice(0, 60);
  const p = pOf(pid);
  const canMoney = role() === 'accountant';
  const rows = items.map((b) => `<tr>
    <td><b>${esc(b.code)}</b></td><td>${esc(ar() && b.descAr ? b.descAr : b.desc)}<div class="small muted">${esc(t('cat.' + b.cat))}</div></td>
    <td>${esc(t('unit.' + b.unit))}</td><td class="num">${nf(b.qty)}</td><td class="num">${nf(b.rate)}</td>
    <td class="num">${nf(b.executed)}</td><td style="min-width:110px">${meter(b.executed, b.qty, b.executed >= b.qty ? 'ok' : '')}</td>
    <td class="num">${nf(b.qty - b.executed)}</td><td class="num">${nf(b.qty * b.rate)}</td>
    <td class="acts1">${canSite() && p?.status === 'active' && b.executed < b.qty ? `<button class="btn sm pri" data-act="progress" data-id="${b.id}">${esc(t('b.progress'))}</button>` : ''}${canMoney ? `<button class="btn sm" data-act="addcost" data-id="${b.id}">${esc(t('b.addCost'))}</button>` : ''}${canManage() ? `<button class="btn sm" data-act="editboq" data-id="${b.id}">${esc(t('b.edit'))}</button>` : ''}${role() === 'owner' ? `<button class="btn sm danger" data-act="delboq" data-id="${b.id}">${esc(t('b.delete'))}</button>` : ''}</td></tr>`);
  const crows = costs.map((c) => { const b = bOf(c.boqId); return `<tr><td>${esc(dF(c.date))}</td><td>${esc(b ? b.code : '')}</td><td>${pill(t('ck.' + c.kind))}</td><td class="small">${esc(c.note)}</td><td class="num neg">${nf(c.amount)}</td>${role() === 'owner' ? `<td><button class="btn sm danger" data-act="delcost" data-id="${c.id}">${esc(t('b.delete'))}</button></td>` : ''}</tr>`; });
  return `<div class="bar"><h1>${esc(t('nav.boq'))}</h1><span class="sp"></span>
    ${canManage() ? `<button class="btn pri" data-act="newboq">${esc(t('b.addBoq'))}</button><button class="btn" data-act="importopen">${esc(t('b.import'))}</button><button class="btn" data-act="csv">${esc(t('b.csv'))}</button>` : ''}</div>
  <div class="f" style="max-width:340px"><label>${esc(t('f.project'))}</label>${sel('f-project', projOpts(), pid, 'data-act-change="pid"')}</div>
  ${p ? `<p class="muted small">${esc(nm(p))} · ${esc(t('p.estimate'))}: ${egp(p.estimate)} · ${esc(t('p.actual'))}: ${egp(p.actual)}</p>` : ''}
  ${tbl([[t('boq.code')], [t('boq.desc')], [t('boq.unit')], [t('boq.qty'), 1], [t('boq.rate'), 1], [t('boq.exec'), 1], [t('p.progress')], [t('boq.left'), 1], [t('boq.value'), 1], ['']], rows)}
  <h2 style="margin:1.2rem 0 .4rem">${esc(t('b.addCost'))}</h2>
  ${tbl([[t('cost.date')], [t('boq.code')], [t('cost.kind')], [t('cost.note')], [t('cost.amount'), 1], role() === 'owner' ? [''] : null].filter(Boolean), crows)}
  `;
}

// ---------- claims ----------
function claimRow(cl) {
  const ct = ctOf(cl.contractId), sub = ct && subOf(ct.subId), p = ct && pOf(ct.projectId);
  const st = pill(t('cls.' + cl.status), cl.status === 'paid' ? 'ok' : cl.status === 'certified' ? 'ice' : cl.status === 'rejected' ? 'bad' : cl.status === 'submitted' ? 'warn' : 'off');
  return `<tr><td><b>${cl.certNo ? esc(cl.certNo) : '#' + cl.no}</b><div class="small muted">${esc(nm(sub))} · ${esc(p ? nm(p) : '')}</div></td>
    <td>${st}</td>
    <td class="num">${nf(cl.amount)}</td><td class="num">${cl.certified ? nf(cl.certified) : '—'}</td>
    <td class="num">${cl.certified ? nf(cl.payable) : '—'}</td>
    <td class="num">${nf(cl.paidTotal)}</td><td class="num">${cl.certified ? nf(cl.leftToPay) : '—'}</td>
    <td class="acts1">
    ${canManage() && cl.status === 'draft' ? `<button class="btn sm pri" data-act="submitclaim" data-id="${cl.id}">${esc(t('b.submit'))}</button>` : ''}
    ${role() === 'owner' && cl.status === 'submitted' ? `<button class="btn sm pri" data-act="certifyclaim" data-id="${cl.id}">${esc(t('b.certify'))}</button>` : ''}
    ${role() === 'owner' && (cl.status === 'submitted' || cl.status === 'draft') ? `<button class="btn sm danger" data-act="rejectclaim" data-id="${cl.id}">${esc(t('b.reject'))}</button>` : ''}
    ${role() === 'accountant' && (cl.status === 'certified' || cl.status === 'paid') && cl.leftToPay > 0 ? `<button class="btn sm pri" data-act="payclaim" data-id="${cl.id}">${esc(t('b.pay'))}</button>` : ''}</td></tr>`;
}
function pgClaims() {
  const d = D();
  const sorted = [...d.claims].sort((a, b) => b.createdAt - a.createdAt);
  return `<div class="bar"><h1>${esc(t('nav.claims'))}</h1><span class="sp"></span>${canManage() ? `<button class="btn pri" data-act="newclaim">${esc(t('b.newClaim'))}</button>` : ''}</div>
  <p class="muted small">${esc(t('cl.payable'))}: ${D().retentionPct}%</p>
  ${tbl([[t('cl.no')], [t('cl.status')], [t('cl.amount'), 1], [t('cl.certified'), 1], [t('cl.payable'), 1], [t('cl.paid'), 1], [t('cl.left'), 1], ['']], sorted.map(claimRow))}`;
}

// ---------- subcontractors ----------
function pgSubs() {
  const d = D();
  const rows = d.contracts.map((ct) => {
    const sub = subOf(ct.subId), p = pOf(ct.projectId);
    const cls = d.claims.filter((x) => x.contractId === ct.id && x.status !== 'rejected');
    const claimed = cls.reduce((x, c) => x + c.amount, 0), certified = cls.reduce((x, c) => x + c.certified, 0), paid = cls.reduce((x, c) => x + c.paidTotal, 0);
    return `<tr><td><b>${esc(nm(sub))}</b><div class="small muted">${esc(t('trade.' + sub.trade))}</div></td><td>${esc(p ? nm(p) : '')}</td><td class="small">${esc(ct.scope)}</td>
      <td class="num">${nf(ct.value)}</td><td class="num">${nf(claimed)}</td><td class="num">${nf(certified)}</td><td class="num">${nf(paid)}</td>
      <td style="min-width:110px">${meter(paid, ct.value)}</td>
      ${canManage() ? `<td><button class="btn sm pri" data-act="newclaim" data-id="${ct.id}">${esc(t('b.newClaim'))}</button></td>` : ''}</tr>`;
  });
  return `<div class="bar"><h1>${esc(t('nav.subs'))}</h1><span class="sp"></span>${canManage() ? `<button class="btn pri" data-act="newsub">${esc(t('b.addSub'))}</button><button class="btn" data-act="newcontract">${esc(t('b.addContract'))}</button>` : ''}</div>
  ${tbl([[t('sub.name')], [t('f.project')], [t('sub.scope')], [t('sub.value'), 1], [t('sub.claimed'), 1], [t('sub.certified'), 1], [t('sub.paid'), 1], [t('p.progress')], canManage() ? [''] : null].filter(Boolean), rows)}`;
}

// ---------- site: daily logs + materials ----------
function pgSite() {
  const d = D();
  const pid = S.pid || d.projects[0]?.id || '';
  const logs = d.logs.filter((x) => x.projectId === pid);
  const mats = d.materials.filter((x) => x.projectId === pid);
  const p = pOf(pid);
  return `<div class="bar"><h1>${esc(t('nav.site'))}</h1><span class="sp"></span>
    ${canSite() && p?.status === 'active' ? `<button class="btn pri" data-act="newlog">${esc(t('b.newLog'))}</button><button class="btn" data-act="newmat">${esc(t('b.newMat'))}</button>` : ''}</div>
  <div class="f" style="max-width:340px"><label>${esc(t('f.project'))}</label>${sel('f-project', projOpts(), pid, 'data-act-change="pid"')}</div>
  <h2 style="margin:1rem 0 .4rem">${esc(t('b.newLog'))}</h2>
  ${tbl([[t('log.date')], [t('log.weather')], [t('log.workers'), 1], [t('log.work')], [t('log.issues')], canSite() && p?.status === 'active' ? [''] : null].filter(Boolean),
    logs.map((x) => `<tr><td>${esc(dF(x.date))}</td><td>${esc(t('w.' + x.weather))}</td><td class="num">${nf(x.workers)}</td><td class="small">${esc(x.work)}</td><td class="small">${esc(x.issues)}</td>${canSite() && p?.status === 'active' ? `<td><button class="btn sm" data-act="editlog" data-id="${x.id}">${esc(t('b.edit'))}</button></td>` : ''}</tr>`))}
  <h2 style="margin:1.2rem 0 .4rem">${esc(t('b.newMat'))}</h2>
  ${tbl([[t('mat.item')], [t('mat.qty'), 1], [t('boq.unit')], [t('mat.needed')], [t('mat.status')], ['']],
    mats.map((x) => `<tr><td>${esc(x.item)}</td><td class="num">${nf(x.qty)}</td><td>${esc(t('unit.' + x.unit))}</td><td>${esc(dF(x.neededBy))}</td>
      <td>${pill(t('mats.' + x.status), x.status === 'approved' ? 'ice' : x.status === 'received' ? 'ok' : x.status === 'rejected' ? 'bad' : 'warn')}${x.rejectReason ? `<div class="small muted">${esc(x.rejectReason)}</div>` : ''}</td>
      <td class="acts1">${canManage() && x.status === 'pending' ? `<button class="btn sm pri" data-act="approvemat" data-id="${x.id}">${esc(t('b.approve'))}</button><button class="btn sm danger" data-act="rejectmat" data-id="${x.id}">${esc(t('b.reject'))}</button>` : ''}${canSite() && x.status === 'approved' ? `<button class="btn sm pri" data-act="receivemat" data-id="${x.id}">${esc(t('b.receive'))}</button>` : ''}</td></tr>`))}
  `;
}

// ---------- snags ----------
function pgSnags() {
  const d = D();
  const rows = [...d.snags].sort((a, b) => (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0) || b.createdAt - a.createdAt);
  return `<div class="bar"><h1>${esc(t('nav.snags'))}</h1><span class="sp"></span>${canSite() ? `<button class="btn pri" data-act="newsnag">${esc(t('b.newSnag'))}</button>` : ''}</div>
  ${tbl([[t('f.project')], [t('sn.location')], [t('sn.desc')], [t('sn.sev')], [t('sn.status')], ['']],
    rows.map((x) => `<tr><td>${esc(nm(pOf(x.projectId)))}</td><td>${esc(x.location)}</td><td class="small">${esc(x.desc)}${x.closeNote ? `<div class="muted">${esc(x.closeNote)}</div>` : ''}</td>
      <td>${pill(t('sev.' + x.sev), x.sev === 'critical' ? 'bad' : x.sev === 'major' ? 'warn' : 'off')}</td>
      <td>${pill(t('sns.' + x.status), x.status === 'closed' ? 'ok' : x.status === 'in_progress' ? 'ice' : 'warn')}</td>
      <td class="acts1">${canSite() && x.status === 'open' ? `<button class="btn sm" data-act="startsnag" data-id="${x.id}">${esc(t('b.start'))}</button>` : ''}${canManage() && x.status !== 'closed' ? `<button class="btn sm pri" data-act="closesnag" data-id="${x.id}">${esc(t('b.close'))}</button>` : ''}${canManage() && x.status === 'closed' ? `<button class="btn sm" data-act="reopensnag" data-id="${x.id}">${esc(t('b.reopenS'))}</button>` : ''}</td></tr>`))}
  `;
}

// ---------- documents ----------
function pgDocs() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.docs'))}</h1><span class="sp"></span>${canSite() ? `<button class="btn pri" data-act="newdoc">${esc(t('b.newDoc'))}</button>` : ''}</div>
  ${tbl([[t('doc.title')], [t('f.project')], [t('doc.kind')], [t('doc.ref')], [t('doc.date')], canManage() ? [''] : null].filter(Boolean),
    d.docs.map((x) => `<tr><td><b>${esc(x.title)}</b><div class="small muted">${esc(x.note)}</div></td><td>${esc(nm(pOf(x.projectId)))}</td><td>${pill(t('dk.' + x.kind), 'ice')}</td><td class="small">${esc(x.ref)}</td><td>${esc(dF(x.date))}</td>${canManage() ? `<td><button class="btn sm danger" data-act="deldoc" data-id="${x.id}">${esc(t('b.delete'))}</button></td>` : ''}</tr>`))}
  `;
}

// ---------- reports ----------
function pgReports() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('r.title'))}</h1></div>
  <div class="grid two">
  <section class="card"><h2>${esc(t('r.byMonth'))}</h2>${bars(d.reports.byMonth)}</section>
  <section class="card"><h2>${esc(t('r.byCat'))}</h2>${d.reports.byCat.map((c) => `<div class="mrow"><div style="flex:1"><b>${esc(t('cat.' + c.cat))}</b>${meter(c.cost, Math.max(...d.reports.byCat.map((x) => x.cost)))}</div><b class="num">${egp(c.cost)}</b></div>`).join('') || `<p class="empty">${esc(t('noRows'))}</p>`}</section></div>
  <h2 style="margin:1.2rem 0 .4rem">${esc(t('r.vs'))}</h2>
  ${tbl([[t('f.project')], [t('p.status')], [t('p.progress')], [t('p.estimate'), 1], [t('p.actual'), 1], [t('p.margin'), 1]],
    d.projects.map((p) => `<tr><td>${esc(nm(p))}</td><td>${pill(t('st.' + p.status), p.status === 'active' ? 'ok' : 'off')}</td><td style="min-width:120px">${meter(p.progressPct, 100)}<div class="small muted">${p.progressPct}% / ${p.plannedPct}%</div></td><td class="num">${nf(p.estimate)}</td><td class="num">${nf(p.actual)}</td><td class="num ${p.margin < 0 ? 'neg' : 'ok-t'}">${nf(p.margin)}</td></tr>`))}`;
}

// ---------- settings + audit ----------
function pgSettings() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.settings'))}</h1></div>
  <section class="card" style="max-width:560px"><p class="muted small">${esc(t('s.note'))}</p>
  ${inp('st-ret', t('s.retention'), String(d.retentionPct), 'type="number" min="0" max="20" inputmode="numeric"')}
  <div class="acts"><button class="btn pri" data-act="savesettings">${esc(t('b.save'))}</button></div></section>
  <section class="card" style="max-width:560px;margin-top:1rem"><h2>${esc(t('msg.reset'))}</h2>
  <button class="btn danger" data-act="reset">${esc(t('msg.reset'))}</button></section>`;
}
function pgAudit() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.audit'))}</h1></div><p class="notice">${esc(t('auditNote'))}</p>
  ${tbl([[t('auditWhen')], [t('auditWho')], [t('auditAction')], [t('auditWhat')]],
    d.audit.map((a) => `<tr><td class="small">${new Date(a.ts).toLocaleString(ar() ? 'ar-EG' : 'en-GB', { timeZone: L.TZ })}</td><td>${esc(a.name)}</td><td>${pill(a.action, 'ice')}</td><td class="small">${esc(a.detail)}</td></tr>`))}`;
}

// ---------- modals ----------
function modalHtml() {
  const m = S.modal;
  if (!m) return '';
  const d = D();
  if (m.k === 'project') {
    const p = m.id ? pOf(m.id) : null;
    return modalBg(`${mhead(p ? t('b.edit') : t('b.addProject'))}
    ${inp('pr-name', t('f.name'), p?.name || '')}${inp('pr-nameAr', t('f.nameAr'), p?.nameAr || '')}${inp('pr-client', t('f.client'), p?.client || '')}${inp('pr-site', t('f.site'), p?.site || '')}
    ${inp('pr-value', t('f.value'), p ? String(p.contractValue) : '', 'type="number" min="10000" inputmode="numeric"')}
    ${inp('pr-start', t('f.start'), p?.startDate || d.today, 'type="date"')}${inp('pr-deadline', t('f.deadline'), p?.deadline || '', 'type="date"')}
    ${chk('pr-cv', t('f.clientVisible'), p ? p.clientVisible : false)}
    <div class="acts"><button class="btn pri" data-act="saveproject">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'phase') {
    return modalBg(`${mhead(t('b.addPhase'))}
    ${inp('ph-name', t('f.name'))}${inp('ph-nameAr', t('f.nameAr'))}${inp('ph-weight', t('f.weight'), '', 'type="number" min="1" max="100" inputmode="numeric"')}
    ${inp('ph-s', t('f.start'), d.today, 'type="date"')}${inp('ph-e', t('f.deadline'), '', 'type="date"')}
    <div class="acts"><button class="btn pri" data-act="savephase" data-id="${m.id}">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'milestone') {
    return modalBg(`${mhead(t('b.addMilestone'))}
    ${inp('ms-name', t('f.name'))}${inp('ms-nameAr', t('f.nameAr'))}${inp('ms-due', t('f.due'), '', 'type="date"')}
    <div class="acts"><button class="btn pri" data-act="savemilestone" data-id="${m.id}">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'boq') {
    const b = m.id ? bOf(m.id) : null;
    const pid = b ? b.projectId : (S.pid || d.projects[0]?.id);
    return modalBg(`${mhead(b ? t('b.edit') : t('b.addBoq'))}
    ${b ? '' : field('bq-project', t('f.project'), sel('bq-project', projOpts(), pid))}
    ${inp('bq-code', t('f.code'), b?.code || '')}${inp('bq-desc', t('f.desc'), b?.desc || '')}${inp('bq-descAr', t('f.descAr'), b?.descAr || '')}
    ${field('bq-unit', t('f.unit'), sel('bq-unit', opts(L.UNITS, 'unit'), b?.unit || 'm3'))}${field('bq-cat', t('f.cat'), sel('bq-cat', opts(L.BOQ_CATS, 'cat'), b?.cat || 'concrete'))}
    ${inp('bq-qty', t('f.qty'), b ? String(b.qty) : '', 'type="number" min="1" inputmode="numeric"')}${inp('bq-rate', t('f.rate'), b ? String(b.rate) : '', 'type="number" min="1" inputmode="numeric"')}
    <div class="acts"><button class="btn pri" data-act="saveboq" data-id="${b ? b.id : ''}">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'progress') {
    const b = bOf(m.id);
    return modalBg(`${mhead(t('b.progress') + ' · ' + (b ? b.code : ''))}
    <p class="muted small">${esc(b ? (ar() && b.descAr ? b.descAr : b.desc) : '')} · ${esc(t('boq.left'))}: ${b ? nf(b.qty - b.executed) : ''} ${b ? esc(t('unit.' + b.unit)) : ''}</p>
    ${inp('pg-qty', t('f.execQty'), '', 'type="number" min="1" inputmode="numeric"')}
    <div class="acts"><button class="btn pri" data-act="saveprogress" data-id="${m.id}">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'cost') {
    const b = bOf(m.id);
    return modalBg(`${mhead(t('b.addCost') + ' · ' + (b ? b.code : ''))}
    ${field('co-kind', t('f.kind'), sel('co-kind', opts(L.COST_KINDS, 'ck'), 'material'))}
    ${inp('co-amt', t('f.amount'), '', 'type="number" min="1" inputmode="numeric"')}${inp('co-date', t('f.date'), d.today, 'type="date" max="' + d.today + '"')}${inp('co-note', t('f.note'), '', 'maxlength="120"')}
    <div class="acts"><button class="btn pri" data-act="savecost" data-id="${m.id}">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'import') {
    return modalBg(`${mhead(t('b.import'))}
    ${field('im-project', t('f.project'), sel('im-project', projOpts(), S.pid || d.projects[0]?.id))}
    <p class="muted small">code, description, unit, category, qty, rate</p>
    <div class="f"><label for="im-text">CSV</label><textarea id="im-text" rows="8" style="width:100%"></textarea></div>
    <div class="acts"><button class="btn pri" data-act="saveimport">${esc(t('b.import'))}</button></div>`, true);
  }
  if (m.k === 'sub') {
    return modalBg(`${mhead(t('b.addSub'))}
    ${inp('sb-name', t('f.name'))}${inp('sb-nameAr', t('f.nameAr'))}${field('sb-trade', t('f.trade'), sel('sb-trade', opts(L.TRADES, 'trade'), 'concrete'))}${inp('sb-phone', t('f.phone'))}
    <div class="acts"><button class="btn pri" data-act="savesub">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'contract') {
    return modalBg(`${mhead(t('b.addContract'))}
    ${field('ct-sub', t('sub.name'), sel('ct-sub', d.subs.map((x) => [x.id, nm(x)])))}
    ${field('ct-project', t('f.project'), sel('ct-project', projOpts().filter(([id]) => pOf(id)?.status !== 'closed')))}
    ${inp('ct-scope', t('f.scope'))}${inp('ct-value', t('sub.value') + ' (' + t('cur') + ')', '', 'type="number" min="1000" inputmode="numeric"')}
    <div class="acts"><button class="btn pri" data-act="savecontract">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'claim') {
    const ctId = m.id || d.contracts[0]?.id;
    const ct = ctOf(ctId);
    return modalBg(`${mhead(t('b.newClaim'))}
    ${field('cl-ct', t('f.contract'), sel('cl-ct', d.contracts.filter((c) => pOf(c.projectId)?.status === 'active').map((c) => [c.id, nm(subOf(c.subId)) + ' · ' + nm(pOf(c.projectId)) + ' · ' + egp(c.value)]), ctId))}
    ${inp('cl-amt', t('cl.amount') + ' (' + t('cur') + ')', '', 'type="number" min="1" inputmode="numeric"')}${inp('cl-note', t('f.note'), '', 'maxlength="120"')}
    <div class="acts"><button class="btn pri" data-act="saveclaim">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'certify') {
    const cl = d.claims.find((x) => x.id === m.id);
    return modalBg(`${mhead(t('b.certify') + ' #' + (cl ? cl.no : ''))}
    <p class="muted small">${esc(t('cl.amount'))}: ${cl ? egp(cl.amount) : ''}</p>
    ${inp('cf-amt', t('f.certified'), cl ? String(cl.amount) : '', 'type="number" min="1" inputmode="numeric"')}
    <div class="acts"><button class="btn pri" data-act="savecertify" data-id="${m.id}">${esc(t('b.certify'))}</button></div>`);
  }
  if (m.k === 'pay') {
    const cl = d.claims.find((x) => x.id === m.id);
    return modalBg(`${mhead(t('b.pay') + ' ' + (cl ? cl.certNo : ''))}
    <p class="muted small">${esc(t('cl.left'))}: ${cl ? egp(cl.leftToPay) : ''}</p>
    ${inp('py-amt', t('f.amount'), cl ? String(cl.leftToPay) : '', 'type="number" min="1" inputmode="numeric"')}${inp('py-date', t('f.date'), d.today, 'type="date" max="' + d.today + '"')}
    <div class="acts"><button class="btn pri" data-act="savepay" data-id="${m.id}">${esc(t('b.pay'))}</button></div>`);
  }
  if (m.k === 'reason') {
    return modalBg(`${mhead(t('b.reject'))}${inp('rs-text', t('f.reason'), '', 'maxlength="120"')}
    <div class="acts"><button class="btn pri" data-act="savereason" data-id="${m.id}" data-k="${m.what}">${esc(t('b.reject'))}</button></div>`);
  }
  if (m.k === 'mat') {
    return modalBg(`${mhead(t('b.newMat'))}
    ${field('mt-project', t('f.project'), sel('mt-project', projOpts().filter(([id]) => pOf(id)?.status === 'active'), S.pid))}
    ${inp('mt-item', t('f.item'))}${inp('mt-qty', t('f.qty'), '', 'type="number" min="1" inputmode="numeric"')}
    ${field('mt-unit', t('f.unit'), sel('mt-unit', opts(L.UNITS, 'unit'), 'pc'))}${inp('mt-needed', t('f.neededBy'), d.today, 'type="date"')}${inp('mt-note', t('f.note'), '', 'maxlength="120"')}
    <div class="acts"><button class="btn pri" data-act="savemat">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'log') {
    const lg = m.id ? d.logs.find((x) => x.id === m.id) : null;
    return modalBg(`${mhead(lg ? t('b.edit') : t('b.newLog'))}
    ${lg ? '' : field('lg-project', t('f.project'), sel('lg-project', projOpts().filter(([id]) => pOf(id)?.status === 'active'), S.pid))}
    ${lg ? '' : inp('lg-date', t('f.date'), d.today, 'type="date" max="' + d.today + '"')}
    ${field('lg-weather', t('f.weather'), sel('lg-weather', opts(L.WEATHER, 'w'), lg?.weather || 'sunny'))}
    ${inp('lg-workers', t('f.workers'), lg ? String(lg.workers) : '', 'type="number" min="1" max="500" inputmode="numeric"')}
    <div class="f"><label for="lg-work">${esc(t('f.work'))}</label><textarea id="lg-work" rows="3" style="width:100%" maxlength="500">${esc(lg?.work || '')}</textarea></div>
    <div class="f"><label for="lg-issues">${esc(t('f.issues'))}</label><textarea id="lg-issues" rows="2" style="width:100%" maxlength="300">${esc(lg?.issues || '')}</textarea></div>
    <div class="acts"><button class="btn pri" data-act="savelog" data-id="${lg ? lg.id : ''}">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'snag') {
    return modalBg(`${mhead(t('b.newSnag'))}
    ${field('sn-project', t('f.project'), sel('sn-project', projOpts().filter(([id]) => pOf(id)?.status !== 'closed'), S.pid))}
    ${inp('sn-loc', t('f.location'))}
    <div class="f"><label for="sn-desc">${esc(t('f.desc'))}</label><textarea id="sn-desc" rows="3" style="width:100%" maxlength="200"></textarea></div>
    ${field('sn-sev', t('f.sev'), sel('sn-sev', opts(L.SNAG_SEV, 'sev'), 'minor'))}
    <div class="acts"><button class="btn pri" data-act="savesnag">${esc(t('b.save'))}</button></div>`);
  }
  if (m.k === 'closesnag') {
    return modalBg(`${mhead(t('b.close'))}${inp('cs-note', t('sn.note'), '', 'maxlength="120"')}
    <div class="acts"><button class="btn pri" data-act="saveclosesnag" data-id="${m.id}">${esc(t('b.close'))}</button></div>`);
  }
  if (m.k === 'doc') {
    return modalBg(`${mhead(t('b.newDoc'))}
    ${field('dc-project', t('f.project'), sel('dc-project', projOpts(), S.pid))}
    ${inp('dc-title', t('f.title'))}${field('dc-kind', t('doc.kind'), sel('dc-kind', opts(L.DOC_KINDS, 'dk'), 'drawing'))}
    ${inp('dc-ref', t('f.ref'), '', 'maxlength="40"')}${inp('dc-date', t('f.date'), d.today, 'type="date" max="' + d.today + '"')}${inp('dc-note', t('f.note'), '', 'maxlength="150"')}
    <div class="acts"><button class="btn pri" data-act="savedoc">${esc(t('b.save'))}</button></div>`);
  }
  return '';
}

// ---------- CSV ----------
function csvText(rows) { return rows.map((r) => r.map((c) => { let x = String(c ?? ''); if (/^[=+\-@\t\r]/.test(x)) x = "'" + x; return /[",\r\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; }).join(',')).join('\r\n'); }
function download(name, rows) {
  const blob = new Blob(['﻿' + csvText(rows)], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function parseCsv(text) {
  const rows = []; let cur = '', row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// ---------- actions ----------
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'bg') { if (e.target === el) { S.modal = null; render(); } return; }
  if (act === 'lang') { S.lang = ar() ? 'en' : 'ar'; LS.set('lang', S.lang); render(); return; }
  if (act === 'logout') { logout(); return; }
  if (act === 'pin') { signin(el.dataset.pin); return; }
  if (act === 'login') { signin(val('#pin')); return; }
  if (act === 'close') { S.modal = null; render(); return; }
  if (!S.data) return;
  const ok = async (op, msg, after) => { const r = await doOp(op, msg); if (r) { if (after) after(r); render(); } return r; };
  const shut = () => (S.modal = null);
  const open = (k, extra = {}) => { S.modal = { k, id, ...extra }; render(); };
  if (act === 'newproject') return open('project');
  if (act === 'editproject') return open('project');
  if (act === 'saveproject') { const o = { name: val('#pr-name'), nameAr: val('#pr-nameAr'), client: val('#pr-client'), site: val('#pr-site'), contractValue: num('#pr-value'), startDate: val('#pr-start'), deadline: val('#pr-deadline'), clientVisible: checked('#pr-cv') }; return ok(id ? { type: 'updateProject', projectId: id, ...o } : { type: 'addProject', ...o, key: rid() }, t('msg.saved'), shut); }
  if (act === 'holdproject') return ok({ type: 'setProjectStatus', projectId: id, status: 'on_hold' }, t('msg.saved'));
  if (act === 'activateproject') return ok({ type: 'setProjectStatus', projectId: id, status: 'active' }, t('msg.saved'));
  if (act === 'closeproject') { if (!confirm(t('b.closeProject') + '?')) return; return ok({ type: 'setProjectStatus', projectId: id, status: 'closed' }, t('msg.saved')); }
  if (act === 'addphase') return open('phase');
  if (act === 'savephase') return ok({ type: 'addPhase', projectId: id, name: val('#ph-name'), nameAr: val('#ph-nameAr'), weight: num('#ph-weight'), plannedStart: val('#ph-s'), plannedEnd: val('#ph-e'), key: rid() }, t('msg.saved'), shut);
  if (act === 'addmilestone') return open('milestone');
  if (act === 'savemilestone') return ok({ type: 'addMilestone', phaseId: id, name: val('#ms-name'), nameAr: val('#ms-nameAr'), due: val('#ms-due'), key: rid() }, t('msg.saved'), shut);
  if (act === 'milestone') return ok({ type: 'milestoneDone', milestoneId: id, done: el.dataset.on === '1' }, t('msg.saved'));
  if (act === 'newboq') return open('boq');
  if (act === 'editboq') return open('boq');
  if (act === 'saveboq') { const o = { code: val('#bq-code'), desc: val('#bq-desc'), descAr: val('#bq-descAr'), unit: val('#bq-unit'), cat: val('#bq-cat'), qty: num('#bq-qty'), rate: num('#bq-rate') }; return ok(id ? { type: 'updateBoq', boqId: id, ...o } : { type: 'addBoq', projectId: val('#bq-project'), ...o, key: rid() }, t('msg.saved'), shut); }
  if (act === 'delboq') { if (!confirm(t('confirm.delete'))) return; return ok({ type: 'deleteBoq', boqId: id }, t('msg.deleted')); }
  if (act === 'progress') return open('progress');
  if (act === 'saveprogress') return ok({ type: 'recordProgress', boqId: id, qty: num('#pg-qty'), key: rid() }, t('msg.progress'), shut);
  if (act === 'addcost') return open('cost');
  if (act === 'savecost') return ok({ type: 'addCost', boqId: id, kind: val('#co-kind'), amount: num('#co-amt'), date: val('#co-date'), note: val('#co-note'), key: rid() }, t('msg.saved'), shut);
  if (act === 'delcost') { if (!confirm(t('confirm.delete'))) return; return ok({ type: 'deleteCost', costId: id }, t('msg.deleted')); }
  if (act === 'importopen') return open('import');
  if (act === 'saveimport') {
    const rows = parseCsv(val('#im-text')).map((r) => ({ code: r[0], desc: r[1], unit: r[2], cat: r[3], qty: Number(r[4]), rate: Number(r[5]) }));
    return ok({ type: 'importBoq', projectId: val('#im-project'), rows, key: rid() }, t('msg.saved'), (r) => { shut(); if (r.errors?.length) toast(r.errors.map((x) => x.row + ': ' + x.error).join(' · '), true); });
  }
  if (act === 'csv') { const rows = [[t('boq.code'), t('boq.desc'), t('boq.unit'), t('boq.cat'), t('boq.qty'), t('boq.rate'), t('boq.exec')]]; for (const b of D().boq) rows.push([b.code, ar() && b.descAr ? b.descAr : b.desc, b.unit, b.cat, b.qty, b.rate, b.executed]); download('bunyan-boq.csv', rows); return; }
  if (act === 'newsub') return open('sub');
  if (act === 'savesub') return ok({ type: 'addSub', name: val('#sb-name'), nameAr: val('#sb-nameAr'), trade: val('#sb-trade'), phone: val('#sb-phone'), key: rid() }, t('msg.saved'), shut);
  if (act === 'newcontract') return open('contract');
  if (act === 'savecontract') return ok({ type: 'addContract', subId: val('#ct-sub'), projectId: val('#ct-project'), scope: val('#ct-scope'), value: num('#ct-value'), key: rid() }, t('msg.saved'), shut);
  if (act === 'newclaim') return open('claim');
  if (act === 'saveclaim') return ok({ type: 'createClaim', contractId: val('#cl-ct'), amount: num('#cl-amt'), note: val('#cl-note'), key: rid() }, t('msg.saved'), shut);
  if (act === 'submitclaim') return ok({ type: 'submitClaim', claimId: id }, t('msg.submitted'));
  if (act === 'certifyclaim') return open('certify');
  if (act === 'savecertify') return ok({ type: 'certifyClaim', claimId: id, certified: num('#cf-amt'), key: rid() }, '', (r) => { shut(); toast(t('msg.certified').replace('{n}', r.certNo || '')); });
  if (act === 'rejectclaim') return open('reason', { what: 'claim' });
  if (act === 'savereason') { return el.dataset.k === 'claim' ? ok({ type: 'rejectClaim', claimId: id, reason: val('#rs-text') }, t('msg.rejected'), shut) : ok({ type: 'rejectMaterial', requestId: id, reason: val('#rs-text') }, t('msg.rejected'), shut); }
  if (act === 'payclaim') return open('pay');
  if (act === 'savepay') return ok({ type: 'payClaim', claimId: id, amount: num('#py-amt'), date: val('#py-date'), key: rid() }, t('msg.paid'), shut);
  if (act === 'newmat') return open('mat');
  if (act === 'savemat') return ok({ type: 'requestMaterial', projectId: val('#mt-project'), item: val('#mt-item'), qty: num('#mt-qty'), unit: val('#mt-unit'), neededBy: val('#mt-needed'), note: val('#mt-note'), key: rid() }, t('msg.saved'), shut);
  if (act === 'approvemat') return ok({ type: 'approveMaterial', requestId: id }, t('msg.approved'));
  if (act === 'rejectmat') return open('reason', { what: 'mat' });
  if (act === 'receivemat') return ok({ type: 'receiveMaterial', requestId: id }, t('msg.received'));
  if (act === 'newlog') return open('log');
  if (act === 'editlog') return open('log');
  if (act === 'savelog') { const o = { weather: val('#lg-weather'), workers: num('#lg-workers'), work: val('#lg-work'), issues: val('#lg-issues') }; return ok(id ? { type: 'updateLog', logId: id, ...o } : { type: 'addLog', projectId: val('#lg-project'), date: val('#lg-date'), ...o, key: rid() }, t('msg.saved'), shut); }
  if (act === 'newsnag') return open('snag');
  if (act === 'savesnag') return ok({ type: 'addSnag', projectId: val('#sn-project'), location: val('#sn-loc'), desc: val('#sn-desc'), sev: val('#sn-sev'), key: rid() }, t('msg.saved'), shut);
  if (act === 'startsnag') return ok({ type: 'startSnag', snagId: id }, t('msg.saved'));
  if (act === 'closesnag') return open('closesnag');
  if (act === 'saveclosesnag') return ok({ type: 'closeSnag', snagId: id, note: val('#cs-note') }, t('msg.closed'), shut);
  if (act === 'reopensnag') return ok({ type: 'reopenSnag', snagId: id }, t('msg.saved'));
  if (act === 'newdoc') return open('doc');
  if (act === 'savedoc') return ok({ type: 'addDoc', projectId: val('#dc-project'), title: val('#dc-title'), kind: val('#dc-kind'), ref: val('#dc-ref'), date: val('#dc-date'), note: val('#dc-note'), key: rid() }, t('msg.saved'), shut);
  if (act === 'deldoc') { if (!confirm(t('confirm.delete'))) return; return ok({ type: 'deleteDoc', docId: id }, t('msg.deleted')); }
  if (act === 'savesettings') return ok({ type: 'setSettings', retentionPct: num('#st-ret') }, t('msg.saved'));
  if (act === 'reset') { if (confirm(t('confirm.reset'))) await ok({ type: 'reset' }, t('msg.reset')); return; }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act-change]'); if (!el) return;
  if (el.dataset.actChange === 'pid') { S.pid = el.value; render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal) { S.modal = null; render(); }
  if (e.key === 'Enter' && document.activeElement?.id === 'pin') signin(val('#pin'));
});

// ---------- render ----------
const PAGES = { dashboard: pgDashboard, projects: pgProjects, boq: pgBoq, claims: pgClaims, subs: pgSubs, site: pgSite, snags: pgSnags, docs: pgDocs, reports: pgReports, settings: pgSettings, audit: pgAudit };
async function signin(pin) {
  try {
    const j = await api('POST', { type: 'login', pin: String(pin || '') });
    S.token = j.token; S.me = j.me; LS.set('token', S.token); LS.set('me', S.me);
    S.data = null; location.hash = '#/'; render();
  } catch (e) { toast(e.message, true); }
}
async function render() {
  document.documentElement.lang = S.lang; document.documentElement.dir = ar() ? 'rtl' : 'ltr';
  const app = $('#app');
  const r = route();
  if (r === 'login') { app.innerHTML = loginPage(); return; }
  if (!S.data) { app.innerHTML = '<p class="boot">Loading...</p>'; try { await refresh(); } catch (e) { app.innerHTML = `<p class="boot">${esc(e.message)}</p>`; return; } }
  app.innerHTML = shell(PAGES[r]());
}
window.addEventListener('hashchange', render);
render();
