import fs from "fs";
import { Request, Response } from "express";
import showdown from "showdown";
import { config, listConfig } from "./config";
import { OpenAIKey, keyPool } from "./key-management";
import { getUniqueIps } from "./proxy/rate-limit";
import { getPublicUsers } from "./proxy/auth/user-store"; 
import {
  QueuePartition,
  getEstimatedWaitTime,
  getQueueLength,
} from "./proxy/queue";

const INFO_PAGE_TTL = 5000;
let infoPageHtml: string | undefined;
let infoPageLastUpdated = 0;


export function handleStatusPage(_req: Request) {
  return getStatusJson(_req);
};

export const handleInfoPage = (req: Request, res: Response) => {
  if (infoPageLastUpdated + INFO_PAGE_TTL > Date.now()) {
    res.send(infoPageHtml);
    return;
  }

  // Sometimes huggingface doesn't send the host header and makes us guess.
  const baseUrl =
    process.env.SPACE_ID && !req.get("host")?.includes("hf.space")
      ? getExternalUrlForHuggingfaceSpaceId(process.env.SPACE_ID)
      : req.protocol + "://" + req.get("host");

  res.send(cacheInfoPageHtml(baseUrl));
};

function cacheInfoPageHtml(baseUrl: string) {
  const keys = keyPool.list();

  const openaiKeys = keys.filter((k) => k.service === "openai").length;
  const anthropicKeys = keys.filter((k) => k.service === "anthropic").length;

  const info = {
    uptime: process.uptime(),
    endpoints: {
      ...(openaiKeys ? { openai: baseUrl + "/proxy/openai" } : {}),
      ...(anthropicKeys ? { anthropic: baseUrl + "/proxy/anthropic" } : {}),
    },
    proompts: keys.reduce((acc, k) => acc + k.promptCount, 0),
    ...(config.modelRateLimit ? { proomptersNow: getUniqueIps() } : {}),
    openaiKeys,
    anthropicKeys,
    ...(openaiKeys ? getOpenAIInfo() : {}),
    ...(anthropicKeys ? getAnthropicInfo() : {}),
    config: listConfig(),
    build: process.env.BUILD_INFO || "dev",
  };



  const title = getServerTitle();
  const headerHtml = buildInfoPageHeader(new showdown.Converter(), title);

  const temp_info = structuredClone(info)
  // For Json info 
  delete temp_info.config.page_body
  delete temp_info.config.responseOnUnauthorized
  delete temp_info.config.aliases
  delete temp_info.config.promptInjections
  
  const openai_info = getOpenAIInfo()
  const anthropic_info = getAnthropicInfo()
  
  const public_user_info = getPublicUsers();
  

  infoPageHtml = info.config.page_body
		.replaceAll("{headerHtml}", headerHtml)
		.replaceAll("{user:aliases}", (substring: string) => info.config.aliases.toString() ?? "{}")
		.replaceAll("{user:data}", JSON.stringify(public_user_info).toString())
		.replaceAll("{title}", title)
		.replaceAll("{JSON}", JSON.stringify(temp_info, null, 2))
		.replaceAll("{uptime}", info?.uptime?.toString())
		 .replaceAll("{endpoints:openai}",info?.endpoints.openai ?? "Not Avaliable" )
		 .replaceAll("{endpoints:anthropic}",info?.endpoints.anthropic ?? "Not Avaliable" )
		 .replaceAll("{proompts}", info?.proompts?.toString() ?? "0")
		 .replaceAll("{proomptersNow}",info?.proomptersNow?.toString() ?? "0")
		 .replaceAll("{openaiKeys}", (substring: string) => info.openaiKeys.toString())
		 .replaceAll("{anthropicKeys}", (substring: string) => info.anthropicKeys.toString() )
		 .replaceAll("{status}", (substring: string) => openai_info.status.toString() ?? "Checking finished")
		 .replaceAll("{turbo:activeKeys}", (substring: string) => openai_info.turbo?.activeKeys?.toString() ?? "0")
		 .replaceAll("{turbo:proomptersInQueue}",(substring: string) => openai_info.turbo?.proomptersInQueue?.toString() ?? "0")
		 .replaceAll("{turbo:estimatedQueueTime}", (substring: string) => openai_info.turbo?.estimatedQueueTime?.toString() ?? "Not Avaliable ")
		 .replaceAll("{turbo:revokedKeys}", (substring: string) => openai_info.turbo?.revokedKeys?.toString() ?? "0")
		 .replaceAll("{turbo:overQuotaKeys}", (substring: string) => openai_info.turbo?.overQuotaKeys?.toString() ?? "0")
		 .replaceAll("{gpt4:activeKeys}",(substring: string) => openai_info.gpt4?.activeKeys?.toString() ?? "0")
		 .replaceAll("{gpt4:overQuotaKeys}",(substring: string) => openai_info.gpt4?.overQuotaKeys?.toString() ?? "0")
		 .replaceAll("{gpt4:revokedKeys}",(substring: string) => openai_info.gpt4?.revokedKeys?.toString() ?? "0")
		 .replaceAll("{gpt4:proomptersInQueue}",(substring: string) => openai_info.gpt4?.proomptersInQueue?.toString() ?? "0")
		 .replaceAll("{gpt4:estimatedQueueTime}",(substring: string) => openai_info.gpt4?.estimatedQueueTime?.toString() ?? "No wait")
		 .replaceAll("{gpt432k:activeKeys}",(substring: string) => openai_info.gpt432k?.activeKeys?.toString() ?? "0")
		 .replaceAll("{gpt432k:overQuotaKeys}",(substring: string) => openai_info.gpt432k?.overQuotaKeys?.toString() ?? "0")
		 .replaceAll("{gpt432k:revokedKeys}",(substring: string) => openai_info.gpt432k?.revokedKeys?.toString() ?? "0")
		 .replaceAll("{config:gatekeeper}",(substring: string) => info.config.gatekeeper).replace("{config:modelRateLimit}", (substring: string) => info.config.modelRateLimit?.toString())
		 .replaceAll("{config:maxOutputTokensOpenAI}",(substring: string) => info.config.maxOutputTokensOpenAI.toString())
		 .replaceAll("{config:promptLogging}",(substring: string) => info.config.promptLogging)
		 .replaceAll("{config:queueMode}", (substring: string) => info.config.queueMode.toString() ?? "Fair")
		 .replaceAll("{build}",info.build)
     .replaceAll('{anthropic:activeKeys}', (substring: string) => anthropic_info.claude?.activeKeys?.toString() ?? "0")
     .replaceAll('{anthropic:proomptersInQueue}', (substring: string) => anthropic_info.claude?.proomptersInQueue?.toString() ?? "0")
     .replaceAll('{anthropic:estimatedQueueTime}', (substring: string) => anthropic_info.claude?.estimatedQueueTime?.toString() ?? "No wait");
  infoPageLastUpdated = Date.now();

  return infoPageHtml;
}

