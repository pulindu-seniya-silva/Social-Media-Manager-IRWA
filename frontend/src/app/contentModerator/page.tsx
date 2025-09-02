// app/contentModerator/page.tsx

"use client";

import React, { useState, useMemo, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

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
  hashtags?: string;      // CSV from creator page
  platform?: string;      // "instagram" | "twitter" | "x" | "linkedin" | "tiktok" | "facebook"
};

// -----------------------------
// Config (API is REQUIRED for moderation calls)
// -----------------------------
const API = process.env.NEXT_PUBLIC_API_BASE; // e.g. http://127.0.0.1:8000

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="px-2.5 py-1 rounded-full bg-white/10 text-white text-xs">{children}</span>;
}

function SignalBar({ label, value }: { label: string; value: number }) {
  const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
  const pct = Math.round(clamp(value, 0, 1) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-white/80">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Wrapper to satisfy Next.js requirement:
 * useSearchParams() must be rendered under a <Suspense> boundary.
 * No logic/UI changes — just composition.
 */
export default function ContentModeratorPage() {
  return (
    <Suspense fallback={null}>
      <ContentModeratorBody />
    </Suspense>
  );
}

function ContentModeratorBody() {
  const searchParams = useSearchParams();

  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [autoForward, setAutoForward] = useState(true);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = caption.trim().length > 0;

  const samples = useMemo(
    () => ({
      safe: "Celebrating organic farming 🌱 Fresh, local, and kind to the planet!",
      borderline: "Not a fan of this update, but let's try to improve it together.",
      risky: "This is unacceptable. Report it and remove now.",
    }),
    []
  );

  // Moderation request (triggered ONLY when the user clicks the button)
  const review = useCallback(
    async () => {
      setError(null);
      setDecision(null);

      if (!API) {
        setError(
          'API not available. Set NEXT_PUBLIC_API_BASE (e.g., "http://127.0.0.1:8000") in .env.local and restart the dev server.'
        );
        return;
      }

      const payload = {
        caption,
        hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean),
        platform: platform.toLowerCase(),
        creator_request_id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
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
    },
    [API, autoForward, caption, hashtags, platform]
  );

  // ✅ Auto-PASTE only (no auto-run): prefer URL query params; fallback to sessionStorage
  useEffect(() => {
    const allowed = new Set(["instagram", "twitter", "x", "linkedin", "tiktok", "facebook"]);

    // 1) From Creator button via query params
    const qCaption = searchParams.get("caption") ?? "";
    const qHashtags = searchParams.get("hashtags") ?? "";
    const qPlatformRaw = (searchParams.get("platform") ?? "").toLowerCase();

    const hasQueryPayload = (qCaption && qCaption.trim().length > 0) || (qHashtags && qHashtags.trim().length > 0);

    if (hasQueryPayload) {
      setCaption(qCaption);
      setHashtags(qHashtags);
      if (allowed.has(qPlatformRaw)) setPlatform(qPlatformRaw);
      return; // prefer query params if present
    }

    // 2) Fallback: sessionStorage handoff (if ever used)
    try {
      const raw = sessionStorage.getItem("creator_draft");
      if (!raw) return;
      const draft = JSON.parse(raw) as CreatorDraft | null;
      sessionStorage.removeItem("creator_draft"); // consume once
      if (!draft) return;

      if (draft.caption) setCaption(draft.caption);
      if (typeof draft.hashtags === "string") setHashtags(draft.hashtags);
      if (draft.platform && allowed.has(draft.platform.toLowerCase())) {
        setPlatform(draft.platform.toLowerCase());
      }
    } catch {
      // ignore parsing errors
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white">
      {/* header */}
      <header className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight break-words">
            🛡️ Content Moderator <span className="opacity-70">/ LLM Review</span>
          </h1>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Pill>App Router</Pill>
            <Pill>Next.js + Tailwind</Pill>
            <Pill>API Required</Pill>
          </div>
        </div>
      </header>

      {/* content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* left: form */}
        <section className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h2 className="text-base sm:text-lg font-semibold">Review Draft</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-cyan-400"
                checked={autoForward}
                onChange={(e) => setAutoForward(e.target.checked)}
              />
              <span className="whitespace-nowrap">Auto-forward to Scheduler on approval</span>
            </label>
          </div>

          {error && (
            <div className="mb-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm">
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
              className="w-full rounded-xl border border-white/20 bg-white/5 p-3 outline-none focus:ring-2 focus:ring-cyan-400"
            />
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="Hashtags (comma separated)"
              className="w-full rounded-xl border border-white/20 bg-white/5 p-3 outline-none focus:ring-2 focus:ring-cyan-400"
            />
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full sm:w-auto rounded-xl border border-white/20 bg-white/5 p-2 outline-none text-black"
              >
                <option value="instagram">Instagram</option>
                <option value="twitter">Twitter/X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="tiktok">TikTok</option>
                <option value="facebook">Facebook</option>
              </select>

              <div className="sm:ml-auto flex flex-wrap gap-2 text-xs">
                <button
                  onClick={() => setCaption(samples.safe)}
                  className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 hover:bg-emerald-500/30"
                >
                  Load Safe
                </button>
                <button
                  onClick={() => setCaption(samples.borderline)}
                  className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-400/30 hover:bg-amber-500/30"
                >
                  Load Borderline
                </button>
                <button
                  onClick={() => setCaption(samples.risky)}
                  className="px-3 py-1 rounded-lg bg-rose-500/20 border border-rose-400/30 hover:bg-rose-500/30"
                >
                  Load Risky
                </button>
              </div>
            </div>

            <button
              disabled={!canSubmit || loading}
              onClick={review}
              className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-cyan-400 to-blue-500 text-black hover:from-cyan-300 hover:to-blue-400 disabled:opacity-50"
            >
              {loading ? "Reviewing…" : "Run Moderation"}
            </button>
          </div>
        </section>

        {/* right: result */}
        <section className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl">
          <h2 className="text-base sm:text-lg font-semibold mb-4">Decision</h2>

          {!decision ? (
            <div className="text-white/70">Submit a caption to see status, reasons, and signals here.</div>
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
                    <div className="uppercase tracking-wide text-white/70">Status</div>
                    <div className="text-xl font-bold break-words">{decision.status}</div>
                  </div>
                  {decision.reason && (
                    <div className="text-sm sm:max-w-xs sm:text-right">
                      <div className="uppercase tracking-wide text-white/70">Reason</div>
                      <div className="break-words">{decision.reason}</div>
                    </div>
                  )}
                </div>
              </div>

              {decision.cleaned_caption && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="uppercase tracking-wide text-xs text-white/60 mb-1">Cleaned Caption</div>
                  <p className="leading-relaxed break-words">{decision.cleaned_caption}</p>
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
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="uppercase tracking-wide text-xs text-white/60 mb-2">Explanations</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {decision.explanations.map((e, i) => (
                      <li key={i} className="break-words">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 text-sm text-white/50">
        Tip: Set <code className="bg-white/10 px-1 rounded">NEXT_PUBLIC_API_BASE</code> in <code>.env.local</code>.
      </footer>
    </div>
  );
}
