import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeProvider from "../../components/ThemeProvider";
import SiteHeader from "../../components/SiteHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Social Media Manager",
  description: "AI-powered workspace for content management",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans flex flex-col min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100`}
      >
        <ThemeProvider>
          <SiteHeader />

          <main className="flex-1">{children}</main>

          <footer className="border-t border-gray-200 dark:border-gray-700/60 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-600 dark:text-gray-400">
              <p className="text-center md:text-left">
                © {new Date().getFullYear()}{" "}
                <span className="font-semibold">🤖PostPilot AI</span>. All rights reserved.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
                <a href="/about" className="hover:text-blue-600 transition">
                  About
                </a>
                <a href="/privacy" className="hover:text-blue-600 transition">
                  Privacy
                </a>
                <a href="/terms" className="hover:text-blue-600 transition">
                  Terms
                </a>
                <a href="/contact" className="hover:text-blue-600 transition">
                  Contact
                </a>
              </div>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
