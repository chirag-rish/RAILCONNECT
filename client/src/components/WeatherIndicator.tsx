"use client";

import dynamic from "next/dynamic";

const WeatherIndicator = dynamic(() => import("./WeatherIndicatorInner"), {
  ssr: false,
  loading: () => (
    <div className="inline-block px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full animate-pulse h-8 w-24" />
  ),
});

export default WeatherIndicator;
