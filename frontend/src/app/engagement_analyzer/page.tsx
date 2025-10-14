"use client";

import React, { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Sparkles,
  Lightbulb,
  Search,
  Link as LinkIcon,
  Bot,
  UploadCloud,
  FileCheck2,
} from "lucide-react";

// --- Types ---
type TopPostAnalysis = {
  post_title: string;
  engagement_rate: number;
  likes: number;
  comments: number;
  shares: number;
  external_context_summary: string;
  relevant_urls: string[];
  strategic_recommendations: string;
};

type AnalysisReport = {
  total_posts_analyzed: number;
  average_engagement_rate: number;
  top_performing_post: TopPostAnalysis;
};

// --- Page Component ---
export default function ReportAnalyzerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
      setReport(null);
      setError(null);
    }
  };

  const handleAnalyzeReport = async () => {
    if (!file) {
      setError("Please select a CSV or XLSX file to analyze.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setReport(null);

    const formData = new FormData();
    formData.append("report_file", file);

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/api/engagement/analyze-report",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(
          errData.detail || `Server error: ${response.statusText}`
        );
      }

      const data: AnalysisReport = await response.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const topPost = report?.top_performing_post;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#3f0a6b] via-[#0f0a1a] to-black text-zinc-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight flex items-center justify-center gap-3">
            <Sparkles className="size-7 text-fuchsia-400" /> Reporting Analyzer
            Agent
          </h1>
          <p className="text-zinc-400 mt-1">
            Upload your exported social media report (CSV or XLSX) to get an
            automated strategic analysis.
          </p>
        </header>

        <div className="rounded-2xl bg-[#1a132b]/80 border border-[#2a2044] p-6 shadow-sm flex flex-col md:flex-row items-center gap-4">
          <div className="w-full flex-grow">
            <label
              htmlFor="file-upload"
              className="flex flex-col items-center justify-center w-full h-32 px-4 transition bg-[#110b1f] border-2 border-dashed rounded-xl border-[#2a2044] cursor-pointer hover:border-fuchsia-400"
            >
              {file ? (
                <div className="text-center text-emerald-400">
                  <FileCheck2 className="size-8 mx-auto mb-2" />
                  <p className="font-semibold">{file.name}</p>
                  <p className="text-xs text-zinc-400">Ready to analyze</p>
                </div>
              ) : (
                <div className="text-center text-zinc-400">
                  <UploadCloud className="size-8 mx-auto mb-2" />
                  <p className="font-semibold">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs">CSV or XLSX file</p>
                </div>
              )}
              <input
                id="file-upload"
                type="file"
                className="hidden"
                // --- THIS IS THE ONLY CHANGE ---
                accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileChange}
              />
            </label>
          </div>
          <button
            onClick={handleAnalyzeReport}
            disabled={!file || isLoading}
            className="w-full md:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white font-semibold hover:from-fuchsia-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Bot className="size-5" />
            {isLoading ? "Agent is Analyzing..." : "Generate Report"}
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-400 text-center mt-3">{error}</p>
        )}

        <div className="mt-8 space-y-6">
          {isLoading && (
            <div className="text-center p-10 rounded-2xl bg-[#1a132b]/80 border border-dashed border-[#2a2044]">
              <Bot className="size-16 text-fuchsia-500/50 mb-4 animate-pulse mx-auto" />
              <h3 className="font-semibold text-lg">Agent at Work...</h3>
              <p className="text-zinc-400 text-sm">
                Processing the file, mapping columns, identifying top
                performers, and researching external context.
              </p>
            </div>
          )}

          {report && topPost && (
            <>
              <div className="rounded-2xl bg-[#1a132b]/80 border border-[#2a2044] p-5 shadow-sm text-center">
                <h2 className="text-xl font-semibold">Analysis Complete</h2>
                <p className="text-zinc-400">
                  Analyzed <strong>{report.total_posts_analyzed}</strong> posts
                  with an average engagement rate of{" "}
                  <strong>{report.average_engagement_rate.toFixed(2)}%</strong>.
                </p>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-fuchsia-500/10 via-[#1a132b] to-[#1a132b] border border-[#3e2e66] p-5 shadow-lg">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-fuchsia-300">
                  <Lightbulb className="size-5" /> AI Strategic Recommendations
                </h3>
                <p className="text-zinc-300 whitespace-pre-wrap text-sm leading-relaxed">
                  {topPost.strategic_recommendations}
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#1a132b]/80 border border-[#2a2044]">
                <h3 className="font-semibold text-zinc-100 mb-2">
                  Top Performing Post Analysis
                </h3>
                <p className="text-sm italic text-zinc-300 p-3 rounded-lg bg-[#110b1f]">
                  "{topPost.post_title}"
                </p>

                <div className="mt-4 h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          name: "Metrics",
                          likes: topPost.likes,
                          comments: topPost.comments,
                          shares: topPost.shares,
                        },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2044" />
                      <XAxis dataKey="name" stroke="#a3a3a3" />
                      <YAxis stroke="#a3a3a3" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#110b1f",
                          border: "1px solid #2a2044",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="likes" fill="#8884d8" />
                      <Bar dataKey="comments" fill="#82ca9d" />
                      <Bar dataKey="shares" fill="#ffc658" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl bg-[#1a132b]/80 border border-[#2a2044] p-5 shadow-sm">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-zinc-100">
                  <Search className="size-5 text-fuchsia-400" /> External
                  Context for Top Post
                </h3>
                <p className="text-sm text-zinc-400 mb-3">
                  {topPost.external_context_summary}
                </p>
                <div className="flex flex-wrap gap-2">
                  {topPost.relevant_urls.map((url) => (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      key={url}
                      className="text-xs text-fuchsia-400 bg-[#231a3b] px-2 py-1 rounded-full border border-[#34285a] hover:bg-[#34285a] flex items-center gap-1"
                    >
                      <LinkIcon className="size-3" /> Source Link
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
