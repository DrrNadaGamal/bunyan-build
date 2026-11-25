// Screenshots into docs/. Usage: node e2e/shots.mjs http://localhost:3100
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const U = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
fs.mkdirSync('docs', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
async function page(w = 1280, h = 900) { const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 }); return p; }
async function login(p, pin, lang = 'en') {
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter');
  await p.waitForSelector('.top .nav', { timeout: 8000 }); await sleep(700);
}
const go = async (p, r) => { await p.evaluate((x) => (location.hash = '#/' + x), r); await sleep(700); };
const shot = async (p, name) => { await p.screenshot({ path: 'docs/' + name + '.png' }); console.log('shot', name); };
async function api(token, op) { const r = await fetch(U + '/api/data', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ op }) }); return r.json(); }
const token = (await (await fetch(U + '/api/data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: { type: 'login', pin: '1111' } }) })).json()).token;
await api(token, { type: 'reset' });
let p = await page(); await p.goto(U, { waitUntil: 'networkidle0' }); await sleep(400); await shot(p, '01-login');
await login(p, '1111'); await shot(p, '02-dashboard');
await go(p, 'projects'); await shot(p, '03-projects');
await go(p, 'boq'); await shot(p, '04-boq');
await go(p, 'claims'); await shot(p, '05-claims');
await p.click('[data-act="newclaim"]'); await sleep(500); await shot(p, '06-new-claim'); await p.keyboard.press('Escape'); await sleep(300);
await go(p, 'subs'); await shot(p, '07-subs');
await go(p, 'site'); await shot(p, '08-site');
await go(p, 'snags'); await shot(p, '09-snags');
await go(p, 'docs'); await shot(p, '10-docs');
await go(p, 'reports'); await sleep(600); await shot(p, '11-reports');
await go(p, 'settings'); await shot(p, '12-settings');
await go(p, 'audit'); await shot(p, '13-audit');
let pm = await page(); await login(pm, '2222'); await shot(pm, '14-pm-dashboard');
let eng = await page(); await login(eng, '3333'); await go(eng, 'site'); await shot(eng, '15-engineer-site');
let acc = await page(); await login(acc, '4444'); await go(acc, 'claims'); await shot(acc, '16-accountant-claims');
let cl = await page(); await login(cl, '5555'); await shot(cl, '17-client-dashboard');
await go(cl, 'projects'); await shot(cl, '18-client-projects');
let a = await page(); await login(a, '1111', 'ar'); await shot(a, '19-arabic-dashboard');
await go(a, 'claims'); await shot(a, '20-arabic-claims');
let ph = await page(390, 844); await login(ph, '2222'); await shot(ph, '21-phone-dashboard');
await go(ph, 'boq'); await shot(ph, '22-phone-boq');
let cph = await page(390, 844); await login(cph, '5555'); await shot(cph, '23-phone-client');
let aph = await page(390, 844); await login(aph, '1111', 'ar'); await shot(aph, '24-phone-arabic');
await api(token, { type: 'reset' });
await b.close(); console.log('done');
