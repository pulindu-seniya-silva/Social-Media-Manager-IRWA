"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

// --- Types ---
type Platform = "Instagram" | "Facebook" | "X (Twitter)" | "TikTok" | "LinkedIn" | "YouTube";
interface FoundPostSummary { snippet: string; time_ago: string; predicted_engagement_score: number; justification: string; }
interface ReasonPoint { icon: string; title: string; text: string; }
interface StructuredReason { headline: string; points: ReasonPoint[]; }

interface SuggestResponse {
  best_iso_utc: string;
  best_local_pretty: string;
  platform: Platform;
  heatmap: number[][];
  data_source_explanation: string;
  reason?: StructuredReason | null;
  found_posts?: FoundPostSummary[] | null;
}
type ScheduledItem = { id: string; platform: Platform; content: string; scheduledAt: string; timezone: string; };

// --- FIX: Add specific request and response types ---
interface SuggestRequest {
  platform: string;
  content_type: string;
  content: string;
  timezone: string;
  strategy: string;
}
interface ScheduleRequest {
  content: string;
  platform: string;
  schedule_at_iso: string;
}
interface ScheduleResponse {
  status: string;
  message: string;
  scheduled_at?: string | null;
}


// --- API Helpers ---
const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

async function suggestBestTime(payload: SuggestRequest): Promise<SuggestResponse> {
  const res = await fetch(`${BASE}/post-scheduler/suggest`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text() || "Suggestion failed");
  return await res.json();
}

