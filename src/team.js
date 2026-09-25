import { teamMembers } from "./shared/team-data.js";
import { aboutParagraphs, clubSchedule, partners } from "./shared/about-data.js";

function render(selector, items, build) {
  const root = document.querySelector(selector);
  items.forEach(function (item) {
    root.appendChild(build(item));
  });
}

render("#about-text", aboutParagraphs, function (text) {
  const p = document.createElement("p");
  // Paragraphs carry real <a> links to the other section pages
  // (see shared/about-data.js), so this has to be innerHTML rather
  // than textContent.
  p.innerHTML = text;
  return p;
});

render("#team-grid", teamMembers, function (member) {
  const card = document.createElement("article");
  card.className = "team-card";

  card.innerHTML = `
    <div class="team-card-glow"></div>
    <div class="team-photo-wrap">
      <img src="${member.photo}" alt="${member.name}" class="team-photo" />
    </div>
    <h3 class="team-name">${member.name}</h3>
    <p class="team-role">${member.role}</p>
    <p class="team-bio">${member.bio}</p>
  `;

  return card;
});

render("#club-schedule", clubSchedule, function (entry) {
  const li = document.createElement("li");
  li.className = "schedule-entry";
  li.innerHTML = `
    <div class="schedule-when">
      <span class="schedule-date">${entry.date}</span>
      <span class="schedule-time">${entry.time}</span>
    </div>
    <div class="schedule-what">
      <h3 class="schedule-title">${entry.title}</h3>
      <p class="schedule-details">${entry.details}</p>
    </div>
  `;
  return li;
});

render("#partner-grid", partners, function (partner) {
  const card = document.createElement("article");
  card.className = "team-card partner-card";

  const host = new URL(partner.url).hostname;
  const shot = partner.snapshot
    ? `<img src="${partner.snapshot}" alt="${partner.name}" class="team-photo partner-photo" />`
    : `<div class="snapshot-placeholder">${host}</div>`;

  card.innerHTML = `
    <div class="team-card-glow"></div>
    <a class="team-photo-wrap partner-window" href="${partner.url}" target="_blank"
       rel="noopener noreferrer" aria-label="Visit ${partner.name}">${shot}</a>
    <h3 class="team-name">${partner.name}</h3>
    <p class="team-role">${host}</p>
    <p class="team-bio">${partner.description}</p>
  `;
  return card;
});
