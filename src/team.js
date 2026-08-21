import { teamMembers } from "./shared/team-data.js";

const grid = document.querySelector("#team-grid");

function createCard(member) {
  const card = document.createElement("article");
  card.className = "team-card";

  card.innerHTML = `
    <div class="team-card-glow"></div>
    <div class="team-photo-wrap">
      <img src="${member.photo}" alt="${member.name}" class="team-photo" />
    </div>
    <h2 class="team-name">${member.name}</h2>
    <p class="team-role">${member.role}</p>
    <p class="team-bio">${member.bio}</p>
  `;

  return card;
}

teamMembers.forEach(function (member) {
  grid.appendChild(createCard(member));
});