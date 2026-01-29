import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Al-Qadr Hifdh Class",
    template: "%s | Al-Qadr Hifdh Class",
  },
  description: "Al-Qadr Hifdh Class • Northcliff",
  applicationName: "Al-Qadr Hifdh Class",
  manifest: "/manifest.webmanifest",

  icons: {
    // ✅ browser tab icons (include favicon.ico first)
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],

    // ✅ iPhone / iPad home-screen icon
    apple: [{ url: "/icons/icon-192.png" }],

    // ✅ some browsers use this
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}