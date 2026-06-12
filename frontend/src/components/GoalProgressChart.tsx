"use client";

import { useState } from "react";
import { Sparkles, TrendingUp, Award } from "lucide-react";

interface MetricData {
  name: string;
  shortLabel: string;
  initial: number;
  current: number;
  color: string;
  gradient: string;
  goals: string[];
}

export default function GoalProgressChart() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const metrics: MetricData[] = [
    {
      name: "Speech-Language (SLP)",
      shortLabel: "SLP",
      initial: 35,
      current: 75,
      color: "#6366f1",
      gradient: "url(#slp-grad)",
      goals: ["Expressive vocabulary increased by 40+ words", "Initiates peer conversation in 4 of 5 trials"],
    },
    {
      name: "Occupational Therapy (OT)",
      shortLabel: "OT",
      initial: 40,
      current: 80,
      color: "#3b82f6",
      gradient: "url(#ot-grad)",
      goals: ["Fine motor tripod grasp maintained independently", "Transitions between tasks with zero physical prompts"],
    },
    {
      name: "Physical Therapy (PT)",
      shortLabel: "PT",
      initial: 50,
      current: 70,
      color: "#10b981",
      gradient: "url(#pt-grad)",
      goals: ["Stands on dominant leg for 8+ seconds", "Navigates playground stairs using alternating feet"],
    },
    {
      name: "Behavioral (ABA)",
      shortLabel: "ABA",
      initial: 25,
      current: 68,
      color: "#ec4899",
      gradient: "url(#aba-grad)",
      goals: ["Self-regulation using deep breathing in 80% of opportunities", "Waiting behavior maintained for 3+ minutes"],
    },
    {
      name: "Cognitive (Psychology)",
      shortLabel: "Psych",
      initial: 45,
      current: 85,
      color: "#f59e0b",
      gradient: "url(#psych-grad)",
      goals: ["Maintains task attention for 12+ minutes", "Identifies primary and secondary emotions from social cards"],
    },
  ];

  // SVG dimensions
  const width = 500;
  const height = 220;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const barGroupWidth = chartWidth / metrics.length;
  const barWidth = 24;

  const getPercentHeight = (pct: number) => (pct / 100) * chartHeight;

  return (
    <section 
      className="rounded-xl border border-line shadow-sm p-4 bg-card"
      style={{ fontFamily: "var(--font-sans)", color: "var(--text-primary)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-fg m-0 flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-500" />
            IEP Goals Progress Chart
          </h2>
          <p className="text-[0.7rem] font-medium text-muted m-0">Comparing baseline performance to current cycle progress</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs font-semibold text-muted">
            <span className="w-2.5 h-2.5 rounded-full bg-subtle-soft border border-line" /> Baseline
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-muted">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Current Progress
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* SVG Graph rendering */}
        <div className="md:col-span-2 relative flex items-center justify-center border border-line rounded-xl bg-app/40 p-2">
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ overflow: "visible" }}>
            <defs>
              <linearGradient id="slp-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>
              <linearGradient id="ot-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
              <linearGradient id="pt-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <linearGradient id="aba-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f472b6" />
                <stop offset="100%" stopColor="#db2777" />
              </linearGradient>
              <linearGradient id="psych-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
            </defs>

            {/* Gridlines */}
            {[0, 25, 50, 75, 100].map((level) => {
              const y = height - paddingBottom - getPercentHeight(level);
              return (
                <g key={level}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="var(--border-light)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="var(--text-muted)"
                    fontSize="9px"
                    fontWeight="600"
                  >
                    {level}%
                  </text>
                </g>
              );
            })}

            {/* Bars drawing */}
            {metrics.map((m, idx) => {
              const xCenter = paddingLeft + idx * barGroupWidth + barGroupWidth / 2;
              
              // Baseline bar (light gray)
              const baseHeight = getPercentHeight(m.initial);
              const baseY = height - paddingBottom - baseHeight;
              
              // Current progress bar (colored gradient)
              const currHeight = getPercentHeight(m.current);
              const currY = height - paddingBottom - currHeight;

              const isHovered = hoveredIndex === idx;

              return (
                <g 
                  key={m.shortLabel}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Invisible broad hover card context */}
                  <rect
                    x={paddingLeft + idx * barGroupWidth + 4}
                    y={paddingTop}
                    width={barGroupWidth - 8}
                    height={chartHeight + 10}
                    fill={isHovered ? "rgba(79, 70, 229, 0.04)" : "transparent"}
                    rx="8"
                    style={{ transition: "fill 0.2s ease" }}
                  />

                  {/* Baseline bar */}
                  <rect
                    x={xCenter - barWidth - 2}
                    y={baseY}
                    width={barWidth}
                    height={baseHeight}
                    fill="var(--text-muted)"
                    rx="3"
                    opacity={isHovered ? 0.7 : 0.4}
                    style={{ transition: "opacity 0.2s ease" }}
                  />

                  {/* Current progress bar */}
                  <rect
                    x={xCenter + 2}
                    y={currY}
                    width={barWidth}
                    height={currHeight}
                    fill={m.gradient}
                    rx="3"
                    style={{ transformOrigin: `${xCenter + 2}px ${height - paddingBottom}px`, transition: "all 0.25s ease" }}
                    opacity={hoveredIndex === null || isHovered ? 1 : 0.7}
                  />

                  {/* Score Label on Top of Current Bar */}
                  <text
                    x={xCenter + barWidth / 2 + 2}
                    y={currY - 5}
                    textAnchor="middle"
                    fill={m.color}
                    fontSize="9px"
                    fontWeight="800"
                    opacity={isHovered ? 1 : 0}
                    style={{ transition: "opacity 0.18s ease" }}
                  >
                    {m.current}%
                  </text>

                  {/* X Axis labels */}
                  <text
                    x={xCenter}
                    y={height - 10}
                    textAnchor="middle"
                    fill={isHovered ? m.color : "var(--text-secondary)"}
                    fontSize="10px"
                    fontWeight={isHovered ? "800" : "700"}
                    style={{ transition: "fill 0.18s ease" }}
                  >
                    {m.shortLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Dynamic Tooltip Detail Pane */}
        <div className="flex flex-col justify-between rounded-xl border border-indigo-50/80 bg-indigo-50/10 p-4">
          {hoveredIndex === null ? (
            <div className="flex flex-col items-center justify-center text-center h-full gap-2 py-4">
              <TrendingUp className="text-indigo-400 animate-bounce" size={28} />
              <p className="text-xs font-bold text-fg m-0">Hover over the chart bars</p>
              <p className="text-[0.68rem] text-faint m-0">To view IEP goals, growth percentages, and developmental milestones.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 h-full justify-between">
              <div>
                <span 
                  className="text-[0.55rem] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded bg-card border text-indigo-700 w-fit block mb-1.5"
                  style={{ borderColor: metrics[hoveredIndex].color, color: metrics[hoveredIndex].color }}
                >
                  {metrics[hoveredIndex].shortLabel} FOCUS AREA
                </span>
                <h4 className="text-sm font-extrabold text-fg m-0">{metrics[hoveredIndex].name}</h4>
                
                <div className="flex items-center gap-3 my-2.5 pb-2 border-b border-indigo-100/30">
                  <div>
                    <span className="text-[0.55rem] font-bold text-faint uppercase tracking-wider block">Baseline</span>
                    <span className="text-sm font-extrabold text-muted">{metrics[hoveredIndex].initial}%</span>
                  </div>
                  <div className="text-xs text-indigo-400 font-bold">âž”</div>
                  <div>
                    <span className="text-[0.55rem] font-bold text-faint uppercase tracking-wider block">Current</span>
                    <span className="text-sm font-extrabold text-fg" style={{ color: metrics[hoveredIndex].color }}>
                      {metrics[hoveredIndex].current}%
                    </span>
                  </div>
                  <div className="ml-auto bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md px-1.5 py-0.5 text-[0.68rem] font-extrabold flex items-center gap-0.5">
                    +{metrics[hoveredIndex].current - metrics[hoveredIndex].initial}% Growth
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-[0.6rem] font-bold text-faint uppercase tracking-wider m-0 flex items-center gap-1">
                    <Award size={10} /> Goal Milestones Reached
                  </p>
                  <ul className="m-0 pl-4 text-xs font-semibold text-muted flex flex-col gap-1">
                    {metrics[hoveredIndex].goals.map((g, idx) => (
                      <li key={idx} className="line-clamp-2 leading-relaxed">{g}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
