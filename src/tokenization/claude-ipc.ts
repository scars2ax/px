import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { logger } from "../logger";

const TOKENIZER_SOCKET = "tcp://localhost:5555";
const log = logger.child({ module: "claude-ipc" });
const pythonLog = logger.child({ module: "claude-python" });

let tokenizer: ChildProcess;
let initialized = false;
let socket: any; // zeromq.Dealer, not sure how to import it safely as it is optional

export async function init() {
  log.info("Initializing Claude tokenizer IPC");
  try {
    tokenizer = await launchTokenizer();
    const zmq = await import("zeromq");
    socket = new zmq.Dealer({ sendTimeout: 500 });
    socket.connect(TOKENIZER_SOCKET);

    await socket.send(["init"]);
    const response = await socket.receive();
    if (response.toString() !== "ok") {
      throw new Error("Unexpected init response");
    }

    // Start message pump
    processMessages();

    // Test tokenizer
    const result = await requestTokenCount({
      requestId: "init-test",
      prompt: "test prompt",
    });
    if (result !== 2) {
      log.error({ result }, "Unexpected test token count");
      throw new Error("Unexpected test token count");
    }

    initialized = true;
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
  await socket.send(["tokenize", requestId, prompt]);

  log.debug({ requestId }, "Waiting for socket response");
  return new Promise<number>(async (resolve, reject) => {
    const resolveFn = (tokens: number) => {
      log.debug({ requestId, tokens }, "Received token count");
      pendingRequests.delete(requestId);
      resolve(tokens);
    };

    pendingRequests.set(requestId, { resolve: resolveFn });

    const timeout = initialized ? 500 : 10000;
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

async function processMessages() {
  if (!socket) {
    throw new Error("Claude tokenizer is not initialized");
  }
  log.debug("Starting message loop");
  for await (const [requestId, tokens] of socket) {
    const request = pendingRequests.get(requestId.toString());
    if (!request) {
      log.error({ requestId }, "No pending request found for incoming message");
      continue;
    }
    request.resolve(Number(tokens.toString()));
  }
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

    function cleanup() {
      socket?.close();
      socket = undefined!;
      tokenizer = undefined!;
    }

    proc.stdout!.on("data", (data) => {
      pythonLog.info(data.toString().trim());
    });
    proc.stderr!.on("data", (data) => {
      pythonLog.error(data.toString().trim());
    });
    proc.on("error", (err) => {
      pythonLog.error({ err }, "Claude tokenizer error");
      cleanup();
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
    proc.on("close", (code) => {
      pythonLog.info(`Claude tokenizer exited with code ${code}`);
      cleanup();
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
    }, 200);
  });
}
