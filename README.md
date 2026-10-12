# Quarterly random vehicle selection (Part 4, Option A)

A small TypeScript library and CLI that picks a random share of a company's active vehicles for a quarter. It is fair, an auditor can reproduce it later, and it never produces a second, different selection for the same company and quarter.

**Scope:** this covers only Option A. The rate limiter (Option B) and the wider platform are not built.

## Quick start

Requirements: **Node 22.12+, 24 or 26**, and npm. Nothing else; the database is SQLite, embedded through `better-sqlite3`.

```bash
npm ci              # install (npm may warn about install scripts; this is harmless)
npm test            # 130 tests, takes about 15 seconds
npm run typecheck
npm run demo        # draws 20 vehicles, restarts, retries, then verifies an audit export
npm run benchmark   # times 20 and 200,000 vehicles
```

The demo prints the selected IDs twice, before and after a restart (they are the same), followed by a verification report with `"ok": true`.

## How the brief maps to the code

| Requirement from the brief | How it is met | Where |
|---|---|---|
| Input: active vehicles, percentage, quarter | Validated input object; the caller supplies the active vehicle IDs | `src/validation.ts` |
| Every eligible vehicle has an equal chance | A fresh random 32-byte seed gives every vehicle a random score (HMAC-SHA-256); the lowest scores win | `src/selection.ts` |
| An auditor can reproduce the result | Each draw stores its full input and its seed. `audit` exports them and `verify` recomputes the result | `src/audit.ts` |
| Last quarter's picks are still eligible | Nothing is excluded; every quarter is an independent draw | — |
| Running twice gives no second selection | One database row per (company, quarter). A retry returns the stored draw and never draws again | `src/service.ts`, `src/store.ts` |
| Works for 20 and 200,000 vehicles | Both are tested; 200,000 takes about 1–4 s on a laptop | `test/scale.test.ts` |

## How it works

1. **Validate** the input, then sort vehicle IDs so their order doesn't matter.
2. If a draw **already exists** for this company and quarter, return it with `reused: true`.
3. Otherwise **generate a random seed**, score each vehicle as `HMAC(seed, [company, quarter, vehicleId])`, sort by score and take the first `ceil(count × percentage)`.
4. **Save** the draw (input, result and encrypted seed) in one transaction. If two processes race, the database keeps one and both callers get that one.
5. **Audit:** `audit` exports the record with its seed. `verify` recomputes the selection from that file and checks that it matches. No key or database is needed for this step.

Why a random seed rather than a hash of the inputs: if the selection depended only on the inputs, anyone could predict which vehicles will be picked. The seed keeps the selection unpredictable until the audit export reveals it.

## Using the CLI

You need a 32-byte key to encrypt the stored seeds. Create it once and **keep it**, because the stored draws can't be read without it:

```bash
export FLEETCHECK_SEED_KEY="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64"))')"

npm run cli -- draw --db ./draws.sqlite --input examples/draw-input.json   # first run: new draw
npm run cli -- draw --db ./draws.sqlite --input examples/draw-input.json   # second run: same draw, "reused": true
npm run cli -- get  --db ./draws.sqlite --company co-1 --quarter 2026-Q4

node --import tsx src/cli.ts audit --db ./draws.sqlite --company co-1 --quarter 2026-Q4 > audit.json
npm run verify -- audit.json                                              # "ok": true
```

Exit codes: `0` success, `1` failure (invalid data, wrong key, draw not found), `2` usage error or unreadable JSON.

### Library

```typescript
import { openSelectionService, verifyAuditBundle } from './src/index';

const service = openSelectionService({ databasePath: './draws.sqlite', encryptionKey: key });
const { record, reused, inputsMatch } = await service.createOrGet({
  companyId: 'co-1', quarter: '2026-Q4', percentage: 25,
  vehicleIds: ['v-1', 'v-2', 'v-3', 'v-4'],
});
const report = verifyAuditBundle(await service.exportAudit('co-1', '2026-Q4'));
await service.close();
```

## Input rules

- **Vehicle IDs:** non-empty strings with no duplicates. Order doesn't matter, and IDs are case-sensitive.
- **Quarter:** `YYYY-Q1` to `YYYY-Q4`.
- **Percentage:** 0.01 to 100, with at most 2 decimal places.
- **Number selected:** `ceil(vehicles × percentage)`, rounded up so that any non-empty fleet gets at least one vehicle checked. For example, 7 vehicles at 25% selects 2, and 20 vehicles at 1% selects 1. An empty fleet selects 0.

## Complexity

With *n* vehicles and *k* selected:

- **Time: O(n log n)**, from one HMAC per vehicle followed by a sort. Retries and verification replay the draw, so they cost the same.
- **Space: O(n)**, because the full list of eligible vehicles is stored with each draw so an auditor can replay it.

## Edge case the brief doesn't mention

**The fleet changes between the first run and a retry.** For example, a vehicle is added after the draw. The service still returns the original draw and never redraws, but marks it `inputsMatch: false` so the caller can see the input differs. Listing the same IDs in a different order still gives `inputsMatch: true`.

## Known limits and later work

These are intentionally out of scope for this exercise:

- **Future quarters are accepted.** A draw for `2030-Q1` can be made today with today's fleet. Later: only allow the current quarter, or a configurable window.
- **The seed commitment isn't published.** An auditor can confirm the draw is internally consistent, but not that it wasn't redone. Later: publish the seed hash before the quarter starts.
- **Every read replays the draw.** `get` and retries decrypt the seed and recompute the selection as an integrity check. That costs about 0.5–2 s at 200,000 vehicles and needs the key. Later: run that check on audit only.
- **Losing the key** makes stored draws unreadable. Later: key backup and rotation.
- **Single-host storage.** SQLite is safe for several processes on one machine. In production the same store interface would sit on PostgreSQL.
- **The `v1` algorithm** in `selection.ts`/`audit.ts` is a replay-only format kept from an earlier prototype, so the verifier can check older audit files. New draws always use `v2`. Later: remove it if no v1 files need verifying.

## Project layout

```
src/
  selection.ts   pure selection: scoring, sorting, count rule (no I/O)
  validation.ts  input validation
  service.ts     createOrGet / get / exportAudit (the public API)
  store.ts       SQLite persistence, one row per company+quarter
  crypto.ts      AES-256-GCM encryption of the stored seed
  audit.ts       audit bundle validation and verification
  cli.ts         command line wrapper
test/            unit, concurrency, crash-recovery, CLI and scale tests
scripts/         demo and benchmark
evidence/        recorded test, benchmark and clean-install logs (see VERIFICATION.md)
```
