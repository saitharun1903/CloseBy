"use client";
import { ArrowUp, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useController } from "./context";
import { CHAT_TTL_MS } from "./controller";
import { useRoom } from "./store";

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

function linkify(text: string) {
  const parts: (string | { url: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push({ url: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function host(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export function ChatPanel() {
  const c = useController();
  const chat = useRoom((s) => s.chat);
  const partnerName = useRoom((s) => s.participants.find((p) => p.id !== s.me.id)?.displayName);
  const typing = useRoom((s) => s.partnerTyping);
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    useRoom.setState({ unread: 0 });
  }, [chat.length]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  function send() {
    const t = text.trim();
    if (!t) return;
    void c.sendChat(t);
    setText("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={list} className="scrollbar-quiet min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-4" aria-live="polite" aria-label="Messages" data-testid="chat-list">
        {chat.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <p className="max-w-[240px] text-[13px] leading-relaxed text-paper-faint">
              Say hi{partnerName ? ` to ${partnerName}` : ""}. Messages go straight between the two of you and aren’t stored anywhere.
            </p>
          </div>
        )}
        {chat.map((m, i) => {
          const prev = chat[i - 1];
          const grouped = prev && prev.mine === m.mine && m.sentAt - prev.sentAt < 120_000;
          const links = linkify(m.text);
          const urls = links.filter((p): p is { url: string } => typeof p !== "string");
          return (
            <div key={m.id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start", !grouped && "pt-2")}>
              {!grouped && (
                <span className="mb-1 px-1 text-[11px] text-paper-faint">
                  {m.mine ? "You" : partnerName} · {new Date(m.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              )}
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-[14px] leading-snug",
                  m.mine ? "rounded-br-[6px] bg-lamp text-lamp-ink" : "rounded-bl-[6px] bg-white/[0.09] text-paper",
                )}
              >
                {links.map((p, j) =>
                  typeof p === "string" ? (
                    <span key={j}>{p}</span>
                  ) : (
                    <a key={j} href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-current/50 underline-offset-2">
                      {p.url}
                    </a>
                  ),
                )}
              </div>
              {urls.slice(0, 1).map((u) => (
                <a
                  key={u.url}
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-1 flex max-w-[85%] items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2 text-[12px] text-paper-dim transition-colors hover:bg-white/10 hover:text-paper"
                >
                  <ExternalLink className="size-3.5 shrink-0" />
                  <span className="truncate">Open {host(u.url)} in a new tab</span>
                </a>
              ))}
            </div>
          );
        })}
      </div>
      <div className="h-6 shrink-0 px-4" aria-live="polite">
        {typing && (
          <span className="flex items-center gap-2 text-[12px] text-paper-faint" data-testid="typing">
            <span className="flex gap-0.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-paper-faint" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </span>
            {partnerName ?? "Your partner"} is typing…
          </span>
        )}
      </div>
      <form
        className="border-t hairline p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex items-end gap-2 rounded-[22px] bg-white/[0.07] p-1.5 pl-4 focus-within:bg-white/[0.1]">
          <textarea
            ref={input}
            rows={1}
            value={text}
            maxLength={1000}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) c.sendTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message or paste a link"
            aria-label="Message"
            className="max-h-32 min-h-[34px] flex-1 resize-none bg-transparent py-1.5 text-[14px] text-paper outline-none placeholder:text-paper-ghost [field-sizing:content]"
            data-testid="chat-input"
          />
          <button type="submit" disabled={!text.trim()} aria-label="Send" className="grid size-8 shrink-0 place-items-center rounded-full bg-lamp text-lamp-ink transition-opacity disabled:opacity-30">
            <ArrowUp className="size-4" />
          </button>
        </div>
        <p className="mt-2 px-1 text-[11px] text-paper-faint">Not stored on our servers. Messages fade after {CHAT_TTL_MS / 60_000} minutes.</p>
      </form>
    </div>
  );
}
