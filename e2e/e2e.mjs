// Browser and API checks against a running Bunyan (local dev server or the live URL).
// Usage: node e2e/e2e.mjs http://localhost:3100   (needs Chrome at /usr/bin/google-chrome)
import puppeteer from 'puppeteer-core';
import * as L from '../public/logic.js';
const U = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
const errs = [];
async function newPage(w = 1280, h = 900) {
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function login(p, pin, lang = 'en') {
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear()); await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter'); await p.waitForSelector('.top .nav', { timeout: 15000 }); await sleep(400);
}
const go = async (p, r) => { await p.evaluate((r) => (location.hash = '#/' + r), r); await sleep(450); };
const body = async (p) => { for (let i = 0; i < 4; i++) { try { return await p.evaluate(() => document.body.innerText); } catch { await sleep(600); } } return ''; };
const bare = /undefined|NaN|\[object/;
async function api(token, method, bodyObj, raw) {
  const r = await fetch(U + '/api/data', { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: raw ?? (bodyObj ? JSON.stringify(bodyObj) : undefined) });
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
const tokenFor = async (pin) => (await api(null, 'POST', { op: { type: 'login', pin } })).j.token;
const T = { owner: await tokenFor('1111'), pm: await tokenFor('2222'), engineer: await tokenFor('3333'), accountant: await tokenFor('4444'), client: await tokenFor('5555') };
const post = (role, op) => api(T[role], 'POST', { op });
const view = async (role) => (await api(T[role], 'GET')).j;
await post('owner', { type: 'reset' });
let n = 0; const key = () => 'e2e-' + Date.now().toString(36) + '-' + ++n;
const today = L.dayKey(Date.now());

// ---------- API security ----------
ok((await api(null, 'GET')).status === 401, 'no token: 401');
ok((await api('garbage', 'GET')).status === 401, 'garbage token: 401');
const tv = T.client.split('.'); const forged = Buffer.from('u-owner.' + (Date.now() + 1e7)).toString('base64url') + '.' + tv[1];
ok((await api(forged, 'GET')).status === 401, 'forged token for another user: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: '9999' } })).status === 401, 'wrong PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: ['1111'] } })).status === 401, 'array PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: 1111 } })).status === 401, 'numeric PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: { $ne: 1 } } })).status === 401, 'object PIN: 401');
ok((await api(T.owner, 'POST', null, '{not json')).status === 400, 'malformed JSON: 400');
ok((await post('owner', { type: 'nope' })).status === 400, 'unknown action: 400');
ok((await post('owner', { type: 'constructor' })).status === 400, 'prototype name as action: 400');
ok((await post('owner', { type: '__proto__' })).status === 400, '__proto__ as action: 400');
ok((await post('owner', { type: 'toString' })).status === 400, 'toString as action: 400');
ok((await post('owner', { type: 'addSnag', pad: 'x'.repeat(70000) })).status === 413, 'oversized body: 413');
ok((await api(T.owner, 'DELETE')).status === 405, 'DELETE: 405');
ok((await api(T.owner, 'PUT', { op: { type: 'reset' } })).status === 405, 'PUT: 405');
ok((await api(T.owner, 'PATCH', { op: { type: 'reset' } })).status === 405, 'PATCH: 405');
ok((await post('pm', { type: 'reset' })).status === 403, 'pm cannot reset: 403');
ok((await post('engineer', { type: 'reset' })).status === 403, 'engineer cannot reset: 403');
ok((await post('accountant', { type: 'reset' })).status === 403, 'accountant cannot reset: 403');
ok((await post('client', { type: 'reset' })).status === 403, 'client cannot reset: 403');
ok((await api(null, 'POST', { op: { type: 'reset' } })).status === 401, 'reset without token: 401');

// ---------- client is read-only, everything refused ----------
const d30 = L.addDays(today, 30);
const clientOps = [
  { type: 'addProject', name: 'X', client: 'Y', site: 'Z', contractValue: 100000, startDate: today, deadline: d30 },
  { type: 'updateProject', projectId: 'p1', name: 'X', client: 'Y', site: 'Z', contractValue: 100000, startDate: today, deadline: d30 },
  { type: 'setProjectStatus', projectId: 'p1', status: 'closed' },
  { type: 'addPhase', projectId: 'p1', name: 'X', weight: 5, plannedStart: today, plannedEnd: d30 },
  { type: 'updatePhase', phaseId: 'ph1', name: 'X', weight: 5 },
  { type: 'addMilestone', phaseId: 'ph1', name: 'X', due: d30 },
  { type: 'milestoneDone', milestoneId: 'ms5' },
  { type: 'addBoq', projectId: 'p1', code: 'X-9', desc: 'XX', unit: 'm3', cat: 'concrete', qty: 5, rate: 5 },
  { type: 'updateBoq', boqId: 'q5', code: 'X-9', desc: 'XX', unit: 'm3', cat: 'concrete', qty: 5000, rate: 5 },
  { type: 'deleteBoq', boqId: 'q10' },
  { type: 'recordProgress', boqId: 'q5', qty: 1 },
  { type: 'importBoq', projectId: 'p1', rows: [{ code: 'X-1', desc: 'XX', unit: 'm3', cat: 'concrete', qty: 5, rate: 5 }] },
  { type: 'addCost', boqId: 'q5', kind: 'labor', amount: 5 },
  { type: 'deleteCost', costId: 'co1' },
  { type: 'addSub', name: 'ZZ Sub', trade: 'concrete' },
  { type: 'addContract', subId: 's1', projectId: 'p1', scope: 'XX', value: 5000 },
  { type: 'createClaim', contractId: 'ct1', amount: 100 },
  { type: 'submitClaim', claimId: 'cl8' },
  { type: 'certifyClaim', claimId: 'cl4', certified: 100 },
  { type: 'rejectClaim', claimId: 'cl4', reason: 'nope' },
  { type: 'payClaim', claimId: 'cl3', amount: 100 },
  { type: 'requestMaterial', projectId: 'p1', item: 'XX', qty: 1, unit: 'pc', neededBy: d30 },
  { type: 'approveMaterial', requestId: 'mr1' },
  { type: 'rejectMaterial', requestId: 'mr1', reason: 'nope' },
  { type: 'receiveMaterial', requestId: 'mr3' },
  { type: 'addLog', projectId: 'p1', weather: 'sunny', workers: 5, work: 'XXX' },
  { type: 'updateLog', logId: 'dl1', weather: 'sunny', workers: 5, work: 'XXX' },
  { type: 'addSnag', projectId: 'p1', location: 'XX', desc: 'YYY', sev: 'minor' },
  { type: 'startSnag', snagId: 'sn2' },
  { type: 'closeSnag', snagId: 'sn1', note: 'done' },
  { type: 'reopenSnag', snagId: 'sn3' },
  { type: 'addDoc', projectId: 'p1', title: 'XX', kind: 'other', date: today },
  { type: 'deleteDoc', docId: 'doc1' },
  { type: 'setSettings', retentionPct: 5 },
  { type: 'reset' },
];
let refused = 0;
for (const op of clientOps) { const r = await post('client', op); if (r.status === 403) refused++; else console.log('  client op not refused:', op.type, r.status, JSON.stringify(r.j).slice(0, 80)); }
ok(refused === clientOps.length, `client refused on all ${clientOps.length} write ops`);

