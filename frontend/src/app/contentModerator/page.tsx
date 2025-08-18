"use client";
import { useState } from "react";

type Decision = {
  status: "approved" | "rejected";
  reason?: string | null;
  cleaned_caption?: string | null;
  signals?: Record<string, number>;
  explanations?: string[];
};

const API = process.env.NEXT_PUBLIC_API_BASE!;
const TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN!;

export default function ModeratorPage() {
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoForward, setAutoForward] = useState(true);

  const postBody = {
    caption,
    hashtags: hashtags
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
    platform,
    creator_request_id: crypto.randomUUID(),
  };

  const runModeration = async () => {
    setLoading(true);
    setDecision(null);
    const path = autoForward ? "/moderator/review-and-forward" : "/moderator/review";
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(postBody),
    });
    const data = await res.json();
    setDecision(data);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-6">
      <div className="max-w-3xl mx-auto bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl p-8 space-y-6">
        <h1 className="text-3xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-600 drop-shadow-md">
          🛡️ Content Moderator – Safety Guardian
        </h1>

        <div className="grid gap-4">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Paste caption from Content Creator Agent…"
            rows={5}
            className="w-full border-2 border-indigo-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <input
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="Hashtags (comma separated)"
            className="w-full border-2 border-pink-300 rounded-xl p-3 focus:ring-2 focus:ring-pink-500 focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-indigo-700">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="border-2 border-indigo-300 rounded-xl p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option>instagram</option>
              <option>twitter</option>
              <option>linkedin</option>
              <option>tiktok</option>
              <option>facebook</option>
            </select>

            <label className="flex items-center gap-2 ml-auto text-sm text-pink-700">
              <input
                type="checkbox"
                checked={autoForward}
                onChange={(e) => setAutoForward(e.target.checked)}
                className="accent-pink-500"
              />
              Auto-forward to Scheduler
            </label>
          </div>

          <button
            onClick={runModeration}
            disabled={loading || !caption.trim()}
            className="w-full bg-gradient-to-r from-indigo-600 to-pink-600 text-white py-3 rounded-xl font-semibold shadow-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {loading ? "⚡ Reviewing…" : "🚀 Review Draft"}
          </button>
        </div>

        {decision && (
          <div
            className={`rounded-xl p-5 shadow-inner ${
              decision.status === "approved"
                ? "bg-green-100 border-2 border-green-400"
                : "bg-red-100 border-2 border-red-400"
            }`}
          >
            <p className="font-bold text-lg">
              Status:{" "}
              <span
                className={`uppercase ${
                  decision.status === "approved" ? "text-green-700" : "text-red-700"
                }`}
              >
                {decision.status}
              </span>
            </p>
            {decision.reason && <p className="mt-2 text-sm">💡 Reason: {decision.reason}</p>}
            {decision.cleaned_caption && (
              <p className="mt-2 text-sm">
                ✨ <span className="font-semibold">Cleaned Caption:</span>{" "}
                {decision.cleaned_caption}
              </p>
            )}
            {decision.signals && (
              <div className="mt-2 text-sm">
                📊 Signals:{" "}
                {Object.entries(decision.signals).map(([k, v]) => (
                  <span key={k} className="mr-3 font-mono">
                    {k}: {v}
                  </span>
                ))}
              </div>
            )}
            {decision.explanations && decision.explanations.length > 0 && (
              <ul className="mt-3 list-disc pl-5 text-sm space-y-1">
                {decision.explanations.map((e, i) => (
                  <li key={i}>🔍 {e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
