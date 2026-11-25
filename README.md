# Bunyan (بنيان)

Construction project management for Egyptian contracting companies: projects and sites, phases and milestones, BOQ with cost estimates against actuals, subcontractors with progress claims and payment certificates, materials requests, site daily logs, snag lists and project documents. Bilingual (English / Arabic, RTL), five PIN-based roles for the demo.

**Live demo:** https://bunyan-build.vercel.app

Product direction, scope and delivery: Nada Gamal

## The demo company

One shared demo contracting company with three projects (two active, one closed and handed over), six subcontractors, eight progress claims at every stage of the certification cycle, and six months of cost history. The data is deterministic: a fresh instance always starts from the same seed.

## Roles

Sign in with a PIN (public on the sign-in screen, this is a demo):

| PIN | Role | Can do |
| --- | --- | --- |
| 1111 | Company owner | Everything: certify and reject claims, settings, close projects, delete cost entries, the audit log |
| 2222 | Project manager | Projects, phases, BOQ, subcontractors, contracts, claims draft/submit, materials approval, snag closing |
| 3333 | Site engineer | Progress against BOQ lines, materials requests and receiving, daily logs, snags, documents |
| 4444 | Accountant | Cost entries, paying certified claims |
| 5555 | Client (read-only) | His project's progress, milestones, payment certificates, snags and documents. No costs, rates, claims ledger or subcontractor names |

## The money flow

A subcontractor claim moves draft → submitted → certified → paid. The owner certifies (a `PC-YYYY-NNN` payment certificate is issued) and the accountant pays against it. Retention (default 5%, owner can set 0-20%) is held back from every certified amount; the payable balance always reflects the current setting. Claims can never exceed the contract value, certification cannot exceed the claim, and payments cannot exceed the certified amount minus retention.

## Honest limits

- No database. State lives in the memory of the running server instance and is rebuilt from the seed about every 6 hours, on restart, or when the owner uses Reset on the settings page. Two browser tabs share the same company by design.
- PINs are demo-grade. They are public on the sign-in screen; tokens are signed with an environment secret, but this is not production auth.
- Documents are register entries (title, kind, reference, date), not file uploads.
- One company per deployment. There is no multi-tenancy.

## Stack

Vanilla JS single-page app (`public/`), one serverless function (`api/data.js`) holding the shared state, business rules in `public/logic.js` shared verbatim by the browser, the server and the tests. No build step. Deployed on Vercel as a static site plus one function.

## Development

```
npm install
npm run dev        # local server on :3100 with the same API handler
npm test           # unit tests for logic and i18n
node e2e/e2e.mjs http://localhost:3100    # full browser + API suite (needs Chrome)
node e2e/shots.mjs http://localhost:3100  # screenshots into docs/
```

The e2e suite (252 checks) covers API security (forged tokens, prototype names as actions, oversized bodies, method handling), every role's permission lane, the complete claim-certification-payment cycle with retention math, progress and cost guards, materials, logs, snags, documents, idempotency keys, the client role never seeing internal money (including typed hash routes), XSS stored as text, Arabic RTL, 390px layouts and zero page errors. It runs to completion against the live URL before every release.

## Environment

`BUNYAN_SECRET` — signing secret for session tokens (set in the Vercel project).
