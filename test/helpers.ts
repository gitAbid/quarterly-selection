import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import {
  openSelectionService,
  type DrawInput,
  type SelectionService,
} from "../src/index";
export const input: DrawInput = {
  companyId: "co-1",
  quarter: "2026-Q4",
  percentage: 25,
  vehicleIds: Array.from({ length: 20 }, (_, i) => `v${i}`),
};
export const key = Buffer.alloc(32, 7);
const dirs: string[] = [],
  services: SelectionService[] = [];
export function setup() {
  const dir = mkdtempSync(join(tmpdir(), "fleetcheck-"));
  dirs.push(dir);
  return { dir, path: join(dir, "draws.sqlite") };
}
export function open(
  path: string,
  encryptionKey: Uint8Array = key,
  now?: () => Date,
) {
  const service = openSelectionService({
    databasePath: path,
    encryptionKey,
    ...(now ? { now } : {}),
  });
  services.push(service);
  return service;
}
afterEach(async () => {
  for (const s of services.splice(0)) await s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