function getStatusJson(req: Request) {
  const keys = keyPool.list();
  const baseUrl =
    process.env.SPACE_ID && !req.get("host")?.includes("hf.space")
      ? getExternalUrlForHuggingfaceSpaceId(process.env.SPACE_ID)
      : req.protocol + "://" + req.get("host");


  const openaiKeys = keys.filter((k) => k.service === "openai").length;
  const anthropicKeys = keys.filter((k) => k.service === "anthropic").length;
  const info = {
    uptime: process.uptime(),
    endpoints: {
      ...(openaiKeys ? { openai: baseUrl + "/proxy/openai" } : {}),
      ...(anthropicKeys ? { anthropic: baseUrl + "/proxy/anthropic" } : {}),
    },
    proompts: keys.reduce((acc, k) => acc + k.promptCount, 0),
    ...(config.modelRateLimit ? { proomptersNow: getUniqueIps() } : {}),
    openaiKeys,
    anthropicKeys,
    ...(openaiKeys ? getOpenAIInfo() : {}),
    ...(anthropicKeys ? getAnthropicInfo() : {}),
    config: listConfig(),
    build: process.env.BUILD_INFO || "dev",
  };
  return info 
}

type ServiceInfo = {
  activeKeys: number;
  trialKeys?: number;
  // activeLimit: string;
  revokedKeys?: number;
  overQuotaKeys?: number;
  proomptersInQueue: number;
  estimatedQueueTime: string;
  status: string;
};

