import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
export function isPublicAddress(address: string) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress())
      ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function parseTarget(raw: string, allowLocal = false) {
  const url = new URL(raw);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP(S) URL without embedded credentials.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !allowLocal &&
    (host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      (!host.includes(".") && !ipaddr.isValid(host)) ||
      (ipaddr.isValid(host) && !isPublicAddress(host)))
  )
    throw new Error("Private, local and metadata destinations are blocked.");
  if (!allowLocal && url.port && !["80", "443"].includes(url.port))
    throw new Error("Only public HTTP and HTTPS ports are permitted.");
  url.hash = "";
  return url;
}
export async function validateTarget(raw: string, allowLocal = false) {
  const url = parseTarget(raw, allowLocal);
  if (!allowLocal) {
    const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
      all: true,
    }).catch(() => {
      throw new Error(
        `Couldn't find ${url.hostname}. Check the address for typos and that the site is online.`,
      );
    });
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
      throw new Error("Destination resolves to a blocked network address.");
  }
  return url;
}
export class ToolBudget {
  private stepCount = 0;
  private navigationCount = 0;
  private actionCounts = new Map<string, number>();
  private startedAt = Date.now();
  constructor(
    readonly maxSteps = 20,
    readonly maxNavigations = 6,
    readonly timeout = 120000,
  ) {}
  consume(name: string, args: unknown) {
    if (
      ++this.stepCount > this.maxSteps ||
      Date.now() - this.startedAt > this.timeout
    )
      throw new Error("Mission step or time limit reached");
    if (
      ["navigateTo", "goBack"].includes(name) &&
      ++this.navigationCount > this.maxNavigations
    )
      throw new Error("Navigation limit reached");
    // Repeating the same tool and arguments usually means the mission is stuck.
    const key = name + JSON.stringify(args);
    const repeatCount = (this.actionCounts.get(key) ?? 0) + 1;
    this.actionCounts.set(key, repeatCount);
    if (repeatCount > 3) throw new Error("Repeated action loop detected");
  }
}
