"use client";

import React, { useState, useMemo, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

// -----------------------------
// Types
// -----------------------------
type Decision = {
  status: "approved" | "rejected";
  reason?: string | null;
  cleaned_caption?: string | null;
  signals?: Record<string, number> | null;
  explanations?: string[] | null;
};

type CreatorDraft = {
  caption?: string;
  hashtags?: string; // CSV from creator page
  platform?: string; // "instagram" | "twitter" | "x" | "linkedin" | "tiktok" | "facebook"
};

// -----------------------------
// Config
// -----------------------------
const API = process.env.NEXT_PUBLIC_API_BASE; // e.g. http://127.0.0.1:8000
const SCHEDULER_PATH = "/scheduler";
const CREATOR_PATH = "/content_creator";

function SignalBar({ label, value }: { label: string; value: number }) {
  const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
  const pct = Math.round(clamp(value, 0, 1) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-200/80">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-700/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-pink-400 to-fuchsia-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Suspense wrapper for useSearchParams() */
export default function ContentModeratorPage() {
  return (
    <Suspense fallback={null}>
      <ContentModeratorBody />
    </Suspense>
  );
}

function ContentModeratorBody() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [policy, setPolicy] = useState("standard_safe");
  const [autoForward, setAutoForward] = useState(true);

  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = caption.trim().length > 0;

  const POLICY_OPTIONS = useMemo(
    () => [
      { value: "standard_safe", label: "Standard – Safe & Inclusive" },
      { value: "edgy_marketing", label: "Edgy – Challenger Marketing" },
      { value: "professional_brand", label: "Professional – Corporate" },
    ],
    []
  );

  const samples = useMemo(
    () => ({
      safe: "Celebrating organic farming 🌱 Fresh, local, and kind to the planet!",
      borderline: "Not a fan of this update, but let's try to improve it together.",
      risky: "This is unacceptable. Report it and remove now.",
    }),
    []
  );

  const review = useCallback(async () => {
    setError(null);
    setDecision(null);

    if (!API) {
      setError(
        'API not available. Set NEXT_PUBLIC_API_BASE (e.g., "http://127.0.0.1:8000") in .env.local and restart dev server.'
      );
      return;
    }

    const tags = hashtags
      .split(",")
      .map((h) => h.trim())
      .filter((h) => !!h);

    const payload = {
      caption,
      hashtags: tags,
      platform: platform.toLowerCase(),
      policy,
      creator_request_id:
        (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
    };

    setLoading(true);
    try {
      const path = autoForward ? "/moderator/review_and_forward" : "/moderator/review";
      const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed with ${res.status}`);
      }

      const data = (await res.json()) as Decision;

      setDecision({
        status: data.status,
        reason: data.reason ?? null,
        cleaned_caption: data.cleaned_caption ?? caption,
        signals: data.signals ?? null,
        explanations: data.explanations ?? null,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error while moderating.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [API, autoForward, caption, hashtags, platform, policy]);

  // ✅ Auto-paste only (no auto-run)
  useEffect(() => {
    const allowed = new Set(["instagram", "twitter", "x", "linkedin", "tiktok", "facebook"]);

    const qCaption = searchParams.get("caption") ?? "";
    const qHashtags = searchParams.get("hashtags") ?? "";
    const qPlatformRaw = (searchParams.get("platform") ?? "").toLowerCase();

    const hasQueryPayload =
      (qCaption && qCaption.trim().length > 0) || (qHashtags && qHashtags.trim().length > 0);

    if (hasQueryPayload) {
      setCaption(qCaption);
      setHashtags(qHashtags);
      if (allowed.has(qPlatformRaw)) {
        // normalize "x" -> "twitter" to match <select> option
        setPlatform(qPlatformRaw === "x" ? "twitter" : qPlatformRaw);
      }
      return;
    }

    try {
      const raw = sessionStorage.getItem("creator_draft");
      if (!raw) return;
      const draft = JSON.parse(raw) as CreatorDraft | null;
      sessionStorage.removeItem("creator_draft");
      if (!draft) return;

      if (draft.caption) setCaption(draft.caption);
      if (typeof draft.hashtags === "string") setHashtags(draft.hashtags);
      if (draft.platform) {
        const p = draft.platform.toLowerCase();
        if (allowed.has(p)) setPlatform(p === "x" ? "twitter" : p);
      }
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-[#1b0f3a] via-[#0f0a2a] to-[#070513] text-slate-100">
      <header className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight break-words text-white">
            🛡️ Content Moderator <span className="opacity-70">/ LLM Review</span>
          </h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Left: form */}
        <section className="rounded-2xl p-4 sm:p-6 border border-slate-700/40 shadow-xl bg-[#0f1430]/80">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-white">Review Draft</h2>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                className="accent-fuchsia-500"
                checked={autoForward}
                onChange={(e) => setAutoForward(e.target.checked)}
              />
              <span className="whitespace-nowrap">Auto-forward to Scheduler on approval</span>
            </label>
          </div>

          {error && (
            <div className="mb-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              <div className="font-semibold">Error</div>
              <div className="opacity-90 break-words">{error}</div>
            </div>
          )}

          <div className="space-y-3">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              placeholder="Paste caption from Content Creator Agent…"
              className="w-full rounded-xl border border-slate-700/40 bg-slate-900/60 p-3 outline-none focus:ring-2 focus:ring-pink-500 placeholder:text-slate-400"
            />
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="Hashtags (comma separated)"
              className="w-full rounded-xl border border-slate-700/40 bg-slate-900/60 p-3 outline-none focus:ring-2 focus:ring-pink-500 placeholder:text-slate-400"
            />

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full sm:w-auto rounded-xl border border-slate-700/40 bg-slate-100 text-slate-900 p-2 outline-none"
              >
                <option value="instagram">Instagram</option>
                <option value="twitter">Twitter/X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="tiktok">TikTok</option>
                <option value="facebook">Facebook</option>
              </select>

              <select
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
                className="w-full sm:w-auto rounded-xl border border-slate-700/40 bg-slate-100 text-slate-900 p-2 outline-none"
                title="Company policy profile"
              >
                {POLICY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>

              <div className="sm:ml-auto flex flex-wrap gap-2 text-xs">
                <button
                  onClick={() => setCaption(samples.safe)}
                  className="px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25"
                >
                  Load Safe
                </button>
                <button
                  onClick={() => setCaption(samples.borderline)}
                  className="px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-100 hover:bg-amber-500/25"
                >
                  Load Borderline
                </button>
                <button
                  onClick={() => setCaption(samples.risky)}
                  className="px-3 py-1 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-100 hover:bg-rose-500/25"
                >
                  Load Risky
                </button>
              </div>
            </div>

            <button
              disabled={!canSubmit || loading}
              onClick={review}
              className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white hover:from-fuchsia-400 hover:to-pink-400 disabled:opacity-50"
            >
              {loading ? "Reviewing…" : "Moderate"}
            </button>
          </div>
        </section>

        {/* Right: result */}
        <section className="rounded-2xl p-4 sm:p-6 border border-slate-700/40 shadow-xl bg-[#0f1430]/80">
          <h2 className="text-base sm:text-lg font-semibold mb-4 text-white">Decision</h2>

          {!decision ? (
            <div className="text-slate-200/80">Submit a caption to see status, reasons, and signals here.</div>
          ) : (
            <div className="space-y-4">
              <div
                className={`rounded-xl p-4 border ${
                  decision.status === "approved"
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-rose-500/10 border-rose-500/30"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="text-sm">
                    <div className="uppercase tracking-wide text-slate-200/70">Status</div>
                    <div className="text-xl font-bold break-words text-white">{decision.status}</div>
                  </div>
                  {decision.reason && (
                    <div className="text-sm sm:max-w-xs sm:text-right">
                      <div className="uppercase tracking-wide text-slate-200/70">Reason</div>
                      <div className="break-words text-slate-100">{decision.reason}</div>
                    </div>
                  )}
                </div>
              </div>

              {decision.cleaned_caption && (
                <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-4">
                  <div className="uppercase tracking-wide text-xs text-slate-300/70 mb-1">Cleaned Caption</div>
                  <p className="leading-relaxed break-words text-white">{decision.cleaned_caption}</p>
                </div>
              )}

              {decision.signals && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(decision.signals).map(([k, v]) => (
                    <SignalBar key={k} label={k.replace(/_/g, " ")} value={typeof v === "number" ? v : 0} />
                  ))}
                </div>
              )}

              {decision.explanations && decision.explanations.length > 0 && (
                <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-4">
                  <div className="uppercase tracking-wide text-xs text-slate-300/70 mb-2">Explanations</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-slate-100">
                    {decision.explanations.map((e, i) => (
                      <li key={i} className="break-words">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {decision.status === "approved" && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      const params = new URLSearchParams({
                        caption: decision.cleaned_caption || caption,
                        hashtags,
                        platform,
                      });
                      router.push(`${SCHEDULER_PATH}?${params.toString()}`);
                    }}
                    className="px-4 py-2 rounded-lg border border-emerald-400/30 bg-emerald-500/20 hover:bg-emerald-500/30 text-white"
                  >
                    ✅ Go to Post Scheduler
                  </button>
                </div>
              )}

              {decision.status === "rejected" && (
                <button
                  onClick={() => {
                    const href = `${CREATOR_PATH}?${new URLSearchParams({
                      caption: caption || "",
                      hashtags: hashtags || "",
                      platform: platform || "instagram",
                    }).toString()}`;
                    router.push(href);
                  }}
                  className="px-4 py-2 rounded-lg border border-rose-400/30 bg-rose-500/20 hover:bg-rose-500/30 text-white"
                >
                  ✍️ Revise in Content Creator
                </button>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
