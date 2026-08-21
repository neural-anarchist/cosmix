// ============================================================
// HERO TYPEWRITER
// Types the homepage hero copy in character by character on first
// paint, like a terminal boot log, then reveals the CTA once the
// last line lands. Reads its script from data-type-text attributes
// on .type-target spans rather than hardcoded strings, so it stays
// in sync with the markup and no-ops on any page without a hero.
// ============================================================

export function createHeroTypewriter() {
  const hero = document.querySelector(".hero");
  if (!hero) return { start: function () {} };

  const eyebrow = hero.querySelector(".eyebrow .type-target");
  const h1Lines = Array.from(hero.querySelectorAll("h1 .type-target"));
  const introLabel = hero.querySelector(".intro-label");
  const introTarget = hero.querySelector(".intro .type-target");
  const hintTarget = hero.querySelector(".hint .type-target");
  const button = hero.querySelector("#explore-button[data-reveal]");

  const typedTargets = [eyebrow].concat(h1Lines, [introTarget, hintTarget]).filter(Boolean);
  if (typedTargets.length === 0) return { start: function () {} };

  // Used both as the reduced-motion path and as the error fallback —
  // a bug in the animation should never leave the hero without its copy.
  function fillInstantly() {
    typedTargets.forEach(function (el) {
      el.textContent = el.dataset.typeText || "";
    });
    if (introLabel) {
      introLabel.style.opacity = "";
      introLabel.classList.add("is-visible");
    }
    if (button) {
      button.style.opacity = "";
      button.classList.add("is-visible");
    }
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    return { start: fillInstantly };
  }

  const cursor = document.createElement("span");
  cursor.className = "type-cursor";
  cursor.setAttribute("aria-hidden", "true");

  // A step is a function of (done). Steps run one at a time, each
  // calling done() when it's finished, so typing a line, pausing,
  // and revealing a piece of chrome can all share one queue.
  function typeStep(el, msPerChar) {
    return function (done) {
      const full = el.dataset.typeText || "";
      el.textContent = "";
      el.appendChild(cursor);

      let i = 0;
      function tick() {
        if (i >= full.length) {
          done();
          return;
        }
        i += 1;
        el.textContent = full.slice(0, i);
        el.appendChild(cursor);
        setTimeout(tick, msPerChar);
      }
      tick();
    };
  }

  function waitStep(ms) {
    return function (done) {
      setTimeout(done, ms);
    };
  }

  function revealStep(el) {
    return function (done) {
      if (el) {
        el.style.opacity = "";
        el.classList.add("is-visible");
      }
      done();
    };
  }

  function cleanupStep() {
    return function (done) {
      cursor.remove();
      done();
    };
  }

  // The two h1 lines type back to back with no pause between them,
  // so "The cosmos," and "in a box." read as one continuous line
  // broken only by its own <br>.
  const steps = [waitStep(300)];
  if (eyebrow) steps.push(typeStep(eyebrow, 18), waitStep(160));
  h1Lines.forEach(function (line) { steps.push(typeStep(line, 42)); });
  steps.push(waitStep(200));
  if (introLabel) steps.push(revealStep(introLabel));
  if (introTarget) steps.push(typeStep(introTarget, 9), waitStep(180));
  if (hintTarget) steps.push(typeStep(hintTarget, 15));
  steps.push(cleanupStep(), revealStep(button));

  function run() {
    // Held back inline until their reveal step, rather than in the
    // stylesheet, so a page with this script blocked or erroring
    // before it starts still shows them by default.
    if (introLabel) introLabel.style.opacity = "0";
    if (button) button.style.opacity = "0";

    let index = 0;
    function advance() {
      if (index >= steps.length) return;
      const step = steps[index];
      index += 1;
      try {
        step(advance);
      } catch (err) {
        cursor.remove();
        fillInstantly();
      }
    }
    advance();
  }

  return { start: run };
}
