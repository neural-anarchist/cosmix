// ============================================================
// OBSERVATORY PAGE CONTROLLER
// Entries are markdown files (see src/shared/entries-data.js for the
// manifest and observatory/posts/ for the files). This fetches each
// one, reads its frontmatter, and renders a reverse-chronological
// list; clicking an entry swaps the list for the rendered article.
// Not a CMS: no server, no database, no auto-discovery — a new post
// is a folder plus one manifest line, same discipline as every other
// data-driven page on this site.
// ============================================================
import { entries as manifest } from "./shared/entries-data.js";

const listEl = document.querySelector("#entry-list");
const articleEl = document.querySelector("#entry-article");
const articleBody = document.querySelector("#entry-article-body");
const articleTitle = document.querySelector("#entry-article-title");
const articleMeta = document.querySelector("#entry-article-meta");
const backLink = document.querySelector("#entry-back");

// ------------------------------------------------------------
// Frontmatter: a small hand-rolled parser rather than a YAML
// library, since the schema here is deliberately flat — strings,
// booleans, dates and one-level arrays. See observatory/posts/
// _template.md for the field list.
// ------------------------------------------------------------
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };

  const data = {};
  match[1].split("\n").forEach(function (line) {
    if (!line.trim() || line.trim().startsWith("#")) return;
    const sep = line.indexOf(":");
    if (sep === -1) return;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map(function (s) { return s.trim().replace(/^["']|["']$/g, ""); })
        .filter(Boolean);
    } else if (value === "true" || value === "false") {
      value = value === "true";
    } else {
      value = value.replace(/^["']|["']$/g, "");
    }
    data[key] = value;
  });

  return { data, body: match[2] };
}

// marked follows CommonMark's backslash-escaping rule, which strips
// the backslash from `\,` before KaTeX ever sees it (comma is one of
// CommonMark's escapable punctuation characters) — silently turning
// a thin space into a literal comma inside an equation. Pulling every
// $...$ / $$...$$ span out before parsing, and splicing the original
// raw text back into the resulting HTML afterward, keeps LaTeX source
// untouched by markdown's own escaping.
function extractMath(source) {
  const placeholders = [];
  const protectedSource = source.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, function (match) {
    const token = `\u0000MATH${placeholders.length}\u0000`;
    placeholders.push(match);
    return token;
  });
  return { protectedSource, placeholders };
}

function restoreMath(html, placeholders) {
  return html.replace(/\u0000MATH(\d+)\u0000/g, function (_, i) {
    return placeholders[Number(i)];
  });
}

// Resolve every relative <img src> in rendered HTML against the
// entry's own folder. The markdown is fetched as text and injected
// into observatory/index.html, so an unresolved "./figure.svg"
// would otherwise be read relative to the page, not the post.
function resolveImagePaths(container, entryDir) {
  container.querySelectorAll("img[src]").forEach(function (img) {
    const src = img.getAttribute("src");
    if (/^([a-z]+:)?\/\//i.test(src) || src.startsWith("/")) return;
    img.src = new URL(src, entryDir).href;
  });
}

function renderMath(container) {
  if (typeof window.renderMathInElement !== "function") {
    container.classList.add("katex-missing");
    return;
  }
  window.renderMathInElement(container, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "\\[", right: "\\]", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false }
    ],
    throwOnError: false
  });
}

// If the markdown library failed to load (CDN unreachable), fall
// back to the raw markdown as plain text rather than throwing —
// same reasoning as .katex-missing: a network hiccup degrades the
// page, it doesn't break it.
function renderBody(container, markdown) {
  container.innerHTML = "";
  container.classList.remove("marked-missing");

  if (typeof window.marked === "undefined") {
    container.classList.add("marked-missing");
    const pre = document.createElement("pre");
    pre.className = "prose-raw";
    pre.textContent = markdown;
    container.appendChild(pre);
    return;
  }

  const { protectedSource, placeholders } = extractMath(markdown);
  container.innerHTML = restoreMath(window.marked.parse(protectedSource), placeholders);
}

function showList() {
  articleEl.hidden = true;
  listEl.hidden = false;
}

function showArticle(entry) {
  articleTitle.textContent = entry.data.title || entry.slug;
  articleMeta.textContent = [entry.data.category, entry.dateLabel]
    .filter(Boolean)
    .join(" · ");

  renderBody(articleBody, entry.body);
  resolveImagePaths(articleBody, entry.dirUrl);
  renderMath(articleBody);

  listEl.hidden = true;
  articleEl.hidden = false;
  articleEl.scrollIntoView({ block: "start" });
}

function entryCard(entry) {
  const card = document.createElement("li");
  card.className = "entry-card";
  card.innerHTML = `
    <a class="entry-card-link" href="#${entry.slug}">
      <span class="entry-card-meta">${[entry.data.category, entry.dateLabel].filter(Boolean).join(" · ")}</span>
      <h2 class="entry-card-title">${entry.data.title || entry.slug}</h2>
      <p class="entry-card-summary">${entry.data.summary || ""}</p>
    </a>
  `;
  return card;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

async function loadEntries() {
  const loaded = [];

  for (const { path } of manifest) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const raw = await res.text();
      const { data, body } = parseFrontmatter(raw);
      if (!data.published) continue;

      const dirUrl = new URL(path, window.location.href).href.replace(/[^/]+$/, "");
      loaded.push({
        slug: data.slug || path.split("/").slice(-2, -1)[0],
        data,
        body,
        dirUrl,
        dateLabel: formatDate(data.date)
      });
    } catch (err) {
      console.error(`Observatory: couldn't load entry at "${path}"`, err);
    }
  }

  loaded.sort(function (a, b) { return (b.data.date || "").localeCompare(a.data.date || ""); });
  return loaded;
}

async function init() {
  const loaded = await loadEntries();

  if (loaded.length === 0) {
    const empty = document.createElement("p");
    empty.className = "entry-list-empty";
    empty.textContent = "No entries yet — the first ones are being written.";
    listEl.appendChild(empty);
    return;
  }

  const bySlug = new Map();
  loaded.forEach(function (entry) {
    bySlug.set(entry.slug, entry);
    listEl.appendChild(entryCard(entry));
  });

  function syncToHash() {
    const slug = window.location.hash.slice(1);
    const entry = bySlug.get(slug);
    if (entry) {
      showArticle(entry);
    } else {
      showList();
    }
  }

  window.addEventListener("hashchange", syncToHash);
  if (backLink) {
    backLink.addEventListener("click", function () {
      window.location.hash = "";
    });
  }

  syncToHash();
}

init();
