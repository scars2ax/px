import axios from "axios";
import { promises as fs } from "fs";
import path from "path";
import { v4 } from "uuid";
import { USER_ASSETS_DIR } from "../../config";
import { logger } from "../../logger";

const log = logger.child({ module: "file-storage" });

export type OpenAIImageGenerationResult = {
  created: number;
  data: {
    revised_prompt?: string;
    url: string;
    b64_json: string;
  }[];
};

async function downloadImage(url: string) {
  const { data } = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(data, "binary");
  const newFilename = `${v4()}.png`;

  const filepath = path.join(USER_ASSETS_DIR, newFilename);
  await fs.writeFile(filepath, buffer);
  return filepath;
}

/**
 * Downloads generated images and mirrors them to the user_content directory.
 * Mutates the result object.
 * @param host The hostname of the proxy server
 * @param result The OpenAI image generation result
 */
export async function mirrorGeneratedImage(
  host: string,
  result: OpenAIImageGenerationResult
): Promise<OpenAIImageGenerationResult> {
  for (const item of result.data) {
    const original = item.url;
    const mirror = await downloadImage(original);
    item.url = `${host}/user_content/${path.basename(mirror)}`;
  }
  return result;
}
