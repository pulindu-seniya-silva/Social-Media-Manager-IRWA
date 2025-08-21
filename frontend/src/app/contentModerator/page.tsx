"use client";

import React, { useState, useMemo } from "react";

type Decision = {
  status: "approved" | "rejected";
  reason?: string | null;
  cleaned_caption?: string | null;
  signals?: Record<string, number>;
  explanations?: string[];
};

const API = process.env.NEXT_PUBLIC_API_BASE; // e.g. http://localhost:8000/api



const banned = ["hate", "kill", "racist", "sexist", "terror", "suicide"];
const negWords = ["awful", "stupid", "idiot", "trash", "disgusting", "dumb", "sucks", "hate", "kill"];
const posWords = ["love", "great", "awesome", "kind", "thanks", "amazing", "cool", "happy", "inspiring"];

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function mockModerate(caption: string): Decision {
  const text = caption.toLowerCase();
  const bannedHits = banned.filter(w => new RegExp(`\\b${w}\\b`, "i").test(text));
  const toks = text.match(/[a-z']+/g) ?? [];
  const pos = toks.filter(t => posWords.includes(t)).length;
  const neg = toks.filter(t => negWords.includes(t)).length;
  const polarity = (pos - neg) / Math.max(1, pos + neg);
  const tox = clamp((neg + bannedHits.length) / 5);

  const explanations: string[] = [];
  if (bannedHits.length) explanations.push(`Banned keywords detected: ${bannedHits.join(", ")}`);
  if (tox >= 0.5) explanations.push("High toxicity signals");
  if (polarity < -0.4) explanations.push("Negative sentiment");

  if (bannedHits.length || tox >= 0.5 || polarity < -0.4) {
    let cleaned = caption;
    for (const w of banned) cleaned = cleaned.replace(new RegExp(`\\b${w}\\b`, "gi"), "***");
    return {
      status: "rejected",
      reason: explanations[0] || "Policy violation",
      cleaned_caption: cleaned,
      signals: { polarity: +polarity.toFixed(3), toxicity: +tox.toFixed(3) },
      explanations
    };
  }
  return {
    status: "approved",
    cleaned_caption: caption,
    signals: { polarity: +polarity.toFixed(3), toxicity: +tox.toFixed(3) },
    explanations: ["No banned words; acceptable sentiment and toxicity levels."]
  };
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="px-2.5 py-1 rounded-full bg-white/10 text-white text-xs">{children}</span>;
}

function SignalBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(clamp(value, 0, 1) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-white/80">
        <span>{label}</span><span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ContentModeratorPage() {
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [autoForward, setAutoForward] = useState(true);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = caption.trim().length > 0;

  const samples = useMemo(() => ({
    safe: "Celebrating organic farming 🌱 Fresh, local, and kind to the planet!",
    toxic: "This idea is stupid and your page sucks. Do better.",
    banned: "We should kill negativity with positivity. #motivation"
  }), []);

  const review = async () => {
    setLoading(true);
    setDecision(null);
    const payload = {
      caption,
      hashtags: hashtags.split(",").map(h => h.trim()).filter(Boolean),
      platform,
      creator_request_id: crypto.randomUUID()
    };

    // If API base is not set → use mock
    if (!API) {
      await new Promise(r => setTimeout(r, 300));
      setDecision(mockModerate(payload.caption));
      setLoading(false);
      return;
    }

    try {
      const path = autoForward ? "/moderator/review_and_forward" : "/moderator/review";

      const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setDecision(data);
    } catch {
      setDecision(mockModerate(payload.caption));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white">
      {/* header */}
      <header className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            🛡️ Content Moderator <span className="opacity-70">/ Safety Guardian</span>
          </h1>
          <div className="hidden md:flex gap-2">
            <Pill>App Router</Pill>
            <Pill>Next.js + Tailwind</Pill>
            <Pill>{API ? "API Mode" : "Mock Mode"}</Pill>
          </div>
        </div>
      </header>

      {/* content */}
      <main className="max-w-6xl mx-auto px-6 pb-16 grid md:grid-cols-2 gap-6">
        {/* left: form */}
        <section className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Review Draft</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-cyan-400" checked={autoForward} onChange={e => setAutoForward(e.target.checked)} />
              Auto-forward to Scheduler on approval
            </label>
          </div>

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
            <div className="flex items-center gap-3">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="rounded-xl border border-white/20 bg-white/5 p-2 outline-none text-black"
              >
                <option value="instagram">Instagram</option>
                <option value="twitter">Twitter/X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="tiktok">TikTok</option>
                <option value="facebook">Facebook</option>
              </select>

              <div className="ml-auto flex gap-2 text-xs">
                <button onClick={() => setCaption(samples.safe)} className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 hover:bg-emerald-500/30">Load Safe</button>
                <button onClick={() => setCaption(samples.toxic)} className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-400/30 hover:bg-amber-500/30">Load Toxic</button>
                <button onClick={() => setCaption(samples.banned)} className="px-3 py-1 rounded-lg bg-rose-500/20 border border-rose-400/30 hover:bg-rose-500/30">Load Banned</button>
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
        <section className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-xl">
          <h2 className="text-lg font-semibold mb-4">Decision</h2>

          {!decision ? (
            <div className="text-white/70">
              Submit a caption to see status, reasons, and signals here.
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-xl p-4 border ${
                decision.status === "approved"
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-rose-500/10 border-rose-500/30"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <div className="uppercase tracking-wide text-white/70">Status</div>
                    <div className="text-xl font-bold">{decision.status}</div>
                  </div>
                  {decision.reason && (
                    <div className="text-sm max-w-xs text-right">
                      <div className="uppercase tracking-wide text-white/70">Reason</div>
                      <div>{decision.reason}</div>
                    </div>
                  )}
                </div>
              </div>

              {decision.cleaned_caption && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="uppercase tracking-wide text-xs text-white/60 mb-1">Cleaned Caption</div>
                  <p className="leading-relaxed">{decision.cleaned_caption}</p>
                </div>
              )}

              {decision.signals && (
                <div className="grid gap-4">
                  <SignalBar label="Toxicity" value={decision.signals.toxicity ?? 0} />
                  <SignalBar label="Polarity (neg→pos)" value={((decision.signals.polarity ?? 0) + 1) / 2} />
                  <SignalBar label="Cyberbullying Risk" value={decision.signals.cyberbullying ?? 0} />
                  <SignalBar label="Profanity Intensity" value={decision.signals.profanity ?? 0} />
                  <SignalBar label="Spam Score" value={decision.signals.spam ?? 0} />
                  <SignalBar label="Length Score" value={decision.signals.length ?? 0} />
                  <SignalBar label="Hashtag Density" value={decision.signals.hashtags ?? 0} />
                  <SignalBar label="Emoji Ratio" value={decision.signals.emoji_ratio ?? 0} />
                </div>
              )}

              {!!decision.explanations?.length && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="uppercase tracking-wide text-xs text-white/60 mb-2">Explanations</div>
                  <ul className="list-disc pl-6 space-y-1 text-sm">
                    {decision.explanations.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="max-w-6xl mx-auto px-6 pb-10 text-sm text-white/50">
        Tip: Set <code className="bg-white/10 px-1 rounded">NEXT_PUBLIC_API_BASE</code> to call your backend.
      </footer>
    </div>
  );
}
