import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { Dealer } from "zeromq";
import { logger } from "../logger";

const TOKENIZER_SOCKET = "tcp://localhost:5555";
const log = logger.child({ module: "claude-ipc" });
const pythonLog = logger.child({ module: "claude-python" });

let tokenizer: ChildProcess;
let socket: Dealer;

export async function init() {
  log.info("Initializing Claude tokenizer IPC");
  try {
    tokenizer = launchTokenizer();
    socket = new Dealer({ sendTimeout: 500 });
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
  } catch (e) {
    log.error({ e }, "Failed to initialize Claude tokenizer");
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

  log.debug({ requestId, prompt: prompt.length }, "Requesting token count");
  await socket.send(["tokenize", requestId, prompt]);

  log.debug({ requestId }, "Waiting for socket response");
  return new Promise<number>(async (resolve, reject) => {
    const resolveFn = (tokens: number) => {
      log.debug({ requestId, tokens }, "Received token count");
      pendingRequests.delete(requestId);
      resolve(tokens);
    };

    pendingRequests.set(requestId, { resolve: resolveFn });

    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        const err = "Tokenizer took too long to respond";
        log.warn({ requestId }, err);
        reject(new Error(err));
      }
    }, 500);
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

function launchTokenizer() {
  const proc = spawn("python", [
    "-u",
    join(__dirname, "tokenization", "claude-tokenizer.py"),
  ]);
  if (!proc) {
    throw new Error("Failed to start Claude tokenizer. Is python installed?");
  }
  proc.stdout!.on("data", (data) => {
    pythonLog.info(data.toString());
  });
  proc.stderr!.on("data", (data) => {
    pythonLog.error(data.toString());
  });
  proc.on("close", (code) => {
    pythonLog.info(`Claude tokenizer exited with code ${code}`);
    socket.close();
    socket = undefined!;
    tokenizer = undefined!;
  });
  return proc;
}