// ---------- per-role permission lanes ----------
ok((await post('engineer', { type: 'addCost', boqId: 'q5', kind: 'labor', amount: 5 })).status === 403, 'engineer cannot add costs: 403');
ok((await post('accountant', { type: 'recordProgress', boqId: 'q5', qty: 1 })).status === 403, 'accountant cannot record progress: 403');
ok((await post('engineer', { type: 'createClaim', contractId: 'ct6', amount: 100 })).status === 403, 'engineer cannot create claims: 403');
ok((await post('accountant', { type: 'createClaim', contractId: 'ct6', amount: 100 })).status === 403, 'accountant cannot create claims: 403');
ok((await post('pm', { type: 'certifyClaim', claimId: 'cl4', certified: 100 })).status === 403, 'pm cannot certify: 403');
ok((await post('accountant', { type: 'certifyClaim', claimId: 'cl4', certified: 100 })).status === 403, 'accountant cannot certify: 403');
ok((await post('pm', { type: 'payClaim', claimId: 'cl3', amount: 100 })).status === 403, 'pm cannot pay: 403');
ok((await post('engineer', { type: 'approveMaterial', requestId: 'mr1' })).status === 403, 'engineer cannot approve materials: 403');
ok((await post('accountant', { type: 'receiveMaterial', requestId: 'mr3' })).status === 403, 'accountant cannot receive materials: 403');
ok((await post('accountant', { type: 'addLog', projectId: 'p1', weather: 'sunny', workers: 5, work: 'XXX' })).status === 403, 'accountant cannot log: 403');
ok((await post('pm', { type: 'deleteCost', costId: 'co1' })).status === 403, 'pm cannot delete costs: 403');
ok((await post('accountant', { type: 'deleteCost', costId: 'co1' })).status === 403, 'accountant cannot delete costs: 403');
ok((await post('pm', { type: 'setSettings', retentionPct: 5 })).status === 403, 'pm cannot change settings: 403');
ok((await post('pm', { type: 'addProject', name: 'X', client: 'Y', site: 'Z', contractValue: 100000, startDate: today, deadline: d30 })).status === 403, 'pm cannot add projects: 403');
ok((await post('pm', { type: 'setProjectStatus', projectId: 'p1', status: 'on_hold' })).status === 403, 'pm cannot change project status: 403');
ok((await post('engineer', { type: 'addSub', name: 'ZZ Sub', trade: 'concrete' })).status === 403, 'engineer cannot add subs: 403');
ok((await post('accountant', { type: 'addBoq', projectId: 'p1', code: 'X-9', desc: 'XX', unit: 'm3', cat: 'concrete', qty: 5, rate: 5 })).status === 403, 'accountant cannot add BOQ lines: 403');
ok((await post('engineer', { type: 'closeSnag', snagId: 'sn1', note: 'done' })).status === 403, 'engineer cannot close snags: 403');
ok((await post('engineer', { type: 'deleteDoc', docId: 'doc1' })).status === 403, 'engineer cannot delete docs: 403');
ok((await post('accountant', { type: 'addSnag', projectId: 'p1', location: 'XX', desc: 'YYY', sev: 'minor' })).status === 403, 'accountant cannot add snags: 403');

// ---------- role views ----------
const cv = await view('client');
ok(cv.projects.length === 1 && cv.costs.length === 0 && cv.boq.length === 0 && cv.claims.length === 0 && cv.subs.length === 0 && cv.contracts.length === 0 && cv.materials.length === 0 && cv.audit.length === 0, 'client view: his project only, nothing internal');
ok(cv.projects[0].certificates.length === 4 && !('actual' in cv.projects[0]) && !('margin' in cv.projects[0]), 'client sees four certificates, not costs or margin');
ok(!JSON.stringify(cv).includes('Delta Concrete'), 'client response carries no subcontractor names');
ok(cv.reports.totals.submittedClaims === 0 && cv.reports.totals.submittedAmount === 0, 'client totals carry no claim money');
const ev = await view('engineer');
ok(ev.projects.length === 3 && ev.audit.length === 0 && ev.users.length === 0, 'engineer sees all projects but no audit or users');
const av = await view('accountant');
ok(av.claims.length === 8 && av.reports.byMonth.length === 12 && av.claims[2].payable === 1425000, 'accountant sees claims with payable amounts and 12 months of reports');
const ov0 = await view('owner');
ok(ov0.projects.length === 3 && ov0.users.length === 5, 'owner sees everything including the user list');
ok(ov0.insights.some((i) => i.kind === 'milestone_overdue') && ov0.insights.some((i) => i.kind === 'claim_waiting') && ov0.insights.some((i) => i.kind === 'snag_critical') && ov0.insights.some((i) => i.kind === 'log_missing'), 'the seeded alerts all fire');
ok(ov0.reports.totals.contractValue === 35800000 && ov0.reports.totals.submittedClaims === 2 && ov0.reports.totals.submittedAmount === 2000000, 'totals: EGP 35,800,000 under contract, two claims waiting worth 2,000,000');
const p1v = ov0.projects.find((p) => p.id === 'p1');
ok(p1v.estimate === 25425000 && p1v.doneValue === 10512500 && p1v.progressPct === 41 && p1v.plannedPct === 40, 'p1: estimate 25,425,000, done 10,512,500, 41% against 40% planned');

