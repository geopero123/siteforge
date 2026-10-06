"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { parseRepository, formatRepository } from "@/lib/repository/reference";

// Sends GitHub links to a code scan and anything else to a website audit.
export function targetQuery(input: string) {
  const value = input.trim();
  if (/^(https?:\/\/)?(www\.)?github\.com\//i.test(value))
    try {
      return (
        "repository=" +
        encodeURIComponent(formatRepository(parseRepository(value)))
      );
    } catch {
      /* Fall through and let the form explain the problem. */
    }
  const url = /^https?:\/\//i.test(value) ? value : "https://" + value;
  return "url=" + encodeURIComponent(url);
}

export function UrlEntry() {
  const [value, setValue] = useState("");
  const router = useRouter();
  return (
    <form
      className="url-form"
      onSubmit={(e) => {
        e.preventDefault();
        router.push("/dashboard/new?" + targetQuery(value));
      }}
    >
      <Search size={18} aria-hidden />
      <input
        aria-label="Website URL or GitHub repository"
        placeholder="your-site.com or github.com/you/repo"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="url"
        spellCheck={false}
        required
      />
      <button className="button primary large">
        Run audit <ArrowRight size={16} />
      </button>
    </form>
  );
}
