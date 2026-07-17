"use client";

/**
 * PDF pin surface — use the browser’s native PDF viewer so users can
 * scroll, select, and copy text without a fragile canvas text-layer.
 */
export function PdfPinViewer({ src, title }: { src: string; title: string }) {
  return (
    <div className="pdf-pin-viewer">
      <iframe
        src={src}
        title={title}
        className="pdf-pin-iframe"
      />
      <p className="pdf-pin-hint">
        Select text in the viewer and copy it into your essay.
      </p>
    </div>
  );
}
