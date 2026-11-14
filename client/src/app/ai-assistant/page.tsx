
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import toast from "react-hot-toast";
import { API_URL } from "@/lib/constants";
import { motion } from "framer-motion";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Globe,
  RotateCcw,
  Train,
  ExternalLink,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface WebSource {
  title: string;
  snippet: string;
  url?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  webSearchUsed?: boolean;
  webSources?: WebSource[];
}

interface StreamErrorResponse {
  message?: string;
}

interface StreamEventData {
  content?: string;
  reply?: string;
  webSearchUsed?: boolean;
  webSources?: WebSource[];
  message?: string;
}

const WELCOME_SUGGESTIONS = [
  "Where is my train?",
  "Check my PNR status",
  "What is RAC?",
  "Latest railway news",
];

export default function AIAssistant() {
  const { user, token } = useAuth();
  const isStaff = user?.role === "tte" || user?.role === "admin";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [webSearchAvailable, setWebSearchAvailable] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, streamingContent, scrollToBottom]);

  useEffect(() => {
    axios
      .get(`${API_URL}/ai/web-status`)
      .then((res) => {
        setWebSearchAvailable(res.data?.webSearchAvailable === true);
      })
      .catch(() => {
        setWebSearchAvailable(false);
      });
  }, []);

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setStreamingContent("");
    inputRef.current?.focus();
  };

  const handleSendMessage = async (
    e?: React.FormEvent,
    content?: string
  ) => {
    e?.preventDefault();

    const messageText = content || input;

    if (!messageText.trim() || isLoading) return;

    let storedUser: { token?: string } | null = null;

    try {
      if (typeof window !== "undefined") {
        storedUser = JSON.parse(localStorage.getItem("user") || "{}");
      }
    } catch {
      storedUser = null;
    }

    const effectiveToken = token || storedUser?.token;

    if (!effectiveToken) {
      toast.error("Please login to use the AI assistant.");
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");

    const historyPayload = messages.map((message) => ({
      role: message.role === "assistant" ? "bot" : message.role,
      content: message.content,
    }));

    historyPayload.push({
      role: "user",
      content: messageText,
    });

    try {
      const res = await fetch(`${API_URL}/ai/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${effectiveToken}`,
        },
        body: JSON.stringify({
          message: messageText,
          history: historyPayload,
          role: user?.role,
          useWeb: useWebSearch,
        }),
      });

      if (!res.ok) {
        const errData: StreamErrorResponse = await res
          .json()
          .catch(() => ({}));

        throw new Error(
          errData.message || `HTTP error! status: ${res.status}`
        );
      }

      if (!res.body) {
        throw new Error("Response body is missing");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let currentEvent = "message";
      let finalReply = "";
      let webSearchUsed = false;
      let webSources: WebSource[] = [];

      const processEvent = (eventName: string, dataStr: string) => {
        let data: StreamEventData;

        try {
          data = JSON.parse(dataStr) as StreamEventData;
        } catch {
          return;
        }

        if (eventName === "token") {
          const chunk = data.content || "";
          finalReply += chunk;
          setStreamingContent(finalReply);
        } else if (eventName === "done") {
          finalReply = data.reply || finalReply;
          webSearchUsed = data.webSearchUsed === true;
          webSources = Array.isArray(data.webSources)
            ? data.webSources
            : [];
        } else if (eventName === "error") {
          throw new Error(data.message || "Server error during stream");
        }
      };

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.replace("event:", "").trim();
          } else if (line.startsWith("data:")) {
            const dataStr = line.replace("data:", "").trim();

            if (dataStr) {
              processEvent(currentEvent, dataStr);
            }
          } else if (line.trim() === "") {
            currentEvent = "message";
          }
        }
      }

      buffer += decoder.decode();

      if (buffer.trim()) {
        const remainingLines = buffer.split("\n");

        for (const line of remainingLines) {
          if (line.startsWith("event:")) {
            currentEvent = line.replace("event:", "").trim();
          } else if (line.startsWith("data:")) {
            const dataStr = line.replace("data:", "").trim();

            if (dataStr) {
              processEvent(currentEvent, dataStr);
            }
          }
        }
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: finalReply || "I'm ready.",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        webSearchUsed,
        webSources,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error: unknown) {
      console.error("AI stream error", error);

      const errMsg =
        error instanceof Error
          ? error.message
          : "AI is currently unavailable. Please try again.";

      toast.error(errMsg);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "I'm experiencing a temporary connection issue. Please try again in a moment.",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setStreamingContent("");
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height =
      Math.min(e.target.scrollHeight, 160) + "px";
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="flex items-center justify-between px-4 md:px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Train className="w-4 h-4 text-white" />
          </div>

          <div>
            <h1 className="text-slate-800 font-semibold text-sm leading-tight">
              RailConnect AI
            </h1>
            <p className="text-slate-400 text-[10px] font-medium uppercase tracking-wider">
              {isStaff ? "Staff Mode" : "Passenger"}
            </p>
          </div>
        </div>

        <button
          onClick={handleNewChat}
          className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-xs font-medium"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          New chat
        </button>
      </header>

      <div className="flex-1 overflow-y-auto bg-slate-50">
        {messages.length === 0 && !streamingContent ? (
          <div className="h-full flex flex-col items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-md"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/20">
                <Sparkles className="w-7 h-7 text-white" />
              </div>

              <h2 className="text-slate-800 text-xl font-semibold mb-2">
                How can I help you today?
              </h2>

              <p className="text-slate-500 text-sm mb-8">
                Ask about your journey, train status, PNR, or anything about
                Indian Railways.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {WELCOME_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() =>
                      handleSendMessage(undefined, suggestion)
                    }
                    className="text-left px-4 py-3 text-sm text-slate-700 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 hover:border-slate-300 transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
            {messages.map((msg) => {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${
                    msg.role === "user" ? "justify-end" : ""
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] ${
                      msg.role === "user" ? "order-first" : ""
                    }`}
                  >
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white rounded-br-md"
                          : "bg-white text-slate-700 rounded-bl-md border border-slate-200 shadow-sm"
                      }`}
                    >
                      <div className="prose prose-slate prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {msg.role === "assistant" && (
                      <div className="mt-1.5 flex flex-wrap gap-2 items-center">
                        {msg.webSearchUsed && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            <Globe className="w-3 h-3" />
                            Searched the web
                          </span>
                        )}

                        <span className="text-[10px] text-slate-400">
                          {msg.timestamp}
                        </span>
                      </div>
                    )}

                    {msg.webSources && msg.webSources.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                          Web sources
                        </p>

                        <div className="flex flex-wrap gap-1.5">
                          {msg.webSources.map((src, index) => (
                            <a
                              key={`${msg.id}-${index}`}
                              href={src.url || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors border border-blue-100"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              {src.title?.slice(0, 40) || "Source"}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0 mt-1">
                      <User className="w-4 h-4 text-slate-600" />
                    </div>
                  )}
                </motion.div>
              );
            })}

            {(isLoading || streamingContent) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>

                <div className="max-w-[85%] bg-white border border-slate-200 shadow-sm rounded-2xl rounded-bl-md px-4 py-3">
                  {streamingContent ? (
                    <div className="prose prose-slate prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {streamingContent}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex gap-1.5 items-center py-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            <div ref={scrollRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pb-4 pt-2 bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto">
          {webSearchAvailable && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <button
                type="button"
                onClick={() => setUseWebSearch((previous) => !previous)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                  useWebSearch
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                    : "bg-white text-slate-500 border-slate-300 hover:text-slate-700"
                }`}
              >
                <Globe className="w-3 h-3" />
                {useWebSearch ? "Web search on" : "Web search"}
              </button>
            </div>
          )}

          <form
            onSubmit={handleSendMessage}
            className="flex items-end gap-2 bg-white rounded-2xl p-2 border border-slate-300 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-sm"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your journey or railways..."
              rows={1}
              className="flex-1 bg-transparent text-slate-800 placeholder-slate-400 text-sm resize-none outline-none px-3 py-2 max-h-40 leading-relaxed"
            />

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="shrink-0 w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <p className="text-center text-[10px] text-slate-400 mt-2">
            RailConnect AI can make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}
