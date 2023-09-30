import express from "express";
import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { keyPool } from "../../../shared/key-management";
import { RequestPreprocessor } from ".";
import { AnthropicV1CompleteSchema } from "./transform-outbound-payload";

const AMZ_HOST =
  process.env.AMZ_HOST || "invoke-bedrock.%REGION%.amazonaws.com";

/**
 * Signs an outgoing AWS request with the appropriate headers modifies the
 * request object in place to fix the path.
 */
export const signAwsRequest: RequestPreprocessor = async (req) => {
  req.key = keyPool.get("anthropic.claude-v2");

  const { model, stream } = req.body;
  req.isStreaming = stream === true || stream === "true";

  // AWS supports only a subset of Anthropic's parameters and is more strict
  // about unknown parameters.
  // TODO: This should happen in transform-outbound-payload.ts
  const strippedParams = AnthropicV1CompleteSchema.pick({
    prompt: true,
    max_tokens_to_sample: true,
    stop_sequences: true,
    temperature: true,
    top_k: true,
    top_p: true,
  }).parse(req.body);

  const credential = getCredentialParts(req);
  const host = AMZ_HOST.replace("%REGION%", credential.region);

  // Uses the AWS SDK to sign a request, then modifies our HPM proxy request
  // with the headers generated by the SDK.
  const newRequest = new HttpRequest({
    method: "POST",
    protocol: "https:",
    hostname: host,
    path: `/model/${model}/invoke${stream ? "-with-response-stream" : ""}`,
    headers: {
      ["Host"]: host,
      ["content-type"]: "application/json",
    },
    body: JSON.stringify(strippedParams),
  });

  if (stream) {
    newRequest.headers["x-amzn-bedrock-accept"] = "application/json";
  } else {
    newRequest.headers["accept"] = "*/*";
  }

  req.signedRequest = await sign(newRequest, getCredentialParts(req));
};

type Credential = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};
function getCredentialParts(req: express.Request): Credential {
  const [accessKeyId, secretAccessKey, region] = req.key!.key.split(":");

  if (!accessKeyId || !secretAccessKey || !region) {
    req.log.error(
      { key: req.key!.hash },
      "AWS_CREDENTIALS isn't correctly formatted; refer to the docs"
    );
    throw new Error("The key assigned to this request is invalid.");
  }

  return { accessKeyId, secretAccessKey, region };
}

async function sign(request: HttpRequest, credential: Credential) {
  const { accessKeyId, secretAccessKey, region } = credential;

  const signer = new SignatureV4({
    sha256: Sha256,
    credentials: { accessKeyId, secretAccessKey },
    region,
    service: "bedrock",
  });

  return signer.sign(request);
}