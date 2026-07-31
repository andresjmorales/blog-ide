"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  title: string;
  subtitle: string;
  author: string;
  publication: string;
  onTitleCommit: (title: string) => void;
  onSubtitleCommit: (subtitle: string) => void;
  onAuthorCommit: (author: string) => void;
  onPublicationCommit: (publication: string) => void;
  onFocusBody?: () => void;
  titleDisabled?: boolean;
};

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Title / subtitle / author / publication fields with local draft state so
 * typing does not re-render the TipTap editor or the rest of the workspace.
 */
export function EssayTitleBlock({
  title,
  subtitle,
  author,
  publication,
  onTitleCommit,
  onSubtitleCommit,
  onAuthorCommit,
  onPublicationCommit,
  onFocusBody,
  titleDisabled = false,
}: Props) {
  const [titleFocused, setTitleFocused] = useState(false);
  const [subtitleFocused, setSubtitleFocused] = useState(false);
  const [authorFocused, setAuthorFocused] = useState(false);
  const [publicationFocused, setPublicationFocused] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [subtitleDraft, setSubtitleDraft] = useState(subtitle);
  const [authorDraft, setAuthorDraft] = useState(author);
  const [publicationDraft, setPublicationDraft] = useState(publication);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const subtitleRef = useRef<HTMLInputElement | null>(null);
  const authorRef = useRef<HTMLInputElement | null>(null);
  const publicationRef = useRef<HTMLInputElement | null>(null);

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

  function commitSubtitle(focusNext: "author" | "body" | null) {
    setSubtitleFocused(false);
    if (subtitleDraft !== subtitle) onSubtitleCommit(subtitleDraft);
    if (focusNext === "author") {
      requestAnimationFrame(() => authorRef.current?.focus());
    } else if (focusNext === "body") {
      requestAnimationFrame(() => onFocusBody?.());
    }
  }

  function commitAuthor(focusNext: "publication" | null) {
    setAuthorFocused(false);
    if (authorDraft !== author) onAuthorCommit(authorDraft);
    if (focusNext === "publication") {
      requestAnimationFrame(() => publicationRef.current?.focus());
    }
  }

  function commitPublication(focusBody: boolean) {
    setPublicationFocused(false);
    if (publicationDraft !== publication) {
      onPublicationCommit(publicationDraft);
    }
    if (focusBody) {
      requestAnimationFrame(() => onFocusBody?.());
    }
  }

  return (
    <div className="essay-title-block">
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
        onBlur={() => commitSubtitle(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitSubtitle("author");
          }
        }}
        aria-label="Essay subtitle"
        placeholder="Subtitle (optional)"
        className="essay-subtitle-input"
      />
      <input
        ref={authorRef}
        type="text"
        value={authorFocused ? authorDraft : author}
        onFocus={() => {
          setAuthorFocused(true);
          setAuthorDraft(author);
        }}
        onChange={(e) => setAuthorDraft(e.target.value)}
        onBlur={() => commitAuthor(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitAuthor("publication");
          }
        }}
        aria-label="Author byline"
        placeholder="Author (optional)"
        className="essay-author-input"
      />
      <input
        ref={publicationRef}
        type="text"
        value={publicationFocused ? publicationDraft : publication}
        onFocus={() => {
          setPublicationFocused(true);
          setPublicationDraft(publication);
        }}
        onChange={(e) => setPublicationDraft(e.target.value)}
        onBlur={() => commitPublication(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitPublication(true);
          }
        }}
        aria-label="Publication / venue"
        placeholder="Publication / venue (optional)"
        className="essay-publication-input"
      />
    </div>
  );
}
