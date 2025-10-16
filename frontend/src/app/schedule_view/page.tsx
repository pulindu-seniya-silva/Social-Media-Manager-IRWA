"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Suspense } from 'react';

// --- Types ---
type Platform = "Instagram" | "Facebook" | "X (Twitter)" | "TikTok" | "LinkedIn" | "YouTube";
type ScheduledItem = {
  id: string;
  platform: Platform;
  content: string;
  scheduledAt: string; // ISO string
  timezone: string;
};

function formatLocal(d: Date, tz: string) {
    const opts: Intl.DateTimeFormatOptions = {
        timeZone: tz,
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        year: "numeric",
        month: "short",
        day: "2-digit",
        weekday: "short",
    };
    return new Intl.DateTimeFormat("en-US", opts).format(d);
}

function ScheduleView() {
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledItem[]>([]);

  useEffect(() => {
    // On component mount, load the scheduled posts from session storage
    const storedPosts = sessionStorage.getItem('mockScheduledPosts');
    if (storedPosts) {
      setScheduledPosts(JSON.parse(storedPosts));
    }
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <div className="max-w-4xl mx-auto py-10 px-4">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">🗓️ Scheduled Posts (Mock)</h1>
          <p className="text-slate-300 mt-2">
            This is a list of posts scheduled during your current session. This data will be cleared if you close the browser tab.
          </p>
        </header>

        <div className="bg-slate-800/60 rounded-2xl p-6 shadow-soft border border-white/5">
          {scheduledPosts.length === 0 ? (
            <p className="text-slate-400">No posts have been scheduled yet.</p>
          ) : (
            <div className="space-y-4">
              {scheduledPosts.map((post) => (
                <div key={post.id} className="border-b border-white/10 pb-4 last:border-b-0">
                  <div className="flex justify-between items-center">
                    <span className="px-2 py-1 text-xs rounded-full bg-indigo-500/20 text-indigo-200">
                      {post.platform}
                    </span>
                    <span className="text-sm font-semibold text-emerald-300">
                      {formatLocal(new Date(post.scheduledAt), post.timezone)}
                    </span>
                  </div>
                  <p className="mt-3 text-slate-200 whitespace-pre-wrap">{post.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <Link href="/post_scheduler" className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white inline-block">
            ← Back to Scheduler
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ScheduleViewPage() {
    return (
        <Suspense fallback={<div>Loading Schedule...</div>}>
            <ScheduleView />
        </Suspense>
    )
}