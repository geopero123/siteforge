import Link from "next/link";
import { BrandMark } from "./ui";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="SiteForge home">
      <BrandMark />
      <span>SiteForge</span>
    </Link>
  );
}