// this has long since outgrown this awful "dump everything in a <pre> tag" approach
// but I really don't want to spend time on a proper UI for this right now

function getOpenAIInfo() {
  const info: { [model: string]: Partial<ServiceInfo> } = {};
  const keys = keyPool
    .list()
    .filter((k) => k.service === "openai") as OpenAIKey[];
  const hasGpt4 = keys.some((k) => k.isGpt4) && !config.turboOnly;
  const hasGpt432k = keys.some((k) => k.isGpt432k) && !config.turboOnly;


  if (keyPool.anyUnchecked()) {
    const uncheckedKeys = keys.filter((k) => !k.lastChecked);
    info.status =
      `Performing startup key checks (${uncheckedKeys.length} left).` as any;
  } else {
    info.status = `Finished checking keys.` as any;
  }

  if (config.checkKeys) {
    const turboKeys = keys.filter((k) => !k.isGpt4 && !k.isGpt432k);
    const gpt4Keys = keys.filter((k) => k.isGpt4);
	const gpt432kKeys = keys.filter((k) => k.isGpt432k);
	

    const quota: Record<string, string> = { turbo: "", gpt4: "" };
    const turboQuota = keyPool.activeLimitInUsd("openai");
    const gpt4Quota = keyPool.activeLimitInUsd("openai", { gpt4: true });

    // Don't invert this condition; some proxies may be using the now-deprecated
    // 'partial' option which we want to treat as 'full' here.
    if (config.quotaDisplayMode !== "none") {
      quota.turbo = turboQuota;
      quota.gpt4 = gpt4Quota;
    }

    info.turbo = {
      activeKeys: turboKeys.filter((k) => !k.isDisabled).length,
      trialKeys: turboKeys.filter((k) => k.isTrial).length,
      // activeLimit: quota.turbo,
      revokedKeys: turboKeys.filter((k) => k.isRevoked).length,
      overQuotaKeys: turboKeys.filter((k) => k.isOverQuota).length,
    };

    if (hasGpt4) {
      info.gpt4 = {
        activeKeys: gpt4Keys.filter((k) => !k.isDisabled).length,
        trialKeys: gpt4Keys.filter((k) => k.isTrial).length,
        // activeLimit: quota.gpt4,
        revokedKeys: gpt4Keys.filter((k) => k.isRevoked).length,
        overQuotaKeys: gpt4Keys.filter((k) => k.isOverQuota).length,
      };
    }
	
	if (hasGpt432k) {
		info.gpt4_32k = {
        activeKeys: gpt432kKeys.filter((k) => !k.isDisabled).length,
        revokedKeys: gpt432kKeys.filter((k) => k.isRevoked).length,
        overQuotaKeys: gpt432kKeys.filter((k) => k.isOverQuota).length,
      };
		
	}

    if (config.quotaDisplayMode === "none") {
      // delete info.turbo?.activeLimit;
      // delete info.gpt4?.activeLimit;
    }
  } else {
    info.status = "Key checking is disabled." as any;
    info.turbo = { activeKeys: keys.filter((k) => !k.isDisabled).length };
    info.gpt4 = {
      activeKeys: keys.filter((k) => !k.isDisabled && k.isGpt4).length,
    };
	
	info.gpt4_32k = {
      activeKeys: keys.filter((k) => !k.isDisabled && k.isGpt432k).length,
    };
	
  }

  if (config.queueMode !== "none") {
    const turboQueue = getQueueInformation("turbo");

    info.turbo.proomptersInQueue = turboQueue.proomptersInQueue;
    info.turbo.estimatedQueueTime = turboQueue.estimatedQueueTime;

    if (hasGpt4) {
      const gpt4Queue = getQueueInformation("gpt-4");
      info.gpt4.proomptersInQueue = gpt4Queue.proomptersInQueue;
      info.gpt4.estimatedQueueTime = gpt4Queue.estimatedQueueTime;
    }
  }

  return info;
}

