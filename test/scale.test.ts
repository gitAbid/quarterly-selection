import { expect, it } from "vitest";
import { replaySelection, verifyAuditBundle } from "../src/index";
import { input, open, setup } from "./helpers";
it.each([20, 200_000])(
  "persists, reopens, exports and verifies %i vehicles with safe retries and tamper rejection",
  async (n) => {
    const { path } = setup(),
      request = {
        ...input,
        vehicleIds: Array.from(
          { length: n },
          (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        ),
      };
    const service = open(path),
      first = await service.createOrGet(request);
    await service.close();
    const reopened = open(path),
      again = await reopened.createOrGet({
        ...request,
        vehicleIds: [...request.vehicleIds].reverse(),
      });
    expect(again.record).toEqual(first.record);
    expect(again.inputsMatch).toBe(true);
    expect(again.reused).toBe(true);
    expect(first.record.selectedCount).toBe(n / 4);
    expect(new Set(first.record.selected.map((s) => s.vehicleId)).size).toBe(n / 4);
    const bundle = await reopened.exportAudit(request.companyId, request.quarter);
    expect(verifyAuditBundle(bundle).ok).toBe(true);
    const before = performance.now(),
      pure = replaySelection(request, bundle.revealedSeed),
      ms = performance.now() - before;
    expect(ms).toBeLessThan(10_000);
    expect(pure.selected).toEqual(first.record.selected);
    const changed = await reopened.createOrGet({
      ...request,
      percentage: 50,
      vehicleIds: [...request.vehicleIds, "new-vehicle"],
    });
    expect(changed.inputsMatch).toBe(false);
    expect(changed.record).toEqual(first.record);
    bundle.record.selected[0]!.vehicleId = "not-eligible";
    expect(verifyAuditBundle(bundle).ok).toBe(false);
    expect((await reopened.get(request.companyId, request.quarter))?.selectedCount).toBe(n / 4);
    console.log(
      JSON.stringify({
        vehicles: n,
        pureSelectionMs: Math.round(ms),
        runtime: process.version,
      }),
    );
  },
);
