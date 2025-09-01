import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PenSquare,
  ShieldCheck,
  CalendarClock,
  BarChart3,
  Play,
  Pause,
  RotateCcw,
} from "lucide-react";

/**
 * Animated flow for: Content Creator → Content Moderator → Post Scheduler → Engagement Analyzer
 * - Built with TailwindCSS + Framer Motion + Lucide icons
 * - Drop this component into any React/Next.js app page and it will render/animate
 * - Controls: Play / Pause / Reset, Speed slider, Step-by-step pulse
 */

const NODES = [
  { key: "creator", label: "Content Creator", Icon: PenSquare, color: "from-sky-400 to-blue-500" },
  { key: "moderator", label: "Content Moderator", Icon: ShieldCheck, color: "from-amber-400 to-orange-500" },
  { key: "scheduler", label: "Post Scheduler", Icon: CalendarClock, color: "from-emerald-400 to-teal-500" },
  { key: "analyzer", label: "Engagement Analyzer", Icon: BarChart3, color: "from-fuchsia-400 to-purple-500" },
] as const;

export default function ArchitectureFlow() {
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1); // 0.5x – 2x
  const [step, setStep] = useState(0); // 0..3 (active node)

  // auto-advance
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setStep((s) => (s + 1) % NODES.length), 1200 / speed);
    return () => clearInterval(t);
  }, [playing, speed]);

  const edgePulseDuration = useMemo(() => 0.9 / speed, [speed]);

  return (
    <div className="min-h-[560px] w-full grid place-items-center bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100 p-6">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Social Media Agentic Flow
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-800 hover:bg-slate-700 px-3 py-2 text-sm"
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
              {playing ? "Pause" : "Play"}
            </button>
            <button
              onClick={() => {
                setStep(0);
                setPlaying(false);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-800 hover:bg-slate-700 px-3 py-2 text-sm"
            >
              <RotateCcw size={16} /> Reset
            </button>
            <div className="hidden md:flex items-center gap-2 ml-2">
              <span className="text-xs text-slate-400">Speed</span>
              <input
                aria-label="speed"
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="accent-sky-400"
              />
              <span className="text-xs tabular-nums w-8 text-right">{speed.toFixed(1)}×</span>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="relative rounded-3xl border border-slate-800/60 bg-slate-900/40 p-6 md:p-10 overflow-hidden">
          {/* Glow backdrop */}
          <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]">
            <div className="absolute -inset-20 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.18),transparent_60%)]" />
          </div>

          {/* Nodes row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8 relative z-10">
            {NODES.map((n, i) => (
              <NodeCard
                key={n.key}
                index={i}
                active={step === i}
                label={n.label}
                Icon={n.Icon}
                gradient={n.color}
              />
            ))}
          </div>

          {/* Edges (arrows) */}
          <svg className="absolute left-0 right-0 top-[46%] md:top-1/2 -translate-y-1/2 h-24 md:h-28" viewBox="0 0 1000 200" preserveAspectRatio="none">
            {/**
             * Draw three arrows connecting 4 nodes horizontally.
             * When step matches the edge index (i -> i+1), the arrow pulses.
             */}
            {[0, 1, 2].map((i) => (
              <Arrow
                key={i}
                active={step === i}
                index={i}
                duration={edgePulseDuration}
              />
            ))}
          </svg>

          {/* Legend / captions */}

        </div>

        {/* Helper: step labels below for presentations */}
        <div className="mt-4 grid grid-cols-4 text-center text-xs text-slate-400">
          {NODES.map((n, i) => (
            <div key={n.key} className={"truncate " + (step === i ? "text-slate-200 font-medium" : "")}>{n.label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NodeCard({ index, active, label, Icon, gradient }: {
  index: number;
  active: boolean;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  gradient: string;
}) {
  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.05 * index, type: "spring", stiffness: 140, damping: 16 }}
      className={
        "relative h-36 rounded-3xl border bg-slate-950/40 px-5 py-4 flex flex-col justify-between " +
        "border-slate-800/60 shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
      }
    >
      {/* Glow ring when active */}
      <AnimatePresence>
        {active && (
          <motion.div
            layoutId="active-glow"
            className="absolute inset-0 rounded-3xl ring-2 ring-offset-2 ring-offset-slate-900 ring-sky-400/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      {/* Icon bubble */}
      <div className="flex items-center gap-3">
        <div className={`grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br ${gradient}`}>
          <Icon size={20} />
        </div>
        <div className="font-medium leading-tight">{label}</div>
      </div>

      {/* Status pill */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{active ? "active" : "idle"}</span>
        <motion.span
          key={active ? "on" : "off"}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 250, damping: 18 }}
          className={
            "px-2 py-1 rounded-xl border " +
            (active
              ? "border-sky-400/40 text-sky-300 bg-sky-400/10"
              : "border-slate-700 text-slate-400 bg-slate-800/40")
          }
        >
          {active ? "processing…" : "waiting"}
        </motion.span>
      </div>
    </motion.div>
  );
}

function Arrow({ active, index, duration }: { active: boolean; index: number; duration: number }) {
  // Arrow x positions for 4 equal nodes across the viewport width of 1000
  const x0 = 100 + index * 250; // start near right edge of card i
  const x1 = x0 + 250; // end near left edge of card i+1
  const y = 100; // vertical center

  return (
    <g>
      {/* Base line */}
      <line x1={x0} y1={y} x2={x1} y2={y} stroke="rgba(100,116,139,0.5)" strokeWidth={6} strokeLinecap="round" />

      {/* Animated traveling dot when active */}
      <AnimatePresence>
        {active && (
          <motion.circle
            key={`dot-${index}`}
            r={8}
            cy={y}
            initial={{ cx: x0 }}
            animate={{ cx: x1 }}
            transition={{ duration, ease: "easeInOut" }}
            fill="url(#grad)"
          />
        )}
      </AnimatePresence>

      {/* Arrow head */}
      <polygon points={`${x1},${y} ${x1 - 10},${y - 8} ${x1 - 10},${y + 8}`} fill="rgba(148,163,184,0.8)" />

      {/* gradient def (once) */}
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
    </g>
  );
}

function LegendPill({ children, color }: { children: React.ReactNode; color: "sky" | "amber" | "emerald" | "fuchsia" }) {
  const map: Record<string, string> = {
    sky: "text-sky-300/90 bg-sky-400/10 border-sky-400/30",
    amber: "text-amber-300/90 bg-amber-400/10 border-amber-400/30",
    emerald: "text-emerald-300/90 bg-emerald-400/10 border-emerald-400/30",
    fuchsia: "text-fuchsia-300/90 bg-fuchsia-400/10 border-fuchsia-400/30",
  };
  return (
    <span className={`inline-flex items-center justify-center px-3 py-1 rounded-xl border ${map[color]}`}>
      {children}
    </span>
  );
}
