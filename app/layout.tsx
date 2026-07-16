import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BlogIDE",
  description: "An IDE for essays — long-form writing with footnotes, Git-backed storage, and an AI assistant.",
  applicationName: "BlogIDE",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BlogIDE",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#14130f" },
  ],
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="blogide.theme",v=localStorage.getItem(k),t=v==="light"||v==="dark"?v:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
