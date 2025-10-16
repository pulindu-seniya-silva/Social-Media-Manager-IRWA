"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Suspense } from 'react';

// --- Types ---
type Platform = "Instagram" | "Facebook" | "X (Twitter)" | "TikTok" | "LinkedIn" | "YouTube";
type Job = { id: string; platform: string; content: string; schedule_at_iso: string; status: string; result?: string };

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string>("");

  function formatLocalPretty(iso?: string) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }

  function toLocalInputValue(iso?: string) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const mi = pad(d.getMinutes());
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    } catch {
      return "";
    }
  }

  async function loadJobs() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/post-scheduler/jobs`, { cache: 'no-store' });
      const data = await res.json();
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e) {
      setMessage('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadJobs(); }, []);

  async function reschedule(jobId: string, newIso: string) {
    if (!newIso) return;
    try {
      const res = await fetch(`${API}/post-scheduler/jobs/${jobId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schedule_at_iso: newIso }) });
      if (!res.ok) throw new Error(await res.text());
      setMessage('Updated schedule');
      loadJobs();
    } catch (e) {
      setMessage('Failed to update');
    }
  }

  async function cancel(jobId: string) {
    try {
      const res = await fetch(`${API}/post-scheduler/jobs/${jobId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      setMessage('Cancelled');
      loadJobs();
    } catch (e) {
      setMessage('Failed to cancel');
    }
  }

  function copy(job: Job) {
    navigator.clipboard.writeText(job.content || "");
    setCopiedId(job.id);
    setTimeout(() => setCopiedId(""), 1500);
  }

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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Scheduled Jobs</h2>
            <div className="flex items-center gap-2">
              <Link href="/post_scheduler" className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm">Open Scheduler</Link>
              <button onClick={loadJobs} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm">Refresh</button>
            </div>
          </div>
          {message && <div className="mb-3 text-sm text-emerald-300">{message}</div>}
          {loading ? (
            <p className="text-slate-400">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="text-slate-400">No scheduled jobs.</p>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <div key={job.id} className="border-b border-white/10 pb-4 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 text-xs rounded-full bg-indigo-500/20 text-indigo-200 capitalize">{job.platform}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-700/60">{job.status}</span>
                    </div>
                    <span className="text-sm font-semibold text-emerald-300" title={job.schedule_at_iso}>{formatLocalPretty(job.schedule_at_iso)}</span>
                  </div>
                  <p className="mt-3 text-slate-200 whitespace-pre-wrap">{job.content}</p>
                  {job.result && (
                    <div className="mt-2 text-xs text-slate-300">Result: {job.result}</div>
                  )}
                  {job.status === 'scheduled' && (
                    <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                      <input defaultValue={toLocalInputValue(job.schedule_at_iso)} type="datetime-local" className="rounded bg-slate-900/60 border border-white/10 px-3 py-2 text-sm" />
                      <button onClick={(e) => {
                        const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                        const v = input?.value; // local datetime (no timezone)
                        if (v) {
                          // Convert local "YYYY-MM-DDTHH:mm" to UTC ISO string
                          const iso = new Date(v).toISOString();
                          reschedule(job.id, iso);
                        }
                      }} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Update Time</button>
                      <button onClick={() => cancel(job.id)} className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-sm">Cancel</button>
                      <button onClick={() => copy(job)} className="px-3 py-1 rounded bg-slate-600 hover:bg-slate-500 text-white text-sm">{copiedId === job.id ? 'Copied!' : 'Copy Content'}</button>
                      <Link href={`/post_scheduler?${new URLSearchParams({ caption: job.content || '', platform: (job.platform || 'LinkedIn') }).toString()}`} className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm">Open in Scheduler</Link>
                    </div>
                  )}
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