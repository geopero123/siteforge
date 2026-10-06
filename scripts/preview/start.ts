// Starts the web app in development mode against the in-memory Supabase stand-in.
import { spawn } from "node:child_process";
import { startFakeSupabase } from "./fake-supabase";
import { renderStorefront } from "./storefront";

export async function startPreview(options: {
  appPort: number;
  supabasePort: number;
  quiet?: boolean;
}) {
  const appOrigin = `http://127.0.0.1:${options.appPort}`;
  const supabase = await startFakeSupabase({
    port: options.supabasePort,
    images: await renderStorefront(),
    appOrigin,
  });
  const next = spawn(
    "npx",
    [
      "next",
      "dev",
      "--webpack",
      "-H",
      "127.0.0.1",
      "-p",
      String(options.appPort),
    ],
    {
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      detached: true,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: supabase.url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "preview-publishable-key",
        NEXT_PUBLIC_APP_URL: appOrigin,
      },
    },
  );
  // Keep the tail of quiet output so a failed start can be explained.
  let output = "";
  for (const stream of [next.stdout, next.stderr])
    stream?.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4000);
    });
  const stop = async () => {
    // Next spawns its own server process; stop the whole group.
    try {
      if (next.pid) process.kill(-next.pid, "SIGTERM");
    } catch {
      /* Already stopped. */
    }
    await supabase.close();
  };
  for (let attempt = 0; attempt < 120; attempt++) {
    if (next.exitCode !== null) {
      await supabase.close();
      throw new Error(
        "Next.js exited before it was ready. Only one `next dev` can run per folder; stop other dev servers first.\n" +
          output,
      );
    }
    try {
      if ((await fetch(appOrigin + "/")).ok) break;
    } catch {
      /* Still starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { appOrigin, supabase, next, stop };
}
