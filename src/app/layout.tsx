import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "SiteForge — Find what breaks in your website and code",
    template: "%s · SiteForge",
  },
  description:
    "Real-browser website audits and full GitHub repository scans. Every finding comes with evidence, a location and a fix.",
};
export const viewport: Viewport = {
  themeColor: "#07090b",
  colorScheme: "dark",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
