"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { sendTeamMessage } from "@/features/team-messages/actions";
import { mergeTeamMessages } from "@/features/team-messages/merge";
import {
  getBroadcastRecord,
  TEAM_MESSAGE_BROADCAST_EVENT,
  TEAM_MESSAGES_TOPIC
} from "@/features/collaboration/realtime";
import { createClient } from "@/lib/supabase/client";
import type { TeamMessage } from "@/types/database";
import type { WireframeShellDto } from "@/features/wireframe/types";
import { CloseIcon, MessageIcon } from "../icons";

type CurrentUser = NonNullable<WireframeShellDto["currentUser"]>;
type ConnectionState = "connecting" | "live" | "error";

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "WW";
}

export function TeamMessages({ currentUser }: { currentUser: CurrentUser }) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const isOpenRef = useRef(isOpen);
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    let active = true;
    const channel = supabase
      .channel(TEAM_MESSAGES_TOPIC, { config: { private: true } })
      .on(
        "broadcast",
        { event: TEAM_MESSAGE_BROADCAST_EVENT },
        (message) => {
          if (!active) return;
          const incoming = getBroadcastRecord<TeamMessage>(message.payload);
          if (!incoming) return;
          setMessages((current) => mergeTeamMessages(current, [incoming]));
          if (!isOpenRef.current && incoming.author_id !== currentUser.id) {
            setUnreadCount((count) => count + 1);
          }
        }
      );

    void supabase.realtime.setAuth().then(() => {
      if (!active) return;
      channel.subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") setConnection("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection("error");
      });
    });

    void supabase
      .from("team_messages")
      .select("id, author_id, author_name, body, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) {
          setError("Messages could not be loaded.");
          return;
        }
        setMessages((current) => mergeTeamMessages(current, data ?? []));
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id, supabase]);

  useEffect(() => {
    if (!isOpen) return;
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [isOpen, messages]);

  const submitMessage = () => {
    const body = draft.trim();
    if (!body || isPending) return;

    setError(null);
    startTransition(async () => {
      const result = await sendTeamMessage({ body });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessages((current) => mergeTeamMessages(current, [result.data]));
      setDraft("");
    });
  };

  const setPanelOpen = (open: boolean) => {
    isOpenRef.current = open;
    setIsOpen(open);
    if (open) setUnreadCount(0);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPanelOpen(!isOpen)}
        aria-label={unreadCount ? `Team messages, ${unreadCount} unread` : "Team messages"}
        aria-expanded={isOpen}
        className="relative flex h-11 items-center gap-2 rounded-xl border border-[#e4e4df] bg-white px-3.5 text-sm font-medium text-[#44443f] transition-colors hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8b8b0]"
      >
        <MessageIcon />
        <span>Messages</span>
        {unreadCount > 0 ? (
          <span className="grid min-w-5 place-items-center rounded-full bg-[#151512] px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          aria-label="Team messages"
          className="absolute right-0 top-[calc(100%+0.65rem)] z-50 flex h-[min(620px,calc(100svh-7rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#deded8] bg-white shadow-[0_18px_50px_rgba(21,21,18,0.14)]"
        >
          <header className="flex items-start justify-between border-b border-[#eeeeea] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[#151512]">Team messages</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#8a8a83]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${connection === "live" ? "bg-[#3d8a62]" : connection === "error" ? "bg-[#b8534b]" : "bg-[#aaa99f]"}`}
                />
                {connection === "live" ? "Live" : connection === "error" ? "Reconnecting" : "Connecting"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label="Close team messages"
              className="grid h-8 w-8 place-items-center rounded-lg text-[#77776f] hover:bg-[#f4f4f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8b8b0]"
            >
              <CloseIcon />
            </button>
          </header>

          <div ref={messageListRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.length ? (
              <ol className="space-y-4">
                {messages.map((message) => {
                  const isMine = message.author_id === currentUser.id;
                  return (
                    <li key={message.id} className={`flex gap-2.5 ${isMine ? "flex-row-reverse" : ""}`}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#e4e4df] bg-[#f7f7f4] text-[10px] font-semibold text-[#5c5c55]">
                        {isMine ? currentUser.initials : initialsFor(message.author_name)}
                      </span>
                      <div className={`max-w-[78%] ${isMine ? "text-right" : ""}`}>
                        <p className="mb-1 px-1 text-[11px] text-[#8a8a83]">
                          {isMine ? "You" : message.author_name} · {formatMessageTime(message.created_at)}
                        </p>
                        <p className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-left text-sm leading-5 ${isMine ? "rounded-tr-md bg-[#151512] text-white" : "rounded-tl-md bg-[#f3f3ef] text-[#2f2f2a]"}`}>
                          {message.body}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="grid h-full min-h-48 place-items-center text-center">
                <div>
                  <p className="text-sm font-semibold text-[#44443f]">Start the team conversation</p>
                  <p className="mt-1 text-xs text-[#8a8a83]">New messages appear here for everyone instantly.</p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-[#eeeeea] p-3">
            {error ? <p className="mb-2 px-1 text-xs text-[#a5443d]">{error}</p> : null}
            <div className="flex items-end gap-2 rounded-xl border border-[#deded8] bg-white p-2 focus-within:ring-2 focus-within:ring-[#d9d9d2]">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitMessage();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder="Message the team"
                aria-label="Message the team"
                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm leading-5 text-[#151512] outline-none placeholder:text-[#9b9b94]"
              />
              <button
                type="button"
                onClick={submitMessage}
                disabled={!draft.trim() || isPending}
                className="h-9 rounded-lg bg-[#151512] px-3 text-xs font-semibold text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#77776f] focus-visible:ring-offset-2"
              >
                {isPending ? "Sending" : "Send"}
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-[#9b9b94]">Enter to send, Shift + Enter for a new line</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
