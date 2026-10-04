import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "SiteForge — Website quality, verified",
    template: "%s · SiteForge",
  },
  description:
    "Real browser audits, evidence-backed findings, and actionable fixes.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