// ---------- the payment cycle with 5% retention ----------
let r = await post('pm', { type: 'createClaim', contractId: 'ct6', amount: 900000, key: key() });
ok(r.status === 200 && r.j.result.claimId, 'pm drafts the first claim against contract ct6 (900,000)');
const claimId = r.j.result.claimId;
ok((await post('pm', { type: 'submitClaim', claimId })).status === 200, 'pm submits the claim');
r = await post('owner', { type: 'certifyClaim', claimId, certified: 700000 });
ok(r.status === 200 && r.j.result.certNo === 'PC-2026-006', 'owner certifies 700,000 as ' + (r.j.result?.certNo || r.j.error));
r = await post('accountant', { type: 'payClaim', claimId, amount: 666000 });
ok(r.status === 400 && /payable balance/.test(r.j.error), 'paying more than certified minus retention is refused');
r = await post('accountant', { type: 'payClaim', claimId, amount: 665000 });
ok(r.status === 200 && r.j.result.status === 'paid', 'accountant pays 665,000 = 700,000 less 5% retention, claim paid');
r = await post('accountant', { type: 'payClaim', claimId, amount: 1 });
ok(r.status === 400, 'one pound more on a paid claim is refused');
ok((await view('accountant')).claims.find((c) => c.id === claimId).status === 'paid', 'claim shows as paid in the view');
r = await post('pm', { type: 'createClaim', contractId: 'ct6', amount: 1 });
ok(r.status === 400 && /exceed the contract value/.test(r.j.error), 'a claim beyond the contract value is refused');
ok((await post('owner', { type: 'certifyClaim', claimId, certified: 100 })).status === 400, 'certifying a paid claim: 400');
ok((await post('pm', { type: 'createClaim', contractId: 'ct6', amount: 'abc' })).status === 400, 'non-numeric claim: 400');
ok((await post('pm', { type: 'createClaim', contractId: 'ct6', amount: -5 })).status === 400, 'negative claim: 400');
ok((await post('pm', { type: 'createClaim', contractId: 'ct6', amount: 0 })).status === 400, 'zero claim: 400');
r = await post('pm', { type: 'createClaim', contractId: 'ct4', amount: 250000, key: key() });
ok(r.status === 200, 'pm drafts a 250,000 claim against contract ct4');
const clId2 = r.j.result.claimId;
ok((await post('pm', { type: 'submitClaim', claimId: clId2 })).status === 200, 'submitted');
ok((await post('owner', { type: 'certifyClaim', claimId: clId2, certified: 250001 })).status === 400, 'certifying more than claimed: 400');
ok((await post('owner', { type: 'certifyClaim', claimId: clId2, certified: -1 })).status === 400, 'negative certification: 400');
ok((await post('owner', { type: 'certifyClaim', claimId: clId2, certified: 'x' })).status === 400, 'text certification: 400');
ok((await post('accountant', { type: 'payClaim', claimId: clId2, amount: 100 })).status === 400, 'paying before certification: 400');
ok((await post('owner', { type: 'certifyClaim', claimId: clId2, certified: 250000 })).status === 200, 'certified in full');
r = await post('accountant', { type: 'payClaim', claimId: clId2, amount: 237500 });
ok(r.status === 200 && r.j.result.status === 'paid', 'paid in full with retention held');
r = await post('pm', { type: 'createClaim', contractId: 'ct5', amount: 1000001 });
ok(r.status === 400 && /exceed/.test(r.j.error), 'claims beyond the remaining contract value are refused');
ok((await post('owner', { type: 'certifyClaim', claimId: 'zz', certified: 1 })).status === 400, 'certifying a missing claim: 400');
ok((await post('pm', { type: 'submitClaim', claimId: 'zz' })).status === 400, 'submitting a missing claim: 400');
ok((await post('accountant', { type: 'payClaim', claimId: 'zz', amount: 1 })).status === 400, 'paying a missing claim: 400');
ok((await post('pm', { type: 'submitClaim', claimId: 'cl3' })).status === 400, 'submitting a certified claim: 400');
r = await post('owner', { type: 'rejectClaim', claimId: 'cl8', reason: 'Scope not agreed' });
ok(r.status === 200, 'owner rejects the draft claim cl8');
ok((await post('pm', { type: 'submitClaim', claimId: 'cl8' })).status === 400, 'a rejected claim cannot be submitted');
ok((await post('pm', { type: 'createClaim', contractId: 'ct2', amount: 500000 })).status === 200, 'rejected claims free up the contract: 500,000 fits again');
ok((await post('pm', { type: 'createClaim', contractId: 'ct2', amount: 800001 })).status === 400, 'but 800,001 over the remaining 800,000 is refused');

