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

<<<<<<< HEAD
            <ul className="flex items-center gap-6 text-sm font-medium">
              <li>
                <Link href="/content_creator" className="hover:text-blue-600">
                  Content Creator
                </Link>
              </li>
              <li>
                <Link href="/contentModerator" className="hover:text-blue-600">
                  Content Moderator
                </Link>
              </li>
              <li>
                <Link href="/post_scheduler" className="hover:text-blue-600">
                  Post Scheduler
                </Link>
              </li>
              <li>
                <Link href="/analyzer" className="hover:text-blue-600">
                  Engagement Analyzer
                </Link>
              </li>
              <li>
                <Link
                  href="/sign-in" // change to "/login" if you have your own login page
                  className="px-3 py-2 rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-90 transition"
                >
                  Log in
                </Link>
              </li>
            </ul>
          </nav>
        </header>

        {/* ===== Main Page Content ===== */}
        <main className="flex-1">{children}</main>

        {/* ===== Footer ===== */}
      <footer className="border-t border-gray-200 dark:border-gray-700/60 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-600 dark:text-gray-400">
        {/* Left side: copyright */}
        <p className="text-center md:text-left">
          © {new Date().getFullYear()} <span className="font-semibold">Social Media Manager</span>. All rights reserved.
        </p>

        {/* Right side: quick links */}
        <div className="flex gap-6">
          <a href="/about" className="hover:text-blue-600 transition">About</a>
          <a href="/privacy" className="hover:text-blue-600 transition">Privacy</a>
          <a href="/terms" className="hover:text-blue-600 transition">Terms</a>
          <a href="/contact" className="hover:text-blue-600 transition">Contact</a>
        </div>
      </div>
    </footer>
=======
          <main className="flex-1">{children}</main>
>>>>>>> origin/main

          <footer className="border-t border-gray-200 dark:border-gray-700/60 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-600 dark:text-gray-400">
              <p className="text-center md:text-left">
                © {new Date().getFullYear()}{" "}
                <span className="font-semibold">Social Media Manager</span>. All rights reserved.
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
