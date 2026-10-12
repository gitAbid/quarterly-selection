import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import type { RunOutcome } from "../src/index";
import { key } from "./helpers";

/** Messages the worker fixture sends back over IPC, by kind. */
interface WorkerMessages {
  ready: { kind: "ready" };
  starting: { kind: "starting" };
  result: { kind: "result"; result: RunOutcome };
  error: { kind: "error"; message: string };
}

const children: ChildProcess[] = [];

/** IPC data is untyped; the worker fixture is trusted to send the shapes above. */
function isMessage<K extends keyof WorkerMessages>(
  value: unknown,
  kind: K,
): value is WorkerMessages[K] {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === kind;
}

export function message<K extends keyof WorkerMessages>(
  child: ChildProcess,
  kind: K,
): Promise<WorkerMessages[K]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`worker ${kind} timeout`));
    }, 15000);
    const onMessage = (value: unknown) => {
      if (isMessage(value, kind)) {
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
