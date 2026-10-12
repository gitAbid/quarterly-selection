import Database from "better-sqlite3";
import { openSelectionService } from "../../src/index";
const [mode, path, duration] = process.argv.slice(2);
if (!path) throw new Error("missing worker path");
if (mode === "uncommitted") {
  // External crash injection: change an existing row and insert another row
  // while holding an actual SQLite write transaction. Neither may survive.
  const db = new Database(path, { timeout: 5000 });
  db.exec("BEGIN IMMEDIATE");
  db.exec(`INSERT INTO selection_runs SELECT company_id,'2027-Q1',public_record,
    seed_ciphertext,seed_nonce,seed_tag,schema_version FROM selection_runs;
    UPDATE selection_runs SET public_record='{}' WHERE quarter!='2027-Q1'`);
  process.send?.({ kind: "ready" });
  process.on("message", () => {}); // Keep the transaction open until SIGKILL.
} else if (mode === "lock") {
  const db = new Database(path, { timeout: 5000 });
  db.pragma("journal_mode = WAL");
  db.exec("BEGIN IMMEDIATE");
  const release = () => {
    if (db.open) {
      db.exec("ROLLBACK");
      db.close();
    }
    process.exit(0);
  };
  process.on("message", release);
  process.send?.({ kind: "ready" });
  if (Number(duration) > 0) setTimeout(release, Number(duration));
} else {
  const service = openSelectionService({
    databasePath: path,
    encryptionKey: Buffer.from(process.env.FLEETCHECK_SEED_KEY ?? "", "base64"),
  });
  process.on("message", async (input) => {
    process.send?.({ kind: "starting" });
    try {
      const result = await service.createOrGet(
        input as Parameters<typeof service.createOrGet>[0],
      );
      process.send?.({ kind: "result", result });
    } catch (e) {
      process.send?.({
        kind: "error",
        message: e instanceof Error ? e.message : "worker operation failed",
      });
    }
  });
  process.send?.({ kind: "ready" });
}
