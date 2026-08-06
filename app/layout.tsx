import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AuthGate } from "./state/auth-context";
import "./globals.css";

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
      default: "StrideCrew Training",
      template: "%s · StrideCrew",
    },
    description,
    applicationName: "StrideCrew",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "StrideCrew",
    },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      type: "website",
      title: "StrideCrew Training",
      description,
      siteName: "StrideCrew",
      images: [{ url: `${origin}/og.png`, width: 1729, height: 910 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "StrideCrew Training",
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