// ---------- idempotency ----------
const dupK = key();
ok((await post('pm', { type: 'addSub', name: 'E2E Subcontractors', trade: 'steelwork', key: dupK })).status === 200, 'sub added');
r = await post('pm', { type: 'addSub', name: 'E2E Subcontractors', trade: 'steelwork', key: dupK });
ok(r.status === 200 && r.j.result.duplicate === true, 'same key again: duplicate acknowledged, not applied');
ok((await view('pm')).subs.filter((s) => s.name === 'E2E Subcontractors').length === 1, 'one sub on file');
ok((await post('pm', { type: 'addSub', name: 'e2e subcontractors', trade: 'steelwork' })).status === 400, 'the same name without a key: 400');
const logK = key();
ok((await post('engineer', { type: 'addLog', projectId: 'p2', weather: 'sunny', workers: 10, work: 'Block work, villa 3', key: logK })).status === 200, 'daily log filed for p2 today');
r = await post('engineer', { type: 'addLog', projectId: 'p2', weather: 'sunny', workers: 10, work: 'Block work, villa 3', key: logK });
ok(r.status === 200 && r.j.result.duplicate === true, 'same log key: duplicate acknowledged');
ok((await view('engineer')).logs.filter((x) => x.projectId === 'p2' && x.date === today).length === 1, 'one p2 log for today');

// ---------- progress and costs ----------
r = await post('pm', { type: 'recordProgress', boqId: 'q5', qty: 100 });
ok(r.status === 200 && r.j.result.executed === 1100, 'pm records 100 m3 of skeleton work on q5 (1,100 of 1,800)');
r = await post('pm', { type: 'recordProgress', boqId: 'q5', qty: 701 });
ok(r.status === 400 && /exceed the planned quantity/.test(r.j.error), 'execution beyond the BOQ quantity is refused');
ok((await post('pm', { type: 'recordProgress', boqId: 'q5', qty: 0 })).status === 400, 'zero progress: 400');
ok((await post('pm', { type: 'recordProgress', boqId: 'q5', qty: -1 })).status === 400, 'negative progress: 400');
ok((await post('pm', { type: 'recordProgress', boqId: 'q5', qty: 'x' })).status === 400, 'text progress: 400');
ok((await post('pm', { type: 'recordProgress', boqId: 'q16', qty: 1 })).status === 400, 'progress on a closed project: 400');
ok((await post('pm', { type: 'recordProgress', boqId: 'zz', qty: 1 })).status === 400, 'progress on a missing line: 400');
const before5 = (await view('accountant')).costs.filter((c) => c.boqId === 'q5').reduce((x, c) => x + c.amount, 0);
r = await post('accountant', { type: 'addCost', boqId: 'q5', kind: 'labor', amount: 40000 });
ok(r.status === 200 && r.j.result.costId, 'accountant books 40,000 of labor on q5');
ok((await view('accountant')).costs.filter((c) => c.boqId === 'q5').reduce((x, c) => x + c.amount, 0) === before5 + 40000, 'the BOQ actuals moved by 40,000');
ok((await post('accountant', { type: 'addCost', boqId: 'q5', kind: 'labor', amount: 0 })).status === 400, 'zero cost: 400');
ok((await post('accountant', { type: 'addCost', boqId: 'q5', kind: 'labor', amount: -10 })).status === 400, 'negative cost: 400');
ok((await post('accountant', { type: 'addCost', boqId: 'q5', kind: 'banana', amount: 10 })).status === 400, 'unknown cost kind: 400');
ok((await post('accountant', { type: 'addCost', boqId: 'zz', kind: 'labor', amount: 10 })).status === 400, 'cost on a missing line: 400');
ok((await post('accountant', { type: 'addCost', boqId: 'q5', kind: 'labor', amount: 10, date: L.addDays(today, 1) })).status === 400, 'a cost dated in the future: 400');
r = await post('accountant', { type: 'addCost', boqId: 'q5', kind: 'labor', amount: 30000 });
ok(r.status === 200, 'a cost to delete books');
ok((await post('engineer', { type: 'deleteCost', costId: r.j.result.costId })).status === 403, 'engineer cannot delete: 403');
ok((await post('owner', { type: 'deleteCost', costId: r.j.result.costId })).status === 200, 'owner deletes the wrong entry');
ok((await view('accountant')).costs.filter((c) => c.boqId === 'q5').reduce((x, c) => x + c.amount, 0) === before5 + 40000, 'actuals back to where they were after deletion');
ok((await post('owner', { type: 'deleteCost', costId: 'zz' })).status === 400, 'deleting a missing cost: 400');

// ---------- settings and retention ----------
r = await post('owner', { type: 'setSettings', retentionPct: 10 });
ok(r.status === 200 && r.j.settings.retentionPct === 10, 'owner changes retention to 10%');
ok((await view('accountant')).claims.find((c) => c.id === 'cl3').payable === 1350000, 'the open certificate recomputes to 1,500,000 less 10%');
ok((await post('owner', { type: 'setSettings', retentionPct: 5 })).status === 200, 'retention back to 5%');
ok((await post('owner', { type: 'setSettings', retentionPct: 21 })).status === 400, 'retention over 20%: 400');
ok((await post('owner', { type: 'setSettings', retentionPct: -1 })).status === 400, 'negative retention: 400');
ok((await post('owner', { type: 'setSettings', retentionPct: 'x' })).status === 400, 'text retention: 400');

