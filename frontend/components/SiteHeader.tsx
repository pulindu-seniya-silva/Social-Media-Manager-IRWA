"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useTheme } from "next-themes";
import { createPortal } from "react-dom";

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  // Track mounted state to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // lock body scroll when sidebar open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : prev || "";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="w-full sticky top-0 z-50 bg-white/80 dark:bg-gray-800/80 shadow-sm backdrop-blur">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-4xl">🤖</span>
          <span className="font-extrabold tracking-tight text-lg sm:text-3xl">
            PostPilot AI
          </span>
        </Link>

        {/* Desktop Nav */}
        <ul className="hidden md:flex items-center gap-6 text-sm font-medium">
          <li><Link href="/content_creator_main" className="hover:text-blue-600">Content Creator</Link></li>
          <li><Link href="/contentModerator" className="hover:text-blue-600">Content Moderator</Link></li>
          <li><Link href="/post_scheduler" className="hover:text-blue-600">Post Scheduler</Link></li>
          <li><Link href="/engagement_analyzer" className="hover:text-blue-600">Engagement Analyzer</Link></li>
          <li>
            <Link
              href="/sign-in"
              className="px-3 py-2 rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-90 transition"
            >
              Log in
            </Link>
          </li>
          {/* Theme toggle */}
          <li>
            {mounted && (
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs"
              >
                {theme === "dark" ? "☀️" : "🌙"}
              </button>
            )}
          </li>
        </ul>

        {/* Mobile Hamburger */}
        <button
          aria-label="Open menu"
          className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-white/90 dark:hover:bg-gray-600"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-6 w-6" />
        </button>
      </nav>

      {/* Mobile Sidebar via Portal */}
      {open &&
        typeof window !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <button
              aria-label="Close menu"
              className="absolute inset-0 bg-black/50"
              onClick={close}
            />

            {/* Drawer */}
            <div
              className="absolute right-0 top-0 h-full w-[60%] sm:w-80 z-[110]
                         text-white shadow-2xl border-l border-indigo-800
                         bg-gradient-to-b from-indigo-700 via-indigo-700 to-indigo-800
                         dark:bg-gradient-to-b dark:from-gray-900 dark:via-gray-900 dark:to-gray-950
                         p-4 flex flex-col"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">Menu</span>
                <button
                  aria-label="Close"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
                  onClick={close}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="mt-4 space-y-1 text-sm">
                <Link href="/content_creator_main" onClick={close} className="block rounded-lg px-3 py-2 hover:bg-white/10">Content Creator</Link>
                <Link href="/contentModerator" onClick={close} className="block rounded-lg px-3 py-2 hover:bg-white/10">Content Moderator</Link>
                <Link href="/post_scheduler" onClick={close} className="block rounded-lg px-3 py-2 hover:bg-white/10">Post Scheduler</Link>
                <Link href="/analyzer" onClick={close} className="block rounded-lg px-3 py-2 hover:bg-white/10">Engagement Analyzer</Link>

                <Link
                  href="/sign-in"
                  onClick={close}
                  className="mt-2 block rounded-xl px-3 py-3 bg-white text-indigo-800 font-semibold text-center hover:opacity-90 transition"
                >
                  Log in
                </Link>

                {mounted && (
                  <button
                    onClick={() => {
                      setTheme(theme === "dark" ? "light" : "dark");
                      close();
                    }}
                    className="mt-2 block w-full rounded-xl px-3 py-3 bg-white/10 hover:bg-white/15 text-center"
                  >
                    {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
                  </button>
                )}
              </nav>

              <div className="mt-auto pt-6 text-xs text-white/80">
                © {new Date().getFullYear()} Social Media Manager.
              </div>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
}
