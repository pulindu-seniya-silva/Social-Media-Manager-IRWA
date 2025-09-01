"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { PenTool, ShieldCheck, CalendarClock, BarChart3, X } from "lucide-react";
import dynamic from "next/dynamic";

// IMPORTANT: dynamically import to avoid any SSR hiccups with framer-motion
const ArchitectureFlow = dynamic(() => import("../../components/ArchitectureFlow"), { ssr: false });

export default function Home() {
  const [showFlow, setShowFlow] = useState(false);

  // optional: lock background scroll when modal is open
  useEffect(() => {
    if (showFlow) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [showFlow]);

  return (
    <div className="font-sans flex flex-col min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100 scroll-smooth">
      {/* Header */}
      <header className="w-full sticky top-0 z-50 bg-white/80 dark:bg-gray-800/80 shadow-sm backdrop-blur">
        <nav className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 group">
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="relative overflow-hidden">
          {/* subtle background shapes */}
          <div className="pointer-events-none absolute inset-0 opacity-30">
            <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-gradient-to-tr from-blue-500 to-sky-400 blur-3xl" />
            <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-gradient-to-tr from-fuchsia-500 to-purple-500 blur-3xl" />
          </div>

          <div className="relative max-w-6xl mx-auto px-6 py-24 sm:py-28 text-center">
            <h1 className="text-4xl sm:text-6xl font-extrabold leading-tight">
              Manage Your Social Media{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-sky-400">
                Smarter
              </span>
            </h1>
            <p className="mt-6 mx-auto max-w-2xl text-lg text-gray-700 dark:text-gray-300">
              An AI-powered workspace to <span className="font-semibold">create</span>,{" "}
              <span className="font-semibold">moderate</span>,{" "}
              <span className="font-semibold">schedule</span>, and{" "}
              <span className="font-semibold">analyze</span> content across platforms — all in one place.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              {/* Keep as Link if you want to jump to creator section */}
              <Link
                href="#creator"
                className="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
              >
                Get Started
              </Link>

              {/* Modal trigger as button (not Link) to avoid nested <a> issues */}
              <button
                onClick={() => setShowFlow(true)}
                className="px-6 py-3 rounded-xl bg-white/70 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold hover:bg-white/90 dark:hover:bg-gray-600 transition"
              >
                Explore Features
              </button>
            </div>
          </div>
        </section>

        {/* Features Grid (unchanged) */}
        <section id="features" className="max-w-6xl mx-auto px-6 pb-20">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Content Creator */}
            <div id="creator" className="group rounded-2xl p-6 bg-white/70 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 hover:border-blue-500 transition shadow-sm hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-600/10 text-blue-600">
                  <PenTool className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-lg">Content Creator</h3>
              </div>
              <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                Draft posts, generate captions, and get smart hashtag ideas tailored to each platform.
              </p>
              <div className="mt-4">
                <Link href="#creator" className="text-blue-600 hover:underline text-sm font-semibold">
                  Open Creator →
                </Link>
              </div>
            </div>

            {/* Content Moderator */}
            <div id="moderator" className="group rounded-2xl p-6 bg-white/70 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 hover:border-blue-500 transition shadow-sm hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-600/10 text-emerald-600">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-lg">Content Moderator</h3>
              </div>
              <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                Screen for toxicity, spam, or policy violations with customizable rules and thresholds.
              </p>
              <div className="mt-4">
                <Link href="#moderator" className="text-emerald-600 hover:underline text-sm font-semibold">
                  Open Moderator →
                </Link>
              </div>
            </div>

            {/* Post Scheduler */}
            <div id="scheduler" className="group rounded-2xl p-6 bg-white/70 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 hover:border-blue-500 transition shadow-sm hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-600/10 text-amber-600">
                  <CalendarClock className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-lg">Post Scheduler</h3>
              </div>
              <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                Plan posts with timezone support and AI suggestions for optimal posting times.
              </p>
              <div className="mt-4">
                <Link href="#scheduler" className="text-amber-600 hover:underline text-sm font-semibold">
                  Open Scheduler →
                </Link>
              </div>
            </div>

            {/* Engagement Analyzer */}
            <div id="analyzer" className="group rounded-2xl p-6 bg-white/70 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 hover:border-blue-500 transition shadow-sm hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-600/10 text-purple-600">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-lg">Engagement Analyzer</h3>
              </div>
              <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                Visualize reach, clicks, and sentiment to learn what resonates with your audience.
              </p>
              <div className="mt-4">
                <Link href="#analyzer" className="text-purple-600 hover:underline text-sm font-semibold">
                  Open Analyzer →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ===== Modal for ArchitectureFlow ===== */}
      {showFlow && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          {/* backdrop */}
          <button
            aria-label="Close overlay"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowFlow(false)}
          />
          {/* content */}
          <div className="relative w-full max-w-6xl rounded-3xl border border-gray-700/50 bg-gray-900 shadow-2xl">
            <button
              onClick={() => setShowFlow(false)}
              className="absolute right-3 top-3 inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white/10 hover:bg-white/20 text-white"
              aria-label="Close"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
            {/* animated flow inside */}
            <ArchitectureFlow />
          </div>
        </div>
      )}
    </div>
  );
}
