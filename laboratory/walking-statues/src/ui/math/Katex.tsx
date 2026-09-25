import katex from "katex";
import { useMemo } from "react";

/**
 * Renders one TeX expression through KaTeX, bundled rather than loaded from a
 * CDN. Bundling matters here because several call sites (diagnostics,
 * benchmark tables, live diagrams) re-render on every readout tick — a
 * DOM-scanning auto-render pass is the wrong tool for text that changes
 * continuously, so each expression is rendered directly to markup instead.
 *
 * `srLabel` gives assistive tech a plain-language reading when the bare TeX
 * (KaTeX's own fallback) would not be clear read aloud, e.g. "F sub slide"
 * instead of "F_{\text{slide}}".
 */
export function Katex({
  tex,
  display = false,
  srLabel,
  className
}: {
  tex: string;
  display?: boolean;
  srLabel?: string;
  className?: string;
}) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { throwOnError: false, displayMode: display, output: "htmlAndMathml" });
    } catch {
      return tex;
    }
  }, [tex, display]);

  return (
    <span
      className={`ws-math${className ? ` ${className}` : ""}`}
      // KaTeX renders both HTML and a MathML annotation ("htmlAndMathml"),
      // and most screen readers read the MathML directly, which is more
      // useful than reading raw TeX aloud — so only override it with an
      // explicit aria-label when a call site has a clearer plain-language
      // reading to offer (e.g. a compact readout row).
      aria-label={srLabel}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Inline math is not restricted to a single line: source paragraphs are
// authored as wrapped multi-line template strings, and a formula can fall
// across that wrap. A stray unmatched `$` (there are none in this project's
// content) would over-match here, so this relies on delimiters always being
// balanced pairs, same as the retired CDN auto-render config did.
const MATH_SPLIT_RE = /(\$\$[^$]+?\$\$|\$[^$]+?\$)/g;

/**
 * Renders a plain string that may contain `$...$` (inline) and `$$...$$`
 * (display) TeX segments, splitting it into text and `Katex` nodes. This is
 * the same delimiter convention the project's theory prose already uses; the
 * difference from the retired CDN auto-render setup is that this runs once
 * per render rather than scanning the live DOM after mount.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => text.split(MATH_SPLIT_RE).filter((part) => part.length > 0), [text]);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("$$") && part.endsWith("$$")) {
          return <Katex key={i} tex={part.slice(2, -2)} display />;
        }
        if (part.startsWith("$") && part.endsWith("$")) {
          return <Katex key={i} tex={part.slice(1, -1)} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
