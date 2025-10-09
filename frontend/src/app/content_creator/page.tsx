'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

type ChatMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
  updatedAt: string;
  seq?: number | null;
  metadata?: Record<string, unknown> | null;
};

const CHAT_BASE = process.env.NEXT_PUBLIC_CHAT_BASE || 'http://127.0.0.1:8000';

/* =============================
   Frontend-only Pricing Helpers
   ============================= */
type PlanName = 'free' | 'pro' | 'team';

const PLAN_LIMITS: Record<
  PlanName,
  { gensPerDay: number; imageRegen: boolean; label: string }
> = {
  free: { gensPerDay: 20, imageRegen: false, label: 'Free' },
  pro: { gensPerDay: 300, imageRegen: true, label: 'Pro' },
  team: { gensPerDay: 1000, imageRegen: true, label: 'Team' },
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function loadPlan(): PlanName {
  try {
    return (localStorage.getItem('plan') as PlanName) || 'free';
  } catch {
    return 'free';
  }
}
function savePlan(p: PlanName) {
  try {
    localStorage.setItem('plan', p);
  } catch {}
}

function readUsageObj(): Record<string, number> {
  try {
    const raw = localStorage.getItem('usage');
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function writeUsageObj(obj: Record<string, number>) {
  try {
    localStorage.setItem('usage', JSON.stringify(obj));
  } catch {}
}

function loadUsage() {
  const key = todayKey();
  const obj = readUsageObj();
  return { count: obj[key] ?? 0, key };
}
function bumpUsage() {
  const key = todayKey();
  const obj = readUsageObj();
  obj[key] = (obj[key] ?? 0) + 1;
  writeUsageObj(obj);
}
function resetIfNewDay() {
  const { key } = loadUsage();
  const obj = readUsageObj();
  // keep only today's count; this implicitly resets past days
  writeUsageObj({ [key]: obj[key] ?? 0 });
}

export default function ContentCreatorPage() {
  const router = useRouter();

  // ------- existing state -------
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('general');
  const [tone] = useState('professional');
  const [wordLimit, setWordLimit] = useState<number | ''>('');

  const [generatedContent, setGeneratedContent] = useState('');
  const [generatedImage, setGeneratedImage] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const [serverHashtags, setServerHashtags] = useState<string[]>([]);
  const [serverKeywords, setServerKeywords] = useState<string[]>([]);
  const [hkLoading, setHKLoading] = useState<{ tags: boolean; kws: boolean }>({
    tags: false,
    kws: false,
  });

  // ------- NEW: chat history state -------
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  // ------- NEW: pricing UI state -------
  const [plan, setPlan] = useState<PlanName>('free');
  const [usedToday, setUsedToday] = useState<number>(0);
  const [showPricing, setShowPricing] = useState<boolean>(false);

  // Reuse a conversation across refreshes + init pricing
  useEffect(() => {
    (async () => {
      const cached = sessionStorage.getItem('creatorConversationId');
      if (cached) {
        setConversationId(cached);
      } else {
        try {
          const res = await fetch(`${CHAT_BASE}/chat/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}), // important to avoid 422
          });
          const data = await res.json();
          if (data?.id) {
            setConversationId(data.id);
            sessionStorage.setItem('creatorConversationId', data.id);
          } else {
            console.warn('Create conversation failed:', data);
          }
        } catch (e) {
          console.warn('Could not create conversation:', e);
        }
      }
      // init pricing data
      resetIfNewDay();
      setPlan(loadPlan());
      setUsedToday(loadUsage().count);
    })();
  }, []);

  // helper: save a message in Mongo
  async function saveMessage(
    role: 'user' | 'assistant' | 'system' | 'tool',
    content: string
  ) {
    if (!conversationId || !content.trim()) return;
    try {
      await fetch(`${CHAT_BASE}/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content }),
      });
    } catch (e) {
      console.warn('saveMessage failed:', e);
    }
  }

  async function loadHistory() {
    if (!conversationId) return;
    setHistoryLoading(true);

    try {
      const res = await fetch(
        `${CHAT_BASE}/chat/conversations/${conversationId}/messages?limit=200`,
        { cache: 'no-store' }
      );

      if (!res.ok) {
        console.warn('loadHistory failed:', res.status, await res.text());
        return; // ❗ keep existing history if server fails
      }

      const data = await res.json();
      // Accept either a plain array or a legacy [array] tuple
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.[0]) ? data[0] : null);

      if (Array.isArray(arr)) {
        setHistory(arr);
      } else {
        console.warn('loadHistory: unexpected shape => keeping old history', data);
      }
    } catch (e) {
      console.warn('loadHistory error:', e); // ❗ keep existing history on error
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (conversationId) loadHistory();
  }, [conversationId]);

  const assistantHistory = useMemo(
    () => history.filter((h) => h.role === 'assistant'),
    [history]
  );

  // ------- your existing handlers (with logging) -------
  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic first!');
      return;
    }

    // --- Pricing soft gate: daily generation limit
    const limits = PLAN_LIMITS[plan];
    if (usedToday >= limits.gensPerDay) {
      setError(
        `Daily limit reached for ${limits.label} plan (${usedToday}/${limits.gensPerDay}). Click "Upgrade" to increase limits.`
      );
      return;
    }

    setLoading(true);
    setGeneratedContent('');
    setGeneratedImage('');
    setError('');
    setCopied(false);
    setServerHashtags([]);
    setServerKeywords([]);

    // log the user's request
    const userSummary = `Generate for topic="${topic}", platform="${platform}", tone="${tone}", word_limit="${
      wordLimit || 'auto'
    }"`;
    await saveMessage('user', userSummary);

    try {
      const res = await fetch('http://127.0.0.1:8000/content/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          platform,
          tone,
          word_limit: wordLimit === '' ? null : Number(wordLimit),
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setGeneratedContent(data.content);
        await saveMessage('assistant', data.content);
        // bump usage on success
        bumpUsage();
        setUsedToday((c) => c + 1);
        loadHistory();
      }
    } catch (err) {
      console.error(err);
      setError('Failed to generate content. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateHashtags = async () => {
    if (!topic.trim() && !generatedContent.trim()) {
      setError('Provide a topic or generate content first to suggest hashtags.');
      return;
    }
    setHKLoading((s) => ({ ...s, tags: true }));
    setServerHashtags([]);
    try {
      const res = await fetch('http://127.0.0.1:8000/content/generate-hashtags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          content: generatedContent,
          platform,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.hashtags)) setServerHashtags(data.hashtags);
    } catch (e) {
      console.error(e);
    } finally {
      setHKLoading((s) => ({ ...s, tags: false }));
    }
  };

  const handleGenerateKeywords = async () => {
    if (!topic.trim() && !generatedContent.trim()) {
      setError('Provide a topic or generate content first to suggest keywords.');
      return;
    }
    setHKLoading((s) => ({ ...s, kws: true }));
    setServerKeywords([]);
    try {
      const res = await fetch('http://127.0.0.1:8000/content/generate-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          content: generatedContent,
          platform,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.keywords)) setServerKeywords(data.keywords);
    } catch (e) {
      console.error(e);
    } finally {
      setHKLoading((s) => ({ ...s, kws: false }));
    }
  };

  const handleGenerateImage = async () => {
    // --- Pricing soft gate: image generation locked on Free
    if (!PLAN_LIMITS[plan].imageRegen) {
      setError('Image generation is available on Pro/Team plans. Click "Upgrade" to proceed.');
      return;
    }

    setImageLoading(true);
    setGeneratedImage('');
    setError('');
    try {
      const res = await fetch('http://127.0.0.1:8000/content/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          content: generatedContent,
          platform,
        }),
      });
      const data = await res.json();
      if (data.image_url) {
        setGeneratedImage(data.image_url);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to generate image. Please try again.');
    } finally {
      setImageLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadImage = () => {
    if (generatedImage) {
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = `social-media-${topic.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // ------- helpers you had -------
  const extractHashtags = (content?: string): string[] => {
    if (!content) return [];
    const hashtagRegex = /#\w+/g;
    const matches = content.match(hashtagRegex);
    return matches ? [...new Set(matches.map((h) => h.slice(1).toLowerCase()))] : [];
  };

  const getContentWithoutHashtags = (content?: string): string => {
    if (!content) return '';
    const hashtagRegex = /#\w+/g;
    return content.replace(hashtagRegex, '').trim();
  };

  const extractKeywords = (content: string): string[] => {
    const contentWithoutHashtags = getContentWithoutHashtags(content);
    const words = contentWithoutHashtags.split(/\s+/);
    const stopWords = ['the', 'and', 'for', 'with', 'this', 'that', 'your', 'about', 'have', 'from'];
    const importantWords = words.filter(
      (word) => word.length > 5 && !stopWords.includes(word.toLowerCase())
    );
    return [...new Set(importantWords.map((w) => w.toLowerCase()))].slice(0, 5);
  };

  const displayHashtags = serverHashtags.length
    ? serverHashtags
    : extractHashtags(generatedContent);
  const displayKeywords = serverKeywords.length
    ? serverKeywords
    : extractKeywords(generatedContent);

  function fmt(ts?: string) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString();
  }

  // ------- UI -------
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-purple-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="text-center mb-6">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r text-white bg-clip-text mb-3">
            ✨ Social Media Content Creator
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            Generate engaging posts and stunning visuals for all your social platforms
          </p>
        </header>

        {/* Plan badge + Upgrade */}
        <div className="mb-4 flex items-center justify-between bg-white/70 dark:bg-gray-800 rounded-xl p-3 shadow">
          <div className="text-sm text-gray-700 dark:text-gray-200">
            Plan: <b>{PLAN_LIMITS[plan].label}</b> • Daily gens: {usedToday}/
            {PLAN_LIMITS[plan].gensPerDay} • Image:{' '}
            {PLAN_LIMITS[plan].imageRegen ? 'Enabled' : 'Locked'}
          </div>
          <button
            onClick={() => setShowPricing(true)}
            className="px-3 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm"
          >
            Upgrade
          </button>
        </div>

        {/* Layout: Sidebar + Main */}
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar: History */}
          <aside className="bg-white/70 dark:bg-gray-800 rounded-2xl shadow-xl p-4 h-fit md:sticky md:top-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">History</h2>
              <button
                onClick={loadHistory}
                className="text-sm px-2 py-1 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                {historyLoading ? '…' : 'Refresh'}
              </button>
            </div>

            {assistantHistory.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                No history yet. Generate something!
              </p>
            ) : (
              <ul className="space-y-2 max-h-[60vh] overflow-auto pr-1">
                {assistantHistory
                  .slice()
                  .reverse()
                  .map((m) => (
                    <li key={m.id}>
                      <button
                        onClick={() => setGeneratedContent(m.content)}
                        className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                        title={fmt(m.createdAt)}
                      >
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          {fmt(m.createdAt)}
                        </div>
                        <div className="line-clamp-3 text-sm text-gray-800 dark:text-gray-100">
                          {m.content}
                        </div>
                      </button>
                    </li>
                  ))}
              </ul>
            )}

            <button
              onClick={async () => {
                sessionStorage.removeItem('creatorConversationId');
                setConversationId(null);
                setHistory([]);
                try {
                  const res = await fetch(`${CHAT_BASE}/chat/conversations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                  });
                  const data = await res.json();
                  if (data?.id) {
                    setConversationId(data.id);
                    sessionStorage.setItem('creatorConversationId', data.id);
                    await loadHistory();
                  }
                } catch (e) {
                  console.warn('new thread failed:', e);
                }
              }}
              className="mt-4 w-full py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold hover:from-purple-700 hover:to-pink-600"
            >
              New Thread
            </button>
          </aside>

          {/* Main column */}
          <div>
            {/* Input Section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Topic or Idea
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Enter your topic..."
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-400 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Platform
                  </label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-400 focus:outline-none transition"
                  >
                    <option value="general">General</option>
                    <option value="instagram">Instagram</option>
                    <option value="twitter">Twitter/X</option>
                    <option value="facebook">Facebook</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="tiktok">TikTok</option>
                  </select>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Word Limit (optional)
                </label>
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={wordLimit}
                  onChange={(e) =>
                    setWordLimit(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="e.g., 80"
                  className="w-40 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-400 focus:outline-none transition"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Leave empty to let the model decide.
                </p>
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-600 active:scale-95 transform transition disabled:opacity-50 flex items-center justify-center"
              >
                {loading ? 'Generating...' : 'Generate Content'}
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-lg">
                <p>{error}</p>
                <button
                  onClick={() => setShowPricing(true)}
                  className="mt-2 underline text-purple-700"
                >
                  See plans
                </button>
              </div>
            )}

            {/* Results Section */}
            {generatedContent && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                    <span className="mr-2">📝</span> Generated Content
                  </h2>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={copyToClipboard}
                      className="p-2 text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 transition"
                      title="Copy to clipboard"
                    >
                      {copied ? '✓ Copied!' : '📋 Copy'}
                    </button>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-4">
                  <p className="text-gray-800 dark:text-gray-100 whitespace-pre-line text-lg">
                    {getContentWithoutHashtags(generatedContent)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 mb-4">
                  <button
                    onClick={handleGenerateHashtags}
                    disabled={hkLoading.tags}
                    className="px-4 py-2 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-100 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800"
                  >
                    {hkLoading.tags ? 'Generating Hashtags…' : 'Generate Hashtags'}
                  </button>
                  <button
                    onClick={handleGenerateKeywords}
                    disabled={hkLoading.kws}
                    className="px-4 py-2 bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-100 rounded-lg hover:bg-pink-200 dark:hover:bg-pink-800"
                  >
                    {hkLoading.kws ? 'Generating Keywords…' : 'Generate Keywords'}
                  </button>
                </div>

                {displayHashtags.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Hashtags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {displayHashtags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-sm"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {displayKeywords.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Keywords
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {displayKeywords.map((keyword, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-pink-100 dark:bg-pink-900 text-pink-800 dark:text-pink-200 rounded-full text-sm"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <button
                    onClick={() => {
                      const tags = displayHashtags.join(',');
                      const query = new URLSearchParams({
                        caption: generatedContent,
                        hashtags: tags,
                        platform,
                      });
                      if (conversationId) query.set('cid', conversationId);
                      router.push(`/contentModerator?${query.toString()}`);
                    }}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
                  >
                    Moderate this Content
                  </button>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
                    <span className="mr-2">🖼️</span> Visual Content
                  </h3>

                  {imageLoading ? (
                    <p className="text-gray-600 dark:text-gray-300">Generating your visual...</p>
                  ) : generatedImage ? (
                    <div className="space-y-4">
                      <div className="flex justify-center">
                        <Image
                          src={generatedImage}
                          alt="Generated for social media"
                          width={1024}
                          height={1024}
                          className="max-w-full h-auto rounded-lg shadow-md max-h-80 object-contain"
                        />
                      </div>
                      <div className="flex justify-end space-x-3">
                        <button
                          onClick={downloadImage}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center"
                        >
                          <span className="mr-2">⬇️</span> Download Image
                        </button>
                        <button
                          onClick={handleGenerateImage}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          Regenerate Image
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleGenerateImage}
                      className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-400 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-pink-500 flex items-center justify-center"
                    >
                      <span className="mr-2">✨</span> Generate Matching Visual image
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-gray-500 dark:text-gray-400 text-sm mt-8">
          <p>© {new Date().getFullYear()} Social Media Content Creator Pro. All rights reserved.</p>
        </footer>
      </div>

      {/* Pricing Modal (frontend-only mock) */}
      {showPricing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold">Choose a plan</h3>
              <button onClick={() => setShowPricing(false)} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Free */}
              <div className="border rounded-xl p-4">
                <h4 className="text-xl font-semibold mb-1">Free</h4>
                <p className="text-3xl font-bold mb-2">$0</p>
                <ul className="text-sm space-y-1 mb-4">
                  <li>✅ 20 generations / day</li>
                  <li>✅ Basic hashtags/keywords</li>
                  <li>🚫 Image generation</li>
                </ul>
                <button
                  onClick={() => {
                    savePlan('free');
                    setPlan('free');
                    setShowPricing(false);
                  }}
                  className={`w-full py-2 rounded-lg ${
                    plan === 'free' ? 'bg-gray-300' : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                >
                  {plan === 'free' ? 'Current' : 'Switch'}
                </button>
              </div>

              {/* Pro */}
              <div className="border rounded-xl p-4 ring-2 ring-purple-400">
                <h4 className="text-xl font-semibold mb-1">Pro</h4>
                <p className="text-3xl font-bold mb-2">$9</p>
                <ul className="text-sm space-y-1 mb-4">
                  <li>✅ 300 generations / day</li>
                  <li>✅ Advanced tags/keywords</li>
                  <li>✅ Image generation</li>
                </ul>
                <button
                  onClick={() => {
                    savePlan('pro');
                    setPlan('pro');
                    setShowPricing(false);
                  }}
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 text-white"
                >
                  Select Pro
                </button>
              </div>

              {/* Team */}
              <div className="border rounded-xl p-4">
                <h4 className="text-xl font-semibold mb-1">Team</h4>
                <p className="text-3xl font-bold mb-2">$29</p>
                <ul className="text-sm space-y-1 mb-4">
                  <li>✅ 1000 generations / day</li>
                  <li>✅ Shared history</li>
                  <li>✅ Priority support</li>
                </ul>
                <button
                  onClick={() => {
                    savePlan('team');
                    setPlan('team');
                    setShowPricing(false);
                  }}
                  className="w-full py-2 rounded-lg bg-gray-900 text-white hover:bg-black"
                >
                  Select Team
                </button>
              </div>
            </div>

            <p className="mt-4 text-xs text-gray-500">* Demo only: plans are stored locally in your browser.</p>
          </div>
        </div>
      )}
    </div>
  );
}
