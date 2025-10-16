"use client";

import React, { useState, FC, PropsWithChildren } from "react";
import Image from "next/image"; // FIX: Import the next/image component
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";
import {
  Sparkles, Lightbulb, Search, Bot, UploadCloud, FileCheck2, TrendingUp, FileText, BarChart2, ChevronDown, Rocket, Megaphone, Target,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// --- Types ---
type PostDetails = {
  id: number;
  post_title: string;
  created_date: string | null;
  likes: number;
  comments: number;
  shares: number;
  engagement_rate: number;
};

type RecommendationDetail = {
    title: string;
    description: string;
}

type StrategicRecommendation = {
    theme: string;
    reason: string;
    recommendations: RecommendationDetail[];
}

type TopPostAnalysis = {
  post_title: string;
  engagement_rate: number;
  likes: number;
  comments: number;
  shares: number;
  external_context_summary: string;
  relevant_urls: string[];
  strategic_recommendations: StrategicRecommendation;
  upcoming_trends: string[];
};

type InitialAnalysisResponse = {
  total_posts_analyzed: number;
  average_engagement_rate: number;
  posts: PostDetails[];
};

// FIX: Add a type for the API error response
type ApiError = {
  detail?: string;
};

// FIX: Add a specific type for the Recharts Tooltip props
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PostDetails }>;
}

// --- Reusable UI Components ---
const Card: FC<PropsWithChildren<{ title: string; icon: React.ReactNode; className?: string; }>> = ({ title, icon, children, className = "" }) => (
    <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, ease: "easeInOut" }}
    className={`bg-[#1a132b]/80 border border-[#2a2044] rounded-2xl p-6 shadow-lg ${className}`}
  >
    <div className="flex items-center gap-3 mb-4">
      <div className="bg-gradient-to-br from-fuchsia-600/20 to-violet-600/20 p-2 rounded-lg border border-fuchsia-500/30">{icon}</div>
      <h3 className="font-semibold text-lg text-zinc-100">{title}</h3>
    </div>
    {children}
  </motion.div>
);

