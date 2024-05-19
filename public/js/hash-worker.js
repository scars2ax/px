importScripts(
  "https://cdn.jsdelivr.net/npm/hash-wasm@4.11.0/dist/argon2.umd.min.js"
);

let active = false;
let nonce = 0;
let signature = "";
let lastNotify = 0;
let params = {
  salt: null,
  hashLength: 0,
  iterations: 0,
  memorySize: 0,
  parallelism: 0,
  targetValue: BigInt(0),
};

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

      const salt = new Uint8Array(c.s.length / 2);
      for (let i = 0; i < c.s.length; i += 2) {
        salt[i / 2] = parseInt(c.s.slice(i, i + 2), 16);
      }

      params = {
        salt: salt,
        hashLength: c.hl,
        iterations: c.t,
        memorySize: c.m,
        parallelism: c.p,
        targetValue: BigInt(c.d.slice(0, -1)),
      };

      console.log("Started", params);
      self.postMessage({ type: "started" });
      setTimeout(solve, 0);
      break;
  }
};

const doHash = async (password) => {
  const { salt, hashLength, iterations, memorySize, parallelism } = params;
  return await self.hashwasm.argon2id({
    password,
    salt,
    hashLength,
    iterations,
    memorySize,
    parallelism,
  });
};

const checkHash = (hash) => {
  const { targetValue } = params;
  const hashValue = BigInt(`0x${hash}`);
  return hashValue <= targetValue;
};

const solve = async () => {
  if (!active) {
    console.log("Stopped", nonce);
    return;
  }

  const batchSize = 5;
  const batch = [];
  for (let i = 0; i < batchSize; i++) {
    batch.push(nonce++);
  }

  try {
    const results = await Promise.all(
      batch.map(async (nonce) => {
        const hash = await doHash(String(nonce));
        return { hash, nonce };
      })
    );

    const solution = results.find(({ hash }) => checkHash(hash));
    if (solution) {
      console.log("Solution found", solution, params.salt);
      self.postMessage({ type: "solved", nonce: solution.nonce });
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
