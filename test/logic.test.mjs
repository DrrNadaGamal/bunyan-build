import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.js';

const NOW = Date.UTC(2026, 10, 25, 12); // noon UTC, Cairo evening of 2026-11-25
const today = L.dayKey(NOW);
const fresh = () => L.seed(NOW);
const u = (s, role) => s.users.find((x) => x.role === role);
const run = (s, role, op) => L.applyOp(s, op, { user: u(s, role), now: NOW });

test('seed is internally consistent', () => {
  const s = fresh();
  assert.equal(s.projects.length, 3);
  for (const p of s.projects) {
    const est = L.boqEstimate(s, p.id);
    assert.ok(est > 0 && est < p.contractValue, p.id + ' estimate below contract');
    const w = s.phases.filter((x) => x.projectId === p.id).reduce((x, y) => x + y.weight, 0);
    assert.equal(w, 100, p.id + ' phase weights sum to 100');
  }
  for (const b of s.boq) assert.ok(b.executed <= b.qty);
  for (const cl of s.claims) assert.ok(L.claimPaid(s, cl) <= (cl.certified ? L.claimPayable(s, cl) : 0) || cl.status === 'draft' || cl.status === 'submitted');
  assert.ok(s.logs.length > 15 && s.costs.length > 25);
  const v = L.view(s, u(s, 'owner'), NOW);
  assert.ok(v.insights.some((i) => i.kind === 'milestone_overdue'));
  assert.ok(v.insights.some((i) => i.kind === 'claim_waiting'));
  assert.ok(v.insights.some((i) => i.kind === 'snag_critical'));
  assert.ok(v.insights.some((i) => i.kind === 'log_missing'));
});

test('progress math and plan tracking', () => {
  const s = fresh();
  const p = s.projects[0];
  const pr = L.projectProgress(s, p, today);
  assert.equal(pr.estimate, L.boqEstimate(s, p.id));
  assert.ok(pr.progressPct > 30 && pr.progressPct < 60);
  assert.ok(pr.plannedPct > 30 && pr.plannedPct < 50);
  assert.equal(L.projectProgress(s, s.projects[2], today).progressPct, 100); // closed, fully executed
});

test('recordProgress refuses overrun and non-active projects', () => {
  const s = fresh();
  const b = s.boq.find((x) => x.projectId === 'p1' && x.executed < x.qty);
  const left = b.qty - b.executed;
  const r = run(s, 'engineer', { type: 'recordProgress', boqId: b.id, qty: Math.min(10, left) });
  assert.equal(r.executed, b.executed);
  assert.throws(() => run(s, 'engineer', { type: 'recordProgress', boqId: b.id, qty: b.qty - b.executed + 1 }), /exceed/);
  const closed = s.boq.find((x) => x.projectId === 'p3');
  assert.throws(() => run(s, 'engineer', { type: 'recordProgress', boqId: closed.id, qty: 1 }), /not active/);
});

test('claim lifecycle: submit, certify, pay with retention', () => {
  const s = fresh();
  const ct = s.contracts.find((x) => x.id === 'ct6'); // clean contract, 900k
  const c1 = run(s, 'pm', { type: 'createClaim', contractId: ct.id, amount: 400000, key: 'k-c1' });
  assert.throws(() => run(s, 'owner', { type: 'certifyClaim', claimId: c1.claimId, certified: 400000 }), /submitted/);
  run(s, 'pm', { type: 'submitClaim', claimId: c1.claimId });
  assert.throws(() => run(s, 'pm', { type: 'certifyClaim', claimId: c1.claimId, certified: 400000 }), /permission/); // owner only
  const cert = run(s, 'owner', { type: 'certifyClaim', claimId: c1.claimId, certified: 380000 });
  assert.match(cert.certNo, /^PC-\d{4}-\d{3}$/);
  assert.throws(() => run(s, 'accountant', { type: 'payClaim', claimId: c1.claimId, amount: 361001 }), /payable/);
  const pay = run(s, 'accountant', { type: 'payClaim', claimId: c1.claimId, amount: 361000 }); // 380000 * 0.95
  assert.equal(pay.status, 'paid');
  assert.throws(() => run(s, 'accountant', { type: 'payClaim', claimId: c1.claimId, amount: 1 }), /payable/);
});

