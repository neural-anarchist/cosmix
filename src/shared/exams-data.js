// ============================================================
// TRIALS — EXAMS
// Cosmix's own mock exams. `pdfLink`/`solutionsLink` are null until
// a real file exists — the page renders those as a disabled
// "coming soon" state rather than a dead link.
//
// `published: false` keeps an entry out of the live page without
// deleting it — draft it here while it's still being written, then
// flip it to `true` (or delete the line, which defaults to visible)
// when it's ready. See src/trials.js, which filters on this field.
//
// `tentativeRelease`, if set, is shown on the card as a not-yet-firm
// release date — for an exam that's published as an announcement
// before the PDF itself exists. Omit it once a real pdfLink is set.
// ============================================================

export const exams = [
  {
    title: "Cosmix Mock USAPhO I",
    type: "mock",
    year: 2026,
    duration: "3 hours",
    pdfLink: null,
    solutionsLink: null,
    tentativeRelease: "December 25, 2026",
    published: true
  },
  {
    title: "Cosmix Mock USAPhO II",
    type: "mock",
    year: 2026,
    duration: "3 hours",
    pdfLink: null,
    solutionsLink: null,
    published: false
  },
  {
    title: "Cosmix Mechanics Sprint",
    type: "mock",
    year: 2025,
    duration: "90 minutes",
    pdfLink: null,
    solutionsLink: null,
    published: false
  }
];