// ---------- materials ----------
r = await post('engineer', { type: 'requestMaterial', projectId: 'p1', item: '16mm rebar', qty: 15, unit: 'ton', neededBy: L.addDays(today, 4), key: key() });
ok(r.status === 200 && r.j.result.requestId, 'site engineer requests 15 t of rebar');
const mrId = r.j.result.requestId;
ok((await post('pm', { type: 'approveMaterial', requestId: mrId })).status === 200, 'pm approves');
ok((await post('engineer', { type: 'receiveMaterial', requestId: mrId })).status === 200, 'engineer marks it received on site');
ok((await post('engineer', { type: 'receiveMaterial', requestId: mrId })).status === 400, 'receiving twice: 400');
ok((await post('pm', { type: 'approveMaterial', requestId: mrId })).status === 400, 'approving a received request: 400');
ok((await post('accountant', { type: 'receiveMaterial', requestId: 'mr3' })).status === 403, 'accountant cannot receive: 403');
ok((await post('accountant', { type: 'approveMaterial', requestId: 'mr1' })).status === 403, 'accountant cannot approve: 403');
ok((await post('engineer', { type: 'receiveMaterial', requestId: 'mr1' })).status === 400, 'receiving a pending request: 400');
ok((await post('engineer', { type: 'receiveMaterial', requestId: 'zz' })).status === 400, 'receiving a missing request: 400');
ok((await post('engineer', { type: 'requestMaterial', projectId: 'p1', item: 'xx', qty: 0, unit: 'pc', neededBy: today })).status === 400, 'zero quantity: 400');
ok((await post('engineer', { type: 'requestMaterial', projectId: 'p1', item: 'xx', qty: -2, unit: 'pc', neededBy: today })).status === 400, 'negative quantity: 400');
ok((await post('engineer', { type: 'requestMaterial', projectId: 'p1', item: 'xx', qty: 1, unit: 'pc', neededBy: L.addDays(today, -1) })).status === 400, 'a needed-by date in the past: 400');
ok((await post('engineer', { type: 'requestMaterial', projectId: 'p1', item: 'xx', qty: 1, unit: 'banana', neededBy: today })).status === 400, 'unknown unit: 400');
ok((await post('engineer', { type: 'requestMaterial', projectId: 'p3', item: 'xx', qty: 1, unit: 'pc', neededBy: today })).status === 400, 'materials for a closed project: 400');
r = await post('pm', { type: 'rejectMaterial', requestId: 'mr2', reason: 'Enough steel on site' });
ok(r.status === 200, 'pm rejects the steel request with a reason');
ok((await post('pm', { type: 'rejectMaterial', requestId: 'mr2', reason: 'again' })).status === 400, 'rejecting twice: 400');

// ---------- daily logs ----------
ok((await post('engineer', { type: 'addLog', projectId: 'p1', weather: 'sunny', workers: 20, work: 'test' })).status === 200, 'engineer files the p1 log for today');
ok((await post('engineer', { type: 'addLog', projectId: 'p1', weather: 'sunny', workers: 20, work: 'test' })).status === 400, 'a second log for the same day: 400');
ok((await post('engineer', { type: 'addLog', projectId: 'p1', date: L.addDays(today, 1), weather: 'sunny', workers: 20, work: 'test' })).status === 400, 'a log in the future: 400');
ok((await post('engineer', { type: 'addLog', projectId: 'p1', date: L.addDays(today, -400), weather: 'sunny', workers: 20, work: 'test' })).status === 400, 'a log more than a year old: 400');
ok((await post('engineer', { type: 'addLog', projectId: 'p2', weather: 'sunny', workers: -1, work: 'test' })).status === 400, 'negative workers: 400');
ok((await post('engineer', { type: 'addLog', projectId: 'p2', weather: 'sunny', workers: 501, work: 'test' })).status === 400, 'over 500 workers: 400');
ok((await post('engineer', { type: 'addLog', projectId: 'zz', weather: 'sunny', workers: 1, work: 'test' })).status === 400, 'log on a missing project: 400');
ok((await post('pm', { type: 'addLog', projectId: 'p3', weather: 'sunny', workers: 1, work: 'test' })).status === 400, 'a log on a closed project: 400');
ok((await post('accountant', { type: 'addLog', projectId: 'p2', weather: 'sunny', workers: 1, work: 'test' })).status === 403, 'accountant cannot file logs: 403');
const p1log = (await view('engineer')).logs.find((x) => x.projectId === 'p1' && x.date === today);
ok((await post('pm', { type: 'updateLog', logId: p1log.id, weather: 'windy', workers: 22, work: 'Corrected entry' })).status === 200, 'pm corrects the log');

// ---------- snags ----------
ok((await post('engineer', { type: 'startSnag', snagId: 'sn2' })).status === 200, 'engineer takes the critical snag in progress');
ok((await post('engineer', { type: 'startSnag', snagId: 'sn2' })).status === 400, 'starting it twice: 400');
ok((await post('pm', { type: 'closeSnag', snagId: 'sn2', note: 'Sleeve realigned and cast' })).status === 200, 'pm closes it with a note');
ok((await post('pm', { type: 'closeSnag', snagId: 'sn2', note: 'again' })).status === 400, 'closing a closed snag: 400');
ok((await post('pm', { type: 'reopenSnag', snagId: 'sn2' })).status === 200, 'pm reopens it after inspection');
ok((await post('pm', { type: 'reopenSnag', snagId: 'sn1' })).status === 400, 'reopening an open snag: 400');
ok((await post('engineer', { type: 'startSnag', snagId: 'zz' })).status === 400, 'starting a missing snag: 400');
ok((await post('engineer', { type: 'addSnag', projectId: 'p3', location: 'XX', desc: 'YYY', sev: 'minor' })).status === 400, 'a snag on a closed project: 400');
ok((await post('engineer', { type: 'addSnag', projectId: 'p1', location: 'XX', desc: 'YYY', sev: 'banana' })).status === 400, 'unknown severity: 400');
r = await post('engineer', { type: 'addSnag', projectId: 'p1', location: 'Col C3', desc: 'Chipped edge <script>window.__xss=1</script> repaired', sev: 'minor', key: key() });
ok(r.status === 200, 'a snag description with script tags is stored');
const xssSnag = r.j.result.snagId;

