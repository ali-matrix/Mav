import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { themeScript } from "@metis/ui";
import "@metis/ui/tokens.css";
import "@metis/ui/kit.css";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Mav — Assets",
  description: "Mav asset management",
};

// Phones: draw edge to edge and match the rail colour.
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2FA8DF" };

// The theme is set before the first paint (no flash): the saved choice, else the device's.
const THEME = themeScript("asset-theme");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME }} /></head>
      <body className={`${inter.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
