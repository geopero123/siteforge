import nextEnv from "@next/env";
import { adminDb } from "../src/lib/supabase/admin";
import { runAudit } from "../src/lib/audit/engine";
import { validateTarget } from "../src/lib/security/url";
import { redactSecrets } from "../src/lib/security/redact";
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const local =
  process.env.ALLOW_LOCAL_AUDITS === "true" &&
  process.env.NODE_ENV !== "production";
if (!local && process.env.AUDIT_EGRESS_ISOLATED !== "true")
  throw new Error(
    "Worker refused to start. Run in an egress-isolated container and set AUDIT_EGRESS_ISOLATED=true, or use controlled local development.",
  );
const db = adminDb();
let stopping = false;
let active: AbortController | undefined;
process.on("SIGINT", () => {
  stopping = true;
  active?.abort(new Error("Worker shutdown requested; rerun this audit."));
});
process.on("SIGTERM", () => {
  stopping = true;
  active?.abort(new Error("Worker shutdown requested; rerun this audit."));
});
function checked<T extends { error: unknown }>(result: T) {
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result;
}
async function work() {
  while (!stopping) {
    checked(await db.rpc("expire_audits"));
    const claimed = checked(await db.rpc("claim_audit"));
    const audit = claimed.data?.[0];
    if (!audit) {
      await new Promise((r) =>
        setTimeout(r, Number(process.env.WORKER_POLL_MS) || 2000),
      );
      continue;
    }
    const id = String(audit.id);
    const heartbeat = setInterval(() => {
      void db
        .from("audits")
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("id", id)
        .then((r) => {
          if (r.error)
            console.error(
              JSON.stringify({
                auditId: id,
                agent: "worker",
                status: "heartbeat_failed",
              }),
            );
        });
    }, 15000);
    const started = Date.now();
    active = new AbortController();
    let previewId: string | undefined;
    try {
      if (audit.url) await validateTarget(audit.url, local);
      // Audits queued before repository targets existed rely on the project's setting.
      const repository =
        audit.repository ??
        checked(
          await db
            .from("projects")
            .select("repository")
            .eq("id", audit.project_id)
            .single(),
        ).data?.repository;
      const result = await runAudit({
        signal: active.signal,
        url: audit.url ?? undefined,
        mode: audit.mode,
        mission: audit.mission ?? undefined,
        allowFormSubmission: audit.allow_form_submission,
        repository: repository ?? undefined,
        userId: audit.user_id,
        preview: async ({ image, url, viewport, capturedAt }) => {
          const path = `${audit.user_id}/${id}/live.png`;
          checked(
            await db.storage.from("screenshots").upload(path, image, {
              contentType: "image/png",
              upsert: true,
              cacheControl: "0",
            }),
          );
          const values = {
            audit_id: id,
            path,
            url,
            viewport,
            created_at: capturedAt,
          };
          if (previewId) {
            checked(
              await db.from("screenshots").update(values).eq("id", previewId),
            );
          } else {
            const saved = checked(
              await db.from("screenshots").insert(values).select("id").single(),
            );
            if (!saved.data)
              throw new Error("Could not create live preview metadata");
            previewId = saved.data.id;
          }
        },
        event: async (e) => {
          checked(
            await db.from("agent_runs").insert({
              audit_id: id,
              ...e,
              message: redactSecrets(e.message),
            }),
          );
          console.log(
            JSON.stringify({
              auditId: id,
              agent: e.agent,
              status: e.status,
              duration: Date.now() - started,
              message: redactSecrets(e.message),
            }),
          );
        },
        screenshot: async (image, url, viewport) => {
          const path = `${audit.user_id}/${id}/${crypto.randomUUID()}.png`;
          checked(
            await db.storage
              .from("screenshots")
              .upload(path, image, { contentType: "image/png" }),
          );
          checked(
            await db
              .from("screenshots")
              .insert({ audit_id: id, path, url, viewport }),
          );
          return path;
        },
        page: async (url, evidence) => {
          checked(
            await db.from("audit_pages").insert({
              audit_id: id,
              url,
              evidence: JSON.parse(redactSecrets(JSON.stringify(evidence))),
            }),
          );
        },
        step: async (tool, args, result) => {
          checked(
            await db.from("mission_steps").insert({
              audit_id: id,
              tool,
              args: JSON.parse(redactSecrets(JSON.stringify(args ?? {}))),
              result: JSON.parse(redactSecrets(JSON.stringify(result))),
            }),
          );
        },
      });
      if (result.issues.length)
        checked(
          await db.from("issues").insert(
            result.issues.map((f) => ({
              audit_id: id,
              data: f,
              status: "open",
            })),
          ),
        );
      checked(
        await db
          .from("audits")
          .update({
            status: result.warnings.length ? "partial" : "complete",
            report: { ...result, issues: undefined },
            finished_at: new Date().toISOString(),
          })
          .eq("id", id),
      );
    } catch (e) {
      const message = redactSecrets(
        e instanceof Error ? e.message : "Unknown worker failure",
      );
      checked(
        await db
          .from("audits")
          .update({
            status: "failed",
            error: message.slice(0, 2000),
            finished_at: new Date().toISOString(),
          })
          .eq("id", id),
      );
      console.error(
        JSON.stringify({
          auditId: id,
          agent: "worker",
          status: "failed",
          error: message.slice(0, 500),
        }),
      );
    } finally {
      active = undefined;
      clearInterval(heartbeat);
    }
  }
}
work().catch((e) => {
  console.error(redactSecrets(e.message));
  process.exitCode = 1;
});
