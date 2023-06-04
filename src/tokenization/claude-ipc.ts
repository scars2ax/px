import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { logger } from "../logger";
type Zmq = typeof import("zeromq");

const TOKENIZER_SOCKET = "tcp://localhost:5555";
const log = logger.child({ module: "claude-ipc" });
const pythonLog = logger.child({ module: "claude-python" });

let tokenizer: ChildProcess;
let socket: ReturnType<Zmq["socket"]>;
let isReady = false;

export async function init() {
  log.info("Initializing Claude tokenizer IPC");
  try {
    const zmq = await import("zeromq");
    tokenizer = await launchTokenizer();
    socket = zmq.socket("dealer");
    socket.connect(TOKENIZER_SOCKET);

    socket.send(["init"]);
    const response = await new Promise<string>((resolve) => {
      const timeout = setTimeout(() => resolve("timeout"), 1000);
      socket.once("message", (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      });
    });
    if (response === "timeout") {
      throw new Error("Timeout waiting for init response");
    }
    if (response.toString() !== "ok") {
      throw new Error("Unexpected init response");
    }

    socket.on("message", onMessage);
    socket.on("error", (err) => {
      log.error({ err }, "Claude tokenizer socket error");
    });

    // Test tokenizer
    const result = await requestTokenCount({
      requestId: "init-test",
      prompt: "test prompt",
    });
    if (result !== 2) {
      log.error({ result }, "Unexpected test token count");
      throw new Error("Unexpected test token count");
    }

    isReady = true;
  } catch (err) {
    log.error({ err: err.message }, "Failed to initialize Claude tokenizer");
    if (process.env.NODE_ENV !== "production") {
      console.error(
        `\nClaude tokenizer failed to initialize.\nIf you want to use the tokenizer, see the Optional Dependencies documentation.\n`
      );
    }
    return false;
  }
  log.info("Claude tokenizer IPC ready");
  return true;
}

const pendingRequests = new Map<
  string,
  { resolve: (tokens: number) => void }
>();

export async function requestTokenCount({
  requestId,
  prompt,
}: {
  requestId: string;
  prompt: string;
}) {
  if (!socket) {
    throw new Error("Claude tokenizer is not initialized");
  }

  log.debug({ requestId, chars: prompt.length }, "Requesting token count");
  socket.send(["tokenize", requestId, prompt]);

  log.debug({ requestId }, "Waiting for socket response");
  return new Promise<number>(async (resolve, reject) => {
    const resolveFn = (tokens: number) => {
      log.debug({ requestId, tokens }, "Received token count");
      pendingRequests.delete(requestId);
      resolve(tokens);
    };

    pendingRequests.set(requestId, { resolve: resolveFn });

    const timeout = isReady ? 500 : 10000;
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        const err = "Tokenizer deadline exceeded";
        log.warn({ requestId }, err);
        reject(new Error(err));
      }
    }, timeout);
  });
}

function onMessage(requestId: Buffer, tokens: Buffer) {
  const request = pendingRequests.get(requestId.toString());
  if (!request) {
    log.error({ requestId }, "No pending request found for incoming message");
    return;
  }
  request.resolve(Number(tokens.toString()));
}

async function launchTokenizer() {
  return new Promise<ChildProcess>((resolve, reject) => {
    let resolved = false;
    const python = process.platform === "win32" ? "python" : "python3";
    const proc = spawn(python, [
      "-u",
      join(__dirname, "tokenization", "claude-tokenizer.py"),
    ]);
    if (!proc) {
      reject(new Error("Failed to spawn Claude tokenizer"));
    }
    proc.stdout!.on("data", (data) => {
      pythonLog.info(data.toString());
    });
    proc.stderr!.on("data", (data) => {
      pythonLog.error(data.toString());
    });
    proc.on("error", (err) => {
      pythonLog.error({ err }, "Claude tokenizer error");
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    }); 
    proc.on("close", (code) => {
      pythonLog.info(`Claude tokenizer exited with code ${code}`);
      socket?.close();
      socket = undefined!;
      tokenizer = undefined!;
      if (code !== 0 && !resolved) {
        resolved = true;
        reject(new Error("Claude tokenizer exited immediately"));
      }
    });
    // Wait a moment to catch any immediate errors (missing imports, etc)
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(proc);
      }
    }, 100);
  });
}
