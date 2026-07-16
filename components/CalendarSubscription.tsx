"use client";

import { useRef, useState } from "react";
import { CALENDAR_URL } from "@/lib/calendar";

const WEBCAL_URL = CALENDAR_URL.replace(/^https:/, "webcal:");

export default function CalendarSubscription() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "selected">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  async function copyUrl() {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(CALENDAR_URL);
      setCopyState("copied");
    } catch {
      // Clipboard access can be blocked by the browser. Selecting the visible URL still leaves a
      // usable path instead of making the button fail silently.
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopyState("selected");
    }
  }

  return (
    <div>
      <a
        href={WEBCAL_URL}
        className="calendar-primary"
        style={{ display: "flex", minHeight: 48, alignItems: "center", justifyContent: "center", gap: 8, borderRadius: "var(--r-md)", background: "var(--accent-ink)", color: "var(--on-accent)", font: `700 var(--text-sm) var(--font-sans)`, textDecoration: "none" }}
      >
        <SubscriptionIcon />
        캘린더 앱에서 구독
      </a>

      <label htmlFor="calendar-url" style={{ display: "block", margin: "18px 0 5px", color: "var(--ink-muted)", font: `600 var(--text-xs) var(--font-sans)` }}>
        구독 주소
      </label>
      <input
        ref={inputRef}
        id="calendar-url"
        readOnly
        value={CALENDAR_URL}
        onFocus={(event) => event.currentTarget.select()}
        style={{ width: "100%", minWidth: 0, boxSizing: "border-box", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--sunken)", color: "var(--ink)", font: `500 var(--text-base) var(--font-sans)` }}
      />
      <button
        type="button"
        onClick={copyUrl}
        className="calendar-copy"
        style={{ width: "100%", minHeight: 44, marginTop: 8, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface)", color: "var(--ink)", font: `700 var(--text-sm) var(--font-sans)`, cursor: "pointer" }}
      >
        <span aria-live="polite">
          {copyState === "copied" ? "복사했어요" : copyState === "selected" ? "주소를 선택했어요" : "구독 주소 복사"}
        </span>
      </button>

      <style>{`
        .calendar-primary { transition: background var(--dur) var(--ease-out-quart); }
        .calendar-primary:hover { background: var(--accent-press) !important; }
        .calendar-copy { transition: background var(--dur) var(--ease-out-quart); }
        .calendar-copy:hover { background: var(--sunken) !important; }
      `}</style>
    </div>
  );
}

function SubscriptionIcon() {
  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" aria-hidden>
      <rect x="1" y="3" width="14" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 1v4M11.5 1v4M1 7h14M8 9.5v4M6 11.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