// ---------- projects, phases, milestones ----------
ok((await post('owner', { type: 'setProjectStatus', projectId: 'p1', status: 'closed' })).status === 400, 'closing a project with open snags: 400');
ok((await post('owner', { type: 'setProjectStatus', projectId: 'zz', status: 'closed' })).status === 400, 'closing a missing project: 400');
ok((await post('owner', { type: 'setProjectStatus', projectId: 'p1', status: 'banana' })).status === 400, 'unknown status: 400');
ok((await post('owner', { type: 'setProjectStatus', projectId: 'p1', status: 'on_hold' })).status === 200, 'owner puts p1 on hold');
ok((await post('owner', { type: 'setProjectStatus', projectId: 'p1', status: 'active' })).status === 200, 'and back to active');
r = await post('owner', { type: 'addProject', name: 'E2E Mosque', client: 'Cairo Endowments', site: 'Helwan', contractValue: 5000000, startDate: today, deadline: L.addDays(today, 120), key: key() });
ok(r.status === 200 && r.j.result.projectId, 'owner adds a project');
const newP = r.j.result.projectId;
ok((await post('owner', { type: 'addProject', name: 'X', client: 'Y', site: 'Z', contractValue: -5, startDate: today, deadline: d30 })).status === 400, 'negative contract value: 400');
ok((await post('owner', { type: 'addProject', name: 'X', client: 'Y', site: 'Z', contractValue: 100, startDate: d30, deadline: today })).status === 400, 'deadline before start: 400');
ok((await post('owner', { type: 'addProject', name: 'X', client: 'Y', site: 'Z', contractValue: 100000, startDate: 'banana', deadline: d30 })).status === 400, 'bad start date: 400');
ok((await post('owner', { type: 'addProject', name: 'X', client: 'Y', site: 'Z', contractValue: 100000, startDate: L.addDays(today, 60), deadline: L.addDays(today, 90) })).status === 400, 'a start date too far out: 400');
r = await post('pm', { type: 'updateProject', projectId: newP, name: 'E2E Mosque Annex', client: 'Cairo Endowments', site: 'Helwan', contractValue: 5200000, startDate: today, deadline: L.addDays(today, 120) });
ok(r.status === 200, 'pm updates the new project');
r = await post('owner', { type: 'addPhase', projectId: newP, name: 'Structure', weight: 40, plannedStart: today, plannedEnd: L.addDays(today, 60), key: key() });
ok(r.status === 200 && r.j.result.phaseId, 'owner adds a phase to the new project');
const newPh = r.j.result.phaseId;
ok((await post('owner', { type: 'addPhase', projectId: newP, name: 'Bad', weight: 70, plannedStart: today, plannedEnd: d30 })).status === 400, 'phase weights over 100%: 400');
ok((await post('owner', { type: 'addPhase', projectId: newP, name: 'Bad', weight: 5, plannedStart: d30, plannedEnd: today })).status === 400, 'phase end before start: 400');
ok((await post('engineer', { type: 'addPhase', projectId: newP, name: 'X', weight: 5, plannedStart: today, plannedEnd: d30 })).status === 403, 'engineer cannot add phases: 403');
ok((await post('owner', { type: 'addPhase', projectId: 'p1', name: 'Bad', weight: 5, plannedStart: today, plannedEnd: d30 })).status === 400, 'p1 weights already total 100: 400');
ok((await post('pm', { type: 'updatePhase', phaseId: newPh, name: 'Structure works', weight: 50 })).status === 200, 'pm updates the phase');
ok((await post('pm', { type: 'updatePhase', phaseId: newPh, name: 'Structure works', weight: 101 })).status === 400, 'phase weight over 100: 400');
r = await post('pm', { type: 'addMilestone', phaseId: newPh, name: 'Minaret up', due: d30 });
ok(r.status === 200 && r.j.result.milestoneId, 'pm adds a milestone');
ok((await post('pm', { type: 'addMilestone', phaseId: newPh, name: 'Bad', due: 'banana' })).status === 400, 'bad due date: 400');
ok((await post('pm', { type: 'addMilestone', phaseId: 'zz', name: 'Bad', due: d30 })).status === 400, 'milestone on a missing phase: 400');
ok((await post('engineer', { type: 'milestoneDone', milestoneId: 'ms5' })).status === 200, 'engineer marks the overdue milestone done');
ok((await post('engineer', { type: 'milestoneDone', milestoneId: 'ms5' })).status === 400, 'marking it done twice: 400');
ok((await post('engineer', { type: 'milestoneDone', milestoneId: 'ms5', done: false })).status === 200, 'and reopens it');
ok((await post('engineer', { type: 'milestoneDone', milestoneId: 'ms1' })).status === 400, 'a milestone done long ago stays done: 400');
ok((await post('engineer', { type: 'milestoneDone', milestoneId: 'zz' })).status === 400, 'a missing milestone: 400');

// ---------- docs and subs ----------
ok((await post('engineer', { type: 'addDoc', projectId: 'p1', title: 'Slab pour C35 cube results', kind: 'report', date: today, ref: 'LAB-2291', key: key() })).status === 200, 'engineer files a lab report');
ok((await post('engineer', { type: 'addDoc', projectId: 'p1', title: 'X', kind: 'banana', date: today })).status === 400, 'unknown doc kind: 400');
ok((await post('engineer', { type: 'addDoc', projectId: 'p1', title: 'X', kind: 'other', date: L.addDays(today, 1) })).status === 400, 'a doc dated in the future: 400');
ok((await post('accountant', { type: 'addDoc', projectId: 'p1', title: 'X', kind: 'other', date: today })).status === 403, 'accountant cannot file docs: 403');
const docId = (await post('engineer', { type: 'addDoc', projectId: 'p1', title: 'Temp doc', kind: 'other', date: today })).j.result.docId;
ok((await post('engineer', { type: 'deleteDoc', docId })).status === 403, 'engineer cannot delete docs: 403');
ok((await post('pm', { type: 'deleteDoc', docId })).status === 200, 'pm deletes it');
r = await post('pm', { type: 'addContract', subId: 's4', projectId: 'p2', scope: 'MEP first fix, villas 3-6', value: 650000, key: key() });
ok(r.status === 200 && r.j.result.contractId, 'pm adds a contract with Flow Plumbing');
ok((await post('pm', { type: 'addContract', subId: 'zz', projectId: 'p2', scope: 'X', value: 100000 })).status === 400, 'contract with a missing sub: 400');
ok((await post('pm', { type: 'addContract', subId: 's4', projectId: 'zz', scope: 'X', value: 100000 })).status === 400, 'contract on a missing project: 400');
ok((await post('pm', { type: 'addContract', subId: 's4', projectId: 'p2', scope: 'X', value: -1 })).status === 400, 'negative contract: 400');
ok((await post('pm', { type: 'addContract', subId: 's4', projectId: 'p3', scope: 'X', value: 100000 })).status === 400, 'contract on a closed project: 400');

