import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import { key } from "./helpers";
const children: ChildProcess[] = [];
export function message(child: ChildProcess, kind: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`worker ${kind} timeout`));
    }, 15000);
    const onMessage = (value: any) => {
      if (value?.kind === kind) {
        cleanup();
        resolve(value);
      }
    };
    const onExit = () => {
      cleanup();
      reject(new Error(`worker exited before ${kind}`));
    };
    function cleanup() {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
    }
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}
export async function start(mode: string, path: string, duration = 0) {
  const child = fork(
    fileURLToPath(new URL("./fixtures/worker.ts", import.meta.url)),
    [mode, path, String(duration)],
    {
      execPath: process.execPath,
      execArgv: ["--import", "tsx"],
      env: { ...process.env, FLEETCHECK_SEED_KEY: key.toString("base64") },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  children.push(child);
  let stderr = "";
  child.stderr?.on("data", (b) => {
    stderr += String(b);
  });
  try {
    await message(child, "ready");
  } catch (e) {
    throw new Error(`${String(e)} ${stderr}`);
  }
  return child;
}
export async function stop(
  child: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill(signal);
  });
}
afterEach(async () => {
  for (const child of children.splice(0)) await stop(child);
});