// --- FIX: Use the specific ScheduleResponse type instead of 'any' ---
async function schedulePost(payload: ScheduleRequest): Promise<ScheduleResponse> {
  const res = await fetch(`${BASE}/post-scheduler/schedule`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Scheduling failed");
  return data;
}

// --- Components ---
function Heatmap({ heatmap, highlight }: { heatmap: number[][]; highlight?: { weekday: number; hour_24: number } | null }) {
    const WEEKS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return (
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <div className="grid grid-rows-7 gap-1 text-right pr-2">{WEEKS.map((d) => <div key={d} className="text-xs text-slate-400 h-6 flex items-center justify-end">{d}</div>)}</div>
          <div className="grid grid-rows-7 gap-1">
            {heatmap.map((row, wi) => (
              <div key={wi} className="grid grid-cols-24 gap-1">
                {row.map((v, h) => {
                  const isHi = highlight?.weekday === wi && highlight?.hour_24 === h;
                  const bucket = v >= 0.75 ? 3 : v >= 0.5 ? 2 : v >= 0.25 ? 1 : 0;
                  const base = ["bg-slate-700/60", "bg-indigo-800/60", "bg-indigo-700", "bg-indigo-500"][bucket];
                  const ring = isHi ? " ring-2 ring-emerald-400 ring-offset-0" : "";
                  return <div key={h} className={`h-6 rounded ${base}${ring}`} title={`${WEEKS[wi]} ${h.toString().padStart(2, "0")}:00 (score ${v.toFixed(2)})`} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
}

const TZ_OPTIONS = [ { id: "Asia/Colombo", label: "Asia/Colombo (UTC+5:30)" }, { id: "Asia/Kolkata", label: "Asia/Kolkata (UTC+5:30)" }, { id: "Europe/London", label: "Europe/London (UTC±0)" }, { id: "America/New_York", label: "America/New_York (UTC-5)" }, ];
const PLATFORMS: Platform[] = [ "Instagram", "Facebook", "X (Twitter)", "TikTok", "LinkedIn", "YouTube" ];
const CONTENT_TYPES = [ "text", "photo", "video", "reel", "short", "link", "carousel", "story", "any" ];
const LOADING_MESSAGES = [ "Analyzing content...", "Searching for similar posts...", "Checking local trends...", "Expanding search...", "Finalizing with AI analysis...", ];

function SchedulerBody() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("LinkedIn");
  const [contentType, setContentType] = useState<string>("text");
  const [timezone, setTimezone] = useState<string>("Asia/Colombo");
  const [content, setContent] = useState<string>("");
  const [hashtags, setHashtags] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [bestISO, setBestISO] = useState<string | null>(null);
  const [bestPretty, setBestPretty] = useState<string | null>(null);
  const [suggestedTime, setSuggestedTime] = useState<string>("");
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [heatmap, setHeatmap] = useState<number[][] | null>(null);
  const [highlight, setHighlight] = useState<{ weekday: number; hour_24: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [dataSourceExplanation, setDataSourceExplanation] = useState<string | null>(null);
  const [reason, setReason] = useState<StructuredReason | null>(null);
  const [foundPosts, setFoundPosts] = useState<FoundPostSummary[] | null>(null);
  const [moderationSignals, setModerationSignals] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (loading) {
      setMessage(LOADING_MESSAGES[0]);
      let i = 1;
      const interval = setInterval(() => { setMessage(LOADING_MESSAGES[i % LOADING_MESSAGES.length]); i++; }, 4000);
      return () => clearInterval(interval);
    }
  }, [loading]);

  useEffect(() => {
    const caption = searchParams.get("caption");
    const tags = searchParams.get("hashtags");
    const plat = searchParams.get("platform");
    const signals = searchParams.get("moderation_signals");

    if (caption) setContent(caption);
    if (tags) setHashtags(tags);
    if (plat && PLATFORMS.includes(plat as Platform)) setPlatform(plat as Platform);
    if (signals) { try { setModerationSignals(JSON.parse(signals)); } catch {} }
  }, [searchParams]);

  const onSuggest = async (useLLM = true) => {
    setLoading(true); setFoundPosts(null);
    try {
      const fullContent = `${content} ${hashtags.split(",").map(t => `#${t.trim()}`).join(" ")}`.trim();
      const data = await suggestBestTime({ platform, content_type: contentType, timezone, content: fullContent, strategy: useLLM ? "llm" : "heuristic" });
      setBestISO(data.best_iso_utc);
      setBestPretty(data.best_local_pretty);
      setSuggestedTime(data.best_iso_utc);
      setShowTimeInput(true);
      setReason(data.reason ?? null);
      setHeatmap(data.heatmap);
      setDataSourceExplanation(data.data_source_explanation);
      setFoundPosts(data.found_posts ?? null);
      const dt = new Date(data.best_iso_utc);
      const local = new Date(dt.toLocaleString("en-US", { timeZone: timezone }));
      setHighlight({ weekday: (local.getDay() + 6) % 7, hour_24: local.getHours() });
      setMessage("✨ Suggested");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const onSchedule = async () => {
    const fullContent = `${content} ${hashtags.split(",").map(t => `#${t.trim()}`).join(" ")}`.trim();
    if (!fullContent) { setMessage("Cannot schedule empty content."); return; }
    if (!suggestedTime) { setMessage("Please suggest a time first to schedule."); return; }

    setIsScheduling(true);
    setMessage(`Scheduling for ${platform} (Demonstration)...`);
    try {
      const result = await schedulePost({
        content: fullContent,
        platform: platform,
        schedule_at_iso: suggestedTime,
      });

      const newItem: ScheduledItem = { id: `${Date.now()}`, platform, content: fullContent, scheduledAt: suggestedTime, timezone };
      const existingPostsRaw = sessionStorage.getItem('mockScheduledPosts');
      const existingPosts = existingPostsRaw ? JSON.parse(existingPostsRaw) : [];
      const updatedPosts = [...existingPosts, newItem].sort((a,b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
      sessionStorage.setItem('mockScheduledPosts', JSON.stringify(updatedPosts));
      setMessage(result.message || "Scheduled successfully!");
      router.push('/schedule_view');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to schedule.");
    } finally {
      setIsScheduling(false);
    }
  };

  function formatSuggestedTime(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }

  function toLocalInputValue(iso: string) {
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto py-10 px-4">
        <header className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">⏲️ Post Scheduler</h1>
              <p className="text-slate-300 mt-2 max-w-2xl">Find the optimal time and schedule your post.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/schedule_view" className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">View Scheduled</Link>
              {message && <div className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 rounded-xl px-4 py-2">{message}</div>}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-slate-800/60 rounded-2xl p-6 shadow-soft backdrop-blur-sm border border-white/5">
            <h2 className="text-xl font-semibold mb-4">Compose & Preferences</h2>

            {moderationSignals && (
              <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <div className="flex items-center gap-3">
                  <div className="text-lg">🛡️</div>
                  <div>
                    <div className="font-semibold text-emerald-200">Moderation Passed</div>
                    <div className="text-xs text-slate-300">Toxicity: {((moderationSignals.toxicity || 0) * 100).toFixed(0)}% &middot; Polarity: {((moderationSignals.polarity || 0) * 100).toFixed(0)}%</div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div><label className="block text-sm text-slate-300 mb-1">Platform</label><select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2">{PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
              <div><label className="block text-sm text-slate-300 mb-1">Timezone</label><select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2">{TZ_OPTIONS.map((tz) => <option key={tz.id} value={tz.id}>{tz.label}</option>)}</select></div>
              <div><label className="block text-sm text-slate-300 mb-1">Content Type</label><select value={contentType} onChange={(e) => setContentType(e.target.value)} className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2">{CONTENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            </div>
            <div className="mb-4"><label className="block text-sm text-slate-300 mb-1">Post Caption</label><textarea value={content} onChange={(e) => setContent(e.target.value)} className="w-full min-h-[120px] rounded-xl bg-slate-900/60 border border-white/10 p-3" placeholder="Paste your caption..." /></div>
            <div className="mb-4"><label className="block text-sm text-slate-300 mb-1">Hashtags</label><input value={hashtags} onChange={(e) => setHashtags(e.target.value)} className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2" placeholder="discovery, socialmedia, marketing" /></div>
            
            <div className="flex flex-wrap gap-3">
              <button onClick={() => onSuggest(true)} disabled={loading || isScheduling} className="px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-95 disabled:opacity-50">{loading ? "Analyzing…" : "✨ Suggest Best Time"}</button>
              <button 
                onClick={onSchedule}
                disabled={loading || isScheduling || !suggestedTime}
                title={!suggestedTime ? "Suggest a time first" : `Schedule this post for ${platform}`}
                className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {isScheduling ? "Scheduling..." : `✅ Schedule Post`}
              </button>
            </div>

            {suggestedTime && (
              <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm text-emerald-200">AI Suggested Time:</div>
                    <div className="text-lg font-semibold text-emerald-100">{formatSuggestedTime(suggestedTime)}</div>
                  </div>
                  <button 
                    onClick={() => setShowTimeInput(!showTimeInput)}
                    className="px-3 py-1 rounded bg-slate-600 hover:bg-slate-500 text-white text-sm"
                  >
                    {showTimeInput ? "Hide" : "Change Time"}
                  </button>
                </div>
                
                {showTimeInput && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-emerald-200 mb-1">Custom Schedule Time</label>
                      <input 
                        type="datetime-local" 
                        defaultValue={toLocalInputValue(suggestedTime)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v) {
                            const newIso = new Date(v).toISOString();
                            setSuggestedTime(newIso);
                          }
                        }}
                        className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2"
                      />
                    </div>
                    <div className="text-xs text-emerald-200/80">
                      Current: {formatSuggestedTime(suggestedTime)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {bestISO && reason && (
                <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="text-sm text-emerald-200">Chosen time: <strong>{bestPretty}</strong></div>
                  <div className="mt-3 pt-3 border-t border-emerald-500/20">
                    <h4 className="font-semibold text-emerald-200 text-sm mb-2">{reason.headline}</h4>
                    <div className="space-y-2">{reason.points.map((point, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <div className="text-lg mt-0.5">{point.icon}</div>
                        <div>
                          <p className="font-medium text-xs text-emerald-200/95">{point.title}</p>
                          <p className="text-xs text-emerald-200/80">{point.text}</p>
                        </div>
                      </div>))}
                    </div>
                  </div>
                </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-slate-800/60 rounded-2xl p-6 shadow-soft border border-white/5">
              <h2 className="text-xl font-semibold mb-3">Weekly Engagement Heatmap</h2>
              {heatmap ? (<><Heatmap heatmap={heatmap} highlight={highlight} />{dataSourceExplanation && <div className="mt-4 pt-4 border-t border-white/10"><p className="text-sm text-slate-400"><strong>How was this generated?</strong><br/>{dataSourceExplanation}</p></div>}</>) : <div className="text-slate-400 text-sm">No data yet. Click Suggest to load.</div>}
            </div>
            {foundPosts && foundPosts.length > 0 && (
              <div className="bg-slate-800/60 rounded-2xl p-6 shadow-soft border border-white/5">
                <h2 className="text-xl font-semibold mb-4">Evidence from Similar Posts</h2>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {foundPosts.map((post, index) => (
                    <div key={index} className="border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
                      <p className="text-slate-200 text-sm">{'"'}{post.snippet}{'"'}</p>
                      <div className="text-xs text-slate-400 mt-2">Posted ~{post.time_ago}</div>
                      <div className="mt-2 flex items-center gap-3 bg-slate-900/50 rounded-lg p-2">
                        <div className="font-bold text-emerald-400 text-lg">{post.predicted_engagement_score}<span className="text-xs font-normal">/100</span></div>
                        <div className="text-xs text-slate-300 border-l border-white/10 pl-3"><strong>Justification:</strong> {post.justification}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function PostSchedulerPage() {
    return (
        <Suspense fallback={<div>Loading Page...</div>}>
            <SchedulerBody />
        </Suspense>
    )
}