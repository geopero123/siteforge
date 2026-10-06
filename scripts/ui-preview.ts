// Runs the web app against an in-memory Supabase stand-in with fixture data, so
// every signed-in page can be viewed without credentials. Development only.
import { startPreview } from "./preview/start";

const preview = await startPreview({
  appPort: Number(process.env.PREVIEW_APP_PORT) || 3100,
  supabasePort: Number(process.env.PREVIEW_SUPABASE_PORT) || 54321,
});
console.log(
  `\nSiteForge UI preview with fixture data.\n  Sign in: ${preview.supabase.url}/__signin\n  App:     ${preview.appOrigin}\n`,
);
const stop = async () => {
  await preview.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
preview.next.on("exit", (code) => {
  void preview.supabase.close();
  process.exit(code ?? 0);
});
