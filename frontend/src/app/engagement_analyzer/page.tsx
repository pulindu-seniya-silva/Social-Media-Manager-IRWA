"use client";

import React, { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LineChart,
  Line,
} from "recharts";
import {
  Sparkles,
  TrendingUp,
  MessageSquareText,
  BarChart3,
  History,
  Upload,
  Trash2,
} from "lucide-react";
import Sentiment from "sentiment";
import { Icon } from "next/dist/lib/metadata/types/metadata-types";

// -------------------------
// helpers (pure front-end demo)
// -------------------------
const sentiment = new Sentiment();

type PostInput = {
  post_id: string;
  platform: "instagram" | "twitter" | "x" | "linkedin" | "facebook";
  content?: string;
  tags?: string[];
  likes: number;
  comments: string[];
  shares: number;
  reach: number;
  follower_change: number;
  engagementRate?: number;
  breakdown?: { positive: number; neutral: number; negative: number };
  keywords?: string[];
};

const STOPWORDS = new Set(
  "a an the and or but if while is are was were be been being i you he she it we they them this that these those to from for of on in at by with about as into like through after over between out against during without before under around among very really just not no your our their me my mine ours theirs too very so such can could should would will won don t s".split(
    /\s+/g
  )
);

function tokenize(text: string) {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
  return cleaned;
}

