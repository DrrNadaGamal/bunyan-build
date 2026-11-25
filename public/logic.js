// Bunyan business rules. Pure functions shared by the browser, the API and the tests.
// Money is whole EGP. Cairo calendar days are 'YYYY-MM-DD'. Times are epoch ms.
export const TZ = 'Africa/Cairo';
export const ROLES = { owner: 'owner', pm: 'pm', engineer: 'engineer', accountant: 'accountant', client: 'client' };
export const DEMO_USERS = [
  { pin: '1111', label: 'Company owner (Eng. Hany)', labelAr: 'مالك الشركة (م. هاني)' },
  { pin: '2222', label: 'Project manager (Eng. Dina)', labelAr: 'مديرة المشروع (م. دينا)' },
  { pin: '3333', label: 'Site engineer (Eng. Omar)', labelAr: 'مهندس الموقع (م. عمر)' },
  { pin: '4444', label: 'Accountant (Fady)', labelAr: 'المحاسب (فادي)' },
  { pin: '5555', label: 'Client - read only (Mr. Nader)', labelAr: 'العميل - قراءة فقط (أ. نادر)' },
];
export const PROJECT_STATUS = ['active', 'on_hold', 'closed'];
export const BOQ_CATS = ['earthworks', 'concrete', 'steel', 'masonry', 'mep', 'finishes', 'external'];
export const COST_KINDS = ['material', 'labor', 'equipment', 'subcontractor', 'other'];
export const UNITS = ['m3', 'm2', 'm', 'ton', 'kg', 'pc', 'ls'];
export const TRADES = ['concrete', 'steelwork', 'masonry', 'plaster', 'electrical', 'plumbing', 'hvac', 'aluminum', 'tiling', 'painting'];
export const CLAIM_STATUS = ['draft', 'submitted', 'certified', 'paid', 'rejected'];
export const MAT_STATUS = ['pending', 'approved', 'rejected', 'received'];
export const SNAG_SEV = ['minor', 'major', 'critical'];
export const SNAG_STATUS = ['open', 'in_progress', 'closed'];
export const DOC_KINDS = ['drawing', 'contract', 'permit', 'report', 'other'];
export const WEATHER = ['sunny', 'cloudy', 'hot', 'windy', 'rain'];
export const DEFAULTS = { retentionPct: 5, importMax: 200 };
export const MAX_AMOUNT = 500000000;

export class UserError extends Error {}
export class PermError extends Error {}

// ---------- dates ----------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayKey = (ts) => fmt.format(ts);
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (k, n) => toKey(parse(k) + n * 864e5);
export const monthOf = (k) => k.slice(0, 7);
export const isKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && toKey(parse(k)) === k;
export const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
export const monthDiff = (a, b) => { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by - ay) * 12 + bm - am; };
const pad = (n, w) => String(n).padStart(w, '0');
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

// ---------- validation ----------
const str = (v, min, max, label) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw new UserError(`${label} must be ${min === max ? min : `${min} to ${max}`} characters`);
  return s;
};
const optStr = (v, max, label) => (v === undefined || v === null || v === '' ? '' : str(v, 0, max, label));
const intIn = (v, min, max, label) => { if (!Number.isInteger(v) || v < min || v > max) throw new UserError(`${label} must be a whole number from ${min} to ${max}`); return v; };
const oneOf = (v, list, msg) => { if (typeof v !== 'string' || !list.includes(v)) throw new UserError(msg); return v; };
const bool = (v) => v === true;
const need = (user, roles) => { if (!roles.includes(user.role)) throw new PermError('You do not have permission to do this'); };
const MANAGE = ['owner', 'pm'];          // run projects, phases, BOQ, subs, approvals
const SITE = ['owner', 'pm', 'engineer']; // site work: logs, progress, materials, snags, docs
const MONEY_VIEW = ['owner', 'pm', 'accountant'];
const settings = (s) => ({ ...DEFAULTS, ...(s.settings || {}) });
const nextId = (s, p) => `${p}${(s.counters[p] = (s.counters[p] || 0) + 1)}`;
const audit = (s, user, now, action, detail) => { s.audit.unshift({ ts: now, userId: user.id, name: user.name, action, detail: String(detail).slice(0, 200) }); if (s.audit.length > 400) s.audit.length = 400; };
const once = (s, op, fn) => {
  if (op.key !== undefined && (typeof op.key !== 'string' || op.key.length < 4 || op.key.length > 64)) throw new UserError('Bad request');
  if (op.key && s.keys.includes(op.key)) return { duplicate: true };
  const r = fn(); if (op.key) { s.keys.push(op.key); if (s.keys.length > 600) s.keys.shift(); } return r;
};
const find = (arr, id, what) => { const x = typeof id === 'string' ? arr.find((y) => y.id === id) : null; if (!x) throw new UserError(`${what} not found`); return x; };
const getProject = (s, id) => find(s.projects, id, 'Project');
const getBoq = (s, id) => find(s.boq, id, 'BOQ item');
const getContract = (s, id) => find(s.contracts, id, 'Contract');
const getClaim = (s, id) => find(s.claims, id, 'Claim');
const getMat = (s, id) => find(s.materials, id, 'Material request');
const getSnag = (s, id) => find(s.snags, id, 'Snag');
const getMilestone = (s, id) => find(s.milestones, id, 'Milestone');

const txDate = (op, now) => {
  const today = dayKey(now);
  const d = op.date === undefined ? today : op.date;
  if (!isKey(d)) throw new UserError('Date must be a valid date');
  if (d > today) throw new UserError('Date cannot be in the future');
  if (d < addDays(today, -365)) throw new UserError('Date cannot be more than a year ago');
  return d;
};
const amount = (op) => intIn(op.amount, 1, MAX_AMOUNT, 'Amount');

// ---------- derived numbers ----------
export const boqEstimate = (s, pid) => s.boq.filter((b) => b.projectId === pid).reduce((x, b) => x + b.qty * b.rate, 0);
export const boqDoneValue = (s, pid) => s.boq.filter((b) => b.projectId === pid).reduce((x, b) => x + b.executed * b.rate, 0);
export const projectCosts = (s, pid) => s.costs.filter((c) => c.projectId === pid).reduce((x, c) => x + c.amount, 0);
export const projectContracts = (s, pid) => s.contracts.filter((c) => c.projectId === pid);
export const claimPayable = (s, cl) => Math.round(cl.certified * (1 - settings(s).retentionPct / 100));
export const claimPaid = (s, cl) => cl.payments.reduce((x, p) => x + p.amount, 0);
export const projectClaims = (s, pid) => s.claims.filter((cl) => getContract(s, cl.contractId).projectId === pid);
export const certTotals = (s, pid) => {
  let certified = 0, paid = 0;
  for (const cl of projectClaims(s, pid)) {
    if (cl.status === 'certified' || cl.status === 'paid') { certified += cl.certified; paid += claimPaid(s, cl); }
  }
  return { certified, paid };
};
export function projectProgress(s, p, today) {
  const est = boqEstimate(s, p.id), done = boqDoneValue(s, p.id);
  const total = Math.max(1, daysBetween(p.startDate, p.deadline));
  const gone = Math.min(total, Math.max(0, daysBetween(p.startDate, today)));
  return {
    estimate: est, doneValue: done, actual: projectCosts(s, p.id),
    progressPct: Math.round((done / Math.max(1, est)) * 100),
    plannedPct: p.status === 'closed' ? 100 : Math.round((gone / total) * 100),
    margin: est - projectCosts(s, p.id),
  };
}

