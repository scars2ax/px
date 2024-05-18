importScripts(
  "https://cdn.jsdelivr.net/npm/argon2-browser@1.18.0/dist/argon2-bundled.min.js"
);

const argon2 = self.argon2;

let active = false;
let nonce = 0;
let signature = "";
let params = {
  salt: "",
  length: 0,
  time: 0,
  mem: 0,
  parallelism: 0,
  type: 0,
  difficulty: 0,
  expiry: 0,
  ip: "",
};

self.onmessage = async (event) => {
  const { data } = event;
  switch (data.type) {
    case "start":
      if (active) {
        return;
      }
      active = true;

      signature = data.signature;
      nonce = data.nonce || 0; // for resuming
      const parsed = JSON.parse(data.challenge);
      params = {
        salt: parsed.s,
        length: parsed.hl,
        time: parsed.t,
        mem: parsed.m,
        parallelism: parsed.p,
        type: parsed.at,
        difficulty: parsed.d,
        expiry: parsed.e,
        ip: parsed.ip,
      };

      console.log("Started", params);
      self.postMessage({ type: "start" });
      setTimeout(solve, 0);
      break;
    case "stop":
      active = false;
      console.log("Paused", nonce);
      self.postMessage({ type: "stop", nonce });
      break;
  }
};

const doHash = async (password) => {
  const { salt, length, time, mem, parallelism, type } = params;
  const hash = await argon2.hash(password, {
    salt: new TextEncoder().encode(salt),
    hashLength: length,
    timeCost: time,
    memoryCost: mem,
    parallelism,
    type,
  });
  return hash.hash;
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

  const password = signature + ":" + nonce;
  const hash = await doHash(password);
  if (checkHash(hash)) {
    self.postMessage({ type: "solved", password });
    active = false;
  } else {
    nonce++;
    setTimeout(solve, 0);
  }
};
