"use client";

import dynamic from "next/dynamic";

const LiveTrainMap = dynamic(() => import("./LiveTrainMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] bg-slate-100 rounded-[2rem] flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest text-xs">
      Loading Live Train Map...
    </div>
  ),
});

export default LiveTrainMap;
