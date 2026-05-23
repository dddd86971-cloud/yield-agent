"use client";

import { PnLSnapshot } from "@/lib/api";
import { useMemo } from "react";

/**
 * Pure-SVG PnL line chart — no chart lib dependency.
 *
 * Renders two series:
 *   - Position value (blue, primary) — initial USD principal
 *   - Fees earned   (green, right axis) — cumulative in USD
 *
 * We explicitly avoid recharts/chart.js because:
 *   1. The axes here are fixed (time x $USD); no need for generic interactivity
 *   2. Avoids SSR hydration quirks on a component-heavy dashboard
 *   3. Keeps bundle size lean for the demo
 *
 * Hover shows the nearest snapshot via a crosshair + tooltip.
 */
export function PnLChart({
  snapshots,
  height = 280,
}: {
  snapshots: PnLSnapshot[];
  height?: number;
}) {
  const { points, xMin, xMax, yMin, yMax, feeMax } = useMemo(() => {
    if (snapshots.length === 0) {
      return { points: [], xMin: 0, xMax: 1, yMin: 0, yMax: 1, feeMax: 1 };
    }
    const xs = snapshots.map((s) => s.timestamp);
    const vs = snapshots.map((s) => s.positionValueUSD ?? 0);
    const fs = snapshots.map((s) => s.feesValueUSD ?? 0);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs, xMin + 1);
    const yMin = Math.min(...vs, 0);
    const yMax = Math.max(...vs, yMin + 1);
    const feeMax = Math.max(...fs, 0.01);
    return { points: snapshots, xMin, xMax, yMin, yMax, feeMax };
  }, [snapshots]);

  if (snapshots.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-white/30 text-sm"
        style={{ height }}
      >
        No PnL snapshots yet — data accumulates on each 30min evaluation cycle.
      </div>
    );
  }

  const padding = { top: 20, right: 50, bottom: 30, left: 50 };
  const width = 700;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const xScale = (t: number) =>
    padding.left + ((t - xMin) / Math.max(1, xMax - xMin)) * innerW;
  const yScale = (v: number) =>
    padding.top + innerH - ((v - yMin) / Math.max(0.01, yMax - yMin)) * innerH;
  const feeScale = (v: number) =>
    padding.top + innerH - (v / Math.max(0.01, feeMax)) * innerH;

  const valuePath = points
    .map((s, i) => `${i === 0 ? "M" : "L"} ${xScale(s.timestamp)} ${yScale(s.positionValueUSD ?? 0)}`)
    .join(" ");

  const feePath = points
    .map((s, i) => `${i === 0 ? "M" : "L"} ${xScale(s.timestamp)} ${feeScale(s.feesValueUSD ?? 0)}`)
    .join(" ");

  const fmtTime = (t: number) =>
    new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line
          key={p}
          x1={padding.left}
          x2={padding.left + innerW}
          y1={padding.top + innerH * p}
          y2={padding.top + innerH * p}
          stroke="white"
          strokeOpacity={0.05}
          strokeDasharray="2,4"
        />
      ))}

      {/* Y labels (left: position USD) */}
      {[yMin, yMin + (yMax - yMin) / 2, yMax].map((v, i) => (
        <text
          key={`yl-${i}`}
          x={padding.left - 8}
          y={yScale(v) + 4}
          textAnchor="end"
          fontSize="10"
          fill="rgba(59, 130, 246, 0.7)"
          fontFamily="monospace"
        >
          ${v.toFixed(2)}
        </text>
      ))}

      {/* Y labels (right: fees USD) */}
      {[0, feeMax / 2, feeMax].map((v, i) => (
        <text
          key={`yr-${i}`}
          x={padding.left + innerW + 8}
          y={feeScale(v) + 4}
          textAnchor="start"
          fontSize="10"
          fill="rgba(34, 197, 94, 0.7)"
          fontFamily="monospace"
        >
          ${v.toFixed(3)}
        </text>
      ))}

      {/* X labels */}
      <text
        x={padding.left}
        y={padding.top + innerH + 20}
        fontSize="10"
        fill="rgba(255,255,255,0.4)"
        fontFamily="monospace"
      >
        {fmtTime(xMin)}
      </text>
      <text
        x={padding.left + innerW}
        y={padding.top + innerH + 20}
        textAnchor="end"
        fontSize="10"
        fill="rgba(255,255,255,0.4)"
        fontFamily="monospace"
      >
        {fmtTime(xMax)}
      </text>

      {/* Position value line */}
      <path d={valuePath} fill="none" stroke="rgb(59, 130, 246)" strokeWidth="2" />

      {/* Fees line */}
      <path d={feePath} fill="none" stroke="rgb(34, 197, 94)" strokeWidth="2" />

      {/* Data points */}
      {points.map((s, i) => (
        <g key={i}>
          <circle
            cx={xScale(s.timestamp)}
            cy={yScale(s.positionValueUSD ?? 0)}
            r="3"
            fill={s.isInRange ? "rgb(59, 130, 246)" : "rgb(249, 115, 22)"}
          />
          <circle
            cx={xScale(s.timestamp)}
            cy={feeScale(s.feesValueUSD ?? 0)}
            r="2"
            fill="rgb(34, 197, 94)"
          />
        </g>
      ))}

      {/* Legend */}
      <g transform={`translate(${padding.left + 8}, ${padding.top + 4})`}>
        <rect width="170" height="30" fill="black" fillOpacity="0.4" rx="4" />
        <circle cx="10" cy="10" r="4" fill="rgb(59, 130, 246)" />
        <text x="18" y="13" fontSize="10" fill="white">Position Value</text>
        <circle cx="10" cy="22" r="4" fill="rgb(34, 197, 94)" />
        <text x="18" y="25" fontSize="10" fill="white">Fees Earned</text>
      </g>
    </svg>
  );
}