// --- Feature Components ---
const ReportUploader: FC<{file: File | null;isLoading: boolean;onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;onAnalyze: () => void;}> = ({ file, isLoading, onFileChange, onAnalyze }) => ( <div className="rounded-2xl bg-[#1a132b]/80 border border-[#2a2044] p-6 shadow-sm flex flex-col md:flex-row items-center gap-6"> <div className="w-full flex-grow"> <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-32 px-4 transition-all duration-300 bg-[#110b1f] border-2 border-dashed rounded-xl border-[#2a2044] cursor-pointer hover:border-fuchsia-400 hover:bg-[#1a132b]/50"> {file ? ( <div className="text-center text-emerald-400"> <FileCheck2 className="size-8 mx-auto mb-2" /> <p className="font-semibold">{file.name}</p> <p className="text-xs text-zinc-400">Ready to analyze</p> </div> ) : ( <div className="text-center text-zinc-400"> <UploadCloud className="size-8 mx-auto mb-2" /> <p className="font-semibold">Click to upload or drag and drop</p> <p className="text-xs">CSV or XLSX file</p> </div> )} <input id="file-upload" type="file" className="hidden" accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={onFileChange} /> </label> </div> <button onClick={onAnalyze} disabled={!file || isLoading} className="w-full md:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white font-semibold shadow-lg hover:shadow-fuchsia-500/40 transition-all duration-300 transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0 flex items-center justify-center gap-2"> <Bot className="size-5" /> {isLoading ? "Agent is Processing..." : "Process Report"} </button> </div> );
const LoadingState: FC<{ text?: string }> = ({ text = "Processing the file, mapping columns, and extracting posts..." }) => ( <div className="text-center p-10 rounded-2xl bg-[#1a132b]/80 border border-dashed border-[#2a2044]"> <Bot className="size-16 text-fuchsia-500/50 mb-4 animate-pulse mx-auto" /> <h3 className="font-semibold text-lg">Agent at Work...</h3> <p className="text-zinc-400 text-sm max-w-md mx-auto">{text}</p> </div> );


// --- Analysis Dashboard Component ---
const AnalysisDashboard: FC<{ initialReport: InitialAnalysisResponse }> = ({ initialReport }) => {
  const [selectedPostId, setSelectedPostId] = useState<string>("");
  const [detailedAnalysis, setDetailedAnalysis] = useState<TopPostAnalysis | null>(null);
  const [isPostLoading, setIsPostLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePostSelection = async (postId: string) => {
    if (!postId) {
      setSelectedPostId("");
      setDetailedAnalysis(null);
      return;
    }
    setSelectedPostId(postId);
    setDetailedAnalysis(null);
    setIsPostLoading(true);
    setError(null);
    const selectedPost = initialReport.posts.find(p => p.id === parseInt(postId, 10));
    if (!selectedPost) {
      setError("Could not find the selected post.");
      setIsPostLoading(false);
      return;
    }
    try {
      const response = await fetch("http://127.0.0.1:8000/api/engagement/analyze-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedPost),
      });
      if (!response.ok) {
        // FIX: Use a specific type for the error data
        const errData: ApiError = await response.json();
        throw new Error(errData.detail || `Server error: ${response.statusText}`);
      }
      const data: TopPostAnalysis = await response.json();
      setDetailedAnalysis(data);
    // FIX: Catch error as 'unknown' and then check its type
    } catch (err) {
      if (err instanceof Error) {
        setError(`Failed to analyze post: ${err.message}`);
      } else {
        setError("An unknown error occurred while analyzing the post.");
      }
    } finally {
      setIsPostLoading(false);
    }
  };
  
  // Custom Dot for the highlighted point on the line chart
  const HighlightedDot = (props: any) => {
      const { cx, cy, stroke, payload } = props;
      if (payload.id === parseInt(selectedPostId, 10)) {
          return <circle cx={cx} cy={cy} r={8} fill={"#2dd4bf"} stroke="#fff" strokeWidth={2} />;
      }
      return <circle cx={cx} cy={cy} r={4} fill={stroke} />;
  };

  // Custom Tooltip for the line chart
  // FIX: Use specific props type and remove unused 'label'
  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#110b1f] border border-[#2a2044] rounded-lg p-3 text-sm shadow-lg">
          <p className="font-bold text-fuchsia-300">{`${data.engagement_rate.toFixed(2)}%`}</p>
          <p className="text-zinc-400 max-w-[200px] truncate">{data.post_title}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <select
          value={selectedPostId}
          onChange={(e) => handlePostSelection(e.target.value)}
          className="w-full appearance-none bg-[#110b1f] border border-[#2a2044] rounded-lg p-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 transition-all"
          disabled={!initialReport.posts.length}
        >
          <option value="">-- Select a Post to Analyze --</option>
          {initialReport.posts.map(post => (<option key={post.id} value={post.id}>{post.post_title.substring(0, 100)}{post.post_title.length > 100 ? "..." : ""}</option>))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-5 text-zinc-400 pointer-events-none" />
      </div>
      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        initial="hidden" animate="visible"
        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } }}
      >
        <div className="lg:col-span-1 flex flex-col gap-6">
          <Card title="Overall Summary" icon={<FileText className="size-5 text-fuchsia-400" />}>
            <div className="flex justify-around text-center">
              <div><p className="text-2xl font-bold text-fuchsia-300">{initialReport.total_posts_analyzed}</p><p className="text-xs text-zinc-400">Posts in Report</p></div>
              <div><p className="text-2xl font-bold text-fuchsia-300">{initialReport.average_engagement_rate.toFixed(2)}%</p><p className="text-xs text-zinc-400">Avg. Engagement</p></div>
            </div>
          </Card>
          
          <AnimatePresence>
            {detailedAnalysis && (
                <>
                <Card title="Selected Post Performance" icon={<BarChart2 className="size-5 text-fuchsia-400" />}>
                    {/* FIX: Use curly braces to correctly handle quotes in JSX */}
                    <p className="text-sm italic text-zinc-300 p-3 mb-4 rounded-lg bg-[#110b1f]">{`"${detailedAnalysis.post_title}"`}</p>
                    <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#110b1f] p-4 rounded-lg text-center"><p className="text-2xl font-bold text-emerald-400">{detailedAnalysis.engagement_rate.toFixed(1)}%</p><p className="text-xs text-zinc-400">Engagement Rate</p></div>
                    <div className="bg-[#110b1f] p-4 rounded-lg text-center"><p className="text-2xl font-bold text-fuchsia-300">{detailedAnalysis.likes}</p><p className="text-xs text-zinc-400">Likes</p></div>
                    <div className="bg-[#110b1f] p-4 rounded-lg text-center"><p className="text-2xl font-bold text-fuchsia-300">{detailedAnalysis.comments}</p><p className="text-xs text-zinc-400">Comments</p></div>
                    <div className="bg-[#110b1f] p-4 rounded-lg text-center"><p className="text-2xl font-bold text-fuchsia-300">{detailedAnalysis.shares}</p><p className="text-xs text-zinc-400">Shares</p></div>
                    </div>
                </Card>
                <Card title="Upcoming Trend Ideas" icon={<Rocket className="size-5 text-fuchsia-400" />}>
                    <ul className="space-y-3">
                        {detailedAnalysis.upcoming_trends?.map((trend, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
                                <Lightbulb className="size-4 mt-0.5 flex-shrink-0 text-fuchsia-400" />
                                <span>{trend}</span>
                            </li>
                        ))}
                    </ul>
                </Card>
                </>
            )}
          </AnimatePresence>
        </div>
        <div className="lg:col-span-2 flex flex-col gap-6">
          <AnimatePresence mode="wait">
            {isPostLoading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <LoadingState text="Analyzing selected post, researching context, and generating strategic insights..." />
              </motion.div>
            ) : detailedAnalysis ? (
              <motion.div key="results" className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card title="Engagement Rate Context" icon={<TrendingUp className="size-5 text-fuchsia-400" />}>
                    <div className="h-64 w-full">
                        <ResponsiveContainer>
                            <LineChart
                                data={initialReport.posts}
                                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#2a2044" />
                                <XAxis 
                                    dataKey="id" 
                                    tickFormatter={(tick) => `Post ${tick + 1}`} 
                                    stroke="#a3a3a3"
                                    fontSize={12}
                                />
                                <YAxis 
                                    stroke="#a3a3a3" 
                                    fontSize={12}
                                    tickFormatter={(value) => `${value}%`}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Line
                                    type="monotone"
                                    dataKey="engagement_rate"
                                    stroke="#a855f7"
                                    strokeWidth={2}
                                    dot={<HighlightedDot />}
                                    activeDot={{ r: 8 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card title="AI Strategic Recommendations" icon={<Lightbulb className="size-5 text-fuchsia-400" />}>
                    <div className="space-y-4">
                        <div className="text-center p-3 bg-[#110b1f] rounded-lg">
                            <span className="text-sm font-semibold uppercase tracking-wider text-fuchsia-400">Core Theme</span>
                            <h4 className="text-xl font-bold text-zinc-100">{detailedAnalysis.strategic_recommendations.theme}</h4>
                        </div>
                        <p className="text-center text-sm text-zinc-400 italic">
                           <span className="font-semibold text-zinc-300">Why it worked:</span> {detailedAnalysis.strategic_recommendations.reason}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                           {detailedAnalysis.strategic_recommendations.recommendations.map((rec, i) => (
                               <div key={i} className="bg-[#0c0718]/80 border border-[#2a2044] rounded-lg p-4">
                                   <div className="flex items-center gap-3 mb-2">
                                       {i === 0 ? <Megaphone className="size-5 text-emerald-400"/> : <Target className="size-5 text-emerald-400"/>}
                                       <h5 className="font-semibold text-zinc-200">{rec.title}</h5>
                                   </div>
                                   <p className="text-sm text-zinc-400">{rec.description}</p>
                               </div>
                           ))}
                        </div>
                    </div>
                </Card>

                <Card title="External Engagement Context" icon={<Search className="size-5 text-fuchsia-400" />}>
                  <div className="bg-[#0c0718]/80 border border-[#2a2044] rounded-xl p-4 text-sm text-zinc-300 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-[#4b397c] scrollbar-track-transparent">
                    <ul className="list-disc list-inside space-y-2">{detailedAnalysis.external_context_summary.split(/(?<=\.)\s+/).map((s,i) => <li key={i}>{s.trim()}</li>)}</ul>
                  </div>
                  {detailedAnalysis.relevant_urls.length > 0 && (
                       <div className="mt-4">
                           <p className="text-xs text-fuchsia-300 mb-3 uppercase tracking-wide font-semibold">🔗 Trending Mentions & Sources</p>
                           <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-fuchsia-500/50 scrollbar-track-transparent">
                               {detailedAnalysis.relevant_urls.map((url) => {
                                   const domain = new URL(url).hostname;
                                   return (
                                   <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 w-60 bg-[#1a112f]/80 border border-[#34285a] hover:border-fuchsia-500/50 rounded-xl p-3 shadow-lg transition-all group" title={url}>
                                       {/* FIX: Use next/image instead of <img> */}
                                       <div className="flex items-center mb-1 gap-2"><Image src={`https://www.google.com/s2/favicons?domain=${domain}`} alt="favicon" width={16} height={16} className="rounded-sm" /><span className="text-sm text-fuchsia-200 font-medium truncate">{domain}</span></div>
                                       <p className="text-xs text-zinc-400 truncate">{url}</p>
                                   </a>
                                   );
                               })}
                           </div>
                       </div>
                  )}
                </Card>
              </motion.div>
            ) : (
              <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center text-center p-10 rounded-2xl bg-[#1a132b]/50 border border-dashed border-[#2a2044] h-full">
                <div>
                  <TrendingUp className="size-16 text-fuchsia-500/30 mb-4 mx-auto" />
                  <h3 className="font-semibold text-lg">Select a Post</h3>
                  <p className="text-zinc-400 text-sm">Choose a post from the dropdown to see its detailed analysis.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};


// --- Main Page Component ---
export default function ReportAnalyzerPage() {
    const [file, setFile] = useState<File | null>(null);
    const [initialReport, setInitialReport] = useState<InitialAnalysisResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
  
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        setFile(event.target.files[0]);
        setInitialReport(null);
        setError(null);
      }
    };
  
    const handleProcessFile = async () => {
      if (!file) {
        setError("Please select a CSV or XLSX file to analyze.");
        return;
      }
      setIsLoading(true);
      setError(null);
      setInitialReport(null);
  
      const formData = new FormData();
      formData.append("report_file", file);
  
      try {
        const response = await fetch("http://127.0.0.1:8000/api/engagement/process-file", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const errData: ApiError = await response.json();
          throw new Error(errData.detail || `Server error: ${response.statusText}`);
        }
        const data: InitialAnalysisResponse = await response.json();
        setInitialReport(data);
      // FIX: Catch error as 'unknown' and then check its type
      } catch (err) {
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError("An unknown error occurred while processing the file.");
        }
      } finally {
        setIsLoading(false);
      }
    };
  
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#3f0a6b] via-[#0f0a1a] to-black text-zinc-100 font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <header className="mb-10 text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight flex items-center justify-center gap-3 bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-400 to-violet-400">
              <Sparkles className="size-8" /> Reporting Analyzer Agent
            </h1>
            <p className="text-zinc-400 mt-2 max-w-2xl mx-auto">
              Upload your report to get an automated strategic analysis for any post.
            </p>
          </header>
  
          <main className="space-y-8">
            <ReportUploader
              file={file}
              isLoading={isLoading}
              onFileChange={handleFileChange}
              onAnalyze={handleProcessFile}
            />
  
            {error && (
              <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-red-400 text-center">
                {error}
              </motion.p>
            )}
  
            <AnimatePresence>
              {isLoading && <LoadingState />}
              {initialReport && <AnalysisDashboard initialReport={initialReport} />}
            </AnimatePresence>
          </main>
        </div>
      </div>
    );
  }