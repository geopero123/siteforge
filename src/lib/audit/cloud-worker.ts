import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Sandbox, type NetworkPolicy } from "@vercel/sandbox";
import { adminDb } from "../supabase/admin";
import { redactSecrets } from "../security/redact";

// Enforce public destinations at the network layer, including after DNS rebinding.
export const workerNetworkPolicy: NetworkPolicy = {
  subnets: {
    allow: ["0.0.0.0/0"],
    deny: [
      "0.0.0.0/8",
      "10.0.0.0/8",
      "100.64.0.0/10",
      "127.0.0.0/8",
      "169.254.0.0/16",
      "172.16.0.0/12",
      "192.0.0.0/24",
      "192.0.2.0/24",
      "192.88.99.0/24",
      "192.168.0.0/16",
      "198.18.0.0/15",
      "198.51.100.0/24",
      "203.0.113.0/24",
      "224.0.0.0/4",
      "240.0.0.0/4",
    ],
  },
};

export function cloudWorkerEnabled() {
  return (
    process.env.AUDIT_WORKER_MODE !== "external" &&
    (process.env.VERCEL === "1" || !!process.env.AUDIT_WORKER_SNAPSHOT_ID)
  );
}

export function workerConfigurationError() {
  if (!cloudWorkerEnabled()) return null;
  for (const key of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "AUDIT_WORKER_SNAPSHOT_ID",
  ]) {
    if (!process.env[key])
      return `The audit worker is missing ${key}. Add it to the Production environment and redeploy.`;
  }
  return null;
}

export async function dispatchQueuedAudit(id: string) {
  if (!cloudWorkerEnabled()) return false;
  const configurationError = workerConfigurationError();
  if (configurationError) throw new Error(configurationError);
  const db = adminDb();
  const { data: audit, error } = await db
    .from("audits")
    .select("id,status,started_at,mode")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Unable to read the worker queue.");
  if (!audit || audit.status !== "queued") return false;
  // Reserve startup across function instances, with recovery after a crash.
  if (audit.started_at && Date.now() - Date.parse(audit.started_at) < 180_000)
    return false;
  const lease = new Date().toISOString();
  let reservation = db
    .from("audits")
    .update({ started_at: lease })
    .eq("id", id)
    .eq("status", "queued");
  reservation = audit.started_at
    ? reservation.eq("started_at", audit.started_at)
    : reservation.is("started_at", null);
  const claimed = await reservation.select("id");
  if (claimed.error) throw new Error("Unable to reserve worker startup.");
  if (!claimed.data?.length) return false;
  let sandbox: Sandbox | undefined;
  try {
    const bundle = await readFile(
      join(process.cwd(), ".audit-worker/worker.cjs"),
    );
    // Full website/repository scans have a twenty-minute engine deadline.
    const duration = audit.mode === "full" ? 20 : 10;
    sandbox = await Sandbox.create({
      name: `audit-${id}-${Date.parse(lease)}`,
      source: {
        type: "snapshot",
        snapshotId: process.env.AUDIT_WORKER_SNAPSHOT_ID!,
      },
      persistent: false,
      timeout: (duration + 2) * 60_000,
      resources: { vcpus: 2 },
      networkPolicy: workerNetworkPolicy,
    });
    // Enforce IPv6 and in-VM loopback isolation before giving the worker secrets.
    const isolation = await sandbox.runCommand({
      cmd: "bash",
      args: [
        "-c",
        "set -eu\n" +
          "sysctl -w net.ipv6.conf.all.disable_ipv6=1 net.ipv6.conf.default.disable_ipv6=1\n" +
          "nft add table ip siteforge\n" +
          "nft 'add chain ip siteforge output { type filter hook output priority 0; policy accept; }'\n" +
          "nft add rule ip siteforge output meta skuid 1000 ip daddr 127.0.0.0/8 drop\n",
      ],
      sudo: true,
    });
    if (isolation.exitCode !== 0)
      throw new Error("Could not enforce worker network isolation.");
    // Prepared snapshots already contain this directory; mkdir -p also handles
    // snapshots built without a worker bundle.
    const directory = await sandbox.runCommand({
      cmd: "mkdir",
      args: ["-p", "/vercel/siteforge/.audit-worker"],
    });
    if (directory.exitCode !== 0)
      throw new Error("Could not prepare worker directory.");
    await sandbox.writeFiles([
      { path: "/vercel/siteforge/.audit-worker/worker.cjs", content: bundle },
    ]);
    await sandbox.runCommand({
      cmd: "node",
      args: [".audit-worker/worker.cjs"],
      cwd: "/vercel/siteforge",
      detached: true,
      env: {
        NODE_ENV: "production",
        AUDIT_EGRESS_ISOLATED: "true",
        WORKER_AUDIT_ID: id,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
        ...(process.env.GEMINI_MODEL
          ? { GEMINI_MODEL: process.env.GEMINI_MODEL }
          : {}),
      },
    });
    return true;
  } catch (error) {
    await sandbox?.stop().catch(() => {});
    console.error("Audit worker startup failed:", redactSecrets(String(error)));
    const saved = await db
      .from("audits")
      .update({
        status: "failed",
        error:
          "The cloud worker could not start. Check the worker configuration and rerun this audit.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "queued")
      .eq("started_at", lease);
    if (saved.error) console.error("Could not save worker startup failure.");
    throw new Error(
      "The cloud worker could not start. Check the deployment logs.",
    );
  }
}
