import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { ThemeBoot } from "@/components/ThemeBoot";
import { ToastHost } from "@/components/ToastHost";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: PRODUCT_DESCRIPTION,
  applicationName: PRODUCT_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: PRODUCT_NAME,
  },
};

// No themeColor here: the bar colour follows the in-app theme, which can
// differ from the OS, so public/theme-init.js and lib/theme.ts set it.
export const viewport: Viewport = {
  // Shrink the layout viewport when the on-screen keyboard opens (instead of
  // panning the page), so the app header and toolbar stay anchored.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        <ThemeBoot />
        {children}
        <ToastHost />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