test('claims cannot exceed the contract value', () => {
  const s = fresh();
  const ct = s.contracts.find((x) => x.id === 'ct6');
  run(s, 'pm', { type: 'createClaim', contractId: ct.id, amount: 800000 });
  assert.throws(() => run(s, 'pm', { type: 'createClaim', contractId: ct.id, amount: 200000 }), /exceed the contract/);
});

test('retention setting changes the payable amount', () => {
  const s = fresh();
  const cl = s.claims.find((x) => x.certNo === 'PC-2026-003'); // certified 1.5M
  assert.equal(L.claimPayable(s, cl), 1425000);
  run(s, 'owner', { type: 'setSettings', retentionPct: 10 });
  assert.equal(L.claimPayable(s, cl), 1350000);
  assert.throws(() => run(s, 'owner', { type: 'setSettings', retentionPct: 25 }), /whole number/);
  assert.throws(() => run(s, 'pm', { type: 'setSettings', retentionPct: 5 }), /permission/);
});

test('daily log is unique per project per day and never future', () => {
  const s = fresh();
  const r = run(s, 'engineer', { type: 'addLog', projectId: 'p1', weather: 'sunny', workers: 60, work: 'Poured the core walls' });
  assert.ok(r.logId);
  assert.throws(() => run(s, 'engineer', { type: 'addLog', projectId: 'p1', weather: 'sunny', workers: 60, work: 'Duplicate day' }), /already a log/);
  assert.throws(() => run(s, 'engineer', { type: 'addLog', projectId: 'p2', date: L.addDays(today, 1), weather: 'sunny', workers: 60, work: 'Future' }), /future/);
  assert.throws(() => run(s, 'accountant', { type: 'addLog', projectId: 'p2', weather: 'sunny', workers: 60, work: 'Not his job' }), /permission/);
});

test('materials flow: request, approve, receive', () => {
  const s = fresh();
  const mr = run(s, 'engineer', { type: 'requestMaterial', projectId: 'p1', item: 'Cement', qty: 100, unit: 'pc', neededBy: L.addDays(today, 2) });
  assert.throws(() => run(s, 'engineer', { type: 'receiveMaterial', requestId: mr.requestId }), /approved/);
  assert.throws(() => run(s, 'engineer', { type: 'approveMaterial', requestId: mr.requestId }), /permission/);
  run(s, 'pm', { type: 'approveMaterial', requestId: mr.requestId });
  run(s, 'engineer', { type: 'receiveMaterial', requestId: mr.requestId });
  assert.throws(() => run(s, 'pm', { type: 'approveMaterial', requestId: mr.requestId }), /settled/);
});

test('snag lifecycle and project close guard', () => {
  const s = fresh();
  const sn = run(s, 'engineer', { type: 'addSnag', projectId: 'p2', location: 'Villa 1', desc: 'Cracked lintel', sev: 'major' });
  run(s, 'engineer', { type: 'startSnag', snagId: sn.snagId });
  assert.throws(() => run(s, 'engineer', { type: 'closeSnag', snagId: sn.snagId, note: 'Fixed with epoxy' }), /permission/);
  run(s, 'pm', { type: 'closeSnag', snagId: sn.snagId, note: 'Fixed with epoxy' });
  assert.throws(() => run(s, 'owner', { type: 'setProjectStatus', projectId: 'p1', status: 'closed' }), /snags/); // p1 has open snags
  run(s, 'pm', { type: 'reopenSnag', snagId: sn.snagId });
});

