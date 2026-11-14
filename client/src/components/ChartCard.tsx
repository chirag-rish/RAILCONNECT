"use client";

import dynamic from "next/dynamic";

export const YieldDistributionChart = dynamic(
  () => import("./ChartCardInner").then((mod) => mod.YieldDistributionChart),
  { ssr: false, loading: () => <div className="h-64 flex items-center justify-center text-slate-400 text-xs font-bold">Loading Chart...</div> }
);

export const AssetUtilizationChart = dynamic(
  () => import("./ChartCardInner").then((mod) => mod.AssetUtilizationChart),
  { ssr: false, loading: () => <div className="h-64 flex items-center justify-center text-slate-400 text-xs font-bold">Loading Chart...</div> }
);
