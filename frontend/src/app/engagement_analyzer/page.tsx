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
  const s = sentiment.analyze(text).comparative; // comparative normalizes by length
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

// Sample dataset (front-end only)
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
// UI components
// -------------------------
function StatCard({
  title,
  value,
  icon: Icon,
  sub,
}: {
  title: string;
  value: string | number;
  icon: any;
  sub?: string;
}) {
  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50 via-fuchsia-50 to-rose-50 dark:from-indigo-900/40 dark:via-fuchsia-900/40 dark:to-rose-900/40 shadow-lg border border-zinc-200 dark:border-zinc-700 flex items-center gap-4 hover:scale-105 transition-transform duration-300">
      <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 text-indigo-600 dark:text-indigo-300">
        <Icon className="size-6" />
      </div>
      <div>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">{title}</div>
        <div className="text-2xl font-bold text-gradient bg-clip-text bg-gradient-to-r from-pink-500 to-indigo-500">{value}</div>
        {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-pink-100 via-purple-100 to-indigo-100 dark:from-pink-900/40 dark:via-purple-900/40 dark:to-indigo-900/40 text-pink-700 dark:text-purple-200 text-xs border border-zinc-200 dark:border-zinc-700">
      {label}
    </span>
  );
}

// -------------------------
// Page
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
  const [history, setHistory] = useState<any[]>([]);
  const [jsonInput, setJsonInput] = useState<string>("");
  const [useJson, setUseJson] = useState(false);

  const analysis = useMemo(() => analyzePost(form), [form]);

  const seriesData = useMemo(() => {
    return [
      { name: "likes", value: form.likes },
      { name: "comments", value: form.comments.length },
      { name: "shares", value: form.shares },
    ];
  }, [form]);

  const pieData = useMemo(() => {
    const b = analysis.breakdown;
    return [
      { name: "Positive", value: b.positive, fill: "#4CAF50" },
      { name: "Neutral", value: b.neutral, fill: "#FFC107" },
      { name: "Negative", value: b.negative, fill: "#F44336" },
    ];
  }, [analysis]);

  const addToHistory = () => {
    setHistory((h) => [analysis, ...h].slice(0, 20));
  };

  const loadSample = (i = 0) => setForm(SAMPLE[i]);

  const applyJson = () => {
    try {
      const obj = JSON.parse(jsonInput);
      setForm({
        post_id: obj.post_id ?? "sample",
        platform: (obj.platform || "instagram").toLowerCase(),
        content: obj.content ?? "",
        tags: obj.tags ?? [],
        likes: Number(obj.likes ?? 0),
        comments: Array.isArray(obj.comments) ? obj.comments : [],
        shares: Number(obj.shares ?? 0),
        reach: Number(obj.reach ?? 1),
        follower_change: Number(obj.follower_change ?? 0),
      });
    } catch (e) {
      alert("Invalid JSON. Please check your input.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 dark:from-pink-950 dark:via-purple-950 dark:to-indigo-950 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight flex items-center gap-3 text-gradient bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500">
              <Sparkles className="size-7 text-pink-600" /> Engagement Analyzer
            </h1>
            <p className="text-zinc-600 dark:text-zinc-300 mt-1">
              Paste metrics or use a sample, then instantly see sentiment, keywords and engagement quality.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadSample(0)}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300 dark:from-pink-800 dark:via-purple-800 dark:to-indigo-800 border border-zinc-200 dark:border-zinc-700 hover:scale-105 transition-transform"
              title="Load sample"
            >
              <Upload className="size-4 inline mr-2" /> Sample
            </button>
            <button
              onClick={() => setHistory([])}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-red-300 via-rose-300 to-pink-300 dark:from-red-800 dark:via-rose-800 dark:to-pink-800 border border-zinc-200 dark:border-zinc-700 hover:scale-105 transition-transform"
              title="Clear history"
            >
              <Trash2 className="size-4 inline mr-2" /> Clear
            </button>
          </div>
        </header>

        {/* Content grid */}
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {/* Left: Input card */}
          <div className="rounded-2xl bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 dark:from-pink-900/40 dark:via-purple-900/40 dark:to-indigo-900/40 border border-zinc-200 dark:border-zinc-800 p-5 shadow-lg">
            {/* ... rest of input form remains unchanged ... */}
          </div>

          {/* Right: Analysis */}
          <div className="space-y-6">
            {/* ... all analysis cards remain unchanged ... */}
          </div>
        </div>

        {/* Footer note */}
        <p className="text-xs text-zinc-500 mt-8 text-center">
          Front-end demo only (local analysis). Later, wire this to your FastAPI backend endpoints.
        </p>
      </div>
    </div>
  );
}
