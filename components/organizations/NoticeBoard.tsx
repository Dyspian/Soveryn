"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { EntityMark } from "@/components/game/EntityMark";
import { ActionFeedback } from "@/components/feedback/ActionFeedback";
import { organizationsAction } from "@/lib/actions/organizations";
import type { ActionResult } from "@/lib/actions/account";
import { hiddenUnread, noticeHref, noticeLabel, noticeNeedsAttention, noticePanelBox, type NoticeFeed } from "@/lib/organizations/notices";
import { formatUtc } from "@/lib/world/clock";

function NoticeSubmit({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-secondary" type="submit" disabled={disabled || pending}>
      {pending ? "Saving" : label}
    </button>
  );
}

function NoticeRows({ feed, limit }: { feed: NoticeFeed; limit: number }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(organizationsAction, null);
  const shown = feed.notices.slice(0, limit);
  const shownUnread = shown.filter((notice) => !notice.read).length;
  const older = hiddenUnread(feed.unread, shownUnread);

  return (
    <div className="space-y-3">
      <ActionFeedback state={state} />
      <p className="text-sm text-muted">
        {feed.unread === 0 ? "No unread organization notice." : `${feed.unread} unread.`} These update when you open a page or finish an action.
      </p>
      {feed.notices.length === 0 ? <p className="text-sm text-muted">No organization notice is stored for this character.</p> : null}
      {older > 0 ? (
        <p className="text-sm text-muted">
          {older} older unread {older === 1 ? "notice is" : "notices are"} outside this list. Mark all read covers every unread notice.
        </p>
      ) : null}
      {feed.unread > 0 ? (
        <form action={action}>
          <input type="hidden" name="intent" value="read-all-notices" />
          <NoticeSubmit label="Mark all read" disabled={pending} />
        </form>
      ) : null}
      <ul className="space-y-2">
        {shown.map((notice) => {
          const href = noticeHref(notice.organizationId);
          return (
            <li key={notice.id} className={`border border-line px-3 py-2 text-sm ${notice.read ? "" : "border-l-2 border-l-gold"}`}>
              <p className="flex flex-wrap items-center gap-2">
                {notice.organizationTag ? (
                  <EntityMark kind="organization" code={notice.organizationTag} label={notice.organizationName ?? notice.organizationTag} size="sm" />
                ) : null}
                <span className={noticeNeedsAttention(notice.kind) ? "text-danger" : "text-muted"}>{noticeLabel(notice.kind)}</span>
                <span className="text-xs text-muted">{notice.read ? "Read" : "Unread"}</span>
              </p>
              <p className="mt-1">{notice.detail}</p>
              <p className="mt-1 text-xs text-muted">{formatUtc(notice.createdAt)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {href ? (
                  <Link href={href} className="text-gold">
                    {notice.organizationName ?? "Open organization"}
                  </Link>
                ) : null}
                {notice.read ? null : (
                  <form action={action}>
                    <input type="hidden" name="intent" value="read-notice" />
                    <input type="hidden" name="noticeId" value={notice.id} />
                    <NoticeSubmit label="Mark read" disabled={pending} />
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NoticeBoard({ feed }: { feed: NoticeFeed }) {
  return (
    <section id="notices" className="space-y-3">
      <h2 className="section-title">Notices</h2>
      <NoticeRows feed={feed} limit={12} />
    </section>
  );
}

export function NoticeBell({ feed }: { feed: NoticeFeed }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  function place() {
    const anchor = rootRef.current?.getBoundingClientRect();
    if (anchor) setBox(noticePanelBox(anchor.right, anchor.bottom, window.innerWidth));
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onReflow() {
      place();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  const label = feed.unread > 0 ? `Notices, ${feed.unread} unread` : "Notices";

  return (
    <div className={open ? "relative z-30" : "relative"} ref={rootRef}>
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (open) setOpen(false);
          else {
            place();
            setOpen(true);
          }
        }}
      >
        {label}
      </button>
      {open && box ? (
        <div
          id={panelId}
          role="region"
          aria-label="Organization notices"
          className="fixed z-40 max-h-[min(70vh,32rem)] overflow-auto border border-line bg-panel p-3"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          <NoticeRows feed={feed} limit={8} />
          <p className="mt-3 text-sm">
            <Link href="/organizations#notices" className="text-gold" onClick={() => setOpen(false)}>
              All stored notices
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
