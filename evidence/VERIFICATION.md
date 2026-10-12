# Final verification — 2026-10-12

> **Status note.** The results below were recorded on 12 October 2026 at the first commit, before the code was refactored into layers (`domain`, `application`, `infrastructure`, `bootstrap`, `cli`) and one more test was added (the seed commitment hash). The current code has **131 tests** (the 130 below plus that one). On Node 26.10 all 131 pass, the typecheck is clean and `npm run format:check` passes; Node 22 and 24 were not re-run. Local file paths in these logs were replaced with `<project>` and `node`.

Two independent clean copies without node_modules were installed with `npm ci`. Each used its stated Node executable in PATH and the submitted lockfile. Commands stopped immediately on nonzero exit; all returned zero.

| Check | Node 22.23.3 | Node 24.19.0 |
|---|---|---|
| Clean npm ci | Passed | Passed |
| Automated tests | 130 passed, 7 files | 130 passed, 7 files |
| TypeScript check | Passed | Passed |
| Demo: create/reopen/retry/audit | Passed | Passed |
| CLI: draw/retry/get/export/verify | Passed | Passed |
| npm audit at all reported severities | 0 vulnerabilities | 0 vulnerabilities |
| Isolated scale benchmark | Passed at 20 and 200,000 | Passed at 20 and 200,000 |

Full logs are `clean-node22-*.log` and `clean-node24-*.log`. `checkpoint-node24-*` logs predate the final additional crash test and are retained as development evidence, not final results.

## Measured performance

Apple M1 Pro, macOS 27.0.1, darwin arm64; npm 11.19.1. Each population ran in its own child process, after clean-install correctness checks. Values below are one measured run, not a benchmark distribution or service latency guarantee.

| Node | Vehicles | Create ms | Reopen/retry ms | Export ms | Pure replay ms | Verify ms | Peak RSS MiB |
|---|---:|---:|---:|---:|---:|---:|---:|
| v22.23.3 | 20 | 3.03 | 1.62 | 0.40 | 0.07 | 0.17 | 81.8 |
| v22.23.3 | 200,000 | 1208.91 | 568.53 | 505.05 | 401.86 | 487.78 | 369.2 |
| v24.19.0 | 20 | 3.46 | 1.40 | 0.29 | 0.16 | 0.20 | 81.5 |
| v24.19.0 | 200,000 | 4245.95 | 1889.75 | 1824.48 | 1787.45 | 2045.34 | 484.5 |

Peak RSS is the whole process maximum, including runtime, SQLite, input fixtures, retained records and exported evidence. It is not incremental algorithm memory. Heap/RSS at completion and exact timestamps are in benchmark-node22.json and benchmark-node24.json. Each 200,000-vehicle draw selected 50,000 unique vehicles. Pure replay remained under the 10-second guard. Creation and evidence reads include replay validation; they are intentionally more expensive than a single scoring pass. Larger Node 24 timing and memory usage are measured observations, not a claim that Node 22 will always be faster.

## Recovery and independent review

Real independent processes verify ten-way identical and conflicting requests, post-commit termination, termination during draw preparation, short/prolonged contention, timeout/retry and failed-insert rollback. A separate child starts BEGIN IMMEDIATE, writes a new row and changes a committed row, signals readiness after those uncommitted writes, then receives SIGKILL. Public reopen proves both rollback and safe retry. This is deliberate external crash injection, separate from the service's normal transaction path.

The core checkpoint review found sparse-array acceptance, extra-precision acceptance and insufficient trusted-read validation. Failing cases were recorded and defects fixed. Final specification review requested stronger interrupted-transaction evidence; the deterministic real-process crash test passed. Final code-quality review reported no actionable findings. Reviews do not substitute for the execution logs above.

## Test-first evidence and limits

`evidence/tdd.jsonl` and `evidence/tdd/` retain real red/green slices and later regression runs. Subsequent cases that already passed were recorded as regression; no retroactive failing test was manufactured. Some initial logs use the earlier test-runner version; final clean results use Vitest 5.0.4. Distribution testing detects gross errors, not a mathematical fairness proof. Replay verifies internal consistency, not independently anchored historical authenticity.

Original implementation preservation: all 19 baseline files in original-sha256.json retain their hashes, as recorded in original-integrity.json. The sibling original implementation was not edited.
