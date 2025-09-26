"use client";

import React, { useState } from "react";

// -----------------------------
// Types
// -----------------------------
type Platform =
  | "Instagram"
  | "Facebook"
  | "X (Twitter)"
  | "TikTok"
  | "LinkedIn"
  | "YouTube";

type QueueItem = {
  id: string;
  platform: Platform;
  timezone: string;
  contentPreview: string;
  scheduledAt: string; // ISO UTC
  status: "scheduled" | "posted" | "cancelled";
};

interface Slot {
  weekday: number; // 0=Mon..6=Sun
  hour_24: number;
  score: number;
}

interface SuggestResponse {
  best_iso_utc: string;
  best_local_pretty: string;
  platform: Platform;
  content_type: string;
  top_slots: Slot[];
  heatmap: number[][]; // 7x24
  reason?: string | null;
}

// -----------------------------
// API helpers
// -----------------------------
const BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

async function suggestBestTime(
  payload: {
    platform: Platform;
    content_type: string;
    timezone: string;
    days_ahead?: number;
    strategy?: "heuristic" | "llm";
  }
): Promise<SuggestResponse> {
  const res = await fetch(`${BASE}/post-scheduler/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Suggestion failed");
  return data as SuggestResponse;
}

// -----------------------------
// Small Heatmap component
// -----------------------------
function Heatmap({
  heatmap,
  highlight,
}: {
  heatmap: number[][];
  highlight?: { weekday: number; hour_24: number } | null;
}) {
  const WEEKS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-[auto_1fr] gap-3">
        {/* Labels */}
        <div className="grid grid-rows-7 gap-1 text-right pr-2">
          {WEEKS.map((d) => (
            <div
              key={d}
              className="text-xs text-slate-400 h-6 flex items-center justify-end"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Heat cells */}
        <div className="grid grid-rows-7 gap-1">
          {heatmap.map((row, wi) => (
            <div key={wi} className="grid grid-cols-24 gap-1">
              {row.map((v, h) => {
                const isHi =
                  highlight &&
                  highlight.weekday === wi &&
                  highlight.hour_24 === h;
                const bucket =
                  v >= 0.75 ? 3 : v >= 0.5 ? 2 : v >= 0.25 ? 1 : 0;
                const base =
                  bucket === 0
                    ? "bg-slate-700/60"
                    : bucket === 1
                    ? "bg-indigo-800/60"
                    : bucket === 2
                    ? "bg-indigo-700"
                    : "bg-indigo-500";
                const ring = isHi
                  ? " ring-2 ring-emerald-400 ring-offset-0"
                  : "";
                return (
                  <div
                    key={h}
                    className={`h-6 rounded ${base}${ring}`}
                    title={`${WEEKS[wi]} ${h
                      .toString()
                      .padStart(2, "0")}:00  (score ${v.toFixed(2)})`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// -----------------------------
// Page
// -----------------------------
const TZ_OPTIONS = [
  { id: "Asia/Colombo", label: "Asia/Colombo (UTC+5:30)" },
  { id: "Asia/Kolkata", label: "Asia/Kolkata (UTC+5:30)" },
  { id: "Asia/Singapore", label: "Asia/Singapore (UTC+8)" },
  { id: "Europe/London", label: "Europe/London (UTC±0)" },
  { id: "America/New_York", label: "America/New_York (UTC-5)" },
  { id: "America/Los_Angeles", label: "America/Los_Angeles (UTC-8)" },
];

const PLATFORMS: Platform[] = [
  "Instagram",
  "Facebook",
  "X (Twitter)",
  "TikTok",
  "LinkedIn",
  "YouTube",
];

const CONTENT_TYPES = [
  "text",
  "photo",
  "video",
  "reel",
  "short",
  "link",
  "carousel",
  "story",
  "any",
];

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
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

export default function PostSchedulerPage() {
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [contentType, setContentType] = useState<string>("reel");
  const [timezone, setTimezone] = useState<string>("Asia/Colombo");
  const [content, setContent] = useState<string>("");

  const [message, setMessage] = useState<string>("");
  const [queue, setQueue] = useState<QueueItem[]>([]);

  // from backend
  const [bestISO, setBestISO] = useState<string | null>(null);
  const [bestPretty, setBestPretty] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [heatmap, setHeatmap] = useState<number[][] | null>(null);
  const [highlight, setHighlight] = useState<{
    weekday: number;
    hour_24: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const onSuggest = async (useLLM = true) => {
    setLoading(true);
    setMessage("Analyzing…");
    try {
      const data = await suggestBestTime({
        platform,
        content_type: contentType,
        timezone,
        strategy: useLLM ? "llm" : "heuristic",
      });
      setBestISO(data.best_iso_utc);
      setBestPretty(data.best_local_pretty);
      setReason(data.reason ?? null);
      setHeatmap(data.heatmap);

      const dt = new Date(data.best_iso_utc);
      const local = new Date(
        dt.toLocaleString("en-US", { timeZone: timezone })
      );
      setHighlight({
        weekday: (local.getDay() + 6) % 7, // convert Sun=0 to Mon=0
        hour_24: local.getHours(),
      });

      setMessage("✨ Suggested");
    } catch (e: unknown) {
      setMessage(
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message?: string }).message)
          : "Failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const onSchedule = () => {
    if (!content.trim()) {
      setMessage("Add content first.");
      return;
    }
    if (!bestISO) {
      setMessage("Click Suggest first.");
      return;
    }
    const item: QueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      platform,
      timezone,
      contentPreview:
        content.length > 80 ? content.slice(0, 77) + "…" : content,
      scheduledAt: bestISO,
      status: "scheduled",
    };
    setQueue((q) =>
      [...q].concat(item).sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() -
          new Date(b.scheduledAt).getTime()
      )
    );
    setMessage("✅ Added to schedule.");
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto py-10 px-4">
        <header className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                ⏲️ Post Scheduler
              </h1>
              <p className="text-slate-300 mt-2 max-w-2xl">
                Choose the best time to post, manage a queue, and prep the
                “handoff” to the Engagement Analyzer.
              </p>
            </div>
            {message && (
              <div className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 rounded-xl px-4 py-2 shadow-soft">
                {message}
              </div>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Left */}
          <div className="bg-slate-800/60 rounded-2xl p-6 shadow-soft backdrop-blur-sm border border-white/5">
            <h2 className="text-xl font-semibold mb-4">
              Compose & Preferences
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Platform
                </label>
                <select
                  className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform)}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Timezone
                </label>
                <select
                  className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {TZ_OPTIONS.map((tz) => (
                    <option key={tz.id} value={tz.id}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Content Type
                </label>
                <select
                  className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                >
                  {CONTENT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-slate-300 mb-1">
                Post Content
              </label>
              <textarea
                className="w-full min-h-[120px] rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2"
                placeholder="Paste the approved caption/content here…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => onSuggest(true)}
                disabled={loading}
                className="px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-95 disabled:opacity-50"
              >
                {loading ? "Analyzing…" : "✨ Suggest Best Time"}
              </button>
              <button
                onClick={onSchedule}
                className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500"
              >
                ✅ Add to Queue
              </button>
            </div>

            {bestISO && (
              <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="text-sm text-emerald-200">
                  Chosen time: <strong>{bestPretty}</strong>
                </div>
                {reason && (
                  <p className="text-xs text-emerald-200/90 mt-1">{reason}</p>
                )}
              </div>
            )}
          </div>

          {/* Right */}
          <div className="space-y-6">
            {/* Heatmap */}
            <div className="bg-slate-800/60 rounded-2xl p-6 shadow-soft border border-white/5">
              <h2 className="text-xl font-semibold mb-3">
                Weekly Engagement Heatmap
              </h2>
              {heatmap ? (
                <Heatmap heatmap={heatmap} highlight={highlight} />
              ) : (
                <div className="text-slate-400 text-sm">
                  No data yet. Click Suggest to load heatmap.
                </div>
              )}
            </div>

            {/* Queue */}
            <div className="bg-slate-800/60 rounded-2xl p-6 shadow-soft border border-white/5">
              <h2 className="text-xl font-semibold mb-4">Scheduled Queue</h2>
              {queue.length === 0 ? (
                <div className="text-slate-400 text-sm">No items yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-slate-300">
                      <tr className="text-left border-b border-white/10">
                        <th className="py-2 pr-3">When</th>
                        <th className="py-2 pr-3">Platform</th>
                        <th className="py-2 pr-3">Content</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.map((q) => {
                        const dt = new Date(q.scheduledAt);
                        return (
                          <tr key={q.id} className="border-b border-white/5">
                            <td className="py-2 pr-3 text-slate-200">
                              {formatLocal(dt, q.timezone)}
                              <div className="text-[10px] text-slate-400">
                                {q.timezone}
                              </div>
                            </td>
                            <td className="py-2 pr-3">{q.platform}</td>
                            <td className="py-2 pr-3 text-slate-300">
                              {q.contentPreview}
                            </td>
                            <td className="py-2 pr-3">
                              <span className="px-2 py-1 rounded-lg text-xs bg-amber-500/20 text-amber-200">
                                {q.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
