import crypto from "crypto";
import { Key, KeyProvider } from "..";
import { config } from "../../config";
import { logger } from "../../logger";

export interface ScaleDeployment extends Key {
  readonly service: "scale";
  deploymentUrl: string;
  createdAt: number;
}

/*
Scale is a bit different from the other providers. It doesn't have set API keys;
instead there are "deployments", which are created in the Scale dashboard and
are accessible via a URL and API key together.

The operator can provide these accounts via the SCALE_KEY environment variable,
but more likely they will want the proxy to just automatically create new
accounts and deployments as older ones reach their usage limits.
*/

export class ScaleKeyProvider implements KeyProvider<ScaleDeployment> {
  readonly service = "scale";

  private deployments: ScaleDeployment[] = [];
  private log = logger.child({ module: "key-provider", service: this.service });
  private churnerEnabled = false;

  constructor() {
    const keyConfig = config.scaleKey?.trim();
    if (!keyConfig) return;
    let initialKeys: string[];
    initialKeys = [...new Set(keyConfig.split(",").map((k) => k.trim()))];
    for (const keyStr of initialKeys) {
      const [key, deploymentUrl] = keyStr.split("$");
      const newDeployment: ScaleDeployment = {
        key,
        deploymentUrl,
        service: this.service,
        isGpt4: false,
        isTrial: false,
        isDisabled: false,
        promptCount: 0,
        lastUsed: 0,
        createdAt: Date.now(),
        hash: `sca-${crypto
          .createHash("sha256")
          .update(keyStr)
          .digest("hex")
          .slice(0, 8)}`,
        lastChecked: 0,
      };
      this.deployments.push(newDeployment);
    }
    this.log.info(
      { keyCount: this.deployments.length },
      "Loaded initial Scale deployments"
    );
  }

  public init() {
    // TODO: Start account churner
    this.churnerEnabled = true;
  }

  public list() {
    return this.deployments.map((k) => Object.freeze({ ...k, key: undefined }));
  }

  public get(_model: unknown) {
    // Scale doesn't support changing models on the fly
    const availableDeployments = this.deployments.filter((a) => !a.isDisabled);
    const canCreateNewAccounts = config.scaleMinDeployments > 0;
    if (availableDeployments.length === 0) {
      if (canCreateNewAccounts) {
        this.log.warn(
          "Ran out of Scale deployments and the churner is not creating new ones fast enough."
        );
        throw new Error(
          "No Scale deployments available. Try again in a few minutes when the churner has created new deployments."
        );
      } else {
        throw new Error(
          "No Scale deployments available and account churner is disabled (possible IP ban or signup rate limit)."
        );
      }
    }

    // Unlike other providers, Scale doesn't want to rotate keys. Instead, we
    // want to use the same key for as long as possible while building up a
    // reserve of new accounts. Once an account dies there should be a fresh
    // one ready to go.

    const now = Date.now();

    const deploymentsByPriority = availableDeployments.sort((a, b) => {
      return a.createdAt - b.createdAt;
    });

    const selectedKey = deploymentsByPriority[0];
    selectedKey.lastUsed = now;
    return { ...selectedKey };
  }

  public disable(deployment: ScaleDeployment) {
    const deploymentFromPool = this.deployments.find(
      (d) => d.hash === deployment.hash
    );
    if (!deploymentFromPool || deploymentFromPool.isDisabled) return;
    deploymentFromPool.isDisabled = true;
    this.log.warn({ key: deployment.hash }, "Scale deployment disabled");
  }

  public update(hash: string, update: Partial<ScaleDeployment>) {
    const deploymentFromPool = this.deployments.find((d) => d.hash === hash)!;
    Object.assign(deploymentFromPool, update);
  }

  public available() {
    return this.deployments.filter((k) => !k.isDisabled).length;
  }

  // Normally this would return the number of unchecked keys but we will
  // repurpose it to return the number of pending accounts the churner is
  // creating.
  public anyUnchecked() {
    return config.scaleMinDeployments - this.available() > 0;
  }

  public incrementPrompt(hash?: string) {
    const deployment = this.deployments.find((d) => d.hash === hash);
    if (!deployment) return;
    deployment.promptCount++;
  }

  public getLockoutPeriod(_model: unknown) {
    // TODO: Scale doesn't have rate limits but this may need to be repurposed
    // to lock out the request queue if the account churner enabled but falling
    // behind.
    return 0;
  }

  public markRateLimited(keyHash: string) {
    // Do nothing
  }

  /** Doesn't really mean anything for Scale */
  public remainingQuota() {
    return 1;
  }

  public usageInUsd() {
    return "$0.00 / ∞";
  }
}
