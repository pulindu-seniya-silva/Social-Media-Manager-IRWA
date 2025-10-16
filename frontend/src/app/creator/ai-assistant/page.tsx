'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Download, Copy, RefreshCw, Film, Clock, Users, Target, Sparkles, CheckCircle, AlertCircle, Video, Loader2, X } from 'lucide-react';

// Types
interface VideoScript {
  script: string;
  platform: string;
  duration: number;
  style: string;
  word_count: number;
}

interface VideoOutline {
  outline: string;
  platform: string;
  duration: number;
  style: string;
}

interface VideoIdeas {
  ideas: string;
  platform: string;
  duration: number;
  style: string;
  topic: string;
}

interface SceneDetails {
  scene_number: number;
  scene_details: string;
  duration: number;
  style: string;
}

interface VideoGeneration {
  video_id: string;
  status: 'processing' | 'completed' | 'failed' | 'not_found';
  progress: number;
  video_url?: string;
  thumbnail_url?: string;
  error_message?: string;
  created_at: string;
  estimated_completion?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

export default function VideoCreatorPage() {
  const router = useRouter();
  
  // State management
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('general');
  const [duration, setDuration] = useState(60);
  const [style, setStyle] = useState('professional');
  const [targetAudience, setTargetAudience] = useState('general');
  const [includeVisuals, setIncludeVisuals] = useState(true);
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  
  // Generated content
  const [generatedScript, setGeneratedScript] = useState<VideoScript | null>(null);
  const [generatedOutline, setGeneratedOutline] = useState<VideoOutline | null>(null);
  const [generatedIdeas, setGeneratedIdeas] = useState<VideoIdeas | null>(null);
  const [sceneDetails, setSceneDetails] = useState<SceneDetails | null>(null);
  
  // Video generation
  const [videoGeneration, setVideoGeneration] = useState<VideoGeneration | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('script');
  const [copied, setCopied] = useState(false);

  // Platform options
  const platforms = [
    { value: 'general', label: 'General' },
    { value: 'instagram', label: 'Instagram Reels' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'youtube', label: 'YouTube Shorts' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'twitter', label: 'Twitter' }
  ];

  // Style options
  const styles = [
    { value: 'professional', label: 'Professional' },
    { value: 'casual', label: 'Casual' },
    { value: 'educational', label: 'Educational' },
    { value: 'entertaining', label: 'Entertaining' },
    { value: 'inspirational', label: 'Inspirational' },
    { value: 'trendy', label: 'Trendy' }
  ];

  // Duration options
  const durations = [
    { value: 15, label: '15 seconds' },
    { value: 30, label: '30 seconds' },
    { value: 60, label: '1 minute' },
    { value: 90, label: '1.5 minutes' },
    { value: 120, label: '2 minutes' },
    { value: 180, label: '3 minutes' }
  ];

  // API calls
  const generateScript = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic first!');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE}/video/generate-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          platform,
          duration,
          style,
          target_audience: targetAudience,
          include_visuals: includeVisuals,
          include_voiceover: includeVoiceover
        })
      });

      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setGeneratedScript(data);
        setActiveTab('script');
      }
    } catch (err) {
      setError('Failed to generate script. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const generateOutline = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic first!');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE}/video/generate-outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          platform,
          duration,
          style
        })
      });

      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setGeneratedOutline(data);
        setActiveTab('outline');
      }
    } catch (err) {
      setError('Failed to generate outline. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const generateIdeas = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic first!');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE}/video/generate-video-ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          platform,
          duration,
          style
        })
      });

      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setGeneratedIdeas(data);
        setActiveTab('ideas');
      }
    } catch (err) {
      setError('Failed to generate ideas. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const generateSceneDetails = async (sceneNumber: number) => {
    if (!generatedScript?.script) {
      setError('Please generate a script first!');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE}/video/generate-scene-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: generatedScript.script,
          scene_number: sceneNumber,
          duration: Math.floor(duration / 3), // Approximate scene duration
          style
        })
      });

      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setSceneDetails(data);
        setActiveTab('scenes');
      }
    } catch (err) {
      setError('Failed to generate scene details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Video generation functions
  const generateVideo = async () => {
    if (!generatedScript?.script) {
      setError('Please generate a script first!');
      return;
    }

    setIsGeneratingVideo(true);
    setError('');
    setVideoGeneration(null);
    setVideoProgress(0);
    
    try {
      const response = await fetch(`${API_BASE}/video/create-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: generatedScript.script,
          platform: generatedScript.platform,
          style: generatedScript.style,
          duration: Math.min(generatedScript.duration, 10) // Runway has limits
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        setError(typeof data === 'object' && data && 'detail' in data ? String(data.detail) : 'Failed to start video generation.');
      } else if (data && data.video_id) {
        setVideoGeneration(data);
        setActiveTab('video');
        // Start polling for status
        pollVideoStatus(data.video_id);
      } else if (data && data.error_message) {
        setError(data.error_message);
      } else {
        setError('Failed to start video generation (no video id).');
      }
    } catch (err) {
      setError('Failed to start video generation. Please try again.');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const pollVideoStatus = async (videoId: string) => {
    if (!videoId) return;
    // Clear any existing poller
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/video/video-status/${videoId}`);
        const data = await response.json();
        
        setVideoGeneration(data);
        setVideoProgress(data.progress);
        
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollInterval);
          pollIntervalRef.current = null;
          setIsGeneratingVideo(false);
        }
      } catch (err) {
        console.error('Error polling video status:', err);
        clearInterval(pollInterval);
        pollIntervalRef.current = null;
        setIsGeneratingVideo(false);
      }
    }, 3000); // Poll every 3 seconds
    pollIntervalRef.current = pollInterval;
  };

  const downloadVideo = () => {
    if (!videoGeneration?.video_url) return;
    
    const link = document.createElement('a');
    link.href = videoGeneration.video_url;
    link.download = `video-${topic.replace(/\s+/g, '-').toLowerCase()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Demo video generation (no paid API)
  const generateDemoVideo = async () => {
    const scriptText = generatedScript?.script || (topic ? `Title: ${topic}\n\nPlease demonstrate a short AI-generated demo video.` : 'AI Generated Demo Video');
    setActiveTab('video');
    setError('');
    setIsGeneratingVideo(true);
    setVideoProgress(0);
    try {
      const res = await fetch(`${API_BASE}/video/create-demo-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: scriptText,
          title: 'AI Demo Video',
          duration: Math.min(Math.max(duration, 6), 12),
          width: 1280,
          height: 720,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(typeof data?.error === 'string' ? data.error : 'Demo video generation failed');
        setIsGeneratingVideo(false);
        return;
      }
      setVideoGeneration(data);
      setVideoProgress(100);
      setIsGeneratingVideo(false);
    } catch (e) {
      setError('Demo video generation failed.');
      setIsGeneratingVideo(false);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadScript = () => {
    if (!generatedScript?.script) return;
    
    const blob = new Blob([generatedScript.script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `video-script-${topic.replace(/\s+/g, '-').toLowerCase()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-purple-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-3">
            🎬 AI Video Creator
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            Transform your ideas into engaging video content with AI-powered scripts, outlines, and production guidance
          </p>
        </header>

        {/* Input Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Video Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter your video topic..."
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
                {platforms.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-400 focus:outline-none transition"
              >
                {durations.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Style
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-400 focus:outline-none transition"
              >
                {styles.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Target Audience
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g., young professionals, students..."
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-400 focus:outline-none transition"
              />
            </div>

            <div className="flex flex-col space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeVisuals}
                  onChange={(e) => setIncludeVisuals(e.target.checked)}
                  className="mr-2 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Include Visual Cues</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeVoiceover}
                  onChange={(e) => setIncludeVoiceover(e.target.checked)}
                  className="mr-2 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Include Voiceover Notes</span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={generateScript}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-600 active:scale-95 transform transition disabled:opacity-50 flex items-center"
            >
              {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Film className="w-4 h-4 mr-2" />}
              Generate Script
            </button>
            
            <button
              onClick={generateOutline}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-cyan-600 active:scale-95 transform transition disabled:opacity-50 flex items-center"
            >
              {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Target className="w-4 h-4 mr-2" />}
              Create Outline
            </button>
            
            <button
              onClick={generateIdeas}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-500 text-white font-semibold rounded-lg hover:from-green-700 hover:to-emerald-600 active:scale-95 transform transition disabled:opacity-50 flex items-center"
            >
              {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Get Ideas
            </button>

            {generatedScript && (
              <button
                onClick={generateVideo}
                disabled={isGeneratingVideo}
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-orange-500 text-white font-semibold rounded-lg hover:from-red-700 hover:to-orange-600 active:scale-95 transform transition disabled:opacity-50 flex items-center"
              >
                {isGeneratingVideo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Video className="w-4 h-4 mr-2" />}
                {isGeneratingVideo ? 'Generating Video...' : 'Generate Video'}
              </button>
            )}

            {/* Always-available demo button (uses local generator) */}
            <button
              onClick={generateDemoVideo}
              disabled={isGeneratingVideo}
              className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-800 text-white font-semibold rounded-lg hover:from-gray-700 hover:to-gray-900 active:scale-95 transform transition disabled:opacity-50 flex items-center"
            >
              {isGeneratingVideo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Video className="w-4 h-4 mr-2" />}
              {isGeneratingVideo ? 'Generating Demo...' : 'Generate Demo Video (Free)'}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-lg flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            <p>{error}</p>
          </div>
        )}

        {/* Results Section */}
        {(generatedScript || generatedOutline || generatedIdeas || videoGeneration) && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
              {generatedScript && (
                <button
                  onClick={() => setActiveTab('script')}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    activeTab === 'script'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  📝 Script
                </button>
              )}
              {generatedOutline && (
                <button
                  onClick={() => setActiveTab('outline')}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    activeTab === 'outline'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  📋 Outline
                </button>
              )}
              {generatedIdeas && (
                <button
                  onClick={() => setActiveTab('ideas')}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    activeTab === 'ideas'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  💡 Ideas
                </button>
              )}
              {generatedScript && (
                <button
                  onClick={() => setActiveTab('scenes')}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    activeTab === 'scenes'
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  🎬 Scenes
                </button>
              )}
              {videoGeneration && (
                <button
                  onClick={() => setActiveTab('video')}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    activeTab === 'video'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  🎥 Video
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="space-y-6">
              {/* Script Tab */}
              {activeTab === 'script' && generatedScript && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                      <Film className="w-5 h-5 mr-2" />
                      Generated Script
                    </h3>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyToClipboard(generatedScript.script)}
                        className="p-2 text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 transition"
                        title="Copy script"
                      >
                        {copied ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={downloadScript}
                        className="p-2 text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 transition"
                        title="Download script"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 dark:text-gray-300">
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-1" />
                        {generatedScript.duration}s
                      </div>
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-1" />
                        {generatedScript.platform}
                      </div>
                      <div className="flex items-center">
                        <Target className="w-4 h-4 mr-1" />
                        {generatedScript.style}
                      </div>
                      <div className="flex items-center">
                        <span className="w-4 h-4 mr-1">📝</span>
                        {generatedScript.word_count} words
                      </div>
                    </div>
                  </div>
                  
                  <div className="prose dark:prose-invert max-w-none">
                    <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-100 font-mono text-sm leading-relaxed">
                      {generatedScript.script}
                    </pre>
                  </div>
                  
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => generateSceneDetails(1)}
                      className="px-4 py-2 bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-800 transition"
                    >
                      Generate Scene 1 Details
                    </button>
                    <button
                      onClick={() => generateSceneDetails(2)}
                      className="px-4 py-2 bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-800 transition"
                    >
                      Generate Scene 2 Details
                    </button>
                    <button
                      onClick={() => generateSceneDetails(3)}
                      className="px-4 py-2 bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-800 transition"
                    >
                      Generate Scene 3 Details
                    </button>
                  </div>
                </div>
              )}

              {/* Outline Tab */}
              {activeTab === 'outline' && generatedOutline && (
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                    <Target className="w-5 h-5 mr-2" />
                    Video Outline
                  </h3>
                  <div className="prose dark:prose-invert max-w-none">
                    <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-100 font-mono text-sm leading-relaxed">
                      {generatedOutline.outline}
                    </pre>
                  </div>
                </div>
              )}

              {/* Ideas Tab */}
              {activeTab === 'ideas' && generatedIdeas && (
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                    <Sparkles className="w-5 h-5 mr-2" />
                    Video Ideas
                  </h3>
                  <div className="prose dark:prose-invert max-w-none">
                    <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-100 font-mono text-sm leading-relaxed">
                      {generatedIdeas.ideas}
                    </pre>
                  </div>
                </div>
              )}

              {/* Scenes Tab */}
              {activeTab === 'scenes' && sceneDetails && (
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                    <Play className="w-5 h-5 mr-2" />
                    Scene {sceneDetails.scene_number} Details
                  </h3>
                  <div className="prose dark:prose-invert max-w-none">
                    <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-100 font-mono text-sm leading-relaxed">
                      {sceneDetails.scene_details}
                    </pre>
                  </div>
                </div>
              )}

              {/* Video Tab */}
              {activeTab === 'video' && videoGeneration && (
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                    <Video className="w-5 h-5 mr-2" />
                    Generated Video
                  </h3>
                  
                  {videoGeneration.status === 'processing' && (
                    <div className="space-y-4">
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <Loader2 className="w-5 h-5 mr-2 animate-spin text-blue-600" />
                          <span className="font-medium text-blue-800 dark:text-blue-200">
                            Generating your video...
                          </span>
                        </div>
                        <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${videoProgress}%` }}
                          ></div>
                        </div>
                        <p className="text-sm text-blue-600 dark:text-blue-300 mt-2">
                          Progress: {videoProgress}% - This may take a few minutes
                        </p>
                      </div>
                    </div>
                  )}

                  {videoGeneration.status === 'completed' && videoGeneration.video_url && (
                    <div className="space-y-4">
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                          <span className="font-medium text-green-800 dark:text-green-200">
                            Video generated successfully!
                          </span>
                        </div>
                      </div>
                      
                      {/* Runway guidance if video URL is a local demo file */}
                      {videoGeneration.video_url.startsWith('/video/demo/') && (
                        <div className="rounded-xl border border-blue-300/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-900 dark:text-blue-100">
                          <div className="font-semibold mb-1">About this video</div>
                          <p>
                            This is a local <b>Demo Video</b> used for presentation when Runway ML is not available. To enable real-time AI video generation:
                          </p>
                          <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li>Purchase Runway ML credits</li>
                            <li>Add your API key as <code className="px-1 py-0.5 rounded bg-blue-100/60 dark:bg-blue-800/50">RUNWAY_API_KEY</code> to the backend <code className="px-1 py-0.5 rounded bg-blue-100/60 dark:bg-blue-800/50">.env</code></li>
                            <li>Restart the backend and click <b>Generate Video</b></li>
                          </ul>
                        </div>
                      )}

                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        <video 
                          controls 
                          className="w-full max-w-2xl mx-auto rounded-lg shadow-lg"
                          poster={videoGeneration.thumbnail_url}
                        >
                          <source src={videoGeneration.video_url} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      </div>
                      
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={downloadVideo}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Video
                        </button>
                        <button
                          onClick={() => copyToClipboard(videoGeneration.video_url!)}
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Link
                        </button>
                      </div>
                    </div>
                  )}

                  {videoGeneration.status === 'failed' && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-2">
                      <div className="flex items-center">
                        <X className="w-5 h-5 mr-2 text-red-600" />
                        <span className="font-semibold text-red-800 dark:text-red-200">Video generation unavailable</span>
                      </div>
                      <p className="text-sm text-red-700 dark:text-red-200">
                        Real-time AI video requires an active Runway ML account with credits. For the viva, you can demonstrate using the built-in <b>Demo Video</b> which does not need any API.
                      </p>
                      <ul className="text-sm text-red-700 dark:text-red-200 list-disc pl-5">
                        <li>Add <code className="px-1 rounded bg-red-100/60 dark:bg-red-800/40">RUNWAY_API_KEY</code> to the backend <code className="px-1 rounded bg-red-100/60 dark:bg-red-800/40">.env</code></li>
                        <li>Ensure the account has sufficient credits/payment</li>
                        <li>Restart the backend, then click <b>Generate Video</b> again</li>
                      </ul>
                      {videoGeneration.error_message && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs opacity-80">Technical details</summary>
                          <pre className="mt-1 text-xs whitespace-pre-wrap opacity-80">{videoGeneration.error_message}</pre>
                        </details>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={generateVideo}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          Try Again
                        </button>
                        <button
                          onClick={generateDemoVideo}
                          className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800"
                        >
                          Use Demo Video
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-gray-500 dark:text-gray-400 text-sm mt-8">
          <p>© {new Date().getFullYear()} AI Video Creator. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
