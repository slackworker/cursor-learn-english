import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeScript from "@/components/ThemeScript";
import Navbar from "@/components/Navbar";
import { SwrProvider } from "@/components/SwrProvider";
import { TtsProvider } from "@/components/TtsProvider";
import { ServerStatusProvider, ServerOfflineBanner } from "@/components/ServerStatus";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cursor 学英语",
  description: "Cursor 学英语，使用数据可视化仪表盘",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1f26" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" data-theme="corporate" data-font-size="md" suppressHydrationWarning>
      <head>
        {/* Apply stored theme / font-size before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t);var f=localStorage.getItem("font-size");if(f==="sm"||f==="md"||f==="lg"){document.documentElement.setAttribute("data-font-size",f);}else if(window.matchMedia("(hover: none) and (pointer: coarse)").matches){document.documentElement.setAttribute("data-font-size","lg");}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased min-h-screen bg-[var(--page-bg)] text-base-content`}
      >
        <ThemeScript />
        <SwrProvider>
          <ServerStatusProvider>
            <TtsProvider>
              <Navbar />
              <ServerOfflineBanner />
              {children}
            </TtsProvider>
          </ServerStatusProvider>
        </SwrProvider>
      </body>
    </html>
  );
}
