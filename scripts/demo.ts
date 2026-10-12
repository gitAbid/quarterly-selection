import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSelectionService, verifyAuditBundle } from "../src/index";
import input from "../examples/draw-input.json";
const dir = mkdtempSync(join(tmpdir(), "fleetcheck-demo-")),
  databasePath = join(dir, "draw.sqlite"),
  key = randomBytes(32);
let service = openSelectionService({ databasePath, encryptionKey: key });
try {
  const first = await service.createOrGet(input);
  await service.close();
  service = openSelectionService({ databasePath, encryptionKey: key });
  const second = await service.createOrGet(input),
    bundle = await service.exportAudit(input.companyId, input.quarter),
    report = verifyAuditBundle(bundle);
  console.log(
    JSON.stringify(
      {
        firstSelected: first.record.selected.map((s) => s.vehicleId),
        secondSelected: second.record.selected.map((s) => s.vehicleId),
        reusedAfterReopen: second.reused,
        verification: report,
      },
      null,
      2,
    ),
  );
  if (
    !second.reused ||
    !report.ok ||
    JSON.stringify(first.record) !== JSON.stringify(second.record)
  )
    process.exitCode = 1;
} finally {
  await service.close();
  key.fill(0);
  rmSync(dir, { recursive: true, force: true });
}
