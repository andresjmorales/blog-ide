/** Toolbar icons shared by the main editor and footnote card. */

const TOOL_ICON = 16;

/** VS Code-style fold chevron: points right when collapsed, rotates down when open. */
export function TreeCaret({
  expanded,
  className = "",
  size = 14,
}: {
  expanded: boolean;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      className={`shrink-0 transition-transform duration-100 ${
        expanded ? "rotate-90" : ""
      } ${className}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M6 3.5 11 8 6 12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Horizontal collapse caret for Outline / Footnotes rails (same glyph + size). */
export function PanelCaret({
  direction,
  className = "",
  size = 12,
}: {
  direction: "left" | "right";
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      className={`shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d={
          direction === "left"
            ? "M10.5 3.5 6 8l4.5 4.5"
            : "M5.5 3.5 10 8l-4.5 4.5"
        }
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Blockquote: thin vertical bar + three short lines. */
export function BlockquoteIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width={TOOL_ICON}
      height={TOOL_ICON}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M3 2.75v10.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        d="M6 4.25h7.25M6 8h7.25M6 11.75h7.25"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Bullet list: three dots + three lines. */
export function BulletListIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width={TOOL_ICON}
      height={TOOL_ICON}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <circle cx="3.1" cy="4.25" r="1.2" />
      <circle cx="3.1" cy="8" r="1.2" />
      <circle cx="3.1" cy="11.75" r="1.2" />
      <path
        d="M6.35 4.25H14M6.35 8H14M6.35 11.75H14"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Ordered list: 1 / 2 + three lines. */
export function OrderedListIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width={TOOL_ICON}
      height={TOOL_ICON}
      viewBox="0 0 16 16"
      fill="none"
    >
      <text
        x="3.15"
        y="7.0"
        fill="currentColor"
        fontSize="7.5"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        textAnchor="middle"
      >
        1
      </text>
      <text
        x="3.15"
        y="13.75"
        fill="currentColor"
        fontSize="7.5"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        textAnchor="middle"
      >
        2
      </text>
      <path
        d="M6.35 4.25H14M6.35 8H14M6.35 11.75H14"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ItalicIcon({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-4 w-4 items-center justify-center font-serif italic leading-none ${className}`}
      style={{ fontSize: "15px", fontWeight: 500 }}
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
      width={TOOL_ICON}
      height={TOOL_ICON}
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
      width={TOOL_ICON}
      height={TOOL_ICON}
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

/** Classic “picture frame with mountains” image affordance. */
export function ImageIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width={TOOL_ICON}
      height={TOOL_ICON}
      viewBox="0 0 16 16"
      fill="none"
    >
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="5.5" cy="6" r="1.2" fill="currentColor" />
      <path
        d="M2.5 12.5 6 8.5l2.2 2.2L11 7.5l2.5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
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
