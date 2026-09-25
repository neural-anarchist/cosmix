// ============================================================
// TRIALS PAGE CONTROLLER
// Renders the Cosmix Mocks grid. Either link on a card can be
// missing (no file uploaded yet) — that renders as a disabled
// "coming soon" state instead of a dead link. An exam with
// `published: false` in the data is skipped entirely, so a mock
// still being written can sit in the data file without appearing
// on the live page.
// ============================================================
import { exams } from "./shared/exams-data.js";

function examCard(exam) {
  const card = document.createElement("article");
  card.className = "exam-card";

  const pdf = exam.pdfLink
    ? `<a class="exam-btn" href="${exam.pdfLink}" target="_blank" rel="noopener noreferrer">Exam PDF</a>`
    : `<span class="exam-btn is-disabled" aria-disabled="true">Exam PDF — soon</span>`;

  const solutions = exam.solutionsLink
    ? `<a class="exam-btn" href="${exam.solutionsLink}" target="_blank" rel="noopener noreferrer">Solutions</a>`
    : `<span class="exam-btn is-disabled" aria-disabled="true">Solutions — soon</span>`;

  const release = exam.tentativeRelease
    ? `<p class="exam-release">Tentative release: ${exam.tentativeRelease}</p>`
    : "";

  card.innerHTML = `
    <p class="exam-type">Cosmix Mock</p>
    <h3 class="exam-title">${exam.title}</h3>
    <p class="exam-meta">${exam.year} · ${exam.duration}</p>
    ${release}
    <div class="exam-actions">${pdf}${solutions}</div>
  `;
  return card;
}

const root = document.querySelector("#mocks-grid");
exams
  .filter(function (exam) {
    return exam.published;
  })
  .forEach(function (exam) {
    root.appendChild(examCard(exam));
  });
