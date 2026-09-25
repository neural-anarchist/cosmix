// ============================================================
// OBSERVATORY — ENTRIES
// A static site can't list a folder at runtime, so this manifest is
// the whole index: one row per markdown entry, pointing at its file.
// Title, date, category, summary and published come from the file's
// own frontmatter (src/observatory.js fetches and parses it) rather
// than being copied here, so there is exactly one place that can go
// stale about what an entry says about itself.
//
// A post is a small self-contained folder under observatory/posts/:
// its markdown file plus any images it uses, referenced with a
// relative path (./figure.svg). Add a new entry by writing that
// folder and adding its path below; draft it with `published: false`
// in its own frontmatter until it's ready.
// ============================================================

export const entries = [
  { path: "posts/heat-engine-phase-boundary/index.md" }
];
