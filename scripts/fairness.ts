import { randomBytes } from "node:crypto";
import { replaySelection } from "../src/index";

// Runs many independent draws of 8 vehicles at 25% (2 picked per draw)
// and counts how often each vehicle was picked. Each should land near runs × 2/8.
const runs = Number(process.argv[2] ?? 100_000);
const input = {
  companyId: "co-1",
  quarter: "2026-Q4",
  percentage: 25,
  vehicleIds: ["VAN-1", "VAN-2", "VAN-3", "VAN-4", "VAN-5", "VAN-6", "VAN-7", "VAN-8"],
};
const counts = new Map(input.vehicleIds.map((id) => [id, 0]));
for (let i = 0; i < runs; i++)
  for (const s of replaySelection(input, randomBytes(32).toString("hex")).selected)
    counts.set(s.vehicleId, counts.get(s.vehicleId)! + 1);

const expected = (runs * 2) / 8;
console.log(`${runs} draws, expected ${expected} picks per vehicle\n`);
for (const [id, n] of counts)
  console.log(`${id}  ${String(n).padStart(7)}  ${(((n - expected) / expected) * 100).toFixed(2).padStart(6)}%`);
