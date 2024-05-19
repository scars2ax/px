import { Request, Response, NextFunction } from "express";
import ipaddr, { IPv4, IPv6 } from "ipaddr.js";
import { logger } from "../logger";

const log = logger.child({ module: "cidr" });

function parseRangeList(ranges: string[] | string) {
  const rangeList = Array.isArray(ranges)
    ? ranges
    : ranges.split(",").map((s) => s.trim());
  return rangeList
    .map((input) => {
      try {
        if (input.includes("/")) {
          return ipaddr.parseCIDR(input);
        } else {
          const ip = ipaddr.parse(input);
          return ipaddr.parseCIDR(
            `${input}/${ip.kind() === "ipv4" ? 32 : 128}`
          );
        }
      } catch (e) {
        log.error({ input, error: e.message }, "Invalid CIDR range; skipping");
        return null;
      }
    })
    .filter((cidr): cidr is [IPv4 | IPv6, number] => cidr !== null);
}

export function createWhitelistMiddleware(
  name: string,
  ranges: string[] | string
) {
  const cidrs = parseRangeList(ranges);

  log.info({ list: name, cidrs }, "IP whitelist configured");

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const ip = ipaddr.process(req.ip);
    const allowed = cidrs.some((cidr) => ip.match(cidr));
    if (allowed) {
      req.log.info({ ip: req.ip, list: name }, "Request allowed by whitelist");
      return next();
    }
    req.log.warn({ ip: req.ip, list: name }, "Request denied by whitelist");
    res.status(403).json({ error: `Forbidden (by ${name})` });
  };
  middleware.ranges = ranges;
  return middleware;
}

export function createBlacklistMiddleware(
  name: string,
  ranges: string[] | string
) {
  const cidrs = parseRangeList(ranges);

  log.info({ list: name, cidrs }, "IP blacklist configured");

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const ip = ipaddr.process(req.ip);
    const denied = cidrs.some((cidr) => ip.match(cidr));
    if (denied) {
      req.log.warn({ ip: req.ip, list: name }, "Request denied by blacklist");
      return res.status(403).json({ error: `Forbidden (by ${name})` });
    }
    return next();
  };
  middleware.ranges = ranges;
  return middleware;
}
