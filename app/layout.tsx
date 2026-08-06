import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "PulseOps | Forward-Deployed Analytics Portfolio",
    description:
      "An interactive ETL, data-quality, analytics, and decision-support portfolio project by Krishna Mvwala.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "PulseOps | Forward-Deployed Analytics",
      description: "From raw sales files to trusted decisions. Built by Krishna Mvwala.",
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1735, height: 909, alt: "PulseOps forward-deployed analytics portfolio" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "PulseOps | Forward-Deployed Analytics",
      description: "From raw sales files to trusted decisions. Built by Krishna Mvwala.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
