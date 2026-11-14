"use client";

import dynamic from "next/dynamic";

const AIAssistantWidget = dynamic(() => import("./AIAssistantWidgetInner"), {
  ssr: false,
});

export default AIAssistantWidget;
