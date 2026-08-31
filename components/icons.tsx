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

export function MoreFormattingIcon({ className = "" }: { className?: string }) {
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
        d="M4 6.5 8 10.5 12 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Compact Aa glyph for the extra-formatting overflow (super/sub, case, code block). */
export function FormattingAaIcon({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-4 w-4 items-center justify-center font-serif leading-none ${className}`}
      style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "-0.04em" }}
    >
      Aa
    </span>
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

/** Standard clipboard (Lucide-style board + clip). */
export function ClipboardIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width={TOOL_ICON}
      height={TOOL_ICON}
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="8"
        y="2"
        width="8"
        height="4"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Box with an arrow, used to mark “open in a new tab”. */
export function ExternalLinkIcon({ className = "" }: { className?: string }) {
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
        d="M9.2 3.5H12.5V6.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 8.8 12.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M11 9.2v3.3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1H6.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
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

/** Circle-i for extra frontmatter fields on the title block. */
export function InfoIcon({
  className = "",
  size = TOOL_ICON,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M8 7.15v4.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="5.15" r="0.85" fill="currentColor" />
    </svg>
  );
}

/** Magnifying glass for Find. */
export function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width={TOOL_ICON}
      height={TOOL_ICON}
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle
        cx="7"
        cy="7"
        r="4.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M10.2 10.2 13.5 13.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Broom for cleanup / fix tools.
 * Paths from Lucide Lab `broom` (ISC) — https://lucide.dev/icons/lab/broom
 */
export function BroomIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width={TOOL_ICON}
      height={TOOL_ICON}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="m13 11 9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.6 12.6c.8.8.9 2.1.2 3L10 22l-8-8 6.4-4.8c.9-.7 2.2-.6 3 .2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m6.8 10.4 6.8 6.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m5 17 1.4-1.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
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

/** Bookmark ribbon (Firefox-style) for Library save. */
export function BookmarkIcon({ className = "" }: { className?: string }) {
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
        d="M4 2.5h8a.5.5 0 0 1 .5.5v10.2l-4.25-2.4L4 13.2V3a.5.5 0 0 1 .5-.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Small check for “already in Library” overlay. */
export function BookmarkCheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
    >
      <path
        d="M2 5.2 4.2 7.4 8 2.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Vertical three-dot kebab used for overflow / row menus. */
export function KebabIcon({
  className = "",
  size = 14,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <circle cx="8" cy="3.5" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="8" cy="12.5" r="1.25" />
    </svg>
  );
}

/** Window-maximize corners for focus / fullscreen. */
export function MaximizeIcon({
  className = "",
  size = 15,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M2.75 6.25V2.75H6.25M9.75 2.75h3.5v3.5M13.25 9.75v3.5H9.75M6.25 13.25H2.75V9.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Inward corners to leave fullscreen. */
export function RestoreIcon({
  className = "",
  size = 15,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M6.25 2.75v3.5H2.75M9.75 2.75v3.5h3.5M9.75 13.25v-3.5h3.5M6.25 13.25v-3.5H2.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Codicon-style gear for Editor settings (header, next to Panels). */
export function GearIcon({
  className = "",
  size = 16,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M6.4 1.6h3.2l.35 1.55a4.8 4.8 0 0 1 1.15.65l1.5-.55 1.6 2.75-1.15 1.1c.05.3.08.6.08.9s-.03.6-.08.9l1.15 1.1-1.6 2.75-1.5-.55a4.8 4.8 0 0 1-1.15.65L9.6 14.4H6.4l-.35-1.55a4.8 4.8 0 0 1-1.15-.65l-1.5.55L1.8 9.95l1.15-1.1A4.4 4.4 0 0 1 2.87 8c0-.3.03-.6.08-.9L1.8 6l1.6-2.75 1.5.55c.35-.28.74-.5 1.15-.65L6.4 1.6Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle
        cx="8"
        cy="8"
        r="2.1"
        stroke="currentColor"
        strokeWidth="1.2"
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

/** GitHub mark. `struck` draws a slash for a broken mapping. */
export function GithubMark({
  className = "",
  size = 12,
  struck = false,
}: {
  className?: string;
  size?: number;
  struck?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      {struck && (
        <path
          d="M2.2 13.8 13.8 2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