test('costs: accountant adds, owner deletes, validation holds', () => {
  const s = fresh();
  const b = s.boq.find((x) => x.projectId === 'p1');
  assert.throws(() => run(s, 'pm', { type: 'addCost', boqId: b.id, kind: 'material', amount: 1000 }), /permission/);
  const c = run(s, 'accountant', { type: 'addCost', boqId: b.id, kind: 'material', amount: 1000, key: 'k-cost' });
  assert.throws(() => run(s, 'accountant', { type: 'addCost', boqId: b.id, kind: 'material', amount: 5.5 }), /whole number/);
  assert.throws(() => run(s, 'accountant', { type: 'addCost', boqId: b.id, kind: 'material', amount: 100, date: L.addDays(today, 1) }), /future/);
  assert.throws(() => run(s, 'accountant', { type: 'deleteCost', costId: c.costId }), /permission/);
  run(s, 'owner', { type: 'deleteCost', costId: c.costId });
});

test('idempotency keys never double-record', () => {
  const s = fresh();
  const before = s.costs.length;
  const op = { type: 'addCost', boqId: s.boq[0].id, kind: 'labor', amount: 777, key: 'same-key' };
  run(s, 'accountant', op);
  const dup = run(s, 'accountant', op);
  assert.equal(dup.duplicate, true);
  assert.equal(s.costs.length, before + 1);
});

test('client view hides internal money', () => {
  const s = fresh();
  const v = L.view(s, u(s, 'client'), NOW);
  assert.equal(v.projects.length, 1); // only the client-visible project
  assert.equal(v.costs.length, 0);
  assert.equal(v.boq.length, 0);
  assert.equal(v.claims.length, 0);
  assert.equal(v.materials.length, 0);
  assert.equal(v.audit.length, 0);
  assert.ok(v.projects[0].certificates.length >= 3);
  assert.ok(!('actual' in v.projects[0]) && !('margin' in v.projects[0]));
  assert.ok(v.logs.length > 0 && v.snags.length > 0 && v.docs.length > 0);
  const txt = JSON.stringify(v);
  assert.ok(!txt.includes('Delta Concrete Supply')); // no subcontractors
});

test('BOQ import adds valid rows and reports bad ones', () => {
  const s = fresh();
  const r = run(s, 'pm', { type: 'importBoq', projectId: 'p1', rows: [
    { code: 'G-01', desc: 'Landscaping', unit: 'm2', cat: 'external', qty: 800, rate: 350 },
    { code: 'A-01', desc: 'Duplicate code', unit: 'm3', cat: 'earthworks', qty: 5, rate: 5 },
    { code: 'G-02', desc: 'Bad unit', unit: 'parsec', cat: 'external', qty: 5, rate: 5 },
  ] });
  assert.equal(r.added, 1);
  assert.equal(r.errors.length, 2);
});

test('roles cannot act outside their lane', () => {
  const s = fresh();
  assert.throws(() => run(s, 'client', { type: 'addSnag', projectId: 'p1', location: 'X', desc: 'YYY', sev: 'minor' }), /permission/);
  assert.throws(() => run(s, 'accountant', { type: 'recordProgress', boqId: 'q5', qty: 1 }), /permission/);
  assert.throws(() => run(s, 'engineer', { type: 'addCost', boqId: 'q5', kind: 'labor', amount: 5 }), /permission/);
  assert.throws(() => run(s, 'pm', { type: 'deleteCost', costId: 'co1' }), /permission/);
  assert.throws(() => run(s, 'accountant', { type: 'certifyClaim', claimId: 'cl4', certified: 5 }), /permission/);
});

test('unknown and prototype action names are refused', () => {
  const s = fresh();
  for (const t of ['nope', 'constructor', '__proto__', 'toString']) assert.throws(() => run(s, 'owner', { type: t }), /Unknown action/);
});

test('csv cells escape spreadsheet formulas', () => {
  assert.equal(L.csvCell('=1+1'), "'=1+1");
  assert.equal(L.csvCell('+SUM(A1)'), "'+SUM(A1)");
  assert.equal(L.csvCell('a"b'), '"a""b"');
  assert.equal(L.csvCell('plain'), 'plain');
});
