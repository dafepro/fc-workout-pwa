import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { copy } from "./content/copy";
import { AuthGate } from "./state/auth-context";
import "./globals.css";
import "./player/player.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const description =
    "A safe youth soccer training tracker for effort, consistency, and team motivation.";

  return {
    metadataBase: new URL(origin),
    title: {
      default: `${copy.brand} Training`,
      template: `%s · ${copy.brand}`,
    },
    description,
    applicationName: copy.brand,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: copy.brand,
    },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      type: "website",
      title: `${copy.brand} Training`,
      description,
      siteName: copy.brand,
      images: [{ url: `${origin}/og.png`, width: 1727, height: 910 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${copy.brand} Training`,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b123d",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
