/** Small toolbar icons shared by the main editor and footnote card. */

export function ItalicIcon({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block font-serif italic leading-none ${className}`}
      style={{ fontSize: "1.05em", fontWeight: 500 }}
    >
      i
    </span>
  );
}

export function LinkIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M6.4 9.6a2.8 2.8 0 0 0 4 0l1.7-1.7a2.8 2.8 0 1 0-4-4L7.4 4.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M9.6 6.4a2.8 2.8 0 0 0-4 0L3.9 8.1a2.8 2.8 0 1 0 4 4l.7-.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M8 10.5V14.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M5.2 2.5h5.6l-.7 4.2 1.4 1.4v1.4H4.5V8.1l1.4-1.4L5.2 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Six-dot grip used as a "this is draggable" affordance. */
export function GrabHandle({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width="10"
      height="16"
      viewBox="0 0 10 16"
      fill="currentColor"
    >
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="7" cy="3" r="1.2" />
      <circle cx="3" cy="8" r="1.2" />
      <circle cx="7" cy="8" r="1.2" />
      <circle cx="3" cy="13" r="1.2" />
      <circle cx="7" cy="13" r="1.2" />
    </svg>
  );
}
