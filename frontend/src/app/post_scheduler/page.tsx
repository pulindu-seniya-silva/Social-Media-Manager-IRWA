"use client";

import React, { useMemo, useState } from "react";

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
  scheduledAt: string; // ISO
  status: "scheduled" | "posted" | "cancelled";
};

// -----------------------------
// Helpers (client-only mocks)
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

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatLocal(
  d: Date,
  tz: string,
  withSeconds = false,
  withWeekday = true
) {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(withWeekday ? { weekday: "short" } : {}),
  };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

function toISOInTZ(d: Date, tz: string) {
  // store as UTC ISO, but we compute using target tz
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  const isoLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  // interpret as local in tz, then treat as UTC for storage consistency
  return new Date(isoLocal).toISOString();
}

// Very light, client-only "parsing" demo (replace with real NLP later)
function parsePreferenceMock(input: string, tz: string): Date | null {
  const now = new Date();

  const lower = input.trim().toLowerCase();
  if (!lower) return null;

  const makeAt = (hour: number, minute = 0, dayOffset = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  // Examples: "tomorrow morning", "tonight 8pm", "next monday 10:00"
  if (lower.includes("tomorrow")) {
    if (lower.includes("morning")) return makeAt(9, 0, 1);
    if (lower.includes("afternoon")) return makeAt(14, 0, 1);
    if (lower.includes("evening") || lower.includes("night"))
      return makeAt(20, 0, 1);
    // "tomorrow 8pm"
    const t = lower.match(/tomorrow\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (t) {
      let h = parseInt(t[1], 10);
      let m = t[2] ? parseInt(t[2], 10) : 0;
      const ampm = t[3];
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      return makeAt(h, m, 1);
    }
    return makeAt(9, 0, 1);
  }

  if (lower.includes("tonight")) {
    // tonight defaults to 8pm
    return makeAt(20, 0, 0);
  }

  if (lower.includes("morning")) return makeAt(9);
  if (lower.includes("afternoon")) return makeAt(14);
  if (lower.includes("evening") || lower.includes("night")) return makeAt(20);

  const nextWeekday = (weekday: number) => {
    const d = new Date(now);
    const add = (weekday + 7 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + add);
    return d;
  };

  if (lower.includes("next monday")) {
    const d = nextWeekday(1);
    d.setHours(10, 0, 0, 0);
    return d;
  }

  // ISO-like "2025-08-30 18:00"
  const iso = lower.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
  if (iso) {
    const [_, y, m, day, hh, mm] = iso;
    const d = new Date();
    d.setFullYear(parseInt(y), parseInt(m) - 1, parseInt(day));
    d.setHours(parseInt(hh), parseInt(mm), 0, 0);
    return d;
  }

  return null;
}

// lightweight "best time" heuristic for demo UI (replace w/ IR+LLM later)
function suggestBestTimeMock(
  platform: Platform,
  tz: string
): { time: Date; why: string } {
  const now = new Date();
  const slots: Record<Platform, number[]> = {
    Instagram: [11, 15, 19],
    Facebook: [13, 16, 19],
    "X (Twitter)": [9, 12, 22],
    TikTok: [12, 18, 21],
    LinkedIn: [9, 12, 17],
    YouTube: [12, 18, 20],
  };

  const todayHours = slots[platform];
  const candidates: Date[] = [];
  for (let offset = 0; offset < 7; offset++) {
    for (const h of todayHours) {
      const d = new Date(now);
      d.setDate(now.getDate() + offset);
      d.setHours(h, 0, 0, 0);
      if (d > now) candidates.push(d);
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  const next = candidates[0] ?? new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const why = `Based on typical ${platform} activity patterns, ${formatLocal(
    next,
    tz
  )} should capture lunch/evening scroll time in your audience timezone.`;
  return { time: next, why };
}

// Small heatmap data (7 days × 24 hours) with a highlighted suggestion
function buildHeatmapData(highlightHour: number) {
  // values 0..3 (intensity)
  return Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => {
      let v = Math.floor(Math.random() * 3); // random base
      if (hour === highlightHour) v = 3; // highlight column
      return v;
    })
  );
}

// -----------------------------
// Page
// -----------------------------
export default function PostSchedulerPage() {
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [timezone, setTimezone] = useState<string>("Asia/Colombo");
  const [content, setContent] = useState<string>("");
  const [preference, setPreference] = useState<string>("");

  const [suggested, setSuggested] = useState<Date | null>(null);
  const [suggestReason, setSuggestReason] = useState<string>("");

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState<string>("");

  const parsedPref = useMemo(() => {
    if (!preference) return null;
    return parsePreferenceMock(preference, timezone);
  }, [preference, timezone]);

  const highlightHour = useMemo(() => {
    const hour = (suggested ?? new Date()).getHours();
    return hour;
  }, [suggested]);

  const heatmap = useMemo(
    () => buildHeatmapData(highlightHour),
    [highlightHour]
  );

  const onSuggest = () => {
    const { time, why } = suggestBestTimeMock(platform, timezone);
    setSuggested(time);
    setSuggestReason(why);
    setMessage("✨ Suggested a good posting time (demo).");
    setTimeout(() => setMessage(""), 2000);
  };

  const onSchedule = () => {
    const when = parsedPref ?? suggested;
    if (!content.trim()) {
      setMessage("Add post content (or a summary) first.");
      setTimeout(() => setMessage(""), 1800);
      return;
    }
    if (!when) {
      setMessage("Pick a time: type a preference or click Suggest.");
      setTimeout(() => setMessage(""), 2000);
      return;
    }
    const item: QueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      platform,
      timezone,
      contentPreview:
        content.length > 80 ? content.slice(0, 77) + "..." : content,
      scheduledAt: toISOInTZ(when, timezone),
      status: "scheduled",
    };
    setQueue((q) =>
      [...q, item].sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )
    );
    setMessage("✅ Added to schedule (mock).");
    setTimeout(() => setMessage(""), 1800);
    // reset "picked" state but keep content so user can tweak
    setSuggested(null);
    setPreference("");
  };

  const quickPick = (label: string, h: number, m = 0, dayOffset = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    setSuggested(d);
    setSuggestReason(`Quick pick: ${label}`);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto py-10 px-4">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                2️⃣ Post Scheduler
              </h1>
              <p className="text-slate-300 mt-2 max-w-2xl">
                Choose the best time to post, manage a queue, and prep the
                “handoff” to the Engagement Analyzer. This page is a{" "}
                <span className="font-semibold">frontend demo</span> (no backend
                yet).
              </p>
            </div>
            {message ? (
              <div className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 rounded-xl px-4 py-2 shadow-soft">
                {message}
              </div>
            ) : null}
          </div>
        </header>

        {/* Grid */}
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Left: Composer */}
          <div className="bg-slate-800/60 rounded-2xl p-6 shadow-soft backdrop-blur-sm border border-white/5">
            <h2 className="text-xl font-semibold mb-4">
              Compose & Preferences
            </h2>

            {/* Platform & TZ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Platform
                </label>
                <select
                  className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform)}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Audience Timezone
                </label>
                <select
                  className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
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
            </div>

            {/* Content */}
            <div className="mb-4">
              <label className="block text-sm text-slate-300 mb-1">
                Post Content (from Moderator) or a quick summary
              </label>
              <textarea
                className="w-full min-h-[120px] rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Paste the approved caption/content here…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">
                Tip: paste the final text approved by the Content Moderator
                agent.
              </p>
            </div>

            {/* Preferences line */}
            <div className="mb-4">
              <label className="block text-sm text-slate-300 mb-1">
                Scheduling Preference (natural language)
              </label>
              <input
                className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder='e.g., "tomorrow morning", "tonight 8pm", "2025-08-30 18:00"'
                value={preference}
                onChange={(e) => setPreference(e.target.value)}
              />
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-indigo-400" />
                  Client-side demo parsing only — replace with NLP in backend.
                </span>
              </div>
              {parsedPref && (
                <div className="mt-2 text-sm text-indigo-200">
                  Parsed time:{" "}
                  <strong>{formatLocal(parsedPref, timezone)}</strong>
                </div>
              )}
            </div>

            {/* Quick picks */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => quickPick("Now + 1h", new Date().getHours() + 1)}
                className="px-3 py-1.5 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 transition shadow-soft"
              >
                +1 hour
              </button>
              <button
                onClick={() => quickPick("Tonight 8:00 PM", 20)}
                className="px-3 py-1.5 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 transition shadow-soft"
              >
                Tonight 8:00 PM
              </button>
              <button
                onClick={() => quickPick("Tomorrow 9:00 AM", 9, 0, 1)}
                className="px-3 py-1.5 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 transition shadow-soft"
              >
                Tomorrow 9:00 AM
              </button>
              <button
                onClick={() =>
                  quickPick(
                    "Next Monday 10:00 AM",
                    10,
                    0,
                    (8 - new Date().getDay()) % 7 || 7
                  )
                }
                className="px-3 py-1.5 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 transition shadow-soft"
              >
                Next Mon 10:00 AM
              </button>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onSuggest}
                className="px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-95 transition shadow-soft"
              >
                ✨ Suggest Best Time
              </button>
              <button
                onClick={onSchedule}
                className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 transition shadow-soft"
              >
                ✅ Add to Schedule (Mock)
              </button>
            </div>

            {/* Suggested time pill */}
            {(suggested || parsedPref) && (
              <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="text-sm text-emerald-200">
                  Chosen time:{" "}
                  <strong>
                    {formatLocal((parsedPref ?? suggested) as Date, timezone)}
                  </strong>
                </div>
                {suggestReason && (
                  <p className="text-xs text-emerald-200/90 mt-1">
                    {suggestReason}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right: Insights + Queue */}
          <div className="space-y-6">
            {/* Heatmap Card */}
            <div className="bg-slate-800/60 rounded-2xl p-6 shadow-soft backdrop-blur-sm border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold">
                  Weekly Engagement Heatmap (demo)
                </h2>
                <span className="text-xs text-slate-400">
                  Highlighted column ≈ suggested hour
                </span>
              </div>

              <div className="overflow-x-auto">
                <div className="grid grid-cols-[auto_1fr] gap-3">
                  {/* Y axis labels */}
                  <div className="grid grid-rows-7 gap-1 text-right pr-2">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (d) => (
                        <div
                          key={d}
                          className="text-xs text-slate-400 h-6 flex items-center justify-end"
                        >
                          {d}
                        </div>
                      )
                    )}
                  </div>

                  {/* Heatmap grid */}
                  <div className="grid grid-rows-7 gap-1">
                    {heatmap.map((row, i) => (
                      <div key={i} className="grid grid-cols-24 gap-1">
                        {row.map((v, j) => (
                          <div
                            key={j}
                            className={[
                              "h-6 rounded",
                              v === 0 && "bg-slate-700/60",
                              v === 1 && "bg-indigo-800/60",
                              v === 2 && "bg-indigo-700",
                              v === 3 && "bg-indigo-500",
                            ].join(" ")}
                            title={`${pad(j)}:00`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-400">
                This is a visual placeholder. In the backend, compute real heat
                values from historical engagement (IR) and annotate with LLM
                reasoning.
              </div>
            </div>

            {/* Queue */}
            <div className="bg-slate-800/60 rounded-2xl p-6 shadow-soft backdrop-blur-sm border border-white/5">
              <h2 className="text-xl font-semibold mb-4">
                Scheduled Queue (mock)
              </h2>

              {queue.length === 0 ? (
                <div className="text-slate-400 text-sm">
                  No items yet. Add one from the left panel.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-slate-300">
                      <tr className="text-left border-b border-white/10">
                        <th className="py-2 pr-3">When (local)</th>
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
                              <span
                                className={`px-2 py-1 rounded-lg text-xs ${
                                  q.status === "scheduled"
                                    ? "bg-amber-500/20 text-amber-200"
                                    : q.status === "posted"
                                    ? "bg-emerald-500/20 text-emerald-200"
                                    : "bg-rose-500/20 text-rose-200"
                                }`}
                              >
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

              <div className="text-xs text-slate-400 mt-3">
                Backend idea: store this queue in DB; a worker posts at the time
                and then sends payload to the Engagement Analyzer agent.
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
