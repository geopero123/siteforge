"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
export function UrlEntry() {
  const [url, setUrl] = useState("");
  const router = useRouter();
  return (
    <form
      className="url-form"
      onSubmit={(e) => {
        e.preventDefault();
        router.push("/dashboard/new?url=" + encodeURIComponent(url));
      }}
    >
      <input
        aria-label="Website URL"
        type="url"
        placeholder="https://your-website.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
      />
      <button className="button primary">
        Audit your website <ArrowRight size={16} />
      </button>
    </form>
  );
}
