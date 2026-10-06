import Link from "next/link";
import { Brand } from "@/components/brand";
export default function NotFound() {
  return (
    <main className="not-found">
      <Brand />
      <strong style={{ marginTop: 32 }}>404</strong>
      <h1>This page doesn’t exist</h1>
      <p>The link may be broken, or the page may have been removed.</p>
      <div className="page-actions" style={{ justifyContent: "center" }}>
        <Link className="button" href="/">
          Home
        </Link>
        <Link className="button primary" href="/dashboard">
          Open workspace
        </Link>
      </div>
    </main>
  );
}