// ---------- operations ----------
export const OP_ROLES = {
  addProject: ['owner'], updateProject: MANAGE, setProjectStatus: ['owner'],
  addPhase: MANAGE, updatePhase: MANAGE, addMilestone: MANAGE, milestoneDone: SITE,
  addBoq: MANAGE, updateBoq: MANAGE, deleteBoq: ['owner'], recordProgress: SITE, importBoq: MANAGE,
  addCost: ['accountant'], deleteCost: ['owner'],
  addSub: MANAGE, addContract: MANAGE,
  createClaim: MANAGE, submitClaim: MANAGE, certifyClaim: ['owner'], rejectClaim: ['owner'], payClaim: ['accountant'],
  requestMaterial: SITE, approveMaterial: MANAGE, rejectMaterial: MANAGE, receiveMaterial: SITE,
  addLog: SITE, updateLog: SITE,
  addSnag: SITE, startSnag: SITE, closeSnag: MANAGE, reopenSnag: MANAGE,
  addDoc: SITE, deleteDoc: MANAGE,
  setSettings: ['owner'],
};

const OPS = {
  addProject(s, op, { user, now }) {
    need(user, OP_ROLES.addProject);
    return once(s, op, () => {
      const p = { id: nextId(s, 'p'), name: str(op.name, 2, 80, 'Name'), nameAr: optStr(op.nameAr, 80, 'Arabic name'), client: str(op.client, 2, 80, 'Client'), site: str(op.site, 2, 80, 'Site'), contractValue: intIn(op.contractValue, 10000, MAX_AMOUNT, 'Contract value'), startDate: op.startDate, deadline: op.deadline, status: 'active', clientVisible: bool(op.clientVisible), createdAt: now };
      if (!isKey(p.startDate) || !isKey(p.deadline) || p.deadline <= p.startDate) throw new UserError('The deadline must be after the start date');
      if (p.startDate > addDays(dayKey(now), 30)) throw new UserError('The start date is too far in the future');
      s.projects.push(p); audit(s, user, now, 'addProject', `${p.id} ${p.name}`); return { projectId: p.id };
    });
  },
  updateProject(s, op, { user, now }) {
    need(user, OP_ROLES.updateProject);
    const p = getProject(s, op.projectId);
    const name = str(op.name, 2, 80, 'Name'), nameAr = optStr(op.nameAr, 80, 'Arabic name'), client = str(op.client, 2, 80, 'Client'), site = str(op.site, 2, 80, 'Site');
    const cv = intIn(op.contractValue, 10000, MAX_AMOUNT, 'Contract value');
    if (!isKey(op.startDate) || !isKey(op.deadline) || op.deadline <= op.startDate) throw new UserError('The deadline must be after the start date');
    Object.assign(p, { name, nameAr, client, site, contractValue: cv, startDate: op.startDate, deadline: op.deadline, clientVisible: bool(op.clientVisible) });
    audit(s, user, now, 'updateProject', `${p.id} ${p.name}`); return {};
  },
  setProjectStatus(s, op, { user, now }) {
    need(user, OP_ROLES.setProjectStatus);
    const p = getProject(s, op.projectId);
    const st = oneOf(op.status, PROJECT_STATUS, 'Unknown status');
    if (st === 'closed' && s.snags.some((x) => x.projectId === p.id && x.status !== 'closed')) throw new UserError('Close the open snags before closing the project');
    if (st === 'closed' && s.materials.some((x) => x.projectId === p.id && x.status === 'pending')) throw new UserError('Settle the pending material requests before closing the project');
    p.status = st; audit(s, user, now, 'setProjectStatus', `${p.id} ${st}`); return {};
  },
  addPhase(s, op, { user, now }) {
    need(user, OP_ROLES.addPhase);
    return once(s, op, () => {
      const p = getProject(s, op.projectId);
      if (p.status === 'closed') throw new UserError('This project is closed');
      const ph = { id: nextId(s, 'ph'), projectId: p.id, name: str(op.name, 2, 60, 'Name'), nameAr: optStr(op.nameAr, 60, 'Arabic name'), weight: intIn(op.weight, 1, 100, 'Weight'), plannedStart: op.plannedStart, plannedEnd: op.plannedEnd, createdAt: now };
      if (!isKey(ph.plannedStart) || !isKey(ph.plannedEnd) || ph.plannedEnd <= ph.plannedStart) throw new UserError('The phase end must be after its start');
      const total = s.phases.filter((x) => x.projectId === p.id).reduce((x, y) => x + y.weight, 0);
      if (total + ph.weight > 100) throw new UserError('The phase weights would go over 100%');
      s.phases.push(ph); audit(s, user, now, 'addPhase', `${ph.id} ${ph.name}`); return { phaseId: ph.id };
    });
  },
  updatePhase(s, op, { user, now }) {
    need(user, OP_ROLES.updatePhase);
    const ph = find(s.phases, op.phaseId, 'Phase');
    const w = intIn(op.weight, 1, 100, 'Weight');
    const total = s.phases.filter((x) => x.projectId === ph.projectId && x.id !== ph.id).reduce((x, y) => x + y.weight, 0);
    if (total + w > 100) throw new UserError('The phase weights would go over 100%');
    Object.assign(ph, { name: str(op.name, 2, 60, 'Name'), nameAr: optStr(op.nameAr, 60, 'Arabic name'), weight: w });
    audit(s, user, now, 'updatePhase', `${ph.id} ${ph.name}`); return {};
  },
  addMilestone(s, op, { user, now }) {
    need(user, OP_ROLES.addMilestone);
    return once(s, op, () => {
      const ph = find(s.phases, op.phaseId, 'Phase');
      const m = { id: nextId(s, 'ms'), projectId: ph.projectId, phaseId: ph.id, name: str(op.name, 2, 80, 'Name'), nameAr: optStr(op.nameAr, 80, 'Arabic name'), due: op.due, doneDate: null, createdAt: now };
      if (!isKey(m.due)) throw new UserError('The due date must be a valid date');
      s.milestones.push(m); audit(s, user, now, 'addMilestone', `${m.id} ${m.name}`); return { milestoneId: m.id };
    });
  },
  milestoneDone(s, op, { user, now }) {
    need(user, OP_ROLES.milestoneDone);
    const m = getMilestone(s, op.milestoneId);
    if (m.doneDate && op.done !== false) throw new UserError('This milestone is already done');
    m.doneDate = op.done === false ? null : dayKey(now);
    audit(s, user, now, 'milestoneDone', `${m.id} ${m.doneDate || 'reopened'}`); return {};
  },
  addBoq(s, op, { user, now }) {
    need(user, OP_ROLES.addBoq);
    return once(s, op, () => addBoqRow(s, op, user, now));
  },
  updateBoq(s, op, { user, now }) {
    need(user, OP_ROLES.updateBoq);
    const b = getBoq(s, op.boqId);
    const qty = intIn(op.qty, 1, 10000000, 'Quantity');
    if (qty < b.executed) throw new UserError('The quantity is below what is already executed');
    Object.assign(b, { code: str(op.code, 1, 20, 'Code'), desc: str(op.desc, 2, 120, 'Description'), descAr: optStr(op.descAr, 120, 'Arabic description'), unit: oneOf(op.unit, UNITS, 'Unknown unit'), cat: oneOf(op.cat, BOQ_CATS, 'Unknown category'), qty, rate: intIn(op.rate, 1, MAX_AMOUNT, 'Rate') });
    audit(s, user, now, 'updateBoq', `${b.id} ${b.code}`); return {};
  },
  deleteBoq(s, op, { user, now }) {
    need(user, OP_ROLES.deleteBoq);
    const b = getBoq(s, op.boqId);
    if (b.executed > 0) throw new UserError('Work is already recorded against this item');
    if (s.costs.some((c) => c.boqId === b.id)) throw new UserError('Costs are already recorded against this item');
    s.boq = s.boq.filter((x) => x.id !== b.id); audit(s, user, now, 'deleteBoq', `${b.id} ${b.code}`); return {};
  },
  recordProgress(s, op, { user, now }) {
    need(user, OP_ROLES.recordProgress);
    return once(s, op, () => {
      const b = getBoq(s, op.boqId);
      const p = getProject(s, b.projectId);
      if (p.status !== 'active') throw new UserError('The project is not active');
      const qty = intIn(op.qty, 1, 10000000, 'Quantity');
      if (b.executed + qty > b.qty) throw new UserError('That would exceed the planned quantity');
      b.executed += qty; audit(s, user, now, 'recordProgress', `${b.id} ${b.code} +${qty}`); return { executed: b.executed };
    });
  },
  importBoq(s, op, { user, now }) {
    need(user, OP_ROLES.importBoq);
    return once(s, op, () => {
      const p = getProject(s, op.projectId);
      if (p.status === 'closed') throw new UserError('This project is closed');
      const rows = Array.isArray(op.rows) ? op.rows.slice(0, settings(s).importMax) : [];
      if (!rows.length) throw new UserError('No rows to import');
      let added = 0; const errors = [];
      rows.forEach((r, i) => {
        try { addBoqRow(s, { ...r, projectId: p.id }, user, now, true); added++; }
        catch (e) { if (e instanceof UserError) errors.push({ row: i + 1, error: e.message }); else throw e; }
      });
      audit(s, user, now, 'importBoq', `${p.id} +${added}`); return { added, errors };
    });
  },
  addCost(s, op, { user, now }) {
    need(user, OP_ROLES.addCost);
    return once(s, op, () => {
      const b = getBoq(s, op.boqId);
      const c = { id: nextId(s, 'co'), projectId: b.projectId, boqId: b.id, kind: oneOf(op.kind, COST_KINDS, 'Unknown kind'), amount: amount(op), date: txDate(op, now), note: optStr(op.note, 120, 'Note'), by: user.id, ts: now };
      s.costs.push(c); audit(s, user, now, 'addCost', `${c.id} ${b.code} ${c.amount}`); return { costId: c.id };
    });
  },
  deleteCost(s, op, { user, now }) {
    need(user, OP_ROLES.deleteCost);
    const c = find(s.costs, op.costId, 'Cost');
    s.costs = s.costs.filter((x) => x.id !== c.id); audit(s, user, now, 'deleteCost', `${c.id} ${c.amount}`); return {};
  },
  addSub(s, op, { user, now }) {
    need(user, OP_ROLES.addSub);
    return once(s, op, () => {
      const sub = { id: nextId(s, 's'), name: str(op.name, 2, 80, 'Name'), nameAr: optStr(op.nameAr, 80, 'Arabic name'), trade: oneOf(op.trade, TRADES, 'Unknown trade'), phone: optStr(op.phone, 30, 'Phone'), active: true, createdAt: now };
      if (s.subs.some((x) => x.name.toLowerCase() === sub.name.toLowerCase())) throw new UserError('A subcontractor with this name exists');
      s.subs.push(sub); audit(s, user, now, 'addSub', `${sub.id} ${sub.name}`); return { subId: sub.id };
    });
  },
  addContract(s, op, { user, now }) {
    need(user, OP_ROLES.addContract);
    return once(s, op, () => {
      const sub = find(s.subs, op.subId, 'Subcontractor');
      const p = getProject(s, op.projectId);
      if (p.status === 'closed') throw new UserError('This project is closed');
      const ct = { id: nextId(s, 'ct'), subId: sub.id, projectId: p.id, scope: str(op.scope, 2, 100, 'Scope'), value: intIn(op.value, 1000, MAX_AMOUNT, 'Value'), createdAt: now };
      s.contracts.push(ct); audit(s, user, now, 'addContract', `${ct.id} ${sub.name} ${ct.value}`); return { contractId: ct.id };
    });
  },
  createClaim(s, op, { user, now }) {
    need(user, OP_ROLES.createClaim);
    return once(s, op, () => {
      const ct = getContract(s, op.contractId);
      const p = getProject(s, ct.projectId);
      if (p.status !== 'active') throw new UserError('The project is not active');
      const amt = amount(op);
      const prior = s.claims.filter((x) => x.contractId === ct.id && x.status !== 'rejected').reduce((x, y) => x + y.amount, 0);
      if (prior + amt > ct.value) throw new UserError('The claims would exceed the contract value');
      const cl = { id: nextId(s, 'cl'), contractId: ct.id, no: s.claims.filter((x) => x.contractId === ct.id).length + 1, amount: amt, note: optStr(op.note, 120, 'Note'), status: 'draft', certified: 0, certNo: null, payments: [], by: user.id, createdAt: now };
      s.claims.push(cl); audit(s, user, now, 'createClaim', `${cl.id} #${cl.no} ${amt}`); return { claimId: cl.id };
    });
  },
  submitClaim(s, op, { user, now }) {
    need(user, OP_ROLES.submitClaim);
    const cl = getClaim(s, op.claimId);
    if (cl.status !== 'draft') throw new UserError('Only a draft claim can be submitted');
    cl.status = 'submitted'; cl.submittedAt = now; audit(s, user, now, 'submitClaim', `${cl.id} #${cl.no}`); return {};
  },
  certifyClaim(s, op, { user, now }) {
    need(user, OP_ROLES.certifyClaim);
    return once(s, op, () => {
      const cl = getClaim(s, op.claimId);
      if (cl.status !== 'submitted') throw new UserError('Only a submitted claim can be certified');
      const cert = intIn(op.certified, 1, MAX_AMOUNT, 'Certified amount');
      if (cert > cl.amount) throw new UserError('The certified amount cannot exceed the claim');
      cl.certified = cert; cl.status = 'certified';
      cl.certNo = `PC-${dayKey(now).slice(0, 4)}-${pad(++s.counters.pc, 3)}`;
      cl.certifiedAt = now; audit(s, user, now, 'certifyClaim', `${cl.certNo} ${cert}`); return { certNo: cl.certNo };
    });
  },
  rejectClaim(s, op, { user, now }) {
    need(user, OP_ROLES.rejectClaim);
    const cl = getClaim(s, op.claimId);
    if (cl.status !== 'submitted' && cl.status !== 'draft') throw new UserError('Only a draft or submitted claim can be rejected');
    cl.status = 'rejected'; cl.rejectReason = str(op.reason, 3, 120, 'Reason'); audit(s, user, now, 'rejectClaim', `${cl.id} #${cl.no}`); return {};
  },
  payClaim(s, op, { user, now }) {
    need(user, OP_ROLES.payClaim);
    return once(s, op, () => {
      const cl = getClaim(s, op.claimId);
      if (cl.status !== 'certified' && cl.status !== 'paid') throw new UserError('Only a certified claim can be paid');
      const amt = amount(op);
      const left = claimPayable(s, cl) - claimPaid(s, cl);
      if (amt > left) throw new UserError('That is more than the payable balance');
      cl.payments.push({ id: nextId(s, 'pay'), amount: amt, date: txDate(op, now), by: user.id, ts: now });
      if (claimPaid(s, cl) >= claimPayable(s, cl)) cl.status = 'paid';
      audit(s, user, now, 'payClaim', `${cl.certNo} ${amt}`); return { paid: claimPaid(s, cl), status: cl.status };
    });
  },
  requestMaterial(s, op, { user, now }) {
    need(user, OP_ROLES.requestMaterial);
    return once(s, op, () => {
      const p = getProject(s, op.projectId);
      if (p.status !== 'active') throw new UserError('The project is not active');
      const mr = { id: nextId(s, 'mr'), projectId: p.id, item: str(op.item, 2, 80, 'Item'), qty: intIn(op.qty, 1, 1000000, 'Quantity'), unit: oneOf(op.unit, UNITS, 'Unknown unit'), neededBy: op.neededBy, note: optStr(op.note, 120, 'Note'), status: 'pending', by: user.id, createdAt: now };
      if (!isKey(mr.neededBy) || mr.neededBy < dayKey(now)) throw new UserError('The needed-by date cannot be in the past');
      s.materials.push(mr); audit(s, user, now, 'requestMaterial', `${mr.id} ${mr.item}`); return { requestId: mr.id };
    });
  },
  approveMaterial(s, op, { user, now }) {
    need(user, OP_ROLES.approveMaterial);
    const mr = getMat(s, op.requestId);
    if (mr.status !== 'pending') throw new UserError('This request is already settled');
    mr.status = 'approved'; mr.settledBy = user.id; audit(s, user, now, 'approveMaterial', mr.id); return {};
  },
  rejectMaterial(s, op, { user, now }) {
    need(user, OP_ROLES.rejectMaterial);
    const mr = getMat(s, op.requestId);
    if (mr.status !== 'pending') throw new UserError('This request is already settled');
    mr.status = 'rejected'; mr.rejectReason = str(op.reason, 3, 120, 'Reason'); mr.settledBy = user.id; audit(s, user, now, 'rejectMaterial', mr.id); return {};
  },
  receiveMaterial(s, op, { user, now }) {
    need(user, OP_ROLES.receiveMaterial);
    const mr = getMat(s, op.requestId);
    if (mr.status !== 'approved') throw new UserError('Only an approved request can be received');
    mr.status = 'received'; mr.receivedAt = now; audit(s, user, now, 'receiveMaterial', mr.id); return {};
  },
  addLog(s, op, { user, now }) {
    need(user, OP_ROLES.addLog);
    return once(s, op, () => {
      const p = getProject(s, op.projectId);
      if (p.status !== 'active') throw new UserError('The project is not active');
      const date = txDate(op, now);
      if (s.logs.some((x) => x.projectId === p.id && x.date === date)) throw new UserError('There is already a log for this day');
      const lg = { id: nextId(s, 'dl'), projectId: p.id, date, weather: oneOf(op.weather, WEATHER, 'Unknown weather'), workers: intIn(op.workers, 1, 500, 'Workers'), work: str(op.work, 3, 500, 'Work done'), issues: optStr(op.issues, 300, 'Issues'), by: user.id, ts: now };
      s.logs.push(lg); audit(s, user, now, 'addLog', `${lg.id} ${p.id} ${date}`); return { logId: lg.id };
    });
  },
  updateLog(s, op, { user, now }) {
    need(user, OP_ROLES.updateLog);
    const lg = find(s.logs, op.logId, 'Log');
    Object.assign(lg, { weather: oneOf(op.weather, WEATHER, 'Unknown weather'), workers: intIn(op.workers, 1, 500, 'Workers'), work: str(op.work, 3, 500, 'Work done'), issues: optStr(op.issues, 300, 'Issues') });
    audit(s, user, now, 'updateLog', lg.id); return {};
  },
  addSnag(s, op, { user, now }) {
    need(user, OP_ROLES.addSnag);
    return once(s, op, () => {
      const p = getProject(s, op.projectId);
      if (p.status === 'closed') throw new UserError('This project is closed');
      const sn = { id: nextId(s, 'sn'), projectId: p.id, location: str(op.location, 2, 80, 'Location'), desc: str(op.desc, 3, 200, 'Description'), sev: oneOf(op.sev, SNAG_SEV, 'Unknown severity'), status: 'open', by: user.id, createdAt: now, closedAt: null, closeNote: '' };
      s.snags.push(sn); audit(s, user, now, 'addSnag', `${sn.id} ${sn.sev}`); return { snagId: sn.id };
    });
  },
  startSnag(s, op, { user, now }) {
    need(user, OP_ROLES.startSnag);
    const sn = getSnag(s, op.snagId);
    if (sn.status !== 'open') throw new UserError('Only an open snag can start');
    sn.status = 'in_progress'; audit(s, user, now, 'startSnag', sn.id); return {};
  },
  closeSnag(s, op, { user, now }) {
    need(user, OP_ROLES.closeSnag);
    const sn = getSnag(s, op.snagId);
    if (sn.status === 'closed') throw new UserError('This snag is already closed');
    sn.status = 'closed'; sn.closedAt = now; sn.closeNote = str(op.note, 3, 120, 'Closing note'); audit(s, user, now, 'closeSnag', sn.id); return {};
  },
  reopenSnag(s, op, { user, now }) {
    need(user, OP_ROLES.reopenSnag);
    const sn = getSnag(s, op.snagId);
    if (sn.status !== 'closed') throw new UserError('Only a closed snag can be reopened');
    sn.status = 'open'; sn.closedAt = null; audit(s, user, now, 'reopenSnag', sn.id); return {};
  },
  addDoc(s, op, { user, now }) {
    need(user, OP_ROLES.addDoc);
    return once(s, op, () => {
      const p = getProject(s, op.projectId);
      const d = { id: nextId(s, 'doc'), projectId: p.id, title: str(op.title, 2, 100, 'Title'), kind: oneOf(op.kind, DOC_KINDS, 'Unknown kind'), ref: optStr(op.ref, 40, 'Reference'), date: txDate(op, now), note: optStr(op.note, 150, 'Note'), by: user.id, createdAt: now };
      s.docs.push(d); audit(s, user, now, 'addDoc', `${d.id} ${d.title}`); return { docId: d.id };
    });
  },
  deleteDoc(s, op, { user, now }) {
    need(user, OP_ROLES.deleteDoc);
    const d = find(s.docs, op.docId, 'Document');
    s.docs = s.docs.filter((x) => x.id !== d.id); audit(s, user, now, 'deleteDoc', d.id); return {};
  },
  setSettings(s, op, { user, now }) {
    need(user, OP_ROLES.setSettings);
    s.settings = { retentionPct: intIn(op.retentionPct, 0, 20, 'Retention') };
    audit(s, user, now, 'setSettings', `retention ${s.settings.retentionPct}%`); return {};
  },
};
function addBoqRow(s, r, user, now, silent) {
  const p = getProject(s, r.projectId);
  if (p.status === 'closed') throw new UserError('This project is closed');
  const b = { id: nextId(s, 'q'), projectId: p.id, code: str(r.code, 1, 20, 'Code'), desc: str(r.desc, 2, 120, 'Description'), descAr: optStr(r.descAr, 120, 'Arabic description'), unit: oneOf(r.unit, UNITS, 'Unknown unit'), cat: oneOf(r.cat, BOQ_CATS, 'Unknown category'), qty: intIn(r.qty, 1, 10000000, 'Quantity'), rate: intIn(r.rate, 1, MAX_AMOUNT, 'Rate'), executed: 0, createdAt: now };
  if (s.boq.some((x) => x.projectId === p.id && x.code.toLowerCase() === b.code.toLowerCase())) throw new UserError('This code is already used in the project');
  s.boq.push(b); if (!silent) audit(s, user, now, 'addBoq', `${b.id} ${b.code}`);
  return { boqId: b.id };
}
export function applyOp(s, op, ctx) {
  if (!op || typeof op !== 'object' || !Object.prototype.hasOwnProperty.call(OPS, op.type)) throw new UserError('Unknown action');
  return OPS[op.type](s, op, ctx);
}

