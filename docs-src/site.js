// Manual screenshot viewer. Page content remains static while reading.
(() => {
    const links = [...document.querySelectorAll(".frame a[href$='.webp']")];
    // Every picture once, in the order of the page, although several places show the same one.
    const pictures = [];
    for (const link of links) if (!pictures.some((known) => known.getAttribute("href") === link.getAttribute("href"))) pictures.push(link);
    if (links.length === 0 || typeof HTMLDialogElement === "undefined") return;

    const german = document.documentElement.lang === "de";
    const labels = german ? { close: "Schließen", previous: "Vorheriges Bild", next: "Nächstes Bild" } : { close: "Close", previous: "Previous image", next: "Next image" };

    const dialog = document.createElement("dialog");
    dialog.className = "lightbox";
    dialog.setAttribute("aria-label", german ? "Bildansicht" : "Image viewer");
    dialog.innerHTML = `<button type="button" class="lightbox-close" data-act="close" aria-label="${labels.close}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button><figure class="lightbox-figure"><img class="lightbox-image" alt=""><figcaption><span class="lightbox-count"></span><span class="lightbox-caption"></span></figcaption></figure><button type="button" class="lightbox-nav lightbox-previous" data-act="previous" aria-label="${labels.previous}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><button type="button" class="lightbox-nav lightbox-next" data-act="next" aria-label="${labels.next}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
    document.body.append(dialog);

    const image = dialog.querySelector(".lightbox-image");
    const caption = dialog.querySelector(".lightbox-caption");
    const count = dialog.querySelector(".lightbox-count");
    let current = 0;

    function show(index) {
        current = (index + pictures.length) % pictures.length;
        const link = pictures[current];
        const picture = link.querySelector("img");
        image.src = link.getAttribute("href");
        image.alt = picture?.alt ?? "";
        caption.textContent = link.parentElement.querySelector("figcaption")?.textContent ?? picture?.alt ?? "";
        count.textContent = `${current + 1} / ${pictures.length}`;
    }

    function open(index) {
        show(index);
        if (!dialog.open) dialog.showModal();
    }

    for (const link of links) {
        link.addEventListener("click", (event) => {
            if (event.ctrlKey || event.metaKey || event.shiftKey) return;
            event.preventDefault();
            open(pictures.findIndex((known) => known.getAttribute("href") === link.getAttribute("href")));
        });
    }

    dialog.addEventListener("click", (event) => {
        const action = event.target.closest?.("[data-act]")?.dataset.act;
        if (action === "close") dialog.close();
        else if (action === "previous") show(current - 1);
        else if (action === "next") show(current + 1);
        // A click anywhere beside the picture closes the window.
        else if (event.target === dialog || event.target === dialog.querySelector(".lightbox-figure")) dialog.close();
    });

    dialog.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") show(current - 1);
        else if (event.key === "ArrowRight") show(current + 1);
    });
})();

// The eyes of the mummies follow the pointer.
(() => {
    const mummies = [...document.querySelectorAll(".mm-follow")];
    if (mummies.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    document.addEventListener("pointermove", (event) => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            for (const svg of mummies) {
                const box = svg.getBoundingClientRect();
                const dx = event.clientX - (box.left + box.width / 2);
                const dy = event.clientY - (box.top + box.height * 0.55);
                const distance = Math.hypot(dx, dy) || 1;
                const reach = Math.min(3, distance / 40);
                for (const pupil of svg.querySelectorAll(".mm-pupil")) pupil.style.transform = `translate(${(dx / distance) * reach}px, ${(dy / distance) * reach}px)`;
            }
        });
    });
})();
