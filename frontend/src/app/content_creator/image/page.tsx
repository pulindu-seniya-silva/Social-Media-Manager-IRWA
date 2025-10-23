'use client';

import React, { useState } from 'react';
import Image from 'next/image';

const API_BASE = process.env.NEXT_PUBLIC_CHAT_BASE || 'http://127.0.0.1:8000';

type PlanName = 'free' | 'pro' | 'team';
function loadPlan(): PlanName {
  try { return (localStorage.getItem('plan') as PlanName) || 'free'; } catch { return 'free'; }
}
function ensureClientId(): string {
  try {
    let cid = localStorage.getItem('clientId');
    if (!cid) { cid = 'cid-' + Math.random().toString(36).slice(2); localStorage.setItem('clientId', cid); }
    return cid;
  } catch { return 'cid-anon'; }
}

export default function ImageAnalyzePage() {
  const [uploadPreview, setUploadPreview] = useState<string>('');
  const [uploadBase64, setUploadBase64] = useState<string>('');
  const [platform, setPlatform] = useState('instagram');
  const [tone, setTone] = useState('professional');
  const [wordLimit, setWordLimit] = useState<number | ''>('');
  const [topic, setTopic] = useState('');
  const [caption, setCaption] = useState('');
  const [variationUrl, setVariationUrl] = useState('');
  const [error, setError] = useState('');
  const [loadingCaption, setLoadingCaption] = useState(false);
  const [loadingVariation, setLoadingVariation] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [plan, setPlan] = useState<PlanName>('free');
  const [clientId, setClientId] = useState<string>('cid-anon');

  React.useEffect(() => {
    setPlan(loadPlan());
    setClientId(ensureClientId());
  }, []);

  const authHeaders = { 'X-Plan': plan, 'X-Client-Id': clientId } as const;

  const onImageSelect = (file: File | null) => {
    if (!file) {
      setUploadPreview('');
      setUploadBase64('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setUploadPreview(result);
      const commaIdx = result.indexOf(',');
      const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      setUploadBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!uploadBase64) {
      setError('Please upload an image first.');
      return;
    }
    setLoadingCaption(true);
    setError('');
    setCaption('');
    try {
      const res = await fetch(`${API_BASE}/content/generate-content-from-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          image_base64: uploadBase64,
          platform,
          tone,
          word_limit: wordLimit === '' ? null : Number(wordLimit),
          topic: topic || undefined,
        }),
      });
      
      if (!res.ok) {
        if (res.status === 402) {
          setError('Image generation requires Pro or Team plan. Please upgrade your plan.');
        } else if (res.status === 429) {
          setError('Daily limit reached. Please try again tomorrow or upgrade your plan.');
        } else {
          setError(`Server error: ${res.status}`);
        }
        setCaption('');
        return;
      }
      
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setCaption('');
      } else {
        setCaption(data.content || '');
        setError('');
      }
    } catch (e) {
      setError('Failed to generate caption from image.');
    } finally {
      setLoadingCaption(false);
    }
  };

  const handleVariation = async () => {
    if (!uploadBase64) {
      setError('Please upload an image first.');
      return;
    }
    setLoadingVariation(true);
    setError('');
    setVariationUrl('');
    try {
      const res = await fetch(`${API_BASE}/content/generate-image-variation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ image_base64: uploadBase64, prompt: topic || undefined, size: '1024x1024' }),
      });
      
      if (!res.ok) {
        if (res.status === 402) {
          setError('Image generation requires Pro or Team plan. Please upgrade your plan.');
        } else if (res.status === 429) {
          setError('Daily limit reached. Please try again tomorrow or upgrade your plan.');
        } else {
          setError(`Server error: ${res.status}`);
        }
        setVariationUrl('');
        return;
      }
      
      const data = await res.json();
      console.log('Image variation API response:', data);
      
      if (data.error) {
        setError(data.error);
        setVariationUrl('');
      } else {
        const imageUrl = data.image_url || '';
        console.log('Setting variation URL:', imageUrl);
        setVariationUrl(imageUrl);
        setError('');
      }
    } catch (e) {
      setError('Failed to generate image variation.');
    } finally {
      setLoadingVariation(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-cyan-50 dark:from-gray-950 dark:via-indigo-950 dark:to-purple-950 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600">
              🧠 Image Analyzer
            </h1>
            <p className="text-gray-700 dark:text-gray-300 mt-1">Upload an image and generate a platform-aware caption.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Uploader */}
          <div className="rounded-2xl bg-white/80 dark:bg-gray-900 border border-indigo-100 dark:border-gray-800 shadow-xl p-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upload Image</label>
              <div className="border-2 border-dashed rounded-xl p-6 text-center bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onImageSelect(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-700 dark:text-gray-200 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {uploadPreview ? (
                  <div className="mt-4">
                    <Image src={uploadPreview} alt="preview" width={640} height={640} className="rounded-xl border border-gray-200 dark:border-gray-700 object-contain max-h-80 mx-auto" />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Drag and drop, or click to select an image.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">Platform</label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  <option value="instagram">Instagram</option>
                  <option value="twitter">Twitter/X</option>
                  <option value="facebook">Facebook</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="tiktok">TikTok</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">Tone</label>
                <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="funny">Funny</option>
                  <option value="inspirational">Inspirational</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">Word Limit</label>
                <input type="number" min={10} max={300} value={wordLimit} onChange={(e) => setWordLimit(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g., 80" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">Optional Topic Hint</label>
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g., eco-friendly travel tips" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
            </div>

            <button onClick={handleGenerate} disabled={!uploadBase64 || loadingCaption} className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 text-white font-semibold hover:from-indigo-700 hover:via-purple-700 hover:to-cyan-700 disabled:opacity-50">
              {loadingCaption ? 'Generating…' : 'Generate Caption from Image'}
            </button>

            <button onClick={handleVariation} disabled={!uploadBase64 || loadingVariation} className="mt-3 w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-500 text-white font-semibold hover:from-cyan-700 hover:to-blue-600 disabled:opacity-50">
              {loadingVariation ? 'Creating Variation…' : 'Generate New Image from This'}
            </button>

            {error && (
              <div className="mt-3 bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded-lg">
                {error}
                {error.includes('Pro or Team plan') && (
                  <div className="mt-2">
                    <button 
                      onClick={() => {
                        // You can implement plan upgrade logic here
                        alert('Plan upgrade functionality would be implemented here');
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      Upgrade Plan
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Result */}
          <div className="rounded-2xl bg-white/80 dark:bg-gray-900 border border-purple-100 dark:border-gray-800 shadow-xl p-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Generated Caption</h2>
            <div className="mt-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 min-h-[200px] text-gray-800 dark:text-gray-100 whitespace-pre-line">
              {caption || 'Your caption will appear here.'}
            </div>
            {caption && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => navigator.clipboard.writeText(caption)}
                  className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Copy
                </button>
              </div>
            )}

            {variationUrl && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">Generated Image</h3>
                <div className="flex justify-center">
                  {imageLoading && (
                    <div className="flex items-center justify-center w-full h-64 bg-gray-100 dark:bg-gray-800 rounded-xl">
                      <div className="text-gray-600 dark:text-gray-400">Loading image...</div>
                    </div>
                  )}
                  <img 
                    src={variationUrl} 
                    alt="Generated variation" 
                    width={1024} 
                    height={1024} 
                    className={`rounded-xl border border-gray-200 dark:border-gray-700 object-contain max-h-96 ${imageLoading ? 'hidden' : ''}`}
                    onLoadStart={() => setImageLoading(true)}
                    onError={(e) => {
                      console.error('Image failed to load:', variationUrl);
                      setImageLoading(false);
                      e.currentTarget.style.display = 'none';
                      setError('Failed to load generated image. The image URL may be invalid or expired.');
                    }}
                    onLoad={() => {
                      setImageLoading(false);
                      setError(''); // Clear any previous errors when image loads successfully
                    }}
                  />
                </div>
                {variationUrl && !imageLoading && (
                  <div className="mt-3 flex justify-end gap-3">
                    <a href={variationUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700">View Full Size</a>
                    <a href={variationUrl} download className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700">Download</a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


