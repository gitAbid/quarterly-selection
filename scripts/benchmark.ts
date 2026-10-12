import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  openSelectionService,
  replaySelection,
  verifyAuditBundle,
} from "../src/index";
if (process.argv[2] !== "--size") {
  const runs = [];
  for (const n of [20, 200_000]) {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", fileURLToPath(import.meta.url), "--size", String(n)],
      { encoding: "utf8" },
    );
    if (r.status !== 0) throw new Error("benchmark child failed");
    runs.push(JSON.parse(r.stdout) as unknown);
  }
  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        platform: process.platform,
        architecture: process.arch,
        runs,
      },
      null,
      2,
    ),
  );
} else {
  const n = Number(process.argv[3]);
  if (n !== 20 && n !== 200_000)
    throw new Error("benchmark sizes are 20 or 200000");
  const dir = mkdtempSync(join(tmpdir(), "fleetcheck-bench-")),
    path = join(dir, "draw.sqlite"),
    key = randomBytes(32);
  const input = {
    companyId: "benchmark",
    quarter: "2026-Q4",
    percentage: 25,
    vehicleIds: Array.from(
      { length: n },
      (_, i) => `vehicle-${String(i).padStart(6, "0")}`,
    ),
  };
  let service = openSelectionService({
    databasePath: path,
    encryptionKey: key,
  });
  const start = performance.now();
  try {
    const first = await service.createOrGet(input),
      afterCreate = performance.now();
    await service.close();
    service = openSelectionService({ databasePath: path, encryptionKey: key });
    const retry = await service.createOrGet(input),
      afterReopen = performance.now();
    const bundle = await service.exportAudit(input.companyId, input.quarter),
      afterExport = performance.now();
    const pure = replaySelection(input, bundle.revealedSeed),
      afterPure = performance.now(),
      report = verifyAuditBundle(bundle),
      afterVerify = performance.now();
    if (
      !report.ok ||
      !retry.reused ||
      pure.selectedCount !== n / 4 ||
      JSON.stringify(retry.record) !== JSON.stringify(first.record)
    )
      throw new Error("benchmark correctness failure");
    const memory = process.memoryUsage();
    console.log(
      JSON.stringify({
        runtime: process.version,
        vehicles: n,
        selected: first.record.selectedCount,
        milliseconds: {
          create: afterCreate - start,
          reopenAndRetry: afterReopen - afterCreate,
          export: afterExport - afterReopen,
          pureSelection: afterPure - afterExport,
          verify: afterVerify - afterPure,
          total: afterVerify - start,
        },
        memoryBytes: {
          maxRss: process.resourceUsage().maxRSS * 1024,
          rss: memory.rss,
          heapUsed: memory.heapUsed,
        },
        measurement:
          "one isolated child process per population; maxRss is whole-process peak, including SQLite, fixtures and retained records",
      }),
    );
  } finally {
    await service.close();
    key.fill(0);
    rmSync(dir, { recursive: true, force: true });
  }
}
