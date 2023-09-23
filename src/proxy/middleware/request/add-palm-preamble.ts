import { PalmKey, Key } from "../../../key-management";
import { isCompletionRequest } from "../common";
import { ProxyRequestMiddleware } from ".";

/**
 * Some keys require the prompt to start with `\n\nHuman:`. There is no way to
 * know this without trying to send the request and seeing if it fails. If a
 * key is marked as requiring a preamble, it will be added here.
 */
//export const addPalmPreamble: ProxyRequestMiddleware = (
//  _proxyReq,
//  req
//) => {
//  if (!isCompletionRequest(req) || req.key?.service !== "palm") {
//    return;
//  }
//
//  let preamble = "";
//  let prompt = req.body.prompt;
//  assertPalmKey(req.key);
//  if (req.key.requiresPreamble) {
//    preamble = prompt.startsWith("\n\nHuman:") ? "" : "\n\nHuman:";
//    req.log.debug({ key: req.key.hash, preamble }, "Adding preamble to prompt");
//  }
//  req.body.prompt = preamble + prompt;
//};

function assertPalmKey(key: Key): asserts key is PalmKey {
  if (key.service !== "palm") {
    throw new Error(`Expected an Palm key, got '${key.service}'`);
  }
}
