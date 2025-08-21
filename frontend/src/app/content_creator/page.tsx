'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("general");
  const [tone, setTone] = useState("professional");
  const [generatedContent, setGeneratedContent] = useState("");
  const [generatedImage, setGeneratedImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic first!");
      return;
    }

    setLoading(true);
    setGeneratedContent("");
    setGeneratedImage("");
    setError("");
    setCopied(false);

    try {
      const res = await fetch("http://127.0.0.1:8000/content/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          topic,
          platform,
          tone 
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setGeneratedContent(data.content);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to generate content. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImage = async () => {
    setImageLoading(true);
    setGeneratedImage("");
    setError("");
    
    try {
      const res = await fetch("http://127.0.0.1:8000/content/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          topic, 
          content: generatedContent,
          platform 
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
      setError("Failed to generate image. Please try again.");
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

  // Function to extract hashtags
  const extractHashtags = (content: string): string[] => {
    const hashtagRegex = /#\w+/g;
    const matches = content.match(hashtagRegex);
    return matches ? matches : [];
  };

  // Function to remove hashtags
  const getContentWithoutHashtags = (content: string): string => {
    const hashtagRegex = /#\w+/g;
    return content.replace(hashtagRegex, '').trim();
  };

  // Simple keyword extraction
  const extractKeywords = (content: string): string[] => {
    const contentWithoutHashtags = getContentWithoutHashtags(content);
    const words = contentWithoutHashtags.split(/\s+/);
    const stopWords = ['the', 'and', 'for', 'with', 'this', 'that', 'your', 'about', 'have', 'from'];
    const importantWords = words.filter(word => 
      word.length > 5 && 
      !stopWords.includes(word.toLowerCase())
    );
    return [...new Set(importantWords)].slice(0, 5);
  };

  // 🔹 Navigate to moderator page with generated content
  const goToModerator = () => {
    if (!generatedContent) {
      setError("Please generate content first!");
      return;
    }

    // Pass generatedContent via query param (or localStorage if bigger)
    const query = new URLSearchParams({
      caption: generatedContent,
      hashtags: extractHashtags(generatedContent).join(","),
      platform
    }).toString();

    router.push(`/contentModerator?${query}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-purple-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent mb-3">
            ✨ Social Media Content Creator
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            Generate engaging posts and stunning visuals for all your social platforms
          </p>
        </header>

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
              Tone
            </label>
            <div className="flex flex-wrap gap-3">
              {['professional', 'casual', 'funny', 'inspirational', 'urgent'].map((toneOption) => (
                <button
                  key={toneOption}
                  onClick={() => setTone(toneOption)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${tone === toneOption 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-purple-100 dark:hover:bg-purple-800'}`}
                >
                  {toneOption.charAt(0).toUpperCase() + toneOption.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-600 active:scale-95 transform transition disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? "Generating..." : "Generate Content"}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-lg">
            <p>{error}</p>
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

            {/* 🔹 Navigate to Moderator Page */}
            <div className="mt-4">
              <button
                onClick={goToModerator}
                className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
              >
                Moderate this Content
              </button>
            </div>

            {/* existing image section unchanged */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
                <span className="mr-2">🖼️</span> Visual Content
              </h3>
              
              {imageLoading ? (
                <p className="text-gray-600 dark:text-gray-300">Generating your visual...</p>
              ) : generatedImage ? (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <img 
                      src={generatedImage} 
                      alt="Generated for social media" 
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
                  <span className="mr-2">✨</span> Generate Matching Visual
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-gray-500 dark:text-gray-400 text-sm mt-12">
          <p>© {new Date().getFullYear()} Social Media Content Creator Pro. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
