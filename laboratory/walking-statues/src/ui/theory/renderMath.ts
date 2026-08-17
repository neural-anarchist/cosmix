declare global {
  interface Window {
    renderMathInElement?: (element: HTMLElement, options?: Record<string, unknown>) => void;
  }
}

const KATEX_AUTO_RENDER_OPTIONS = {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false }
  ],
  throwOnError: false
};

/**
 * KaTeX's auto-render script is loaded from a CDN and may not have
 * finished by the time this component mounts, so this polls briefly
 * rather than assuming it's ready. If it never loads, the raw TeX source
 * stays visible as plain text instead of breaking the page.
 */
export function renderMathIn(el: HTMLElement | null, attempt = 0): void {
  if (!el) return;
  if (window.renderMathInElement) {
    window.renderMathInElement(el, KATEX_AUTO_RENDER_OPTIONS);
    return;
  }
  if (attempt < 20) {
    setTimeout(() => renderMathIn(el, attempt + 1), 100);
  }
}