// ---------- BOQ and import ----------
r = await post('pm', { type: 'addBoq', projectId: 'p2', code: 'V-11', desc: 'Plain concrete C20 beds', unit: 'm3', cat: 'concrete', qty: 60, rate: 950, key: key() });
ok(r.status === 200 && r.j.result.boqId, 'pm adds a BOQ line: 60 m3 at 950');
const newBoq = r.j.result.boqId;
ok((await post('pm', { type: 'addBoq', projectId: 'p2', code: 'v-11', desc: 'Dup', unit: 'm3', cat: 'concrete', qty: 5, rate: 5 })).status === 400, 'the same code again in the project: 400');
ok((await post('pm', { type: 'addBoq', projectId: 'p2', code: 'X', desc: 'XX', unit: 'm3', cat: 'concrete', qty: 0, rate: 5 })).status === 400, 'zero quantity BOQ: 400');
ok((await post('pm', { type: 'addBoq', projectId: 'p2', code: 'X', desc: 'XX', unit: 'm3', cat: 'concrete', qty: 5, rate: 0 })).status === 400, 'zero rate BOQ: 400');
ok((await post('pm', { type: 'addBoq', projectId: 'zz', code: 'X', desc: 'XX', unit: 'm3', cat: 'concrete', qty: 5, rate: 5 })).status === 400, 'BOQ on a missing project: 400');
ok((await post('pm', { type: 'addBoq', projectId: 'p3', code: 'X', desc: 'XX', unit: 'm3', cat: 'concrete', qty: 5, rate: 5 })).status === 400, 'BOQ on a closed project: 400');
ok((await post('pm', { type: 'updateBoq', boqId: newBoq, code: 'V-11', desc: 'Plain concrete C20 beds', unit: 'm3', cat: 'concrete', qty: 80, rate: 950 })).status === 200, 'pm updates the quantity to 80');
ok((await post('engineer', { type: 'recordProgress', boqId: newBoq, qty: 5 })).status === 200, 'engineer records 5 m3 against it');
ok((await post('pm', { type: 'updateBoq', boqId: newBoq, code: 'V-11', desc: 'Plain concrete C20 beds', unit: 'm3', cat: 'concrete', qty: 3, rate: 950 })).status === 400, 'quantity below what is executed: 400');
ok((await post('owner', { type: 'deleteBoq', boqId: newBoq })).status === 400, 'a line with work recorded cannot be deleted');
r = await post('pm', { type: 'addBoq', projectId: 'p2', code: 'V-12', desc: 'Temporary line', unit: 'ls', cat: 'external', qty: 1, rate: 5000 });
ok((await post('pm', { type: 'deleteBoq', boqId: r.j.result.boqId })).status === 403, 'pm cannot delete BOQ lines: 403');
ok((await post('owner', { type: 'deleteBoq', boqId: r.j.result.boqId })).status === 200, 'owner deletes the untouched line');
r = await post('pm', { type: 'importBoq', projectId: 'p2', rows: [
  { code: 'V-20', desc: 'Imported clean row', unit: 'm3', cat: 'concrete', qty: 10, rate: 100 },
  { code: 'V-11', desc: 'Duplicate code row', unit: 'm3', cat: 'concrete', qty: 10, rate: 100 },
  { code: 'V-21', desc: 'Bad unit row', unit: 'banana', cat: 'concrete', qty: 10, rate: 100 },
] });
ok(r.status === 200 && r.j.result.added === 1 && r.j.result.errors.length === 2 && r.j.result.errors[0].row === 2, 'import books the clean row and names the bad ones');
r = await post('pm', { type: 'importBoq', projectId: 'p2', rows: [{ code: 'V-20', desc: 'Again', unit: 'm3', cat: 'concrete', qty: 10, rate: 100 }] });
ok(r.status === 200 && r.j.result.added === 0 && r.j.result.errors.length === 1, 'the same row again is a duplicate');
ok((await post('pm', { type: 'importBoq', projectId: 'p2', rows: [] })).status === 400, 'an empty import: 400');
ok((await post('accountant', { type: 'importBoq', projectId: 'p2', rows: [{ code: 'X', desc: 'XX', unit: 'm3', cat: 'concrete', qty: 5, rate: 5 }] })).status === 403, 'accountant cannot import: 403');

// ---------- owner audit ----------
ok((await view('owner')).audit.length > 10, 'the audit trail fills up for the owner');
ok((await view('pm')).audit.length === 0, 'pm never sees the audit trail');

