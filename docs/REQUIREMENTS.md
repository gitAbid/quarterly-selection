# Requirements and acceptance before implementation

Baseline: Audacity Engineering Case Study Part 4 Option A. Build selection only, not the rate limiter or the six-week platform.

Required: company active IDs + percentage + quarter; equal treatment; reproducible audit; previous-quarter vehicles eligible; no second different company/quarter draw; 20 and 200,000 vehicles. Deliver code, tests, runnable README, complexity and an unstated edge case.

Decisions: HMAC ranking; local SQLite; internally generated 32-byte seed encrypted with an external key; ceiling rounding; 0.01–100 percent, two decimals. IDs are case-sensitive, blank/duplicate/ill-formed Unicode rejected, other characters preserved. Quarter years 0001–9999. The caller supplies active IDs. Changed valid requests return the original with inputsMatch false. v2 uses raw seed bytes and JSON HMAC context; explicit v1 replay uses original UTF-8 string seed and delimiter encoding. Audit descriptions are informational.

## Public test boundaries

1. replaySelection: validation, known-answer replay, count, ordering, eligibility, distribution.
2. SelectionService: creation/read/retry, SQLite restart and independent-process concurrency, interruption, contention, record ownership.
3. exportAudit/verifyAuditBundle: encryption/authentication, at-rest artifacts, malformed/tampered/versioned evidence.
4. CLI subprocesses: draw/get/audit/verify, exit codes and no secret-bearing ordinary output.

## Acceptance matrix

| Area | Success | Failure/recovery |
|---|---|---|
| Input | valid values; quotes/delimiters/Unicode preserved | wrong types, missing values, blank/duplicate IDs, lone surrogates, injected orchestration seed rejected |
| Percentage/count | 20@25=5; 7@25=2; 20@1=1; 1@.01=1; empty=0; 100=all; .07 valid | zero, negatives, >100, NaN/infinity, .001, 1e-12, 12.345 rejected; empty input does not bypass validation |
| Replay | literal independent v2 fixture; explicit v1 fixture; input ordering irrelevant; caller arrays untouched | unknown version, bad seed, invalid inputs rejected |
| Eligibility/fairness | no historical exclusion; membership, uniqueness and ranks; deterministic 4000-seed smoke check | malformed encoding IDs rejected; gross bias fails; smoke check never claimed as proof |
| Durable draw | first created; identical/order-only retries reuse; reopen/process persistence | changed valid inputs preserve first and flag mismatch; invalid retries rejected; returned mutation does not persist |
| Concurrency | ten child processes share one winner | conflicting candidates cannot overwrite or falsely return their candidate |
| Recovery | complete committed records survive termination | failed writes, interrupted transaction, contention timeout never yield partial/fallback success; retry safe |
| Seed | correct key exports original after reopen; ordinary output has no seed | malformed/wrong key, modified cipher/nonce/tag, moved ciphertext fail; no replacement seed; plaintext absent from DB artifacts |
| Audit | valid v1/v2 evidence succeeds | null/primitives/missing/wrong fields/unknown versions/tampered identity, fleet, pct, count, ID, rank, score, seed fail structurally |
| CLI | draw/get/audit/verify work from clean setup | invalid evidence/operational failure exit1; usage/unreadable/invalid JSON exit2; no false success or key leaks |
| Scale | complete lifecycle20/200000; 50000 members at25%; measured timing and memory | large restart, changed retry and tampering preserve guarantees; pure selection guard10sec |

## Method and limits

For each new behavior write its test, observe an intended red failure, implement minimum code, then observe green. Tests added after a behavior already works are labeled regression. Capture command/output/runtime in evidence/tdd.jsonl and logs. Do not derive expected selection from production code. Failure tests assert errors plus preserved state and no false success/secrets. Real SQLite/processes prove durability; direct artifact inspection is reserved for at-rest security/corruption tests.

HMAC pseudorandom scores and ID tie-break have negligible theoretical tie bias. Replay establishes internal consistency, not authentic historical issuance. Out of scope: active-fleet management, scheduling/cutoff policy, tenant authorization, AWS, regulator portal, beacons, key rotation and externally anchored evidence. Original quarterly-selection remains unchanged. Node22 and24 are target runtimes.
