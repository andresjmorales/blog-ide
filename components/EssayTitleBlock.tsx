"use client";

import { useEffect, useRef, useState } from "react";
import { FrontmatterFieldsMenu } from "@/components/FrontmatterFieldsMenu";

type Props = {
  title: string;
  subtitle: string;
  frontmatter: string;
  onTitleCommit: (title: string) => void;
  onSubtitleCommit: (subtitle: string) => void;
  onFrontmatterChange: (frontmatter: string) => void;
  onFocusBody?: () => void;
  titleDisabled?: boolean;
};

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Title / subtitle with local draft state so typing does not re-render the
 * TipTap editor. Extra frontmatter (author, date, tags, custom keys) lives
 * behind the info control so the default chrome stays title + subtitle.
 */
export function EssayTitleBlock({
  title,
  subtitle,
  frontmatter,
  onTitleCommit,
  onSubtitleCommit,
  onFrontmatterChange,
  onFocusBody,
  titleDisabled = false,
}: Props) {
  const [titleFocused, setTitleFocused] = useState(false);
  const [subtitleFocused, setSubtitleFocused] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [subtitleDraft, setSubtitleDraft] = useState(subtitle);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const subtitleRef = useRef<HTMLInputElement | null>(null);

  const titleValue = titleFocused ? titleDraft : title;

  useEffect(() => {
    autosize(titleRef.current);
  }, [titleValue]);

  function commitTitle(focusNext: "subtitle" | null) {
    const next = titleDraft.trim() || "Untitled";
    setTitleFocused(false);
    if (next !== title) onTitleCommit(next);
    else setTitleDraft(next);
    if (focusNext === "subtitle") {
      requestAnimationFrame(() => subtitleRef.current?.focus());
    }
  }

  function commitSubtitle(focusBody: boolean) {
    setSubtitleFocused(false);
    if (subtitleDraft !== subtitle) onSubtitleCommit(subtitleDraft);
    if (focusBody) {
      requestAnimationFrame(() => onFocusBody?.());
    }
  }

  return (
    <div className="essay-title-block">
      <FrontmatterFieldsMenu
        frontmatter={frontmatter}
        onFrontmatterChange={onFrontmatterChange}
      />
      <textarea
        ref={titleRef}
        rows={1}
        value={titleValue}
        onFocus={() => {
          setTitleFocused(true);
          setTitleDraft(title);
        }}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={() => commitTitle(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitTitle("subtitle");
          }
        }}
        disabled={titleDisabled}
        aria-label="Essay title"
        placeholder="Title"
        className="essay-title-input"
      />
      <input
        ref={subtitleRef}
        type="text"
        value={subtitleFocused ? subtitleDraft : subtitle}
        onFocus={() => {
          setSubtitleFocused(true);
          setSubtitleDraft(subtitle);
        }}
        onChange={(e) => setSubtitleDraft(e.target.value)}
        onBlur={() => commitSubtitle(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitSubtitle(true);
          }
        }}
        aria-label="Essay subtitle"
        placeholder="Subtitle (optional)"
        className="essay-subtitle-input"
      />
    </div>
  );
}
