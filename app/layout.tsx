import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeScript from "@/components/ThemeScript";
import Navbar from "@/components/Navbar";
import { SwrProvider } from "@/components/SwrProvider";
import { TtsProvider } from "@/components/TtsProvider";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" data-theme="corporate" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased min-h-screen bg-[var(--page-bg)] text-base-content`}
      >
        <ThemeScript />
        <SwrProvider>
          <TtsProvider>
            <Navbar />
            {children}
          </TtsProvider>
        </SwrProvider>
      </body>
    </html>
  );
}
