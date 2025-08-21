'use client'

import { useState } from "react";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setGeneratedContent("");

    try {
      const res = await fetch("http://127.0.0.1:8000/content/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });

      const data = await res.json();
      setGeneratedContent(data.content);
    } catch (err) {
      console.error(err);
      setGeneratedContent("Failed to generate content.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="font-sans flex flex-col items-center justify-start min-h-screen p-8 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 text-center">
      <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-2">
        🚀 Social Media Manager AI
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
        Enter a topic and instantly generate engaging social media posts!
      </p>

      {/* Input + Button */}
      <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter your topic..."
          className="px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 w-72 sm:w-96 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-400 focus:outline-none transition"
        />
        <button
          onClick={handleGenerate}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transform transition"
        >
          {loading ? "Generating..." : "Generate Post"}
        </button>
      </div>

      {/* Generated Content */}
      {generatedContent && (
        <div className="max-w-md w-full mt-6 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 animate-fadeIn">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-gray-700 dark:text-gray-200">📝 Generated Post</span>
            <span className="text-sm text-gray-400 dark:text-gray-500">{new Date().toLocaleTimeString()}</span>
          </div>
          <p className="text-gray-800 dark:text-gray-100">{generatedContent}</p>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-16 text-sm text-gray-500 dark:text-gray-400">
        © {new Date().getFullYear()} Social Media Manager. All rights reserved.
      </footer>
    </div>
  );
}