function extractKeywords(comments: string[], k = 5) {
  const tokens = comments.flatMap((c) => tokenize(c));
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  const hashtags = Array.from(counts.entries())
    .filter(([w]) => w.startsWith("#"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
  const rest = Array.from(counts.entries())
    .filter(([w]) => !w.startsWith("#"))
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
  const merged: string[] = [];
  for (const h of hashtags) merged.push(h);
  for (const r of rest) if (!merged.includes(r)) merged.push(r);
  return merged.slice(0, k);
}

function classifySentiment(text: string) {
  const s = sentiment.analyze(text).comparative;
  if (s > 0.05) return "positive" as const;
  if (s < -0.05) return "negative" as const;
  return "neutral" as const;
}

function analyzePost(p: PostInput) {
  const comments = p.comments || [];
  const breakdown = { positive: 0, neutral: 0, negative: 0 };
  comments.forEach((c) => {
    const label = classifySentiment(c);
    breakdown[label]++;
  });
  const engagementRate = ((p.likes + p.shares + comments.length) / Math.max(1, p.reach)) * 100;
  const keywords = extractKeywords(comments, 5);
  return {
    ...p,
    engagementRate: Number(engagementRate.toFixed(2)),
    breakdown,
    keywords,
  };
}

// Sample dataset
const SAMPLE: PostInput[] = [
  {
    post_id: "123",
    platform: "instagram",
    content: "Healthy smoothie recipe!",
    tags: ["#health", "#smoothie"],
    likes: 120,
    comments: ["Love this!", "Too much sugar", "Looks tasty 😍"],
    shares: 10,
    reach: 1000,
    follower_change: 20,
  },
  {
    post_id: "124",
    platform: "instagram",
    content: "Meal prep tips for busy students",
    tags: ["#mealprep", "#students"],
    likes: 90,
    comments: ["Very helpful", "Okay post", "Not relevant"],
    shares: 7,
    reach: 900,
    follower_change: 5,
  },
  {
    post_id: "L-201",
    platform: "linkedin",
    content: "5 habits for a healthier workday",
    tags: ["#wellbeing", "#productivity"],
    likes: 60,
    comments: ["Great advice", "Will share with my team"],
    shares: 12,
    reach: 800,
    follower_change: 8,
  },
];

// -------------------------
// UI Components
// -------------------------
function StatCard({
  title,
  value,
  icon: Icon,
  sub,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  sub?: string;
}) {
  return (
    <div className="p-5 rounded-2xl bg-[#1a132b]/80 shadow-sm border border-[#2a2044] text-zinc-100 flex items-center gap-4">
      <div className="p-3 rounded-xl bg-gradient-to-br from-fuchsia-500/15 to-violet-500/15 text-fuchsia-300">
        <Icon className="size-6" />
      </div>
      <div>
        <div className="text-sm text-zinc-400">{title}</div>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="px-3 py-1 rounded-full bg-[#231a3b] text-zinc-100 text-xs border border-[#34285a]">
      {label}
    </span>
  );
}

// -------------------------
// Page Component
// -------------------------
export default function EngagementAnalyzerPage() {
  const [form, setForm] = useState<PostInput>({
    post_id: "IG_2025_0001",
    platform: "instagram",
    content: "Sustainability tips for students",
    tags: ["#sustainability", "#studentlife"],
    likes: 120,
    shares: 18,
    reach: 1000,
    follower_change: 12,
    comments: [
      "Love this idea! So useful.",
      "Not sure this helps me.",
      "Great tips – saved!",
      "This is okay.",
      "Amazing post #sustainability",
    ],
  });
  const [history, setHistory] = useState<PostInput[]>([]);
  const [jsonInput, setJsonInput] = useState<string>("");
  const [useJson, setUseJson] = useState(false);

  const analysis = useMemo(() => analyzePost(form), [form]);

  const seriesData = useMemo(() => [
    { name: "likes", value: form.likes },
    { name: "comments", value: form.comments.length },
    { name: "shares", value: form.shares },
  ], [form]);

  const pieData = useMemo(() => {
    const b = analysis.breakdown!;
    return [
      { name: "Positive", value: b.positive },
      { name: "Neutral", value: b.neutral },
      { name: "Negative", value: b.negative },
    ];
  }, [analysis]);

  const addToHistory = () => setHistory((h) => [analysis, ...h].slice(0, 20));
  const loadSample = (i: number) => setForm(SAMPLE[i]);
  const applyJson = () => {
    try {
      const obj = JSON.parse(jsonInput);
      setForm({
        post_id: obj.post_id ?? "sample",
        platform: (obj.platform || "instagram").toLowerCase() as PostInput["platform"],
        content: obj.content ?? "",
        tags: obj.tags ?? [],
        likes: Number(obj.likes ?? 0),
        comments: Array.isArray(obj.comments) ? obj.comments : [],
        shares: Number(obj.shares ?? 0),
        reach: Number(obj.reach ?? 1),
        follower_change: Number(obj.follower_change ?? 0),
      });
    } catch (_e) {
      alert("Invalid JSON. Please check your input.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#3f0a6b] via-[#0f0a1a] to-black text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight flex items-center gap-3">
              <Sparkles className="size-7 text-fuchsia-400" /> Engagement Analyzer
            </h1>
            <p className="text-zinc-400 mt-1">
              Paste metrics or use a sample, then instantly see sentiment, keywords and engagement quality.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadSample(0)}
              className="px-3 py-2 rounded-xl bg-[#1a132b]/80 border border-[#2a2044] hover:shadow-sm"
              title="Load sample"
            >
              <Upload className="size-4 inline mr-2" /> Sample
            </button>
            <button
              onClick={() => setHistory([])}
              className="px-3 py-2 rounded-xl bg-[#1a132b]/80 border border-[#2a2044] hover:shadow-sm"
              title="Clear history"
            >
              <Trash2 className="size-4 inline mr-2" /> Clear
            </button>
          </div>
        </header>

        {/* Content grid */}
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {/* Left: Input card */}
          <div className="rounded-2xl bg-[#1a132b]/80 border border-[#2a2044] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <MessageSquareText className="size-5 text-fuchsia-400" />
                Input
              </h2>
              <label className="text-sm text-zinc-400 flex items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={useJson}
                  onChange={(e) => setUseJson(e.target.checked)}
                />
                Paste JSON
              </label>
            </div>

            {!useJson ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-zinc-400">Post ID</label>
                  <input
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#110b1f] border border-[#2a2044] placeholder-zinc-500"
                    value={form.post_id}
                    onChange={(e) => setForm({ ...form, post_id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Platform</label>
                  <select
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#110b1f] border border-[#2a2044]"
                    value={form.platform}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setForm({ ...form, platform: e.target.value as PostInput["platform"] })
                    }

                  >
                    <option value="instagram">Instagram</option>
                    <option value="twitter">Twitter/X</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="facebook">Facebook</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Reach</label>
                  <input
                    type="number"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#110b1f] border border-[#2a2044]"
                    value={form.reach}
                    onChange={(e) => setForm({ ...form, reach: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Likes</label>
                  <input
                    type="number"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#110b1f] border border-[#2a2044]"
                    value={form.likes}
                    onChange={(e) => setForm({ ...form, likes: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Shares</label>
                  <input
                    type="number"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#110b1f] border border-[#2a2044]"
                    value={form.shares}
                    onChange={(e) => setForm({ ...form, shares: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Follower change</label>
                  <input
                    type="number"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#110b1f] border border-[#2a2044]"
                    value={form.follower_change}
                    onChange={(e) => setForm({ ...form, follower_change: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-zinc-400">Comments (one per line)</label>
                  <textarea
                    rows={5}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-[#110b1f] border border-[#2a2044]"
                    value={form.comments.join("\n")}
                    onChange={(e) =>
                      setForm({ ...form, comments: e.target.value.split("\n").filter(Boolean) })
                    }
                  />
                </div>

                <div className="col-span-2 flex gap-2 mt-2">
                  <button
                    onClick={() => loadSample(0)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white hover:from-fuchsia-700 hover:to-violet-700"
                  >
                    Load Sample A
                  </button>
                  <button
                    onClick={() => loadSample(1)}
                    className="px-4 py-2 rounded-xl bg-[#0f0f14] text-white border border-[#2a2044] hover:bg-black"
                  >
                    Load Sample B
                  </button>
                  <button
                    onClick={() => loadSample(2)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 text-white hover:from-violet-700 hover:to-purple-800"
                  >
                    Load Sample C
                  </button>
                  <button
                    onClick={addToHistory}
                    className="ml-auto px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Save to History
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-xs text-zinc-400 mb-2">
                  Paste JSON with keys: post_id, platform, likes, shares, reach, follower_change, comments[]
                </p>
                <textarea
                  rows={10}
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#110b1f] border border-[#2a2044]"
                  placeholder="{&quot;post_id&quot;:&quot;123&quot;,&quot;platform&quot;:&quot;instagram&quot;,&quot;likes&quot;:120,&quot;shares&quot;:10,&quot;reach&quot;:1000,&quot;follower_change&quot;:20,&quot;comments&quot;:[&quot;Love this!&quot;,&quot;Too much sugar&quot;,&quot;Looks tasty 😍&quot;]}"

                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={applyJson}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white hover:from-fuchsia-700 hover:to-violet-700"
                  >
                    Apply JSON
                  </button>
                  <button
                    onClick={() => setJsonInput("")}
                    className="px-4 py-2 rounded-xl bg-[#1a132b]/80 border border-[#2a2044]"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Analysis */}
          <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
              <StatCard
                title="Engagement rate"
                value={`${analysis.engagementRate}%`}
                icon={TrendingUp}
                sub="(likes + shares + comments) / reach"
              />
              <StatCard title="Comments" value={form.comments.length} icon={MessageSquareText} sub={form.platform} />
              <StatCard title="Follower Δ" value={form.follower_change} icon={BarChart3} sub="since post" />
            </div>

            <div className="rounded-2xl bg-[#1a132b]/80 border border-[#2a2044] p-5 shadow-sm">
              <h3 className="font-semibold mb-3 text-zinc-100">Keyword Highlights</h3>
              <div className="flex flex-wrap gap-2">
                {analysis.keywords.length ? (
                  analysis.keywords.map((k: string) => <Chip key={k} label={k} />)
                ) : (
                  <span className="text-sm text-zinc-400">No keywords extracted</span>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-[#1a132b]/80 border border-[#2a2044] p-5 shadow-sm">
                <h3 className="font-semibold mb-3 text-zinc-100">Post Metrics</h3>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={seriesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" stroke="#a3a3a3" />
                      <YAxis stroke="#a3a3a3" />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="value" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl bg-[#1a132b]/80 border border-[#2a2044] p-5 shadow-sm">
                <h3 className="font-semibold mb-3 text-zinc-100">Sentiment Breakdown</h3>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip />
                      <Legend />
                      <Pie dataKey="value" data={pieData} label />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#1a132b]/80 border border-[#2a2044] p-5 shadow-sm">
              <h3 className="font-semibold mb-3 text-zinc-100">Engagement Quality Over Time (local history)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={history.map((h) => ({
                      name: h.post_id,
                      rate: h.engagementRate,
                      pos: h.breakdown?.positive ?? 0,
                      neg: h.breakdown?.negative ?? 0,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#a3a3a3" />
                    <YAxis stroke="#a3a3a3" />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="rate" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {history.length === 0 && (
                <p className="text-sm text-zinc-400 mt-3">Use &quot;Save to History&quot; to build a comparison chart.</p>
              )}
            </div>

            <div className="rounded-2xl bg-[#1a132b]/80 border border-[#2a2044] p-5 shadow-sm">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-zinc-100">
                <History className="size-5 text-fuchsia-400" /> Recent Comments
              </h3>
              <div className="grid gap-2">
                {form.comments.map((c, i) => (
                  <div key={i} className="px-3 py-2 rounded-xl bg-[#110b1f] border border-[#2a2044]">
                    {c}
                  </div>
                ))}
                {form.comments.length === 0 && (
                  <div className="text-sm text-zinc-400">No comments supplied.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-xs text-zinc-500 mt-8 text-center">
          {"Front-end demo only (local analysis). Later, wire this to your FastAPI backend endpoints."}
        </p>
      </div>
    </div>
  );
}
