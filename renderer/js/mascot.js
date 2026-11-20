// The mummy of Mumbin, the logo, as an element: it blinks, looks around and can sleep.
// How it moves is in mascot.css; the markup is in mascotMarkup.js (the website uses it too).

import { mascotMarkup } from "./mascotMarkup.js";

/** The mummy as an element, for places that are built by the program. */
export function mascot(mood = "awake", className = "") {
    const holder = document.createElement("span");
    holder.className = `mascot ${className}`.trim();
    holder.innerHTML = mascotMarkup(mood);
    return holder;
}

/** Puts a mummy into every element of the page marked with `data-mascot="awake|asleep"`. */
export function placeMascots(root = document) {
    for (const holder of root.querySelectorAll("[data-mascot]")) {
        if (!holder.firstElementChild) holder.innerHTML = mascotMarkup(holder.dataset.mascot);
    }
}

// A click makes an awake mummy wink.
document.addEventListener("click", (event) => {
    const svg = event.target.closest?.(".mm-awake");
    if (!svg) return;
    svg.classList.add("mm-wink");
    setTimeout(() => svg.classList.remove("mm-wink"), 900);
});