function getAnthropicInfo() {
  const claudeInfo: Partial<ServiceInfo> = {};
  const keys = keyPool.list().filter((k) => k.service === "anthropic");
  claudeInfo.activeKeys = keys.filter((k) => !k.isDisabled).length;
  if (config.queueMode !== "none") {
    const queue = getQueueInformation("claude");
    claudeInfo.proomptersInQueue = queue.proomptersInQueue;
    claudeInfo.estimatedQueueTime = queue.estimatedQueueTime;
  }
  return { claude: claudeInfo };
}

/**
 * If the server operator provides a `greeting.md` file, it will be included in
 * the rendered info page.
 **/
function buildInfoPageHeader(converter: showdown.Converter, title: string) {
  const customGreeting = fs.existsSync("greeting.md")
    ? fs.readFileSync("greeting.md", "utf8")
    : null;

  // TODO: use some templating engine instead of this mess

  let infoBody = `<!-- Header for Showdown's parser, don't remove this line -->
# ${title}`;

  if (config.queueMode !== "none") {
    const waits: string[] = [];
    infoBody += `\n## Estimated Wait Times\nIf the AI is busy, your prompt will processed when a slot frees up.`;

    if (config.openaiKey) {
      const turboWait = getQueueInformation("turbo").estimatedQueueTime;
      const gpt4Wait = getQueueInformation("gpt-4").estimatedQueueTime;
      waits.push(`**Turbo:** ${turboWait}`);
      if (keyPool.list().some((k) => k.isGpt4) && !config.turboOnly) {
        waits.push(`**GPT-4:** ${gpt4Wait}`);
      }
    }

    if (config.anthropicKey) {
      const claudeWait = getQueueInformation("claude").estimatedQueueTime;
      waits.push(`**Claude:** ${claudeWait}`);
    }
    infoBody += "\n\n" + waits.join(" / ");
  }

  if (customGreeting) {
    infoBody += `\n## Server Greeting\n
${customGreeting}`;
  }
  return converter.makeHtml(infoBody);
}

/** Returns queue time in seconds, or minutes + seconds if over 60 seconds. */
function getQueueInformation(partition: QueuePartition) {
  if (config.queueMode === "none") {
    return {};
  }
  const waitMs = getEstimatedWaitTime(partition);
  const waitTime =
    waitMs < 60000
      ? `${Math.round(waitMs / 1000)}sec`
      : `${Math.round(waitMs / 60000)}min, ${Math.round(
          (waitMs % 60000) / 1000
        )}sec`;
  return {
    proomptersInQueue: getQueueLength(partition),
    estimatedQueueTime: waitMs > 2000 ? waitTime : "no wait",
  };
}

function getServerTitle() {
  // Use manually set title if available
  if (process.env.SERVER_TITLE) {
    return process.env.SERVER_TITLE;
  }

  // Huggingface
  if (process.env.SPACE_ID) {
    return `${process.env.SPACE_AUTHOR_NAME} / ${process.env.SPACE_TITLE}`;
  }

  // Render
  if (process.env.RENDER) {
    return `Render / ${process.env.RENDER_SERVICE_NAME}`;
  }

  return "OAI Reverse Proxy";
}

function getExternalUrlForHuggingfaceSpaceId(spaceId: string) {
  // Huggingface broke their amazon elb config and no longer sends the
  // x-forwarded-host header. This is a workaround.
  try {
    const [username, spacename] = spaceId.split("/");
    return `https://${username}-${spacename.replace(/_/g, "-")}.hf.space`;
  } catch (e) {
    return "";
  }
}
