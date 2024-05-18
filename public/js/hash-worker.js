importScripts(
  "https://cdn.jsdelivr.net/npm/hash-wasm@4.11.0/dist/argon2.umd.min.js"
);

let active = false;
let nonce = 0;
let signature = "";
let lastNotify = 0;
let params = {
  salt: null,
  workers: 0,
  length: 0,
  time: 0,
  mem: 0,
  parallelism: 0,
  type: 0,
  difficulty: 0,
  expiry: 0,
  ip: "",
};
let argon2Hash = null;

self.onmessage = async (event) => {
  const { data } = event;
  console.log("Hash worker msg", data);
  switch (data.type) {
    case "toggle":
      if (active) {
        active = false;
        self.postMessage({ type: "paused", nonce });
        return;
      }

      active = true;
      signature = data.signature;
      nonce = data.nonce;

      const c = data.challenge;
      params = {
        salt: new TextEncoder().encode(c.s),
        workers: c.w,
        length: c.hl,
        time: c.t,
        mem: c.m,
        parallelism: c.p,
        type: c.at,
        difficulty: c.d,
        expiry: c.e,
        ip: c.ip,
      };

      switch (params.type) {
        case 0:
          argon2Hash = self.hashwasm.argon2i;
          break;
        case 1:
          argon2Hash = self.hashwasm.argon2d;
          break;
        case 2:
          argon2Hash = self.hashwasm.argon2id;
          break;
      }

      console.log("Started", params);
      self.postMessage({ type: "started" });
      setTimeout(solve, 0);
      break;
  }
};

const doHash = async (password) => {
  const { salt, length, time, mem, parallelism } = params;
  return await argon2Hash({
    password,
    salt,
    hashLength: length,
    iterations: time,
    memorySize: mem,
    parallelism,
  });
};

const checkHash = (hash) => {
  const { difficulty } = params;
  return hash.startsWith("0".repeat(difficulty));
};

const solve = async () => {
  if (!active) {
    console.log("Stopped", nonce);
    return;
  }

  const batchSize = 10;
  const batch = [];
  for (let i = 0; i < batchSize; i++) {
    batch.push(nonce++);
  }

  try {
    const results = await Promise.all(
      batch.map(async (nonce) => {
        const password = signature + ":" + nonce;
        const hash = await doHash(password);
        return { nonce, hash };
      })
    );

    const solution = results.find(({ hash }) => checkHash(hash));
    if (solution) {
      console.log("Solution found", solution);
      self.postMessage({ type: "solved", password: signature + ":" + solution.nonce, nonce: solution.nonce });
      active = false;
    } else {
      if (nonce % batchSize === 0 && Date.now() - lastNotify > 1000) {
        lastNotify = Date.now();
        console.log("Notify progress", nonce);
        self.postMessage({ type: "progress", nonce });
      }
      setTimeout(solve, 0);
    }
  } catch (error) {
    console.error("Error", error);
    self.postMessage({ type: "error", error: error.message });
    active = false;
  }
};