// ---------- browser on a clean seed ----------
await post('owner', { type: 'reset' });
const pw = await newPage(); await login(pw, '1111'); const bw = await body(pw);
ok(!bare.test(bw), 'owner dashboard: no undefined / NaN / [object');
ok(bw.includes('Contract value') && bw.includes('35,800,000'), 'owner dashboard shows EGP 35,800,000 of contract value');
ok(bw.includes('36%'), 'average progress shows 36%');
ok(bw.includes('2,000,000'), 'the waiting claims total EGP 2,000,000');
ok(bw.includes('Fifth floor slab') && bw.includes('Core stairwell'), 'the overdue milestone and the critical snag are on the dashboard');
ok((await pw.evaluate(() => [...document.querySelectorAll('.nav a')].map((a) => a.getAttribute('href')).join())).includes('settings') && (await pw.evaluate(() => [...document.querySelectorAll('.nav a')].map((a) => a.getAttribute('href')).join())).includes('audit'), 'owner nav reaches settings and the audit log');
for (const rt of ['projects', 'boq', 'claims', 'subs', 'site', 'snags', 'docs', 'reports', 'settings', 'audit']) { await go(pw, rt); const b2 = await body(pw); ok(!bare.test(b2) && b2.length > 200, 'owner page ' + rt + ' renders'); }
await go(pw, 'projects'); const bpj = await body(pw);
ok(bpj.includes('41% / 40%'), 'projects page shows 41% against 40% planned for p1');
const pmv = await newPage(); await login(pmv, '2222'); const bm = await body(pmv);
ok(!bare.test(bm), 'pm dashboard renders');
const pmNav = await pmv.evaluate(() => [...document.querySelectorAll('.nav a')].map((a) => a.getAttribute('href')).join());
ok(!pmNav.includes('settings') && !pmNav.includes('audit') && pmNav.includes('claims'), 'pm nav matches his lane: no settings, no audit');
const ev2 = await newPage(); await login(ev2, '3333'); const be2 = await body(ev2);
ok(!bare.test(be2), 'engineer dashboard renders');
const eNav = await ev2.evaluate(() => [...document.querySelectorAll('.nav a')].map((a) => a.getAttribute('href')).join());
ok(!eNav.includes('claims') && !eNav.includes('reports') && eNav.includes('site'), 'engineer nav: site work only, no claims or reports');
const av2 = await newPage(); await login(av2, '4444'); const ba = await body(av2);
ok(!bare.test(ba), 'accountant dashboard renders');
await go(av2, 'claims'); const bcl = await body(av2);
ok(bcl.includes('PC-2026-003') && !bare.test(bcl), 'claims page renders with PC-2026-003');
ok(bcl.includes('1,425,000'), 'the payable column shows 1,500,000 less 5% retention');
const cl = await newPage(); await login(cl, '5555'); const bc = await body(cl);
ok(bc.includes('Palm Heights') && bc.includes('certificates'), 'client dashboard shows his project');
ok(!bc.includes('25,425,000'), 'the internal BOQ estimate never reaches the client');
ok(!bc.includes('Delta Concrete') && !bc.includes('Nile Steel'), 'no subcontractor names on the client dashboard');
ok(!/margin/i.test(bc), 'no margin on the client dashboard');
const clientNav = await cl.evaluate(() => [...document.querySelectorAll('.nav a')].map((a) => a.getAttribute('href').replace('#/', '')).join());
ok(clientNav === 'dashboard,projects,site,snags,docs', 'client nav is dashboard, projects, site, snags, docs only');
ok(!bc.includes('Add project') && !bc.includes('Record progress'), 'no action buttons for the client');
await go(cl, 'boq'); const bcb = await body(cl);
ok(!bcb.includes('B-03') && !bcb.includes('Ready-mix'), 'a typed hash never shows the client the BOQ');
await go(cl, 'claims'); const bcm2 = await body(cl);
ok(!bcm2.includes('Delta Concrete') && !bcm2.includes('Payable after retention') && !bcm2.includes('Claimed'), 'a typed hash never shows the client the claims ledger');
await go(cl, 'projects'); const bcp = await body(cl);
ok(bcp.includes('PC-2026-001') || bcp.includes('Certified'), 'the client projects page shows his certificates');
ok(!bcp.includes('25,425,000') && !bcp.includes('Actual costs'), 'no estimates or actuals on the client projects page');
const pl = await newPage(); await pl.goto(U + '/', { waitUntil: 'networkidle0' }); await pl.evaluate(() => localStorage.clear()); await pl.goto(U + '/', { waitUntil: 'networkidle0' });
const bl = await body(pl);
ok(bl.includes('1111') && bl.includes('5555') && bl.includes('Project manager'), 'sign-in screen lists the demo roles with PINs');
const pe = await newPage(); await login(pe, '1111');
ok((await post('engineer', { type: 'addSnag', projectId: 'p1', location: 'Col C3', desc: 'Chipped edge <script>window.__xss=1</script> repaired', sev: 'minor' })).status === 200, 'snag with script tags recorded');
await pe.evaluate(() => { location.hash = '#/snags'; }); await pe.reload({ waitUntil: 'networkidle0' }); await sleep(900);
ok(!(await pe.evaluate(() => window.__xss === 1)), 'script in a snag description never runs');
ok((await body(pe)).includes('Chipped edge'), 'the snag text is visible as text');
const pa = await newPage(); await login(pa, '1111', 'ar'); const bAr = await body(pa);
ok((await pa.evaluate(() => document.documentElement.dir)) === 'rtl' && bAr.includes('المشروعات'), 'Arabic: RTL with translated chrome');
await go(pa, 'claims'); const bArC = await body(pa);
ok(bArC.includes('المستخلصات'), 'Arabic claims page renders translated');
ok(!/\[object|NaN|undefined/.test(bAr), 'Arabic pages carry no placeholders');
const pmob = await newPage(390, 844); await login(pmob, '1111');
ok(await pmob.evaluate(() => document.documentElement.scrollWidth <= 395), '390px dashboard: no horizontal scroll');
await go(pmob, 'boq'); ok(await pmob.evaluate(() => document.documentElement.scrollWidth <= 400), '390px BOQ: no horizontal scroll');
await go(pmob, 'claims'); ok(await pmob.evaluate(() => document.documentElement.scrollWidth <= 400), '390px claims: no horizontal scroll');
const cmob = await newPage(390, 844); await login(cmob, '5555'); await go(cmob, 'projects');
ok(await cmob.evaluate(() => document.documentElement.scrollWidth <= 400), '390px client projects: no horizontal scroll');
ok(errs.length === 0, 'zero page errors in every session' + (errs.length ? ' — ' + errs.join(' | ').slice(0, 300) : ''));

// ---------- reset ----------
ok((await post('owner', { type: 'reset' })).status === 200, 'reset works');
const cv2 = await view('client');
ok(cv2.projects[0].certificates.length === 4 && (await view('owner')).claims.length === 8, 'after reset the demo data is back');
await b.close();
console.log(`RESULT ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