// ---------- CSV ----------
export function csvCell(v) {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
export const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

// ---------- seed ----------
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function seed(now) {
  const today = dayKey(now), m0 = monthOf(today), tDay = Number(today.slice(8, 10));
  const rnd = mulberry32(20261125);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const s = {
    users: [
      { id: 'u-owner', pin: '1111', name: 'Hany Rashad', nameAr: 'هاني رشاد', role: 'owner' },
      { id: 'u-pm', pin: '2222', name: 'Dina Fathy', nameAr: 'دينا فتحي', role: 'pm' },
      { id: 'u-eng', pin: '3333', name: 'Omar Selim', nameAr: 'عمر سليم', role: 'engineer' },
      { id: 'u-acc', pin: '4444', name: 'Fady Aziz', nameAr: 'فادي عزيز', role: 'accountant' },
      { id: 'u-client', pin: '5555', name: 'Nader Fouad', nameAr: 'نادر فؤاد', role: 'client' },
    ],
    counters: {}, keys: [], audit: [], settings: { ...DEFAULTS },
    projects: [], phases: [], milestones: [], boq: [], costs: [], subs: [], contracts: [], claims: [], materials: [], logs: [], snags: [], docs: [],
  };
  const OWN = { id: 'u-owner' }, PM = { id: 'u-pm' }, ENG = { id: 'u-eng' }, ACC = { id: 'u-acc' };
  const md = (m, d) => `${m}-${pad(Math.min(d, m === m0 ? tDay : 28), 2)}`;
  const mkProject = (name, nameAr, client, site, cv, start, deadline, status, clientVisible) => { const p = { id: nextId(s, 'p'), name, nameAr, client, site, contractValue: cv, startDate: start, deadline, status, clientVisible, createdAt: now - 300 * 864e5 }; s.projects.push(p); return p; };
  const p1 = mkProject('Palm Heights Tower', 'برج بالم هايتس', 'Palm Developments (Mr. Nader)', 'New Cairo, plot 114', 28000000, addMonths(m0, -6) + '-01', addMonths(m0, 10) + '-28', 'active', true);
  const p2 = mkProject('Zayed Ridge Villas', 'فلل زايد ريدج', 'Ridge Homes', 'Sheikh Zayed, zone 4', 7800000, addMonths(m0, -2) + '-10', addMonths(m0, 8) + '-15', 'active', false);
  const p3 = mkProject('October School Annex', 'ملحق مدرسة أكتوبر', 'October Schools Co.', '6th of October, district 7', 3800000, addMonths(m0, -10) + '-05', addMonths(m0, -1) + '-20', 'closed', false);
  const mkPhase = (p, name, nameAr, weight, m1, m2) => { const ph = { id: nextId(s, 'ph'), projectId: p.id, name, nameAr, weight, plannedStart: m1, plannedEnd: m2, createdAt: now - 290 * 864e5 }; s.phases.push(ph); return ph; };
  const ph1a = mkPhase(p1, 'Excavation and shoring', 'الحفر والسند', 10, addMonths(m0, -6) + '-01', addMonths(m0, -5) + '-15');
  const ph1b = mkPhase(p1, 'Foundations', 'الأساسات', 20, addMonths(m0, -5) + '-10', addMonths(m0, -3) + '-20');
  const ph1c = mkPhase(p1, 'Skeleton', 'الهيكل الخرساني', 35, addMonths(m0, -3) + '-15', addMonths(m0, 3) + '-30');
  const ph1d = mkPhase(p1, 'Masonry and plaster', 'المباني والمحارة', 15, addMonths(m0, 1) + '-01', addMonths(m0, 5) + '-30');
  const ph1e = mkPhase(p1, 'MEP works', 'الأعمال الكهروميكانيكية', 12, addMonths(m0, 2) + '-01', addMonths(m0, 7) + '-30');
  const ph1f = mkPhase(p1, 'Finishes and handover', 'التشطيبات والتسليم', 8, addMonths(m0, 6) + '-01', addMonths(m0, 10) + '-28');
  const ph2a = mkPhase(p2, 'Foundations', 'الأساسات', 25, addMonths(m0, -2) + '-10', addMonths(m0, -1) + '-10');
  const ph2b = mkPhase(p2, 'Skeleton', 'الهيكل', 45, addMonths(m0, -1) + '-05', addMonths(m0, 3) + '-30');
  const ph2c = mkPhase(p2, 'Finishes', 'التشطيبات', 30, addMonths(m0, 3) + '-01', addMonths(m0, 8) + '-15');
  const ph3a = mkPhase(p3, 'Structure', 'الهيكل', 55, addMonths(m0, -10) + '-05', addMonths(m0, -5) + '-30');
  const ph3b = mkPhase(p3, 'Finishes and handover', 'التشطيبات والتسليم', 45, addMonths(m0, -5) + '-01', addMonths(m0, -1) + '-20');
  const mkMs = (p, ph, name, nameAr, due, done) => { const m = { id: nextId(s, 'ms'), projectId: p.id, phaseId: ph.id, name, nameAr, due, doneDate: done || null, createdAt: now - 280 * 864e5 }; s.milestones.push(m); return m; };
  mkMs(p1, ph1a, 'Excavation complete', 'انتهاء الحفر', addMonths(m0, -5) + '-15', addMonths(m0, -5) + '-13');
  mkMs(p1, ph1b, 'Raft foundation poured', 'صب اللبشة', addMonths(m0, -4) + '-01', addMonths(m0, -4) + '-02');
  mkMs(p1, ph1b, 'Waterproofing done', 'انتهاء العزل', addMonths(m0, -3) + '-20', addMonths(m0, -3) + '-25');
  mkMs(p1, ph1c, 'Ground floor slab', 'سقف الدور الأرضي', addMonths(m0, -2) + '-15', addMonths(m0, -2) + '-18');
  mkMs(p1, ph1c, 'Fifth floor slab', 'سقف الدور الخامس', addDays(today, -6), null); // overdue: the alert on the dashboard
  mkMs(p1, ph1c, 'Skeleton complete', 'اكتمال الهيكل', addMonths(m0, 3) + '-30', null);
  mkMs(p1, ph1d, 'Masonry up to fifth floor', 'مباني حتى الدور الخامس', addMonths(m0, 2) + '-28', null);
  mkMs(p1, ph1f, 'Handover', 'التسليم الابتدائي', addMonths(m0, 10) + '-28', null);
  mkMs(p2, ph2a, 'Villas 1-4 foundations', 'أساسات فلل ١-٤', addMonths(m0, -1) + '-10', addMonths(m0, -1) + '-12');
  mkMs(p2, ph2b, 'Villas 1-4 skeleton', 'هيكل فلل ١-٤', addMonths(m0, 1) + '-20', null);
  mkMs(p3, ph3a, 'Structure complete', 'اكتمال الهيكل', addMonths(m0, -5) + '-30', addMonths(m0, -5) + '-28');
  mkMs(p3, ph3b, 'Handover', 'التسليم', addMonths(m0, -1) + '-20', addMonths(m0, -1) + '-18');
  const mkBoq = (p, code, desc, descAr, unit, cat, qty, rate, executed) => { const b = { id: nextId(s, 'q'), projectId: p.id, code, desc, descAr, unit, cat, qty, rate, executed, createdAt: now - 280 * 864e5 }; s.boq.push(b); return b; };
  const q1 = mkBoq(p1, 'A-01', 'Excavation in all soil types', 'حفر في جميع أنواع التربة', 'm3', 'earthworks', 9000, 85, 9000);
  const q2 = mkBoq(p1, 'A-02', 'Shoring and dewatering', 'سند الجوانب ونزح المياه', 'ls', 'earthworks', 1, 450000, 1);
  const q3 = mkBoq(p1, 'B-01', 'Plain concrete C15', 'خرسانة عادية', 'm3', 'concrete', 500, 2400, 500);
  const q4 = mkBoq(p1, 'B-02', 'Reinforced concrete C35 raft', 'خرسانة مسلحة للبشة', 'm3', 'concrete', 600, 3600, 600);
  const q5 = mkBoq(p1, 'B-03', 'Reinforced concrete skeleton', 'خرسانة مسلحة للهيكل', 'm3', 'concrete', 1800, 3600, 1000);
  const q6 = mkBoq(p1, 'C-01', 'High tensile steel B500', 'حديد تسليح', 'ton', 'steel', 120, 42500, 55);
  const q7 = mkBoq(p1, 'D-01', 'Cement block walls 20cm', 'مباني بلوك ٢٠ سم', 'm2', 'masonry', 9000, 380, 0);
  const q8 = mkBoq(p1, 'E-01', 'Electrical first fix', 'تأسيس كهرباء', 'm2', 'mep', 9000, 160, 0);
  const q9 = mkBoq(p1, 'E-02', 'Plumbing first fix', 'تأسيس سباكة', 'm2', 'mep', 9000, 130, 0);
  const q10 = mkBoq(p1, 'F-01', 'Internal plaster', 'محارة داخلية', 'm2', 'finishes', 18000, 180, 0);
  const r1 = mkBoq(p2, 'A-01', 'Excavation', 'حفر', 'm3', 'earthworks', 2400, 90, 2400);
  const r2 = mkBoq(p2, 'B-01', 'Reinforced concrete', 'خرسانة مسلحة', 'm3', 'concrete', 600, 4000, 280);
  const r3 = mkBoq(p2, 'C-01', 'Steel reinforcement', 'حديد تسليح', 'ton', 'steel', 40, 43000, 20);
  const r4 = mkBoq(p2, 'D-01', 'Block walls', 'مباني بلوك', 'm2', 'masonry', 2500, 420, 0);
  const r5 = mkBoq(p2, 'F-01', 'Finishes package', 'بند التشطيبات', 'ls', 'finishes', 1, 1600000, 0);
  const t1 = mkBoq(p3, 'A-01', 'Excavation', 'حفر', 'm3', 'earthworks', 1200, 80, 1200);
  const t2 = mkBoq(p3, 'B-01', 'Concrete works', 'أعمال خرسانة', 'm3', 'concrete', 620, 3800, 620);
  const t3 = mkBoq(p3, 'F-01', 'Finishes', 'تشطيبات', 'ls', 'finishes', 1, 1100000, 1);
  const mkSub = (name, nameAr, trade) => { const x = { id: nextId(s, 's'), name, nameAr, trade, phone: '01' + String(100000000 + Math.floor(rnd() * 899999999)), active: true, createdAt: now - 270 * 864e5 }; s.subs.push(x); return x; };
  const s1 = mkSub('Delta Concrete Supply', 'دلتا للخرسانة', 'concrete');
  const s2 = mkSub('Nile Steel Fixers', 'النيل لحداد التسليح', 'steelwork');
  const s3 = mkSub('Spark Electrical Works', 'سبارك للأعمال الكهربائية', 'electrical');
  const s4 = mkSub('Flow Plumbing', 'فلو للسباكة', 'plumbing');
  const s5 = mkSub('Smooth Plaster Crew', 'طاقم محارة سموث', 'plaster');
  const s6 = mkSub('CoolAir HVAC', 'كول اير للتكييف', 'hvac');
  const mkContract = (sub, p, scope, value) => { const c = { id: nextId(s, 'ct'), subId: sub.id, projectId: p.id, scope, value, createdAt: now - 260 * 864e5 }; s.contracts.push(c); return c; };
  const ct1 = mkContract(s1, p1, 'Ready-mix concrete supply', 9500000);
  const ct2 = mkContract(s2, p1, 'Steel fixing labor', 2800000);
  const ct3 = mkContract(s3, p1, 'Electrical works', 1900000);
  const ct4 = mkContract(s5, p1, 'Internal plaster', 2400000);
  const ct5 = mkContract(s1, p2, 'Ready-mix concrete supply', 1600000);
  const ct6 = mkContract(s2, p2, 'Steel fixing labor', 900000);
  // claims: older months certified and paid, this month one submitted (waiting, older than 7 days), one draft
  const mkClaim = (ct, no, amount, status, certified, certNo, pays, ageDays) => {
    const base = now - ageDays * 864e5;
    const cl = { id: nextId(s, 'cl'), contractId: ct.id, no, amount, note: '', status, certified, certNo, payments: pays.map((a, i) => ({ id: nextId(s, 'pay'), amount: a, date: dayKey(base + (i + 1) * 864e5), by: 'u-acc', ts: base })), by: 'u-pm', createdAt: base, submittedAt: status === 'draft' ? undefined : base };
    s.claims.push(cl); return cl;
  };
  const ret = (v) => Math.round(v * 0.95);
  mkClaim(ct1, 1, 1800000, 'paid', 1800000, `PC-${m0.slice(0, 4)}-${pad(1, 3)}`, [ret(1800000)], 150);
  mkClaim(ct1, 2, 2200000, 'paid', 2100000, `PC-${m0.slice(0, 4)}-${pad(2, 3)}`, [1000000, ret(2100000) - 1000000], 110);
  mkClaim(ct1, 3, 1500000, 'certified', 1500000, `PC-${m0.slice(0, 4)}-${pad(3, 3)}`, [700000], 35); // partly paid
  mkClaim(ct1, 4, 1200000, 'submitted', 0, null, [], 9); // waiting 9 days: dashboard alert
  mkClaim(ct2, 1, 700000, 'paid', 700000, `PC-${m0.slice(0, 4)}-${pad(4, 3)}`, [ret(700000)], 120);
  mkClaim(ct2, 2, 800000, 'submitted', 0, null, [], 2);
  mkClaim(ct5, 1, 600000, 'paid', 600000, `PC-${m0.slice(0, 4)}-${pad(5, 3)}`, [ret(600000)], 45);
  mkClaim(ct2, 3, 500000, 'draft', 0, null, [], 1);
  s.counters.pc = 5;
  // costs: 6 months of actuals against executed BOQ items
  const cost = (b, kind, amount, date, note, by) => s.costs.push({ id: nextId(s, 'co'), projectId: b.projectId, boqId: b.id, kind, amount, date, note: note || '', by: by.id, ts: parse(date) + 10 * 3600000 });
  const p1Items = [q1, q2, q3, q4, q5, q6], p2Items = [r1, r2, r3], p3Items = [t1, t2, t3];
  for (let back = 5; back >= 0; back--) {
    const m = addMonths(m0, -back), cur = back === 0;
    if (back <= 5) { for (const b of p1Items) { if (b.executed === 0) continue; if (rnd() < 0.85) cost(b, pick(COST_KINDS), 120000 + Math.floor(rnd() * 420000), md(m, 3 + Math.floor(rnd() * 20)), pick(['Batch of materials', 'Site labor', 'Equipment rental', 'Pump hire', 'Lab tests']), ACC); } }
    if (back <= 1) { for (const b of p2Items) { if (rnd() < 0.8) cost(b, pick(COST_KINDS), 60000 + Math.floor(rnd() * 180000), md(m, 4 + Math.floor(rnd() * 18)), 'Site expense', ACC); } }
    if (back >= 4 && back <= 9) { for (const b of p3Items) { if (rnd() < 0.8) cost(b, pick(COST_KINDS), 80000 + Math.floor(rnd() * 220000), md(m, 4 + Math.floor(rnd() * 18)), 'Site expense', ACC); } }
  }
  // materials
  const mkMat = (p, item, qty, unit, neededBy, status, by, note) => s.materials.push({ id: nextId(s, 'mr'), projectId: p.id, item, qty, unit, neededBy, note: note || '', status, by: by.id, createdAt: now - 864e5 * 3 });
  mkMat(p1, 'Cement 52.5N', 800, 'pc', addDays(today, 3), 'pending', ENG);
  mkMat(p1, 'Steel 16mm', 40, 'ton', addDays(today, 6), 'pending', ENG);
  mkMat(p1, 'Ready-mix C35', 350, 'm3', addDays(today, -2), 'approved', ENG);
  mkMat(p2, 'Blocks 20cm', 30000, 'pc', addDays(today, 10), 'pending', ENG);
  mkMat(p1, 'Sand washed', 200, 'm3', addDays(today, -10), 'received', ENG);
  // daily logs for the last 20 days on p1, 10 on p2; today is missing on purpose
  for (let d = 20; d >= 1; d--) {
    if (rnd() < 0.12) continue;
    s.logs.push({ id: nextId(s, 'dl'), projectId: p1.id, date: addDays(today, -d), weather: pick(WEATHER), workers: 55 + Math.floor(rnd() * 40), work: pick(['Skeleton formwork and pouring, zone B', 'Steel fixing for columns, level 3', 'Raft reinforcement continues', 'Shuttering removal and curing', 'Concrete pump pour, core walls']), issues: rnd() < 0.3 ? pick(['Concrete truck arrived late', 'Crane maintenance for two hours', 'Waiting for lab results']) : '', by: ENG.id, ts: now - d * 864e5 });
    if (d <= 10 && rnd() < 0.8) s.logs.push({ id: nextId(s, 'dl'), projectId: p2.id, date: addDays(today, -d), weather: pick(WEATHER), workers: 25 + Math.floor(rnd() * 20), work: pick(['Foundation pouring, villa 3', 'Steel fixing, villa 2', 'Excavation finishing, villa 4']), issues: '', by: ENG.id, ts: now - d * 864e5 });
  }
  // snags
  const mkSnag = (p, location, desc, sev, status, age, closeNote) => s.snags.push({ id: nextId(s, 'sn'), projectId: p.id, location, desc, sev, status, by: ENG.id, createdAt: now - age * 864e5, closedAt: status === 'closed' ? now - age * 864e5 + 2 * 864e5 : null, closeNote: closeNote || '' });
  mkSnag(p1, 'Basement wall B2', 'Honeycombing in poured wall section', 'major', 'in_progress', 12);
  mkSnag(p1, 'Core stairwell', 'Misaligned sleeve for drainage riser', 'critical', 'open', 4); // the critical alert
  mkSnag(p1, 'Ground slab edge', 'Surface cracking near expansion joint', 'minor', 'closed', 20, 'Repaired with epoxy grout');
  mkSnag(p2, 'Villa 2 footing', 'Cover below spec on two sides', 'major', 'open', 6);
  mkSnag(p3, 'Classroom 4', 'Paint blistering on north wall', 'minor', 'closed', 40, 'Repainted');
  // documents
  const mkDoc = (p, title, kind, ref, date, note, by) => s.docs.push({ id: nextId(s, 'doc'), projectId: p.id, title, kind, ref, date, note: note || '', by: by.id, createdAt: now - 200 * 864e5 });
  mkDoc(p1, 'Architectural drawings rev C', 'drawing', 'AR-PHT-REVC', addMonths(m0, -3) + '-02', 'Issued for construction', PM);
  mkDoc(p1, 'Structural calculations package', 'report', 'ST-PHT-04', addMonths(m0, -4) + '-12', '', PM);
  mkDoc(p1, 'Building permit', 'permit', 'BP-NC-114-2026', addMonths(m0, -6) + '-01', '', OWN);
  mkDoc(p1, 'Main contract signed', 'contract', 'CTR-PHT-2026', addMonths(m0, -6) + '-01', '', OWN);
  mkDoc(p2, 'Villas drawings rev A', 'drawing', 'AR-ZRV-REVA', addMonths(m0, -2) + '-01', '', PM);
  return s;
}

// ---------- per-role views ----------
export function view(s, user, now) {
  const today = dayKey(now), m0 = monthOf(today);
  const st = settings(s);
  const visibleProjects = user.role === 'client' ? s.projects.filter((p) => p.clientVisible) : s.projects;
  const pids = new Set(visibleProjects.map((p) => p.id));
  const prog = {}; for (const p of visibleProjects) prog[p.id] = projectProgress(s, p, today);
  const projects = visibleProjects.map((p) => {
    const pr = prog[p.id];
    const phases = s.phases.filter((x) => x.projectId === p.id).map((ph) => ({
      ...ph,
      milestones: s.milestones.filter((m) => m.phaseId === ph.id),
    }));
    const base = { ...p, ...pr, phases, openSnags: s.snags.filter((x) => x.projectId === p.id && x.status !== 'closed').length, criticalSnags: s.snags.filter((x) => x.projectId === p.id && x.status !== 'closed' && x.sev === 'critical').length, pendingMaterials: s.materials.filter((x) => x.projectId === p.id && x.status === 'pending').length };
    if (user.role === 'client') {
      const { actual, margin, ...rest } = base;
      return { ...rest, certificates: s.claims.filter((cl) => (cl.status === 'certified' || cl.status === 'paid') && pids.has(getContract(s, cl.contractId).projectId)).map((cl) => ({ id: cl.id, certNo: cl.certNo, certified: cl.certified, status: cl.status, no: cl.no, contractId: cl.contractId })) };
    }
    return base;
  });
  const money = MONEY_VIEW.includes(user.role) || user.role === 'engineer';
  const boq = user.role === 'client' ? [] : s.boq.filter((b) => pids.has(b.projectId));
  const costs = user.role === 'client' ? [] : s.costs.filter((c) => pids.has(c.projectId)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const subs = user.role === 'client' ? [] : s.subs;
  const contracts = user.role === 'client' ? [] : s.contracts.filter((c) => pids.has(c.projectId));
  const claims = user.role === 'client' ? [] : s.claims.filter((cl) => pids.has(getContract(s, cl.contractId).projectId)).map((cl) => ({ ...cl, payable: cl.certified ? claimPayable(s, cl) : 0, paidTotal: claimPaid(s, cl), leftToPay: cl.certified ? claimPayable(s, cl) - claimPaid(s, cl) : 0 }));
  const materials = user.role === 'client' ? [] : s.materials.filter((x) => pids.has(x.projectId)).sort((a, b) => b.createdAt - a.createdAt);
  const logs = s.logs.filter((x) => pids.has(x.projectId)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const snags = s.snags.filter((x) => pids.has(x.projectId)).sort((a, b) => b.createdAt - a.createdAt);
  const docs = s.docs.filter((x) => pids.has(x.projectId)).sort((a, b) => (a.date < b.date ? 1 : -1));
  // reports: 12 months of costs, and per-category totals
  const byMonth = []; for (let i = 11; i >= 0; i--) { const m = addMonths(m0, -i); byMonth.push({ m, cost: costs.filter((c) => c.date.startsWith(m)).reduce((x, c) => x + c.amount, 0) }); }
  const byCat = BOQ_CATS.map((cat) => ({ cat, cost: costs.filter((c) => getBoq(s, c.boqId).cat === cat).reduce((x, c) => x + c.amount, 0) })).filter((x) => x.cost > 0);
  const active = visibleProjects.filter((p) => p.status === 'active');
  const totals = {
    activeProjects: active.length,
    contractValue: active.reduce((x, p) => x + p.contractValue, 0),
    avgProgress: active.length ? Math.round(active.reduce((x, p) => x + prog[p.id].progressPct, 0) / active.length) : 0,
    monthCost: byMonth[11].cost,
    submittedClaims: user.role === 'client' ? 0 : claims.filter((c) => c.status === 'submitted').length,
    submittedAmount: user.role === 'client' ? 0 : claims.filter((c) => c.status === 'submitted').reduce((x, c) => x + c.amount, 0),
    criticalSnags: snags.filter((x) => x.sev === 'critical' && x.status !== 'closed').length,
    openSnags: snags.filter((x) => x.status !== 'closed').length,
    pendingMaterials: materials.filter((x) => x.status === 'pending').length,
  };
  // insights (not for the client)
  const insights = [];
  if (user.role !== 'client') {
    for (const p of active) {
      const pr = prog[p.id];
      if (pr.actual > pr.estimate * 1.05) insights.push({ kind: 'cost_overrun', projectId: p.id, actual: pr.actual, estimate: pr.estimate });
      if (daysBetween(today, p.deadline) <= 60 && pr.progressPct < pr.plannedPct * 0.8) insights.push({ kind: 'deadline_risk', projectId: p.id, progress: pr.progressPct, planned: pr.plannedPct });
      if (!s.logs.some((x) => x.projectId === p.id && x.date === today)) insights.push({ kind: 'log_missing', projectId: p.id });
      for (const b of s.boq.filter((x) => x.projectId === p.id)) if (b.qty > 0 && b.executed / b.qty >= 0.9 && b.executed < b.qty) insights.push({ kind: 'item_low', boqId: b.id, pct: Math.round((b.executed / b.qty) * 100) });
    }
    for (const m of s.milestones) if (pids.has(m.projectId) && !m.doneDate && m.due < today && getProject(s, m.projectId).status === 'active') insights.push({ kind: 'milestone_overdue', milestoneId: m.id, due: m.due });
    for (const cl of claims) if (cl.status === 'submitted' && now - (cl.submittedAt || cl.createdAt) > 7 * 864e5) insights.push({ kind: 'claim_waiting', claimId: cl.id, amount: cl.amount });
    for (const sn of snags) if (sn.sev === 'critical' && sn.status !== 'closed') insights.push({ kind: 'snag_critical', snagId: sn.id });
  }
  return {
    me: { id: user.id, name: user.name, nameAr: user.nameAr, role: user.role }, today, now,
    settings: st, retentionPct: st.retentionPct,
    projects, boq, costs, subs, contracts, claims, materials, logs, snags, docs,
    reports: { byMonth, byCat, totals },
    insights,
    audit: user.role === 'owner' ? s.audit.slice(0, 120) : [],
    users: user.role === 'owner' ? s.users.map((u) => ({ id: u.id, name: u.name, nameAr: u.nameAr, role: u.role })) : [],
  };
}
