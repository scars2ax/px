import axios from "axios";
import { promises as fs } from "fs";
import path from "path";
import { v4 } from "uuid";
import { logger } from "../../logger";
import { ASSETS_DIR } from "../../config";

const USER_ASSETS_DIR = path.join(ASSETS_DIR, "ugc");

const log = logger.child({ module: "image-mirror" });

export type OpenAIImageGenerationResult = {
  created: number;
  data: {
    revised_prompt?: string;
    url: string;
  }[];
};

async function downloadImage(url: string, created: number) {
  const { data } = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(data, "binary");
  const newFilename = `${v4()}.png`;

  await fs.mkdir(USER_ASSETS_DIR, { recursive: true });

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
    const mirror = await downloadImage(original, result.created);
    item.url = `${host}/user_content/${path.basename(mirror)}`;
  }
  return result;
}
