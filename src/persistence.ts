/**
 * Very scuffed persistence system using a Huggingface's Datasets git repo as a
 * file system. We use this because it's free and everyone is already deploying
 * to Huggingface's Spaces feature anyway, so they can easily create a Dataset
 * repository too rather than having to find some other place to host files.
 *
 * We periodically commit to the repo, and then pull from it when we need to
 * read data. This is a bit slow, but it's fine for our purposes.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { config, Config } from "./config";
import { logger } from "./logger";

const log = logger.child({ module: "dataset-persistence" });

let singleton: DatasetPersistence | null = null;

class DatasetPersistence {
  private initialized: boolean = false;
  private keyPath = `${os.tmpdir()}/id_rsa`;
  private repoPath = `${os.tmpdir()}/oai-proxy-dataset`;

  private repoUrl!: string;
  private sshKey!: string;

  constructor() {
    if (singleton) return singleton;
    if (config.gatekeeperStore !== "huggingface_datasets") return;
    DatasetPersistence.assertConfigured(config);
    this.repoUrl = config.hfDatasetRepoUrl;
    this.sshKey = config.hfPrivateSshKey.trim();
    singleton = this;
  }

  async init() {
    if (this.initialized) return;

    log.info(
      { repoUrl: this.repoUrl, keyPath: this.keyPath, repoPath: this.repoPath },
      "Initializing Huggingface Datasets persistence."
    );

    try {
      this.setupSshKey();

      await this.runGit(
        "config user.email 'oai-proxy-persistence@example.com'"
      );
      await this.runGit("config user.name 'Proxy Persistence'");
      log.info("Cloning repo...");
      const cloneOutput = await this.runGit(
        `clone --depth 1 ${this.repoUrl} ${this.repoPath}`
      );
      log.info({ output: cloneOutput.toString() }, "Cloned repo.");

      // Test write access
      const pushOutput = this.runGit("push").toString();
      if (pushOutput !== "Everything up-to-date") {
        log.error({ output: pushOutput }, "Unexpected output from git push.");
        throw new Error("Unable to push to repo.");
      }
      log.info("Datasets configuration looks good.");
    } catch (e) {
      log.error(
        { error: e },
        "Failed to initialize Huggingface Datasets persistence."
      );
      throw e;
    }

    this.initialized = true;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      await this.init();
      this.runGit(`checkout HEAD -- ${key}`);
      const filePath = path.join(this.repoPath, key);
      return fs.promises.readFile(filePath);
    } catch (e) {
      log.error({ error: e }, "Failed to get key from Dataset repo.");
      return null;
    }
  }

  async set(key: string, value: Buffer) {
    try {
      await this.init();

      await fs.promises.writeFile(`${this.repoPath}/${key}`, value);

      // TODO: Need to set up LFS for >10MB files
      if (fs.statSync(`${this.repoPath}/${key}`).size > 10 * 1024 * 1024) {
        throw new Error("File too large for non-LFS storage.");
      }

      await this.runGit(`add ${key}`);
      await this.runGit(`commit -m "Update ${key}"`);
      await this.runGit("push");
    } catch (e) {
      log.error({ error: e }, "Failed to set key in Dataset repo.");
    }
  }

  protected async cleanup() {
    try {
      await this.init();
      await this.runGit("fetch --depth 1");
      await this.runGit("reset --hard FETCH_HEAD");
    } catch (e) {
      log.error({ error: e }, "Failed to cleanup Dataset repo.");
    }
  }

  protected async setupSshKey() {
    fs.writeFileSync(this.keyPath, this.sshKey);
    fs.chmodSync(this.keyPath, 0o600);
    await this.runGit(`config core.sshCommand 'ssh -i ${this.keyPath}'`);
  }

  protected async runGit(command: string) {
    const cmd = `git -C ${this.repoPath} ${command}`;
    log.debug({ command: cmd }, "Running git command.");
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(cmd, { shell: true });
      const stdout: string[] = [];
      const stderr: string[] = [];

      proc.stdout.on("data", (data) => stdout.push(data.toString()));
      proc.stderr.on("data", (data) => stderr.push(data.toString()));

      proc.on("close", (code) => {
        if (code !== 0) {
          const errorOutput = stderr.join("");
          log.error({ code, errorOutput }, "Git command failed.");
          reject(
            new Error(
              `Git command failed with exit code ${code}: ${errorOutput}`
            )
          );
        } else {
          resolve(stdout.join(""));
        }
      });
    });
  }

  static assertConfigured(input: Config): asserts input is ConfigWithDatasets {
    if (!input.hfDatasetRepoUrl) {
      throw new Error("HF_DATASET_REPO_URL is required when using Datasets.");
    }

    if (!input.hfPrivateSshKey) {
      throw new Error("HF_PRIVATE_SSH_KEY is required when using Datasets.");
    }
  }
}

type ConfigWithDatasets = Config & {
  hfDatasetRepoUrl: string;
  hfPrivateSshKey: string;
};

export { DatasetPersistence };
