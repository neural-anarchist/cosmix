// ============================================================
// FRONTIER PAGE CONTROLLER
// Renders the resource list: one <li> per entry, formatted as
// "bolded, linked title: description". The description is inserted
// as HTML rather than text, since an entry's description may carry
// its own embedded link (see shared/resources-data.js).
// ============================================================
import { resources } from "./shared/resources-data.js";

const root = document.querySelector("#resource-list");

resources.forEach(function (resource) {
  const item = document.createElement("li");
  item.className = "resource-item";
  item.innerHTML = `
    <strong><a href="${resource.url}" target="_blank" rel="noopener noreferrer">${resource.name}</a><span class="sr-only"> (opens in a new tab)</span></strong>:
    ${resource.description}
  `;
  root.appendChild(item);
});
