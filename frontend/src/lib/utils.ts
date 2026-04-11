import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNum(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(digits) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(digits) + "K";
  if (Math.abs(n) >= 1) return n.toFixed(digits);
  if (Math.abs(n) >= 0.0001) return n.toFixed(6);
  if (n === 0) return "0";
  return n.toExponential(2);
}

export function formatUSD(n: number | undefined): string {
  if (n === undefined || n === null) return "$—";
  return "$" + formatNum(n);
}

export function formatPercent(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null) return "—";
  return n.toFixed(digits) + "%";
}

export function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function shortAddress(addr: string | undefined): string {
  if (!addr) return "—";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function shortHash(hash: string | undefined): string {
  if (!hash) return "—";
  return hash.slice(0, 10) + "...";
}

export function actionColor(action: string): string {
  switch (action) {
    case "deploy":
      return "text-accent";
    case "rebalance":
      return "text-warn";
    case "compound":
      return "text-blue-400";
    case "hold":
      return "text-white/60";
    case "emergency_exit":
      return "text-danger";
    default:
      return "text-white";
  }
}

export function riskColor(level: string): string {
  switch (level) {
    case "low":
      return "text-accent";
    case "medium":
      return "text-yellow-400";
    case "high":
      return "text-warn";
    case "critical":
      return "text-danger";
    default:
      return "text-white/60";
  }
}
