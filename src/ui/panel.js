// ============================================================
// WORLD PANEL
// Extracted from main.js. Owns the side panel and the "back to
// system" affordance that pairs with the camera focus state.
// ============================================================
import { SUN, TEAM } from "../config.js";

export function createPanel(handlers = {}, linkBase = "./") {
  const panel = document.querySelector("#world-panel");
  const closeButton = document.querySelector("#panel-close");
  const kicker = document.querySelector("#panel-kicker");
  const title = document.querySelector("#panel-title");
  const description = document.querySelector("#panel-description");
  const link = document.querySelector("#panel-link");
  const teamLink = document.querySelector("#panel-team");
  const backButton = document.querySelector("#back-to-system");

  let current = null;

  function open(world) {
    current = world;

    kicker.textContent = world.kicker;
    title.textContent = world.label;
    description.textContent = world.description;

    const isCentre = world.id === SUN.id || world.id === TEAM.id;
    link.style.display = isCentre ? "none" : "inline-flex";
    teamLink.style.display = world.id === SUN.id ? "inline-flex" : "none";

    if (!isCentre) {
      link.href = `${linkBase}${world.id}/`;
      link.textContent = `Enter ${world.label.replace("The ", "")} →`;
    }

    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-focused");
  }

  function close() {
    current = null;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-focused");
    if (handlers.onClose) handlers.onClose();
  }

  closeButton.addEventListener("click", close);

  if (backButton) {
    backButton.addEventListener("click", close);
  }

  teamLink.setAttribute("href", `${linkBase}team/`);

  return {
    open,
    close,
    get current() {
      return current;
    },
    get isOpen() {
      return current !== null;
    }
  };
}
