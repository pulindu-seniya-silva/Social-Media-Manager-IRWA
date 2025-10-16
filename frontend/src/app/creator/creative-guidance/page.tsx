'use client';

import React, { useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_CHAT_BASE || 'http://127.0.0.1:8000';

export default function CreativeGuidancePage() {
  const [url, setUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [platform, setPlatform] = useState('general');
  const [tone, setTone] = useState('professional');
  const [wordLimit, setWordLimit] = useState<number | ''>('');
  const [draft, setDraft] = useState('');
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [error, setError] = useState('');

  const canAnalyze = useMemo(() => /^https?:\/\//.test(url), [url]);

  const handleAnalyze = async () => {
    if (!canAnalyze) return;
    setLoadingAnalyze(true);
    setError('');
    setSummary('');
    try {
      const res = await fetch(`${API_BASE}/engagement/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setSummary(data.summary || '');
    } catch (e) {
      setError('Failed to analyze the link.');
    } finally {
      setLoadingAnalyze(false);
    }
  };

  const handleQA = async () => {
    if (!canAnalyze || !question.trim()) return;
    setLoadingAsk(true);
    setError('');
    setAnswer('');
    try {
      const res = await fetch(`${API_BASE}/engagement/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, question, summary_hint: summary || undefined }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setAnswer(data.answer || '');
    } catch (e) {
      setError('Failed to answer your question.');
    } finally {
      setLoadingAsk(false);
    }
  };

  const handleDraft = async () => {
    if (!canAnalyze) return;
    setLoadingDraft(true);
    setError('');
    setDraft('');
    try {
      const res = await fetch(`${API_BASE}/engagement/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          platform,
          tone,
          word_limit: wordLimit === '' ? null : Number(wordLimit),
          summary_hint: summary || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setDraft(data.content || '');
    } catch (e) {
      setError('Failed to draft a post.');
    } finally {
      setLoadingDraft(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-gray-900 dark:to-blue-900 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-6">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r text-white bg-clip-text mb-3">💡 Creative Guidance</h1>
          <p className="text-gray-700 dark:text-gray-300 text-lg">Paste a public post/article link, ask questions, and draft your own post.</p>
        </header>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-8">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Public URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-400 focus:outline-none transition"
          />
          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze || loadingAnalyze}
            className="mt-3 w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-cyan-600 disabled:opacity-50"
          >
            {loadingAnalyze ? 'Analyzing…' : 'Analyze Link'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-lg">
            <p>{error}</p>
          </div>
        )}

        {summary && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">Summary</h2>
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg whitespace-pre-line text-gray-800 dark:text-gray-100">{summary}</div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">Ask Questions</h3>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do you want to know about this post?"
              className="w-full h-28 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-400"
            />
            <button onClick={handleQA} disabled={!canAnalyze || !question.trim() || loadingAsk} className="mt-2 w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{loadingAsk ? 'Answering…' : 'Ask'}</button>
            {answer && (
              <div className="mt-4 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-gray-800 dark:text-gray-100 whitespace-pre-line">{answer}</div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">Draft Your Post</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="general">General</option>
                <option value="instagram">Instagram</option>
                <option value="twitter">Twitter/X</option>
                <option value="facebook">Facebook</option>
                <option value="linkedin">LinkedIn</option>
                <option value="tiktok">TikTok</option>
              </select>
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="funny">Funny</option>
                <option value="inspirational">Inspirational</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Word Limit (optional)</label>
              <input
                type="number"
                min={10}
                max={300}
                value={wordLimit}
                onChange={(e) => setWordLimit(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g., 80"
                className="w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <button onClick={handleDraft} disabled={!canAnalyze || loadingDraft} className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg hover:from-purple-700 hover:to-pink-600 disabled:opacity-50">{loadingDraft ? 'Drafting…' : 'Draft from Link'}</button>
            {draft && (
              <div className="mt-4 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-gray-800 dark:text-gray-100 whitespace-pre-line">{draft}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


