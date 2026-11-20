// Screenshots are shown as slideshows and tabs; a click opens them in a modal window instead of a new page. Without this script the
// links still open the image file. Source file; scripts/buildSite.js copies it to docs/assets/site.js.

(() => {
    const german = document.documentElement.lang === "de";
    const text = german
        ? { previous: "Vorheriges Bild", next: "Nächstes Bild", picture: "Bild", of: "von", features: "Funktionen", slideshow: "Bildergalerie", pause: "Automatisches Weiterblättern anhalten", play: "Automatisches Weiterblättern starten" }
        : { previous: "Previous image", next: "Next image", picture: "Image", of: "of", features: "Features", slideshow: "Image gallery", pause: "Pause automatic advance", play: "Start automatic advance" };
    const chevron = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

    const SECONDS = 10;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pauseIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
    const playIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';

    /**
     * Goes on by itself every few seconds, but only while the area is on screen and the visitor neither points at it,
     * has stopped it nor looks at a picture in the viewer. Not at all with "reduce motion": returns null then.
     */
    function autoplay(area, advance) {
        if (reducedMotion) return null;
        let timer = 0;
        let hovering = false;
        let visible = false;
        let stopped = false;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "slider-pause";
        const label = () => {
            button.innerHTML = stopped ? playIcon : pauseIcon;
            button.setAttribute("aria-label", stopped ? text.play : text.pause);
            button.setAttribute("aria-pressed", String(stopped));
        };
        const blocked = () => stopped || hovering || !visible || document.hidden || document.querySelector("dialog[open]") !== null;
        const restart = () => {
            clearInterval(timer);
            timer = setInterval(() => {
                if (!blocked()) advance();
            }, SECONDS * 1000);
        };
        button.addEventListener("click", () => {
            stopped = !stopped;
            label();
            restart();
        });
        area.addEventListener("pointerenter", (event) => {
            if (event.pointerType !== "touch") hovering = true;
        });
        area.addEventListener("pointerleave", () => {
            hovering = false;
            restart();
        });
        new IntersectionObserver(
            (entries) => {
                visible = entries.some((entry) => entry.isIntersecting);
                restart();
            },
            { threshold: 0 },
        ).observe(area);
        label();
        restart();
        return { button, restart };
    }

    /** Turns a list of screenshots into a slideshow: one picture at a time, arrows, dots or thumbnails, swiping. */
    function slideshow(host, { thumbnails = false, auto = true, onUser = () => {} } = {}) {
        const figures = [...host.querySelectorAll(":scope > .frame")];
        if (figures.length < 2) return null;
        host.classList.add("slider");
        host.setAttribute("role", "group");
        host.setAttribute("aria-roledescription", "carousel");
        host.setAttribute("aria-label", text.slideshow);
        const stage = document.createElement("div");
        stage.className = "slider-stage";
        host.prepend(stage);
        stage.append(...figures);

        const bar = document.createElement("div");
        bar.className = thumbnails ? "slider-bar slider-bar-thumbs" : "slider-bar";
        const previous = document.createElement("button");
        previous.type = "button";
        previous.className = "slider-arrow";
        previous.setAttribute("aria-label", text.previous);
        previous.innerHTML = chevron("M15 5l-7 7 7 7");
        const next = document.createElement("button");
        next.type = "button";
        next.className = "slider-arrow";
        next.setAttribute("aria-label", text.next);
        next.innerHTML = chevron("M9 5l7 7-7 7");
        const track = document.createElement("div");
        track.className = thumbnails ? "slider-thumbs" : "slider-dots";
        const counter = document.createElement("span");
        counter.className = "slider-count";
        counter.setAttribute("aria-live", "polite");

        const marks = figures.map((figure, index) => {
            const picture = figure.querySelector("img");
            const caption = figure.querySelector("figcaption")?.textContent ?? picture?.alt ?? "";
            const mark = document.createElement("button");
            mark.type = "button";
            mark.className = thumbnails ? "slider-thumb" : "slider-dot";
            mark.setAttribute("aria-label", `${text.picture} ${index + 1} ${text.of} ${figures.length}: ${caption}`);
            if (thumbnails && picture) {
                const small = document.createElement("img");
                small.src = picture.currentSrc || picture.src;
                small.alt = "";
                small.width = 160;
                small.height = 100;
                small.loading = "lazy";
                small.decoding = "async";
                mark.append(small);
            }
            mark.addEventListener("click", () => byVisitor(index));
            track.append(mark);
            return mark;
        });
        bar.append(previous, track, next);
        if (!thumbnails) bar.append(counter);
        host.append(bar);

        let current = 0;
        const clock = auto ? autoplay(host, () => show(current + 1)) : null;
        if (clock) bar.append(clock.button);
        const byVisitor = (index) => {
            show(index);
            clock?.restart();
            onUser();
        };
        function show(index) {
            current = (index + figures.length) % figures.length;
            figures.forEach((figure, position) => {
                figure.hidden = position !== current;
                const picture = figure.querySelector("img");
                // Pictures of a hidden slide are not loaded yet: load this one now.
                if (position === current && picture) picture.loading = "eager";
            });
            marks.forEach((mark, position) => {
                if (position === current) mark.setAttribute("aria-current", "true");
                else mark.removeAttribute("aria-current");
            });
            counter.textContent = `${current + 1} / ${figures.length}`;
            if (thumbnails) {
                const mark = marks[current];
                track.scrollTo({ left: mark.offsetLeft - (track.clientWidth - mark.offsetWidth) / 2, behavior: "smooth" });
            }
        }
        previous.addEventListener("click", () => byVisitor(current - 1));
        next.addEventListener("click", () => byVisitor(current + 1));
        host.addEventListener("keydown", (event) => {
            if (event.key === "ArrowLeft") byVisitor(current - 1);
            else if (event.key === "ArrowRight") byVisitor(current + 1);
        });

        // Swiping on a touch screen.
        let startX = null;
        let swiped = false;
        stage.addEventListener("pointerdown", (event) => {
            startX = event.pointerType === "touch" ? event.clientX : null;
            swiped = false;
        });
        stage.addEventListener("pointerup", (event) => {
            if (startX === null) return;
            const distance = event.clientX - startX;
            startX = null;
            if (Math.abs(distance) > 40) {
                swiped = true;
                byVisitor(distance < 0 ? current + 1 : current - 1);
            }
        });
        stage.addEventListener(
            "click",
            (event) => {
                if (!swiped) return;
                event.preventDefault();
                event.stopPropagation();
                swiped = false;
            },
            true,
        );

        show(0);
        return {
            show,
            count: figures.length,
            get current() {
                return current;
            },
        };
    }

    // The feature rows become tabs: one feature at a time instead of six long rows below each other.
    const features = document.querySelector("#features");
    const rows = features ? [...features.querySelectorAll(":scope > .row")] : [];
    if (rows.length > 1) {
        features.classList.add("tabbed");
        const list = document.createElement("div");
        list.className = "tabs";
        list.setAttribute("role", "tablist");
        list.setAttribute("aria-label", text.features);
        rows[0].before(list);
        const players = [];
        let active = 0;
        const tabs = rows.map((row, index) => {
            const tab = document.createElement("button");
            tab.type = "button";
            tab.className = "tab";
            tab.id = `feature-tab-${index}`;
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-controls", `feature-panel-${index}`);
            tab.textContent = row.querySelector(".eyebrow")?.textContent ?? `${index + 1}`;
            row.id = `feature-panel-${index}`;
            row.setAttribute("role", "tabpanel");
            row.setAttribute("aria-labelledby", tab.id);
            tab.addEventListener("click", () => {
                select(index, false);
                tour?.restart();
            });
            list.append(tab);
            const shots = row.querySelector(":scope > .shots");
            players[index] = shots ? slideshow(shots, { auto: false, onUser: () => tour?.restart() }) : null;
            return tab;
        });
        // The tour: the pictures of a feature one after the other, then the next feature.
        const tour = autoplay(features, () => {
            const player = players[active];
            if (player && player.current < player.count - 1) player.show(player.current + 1);
            else select((active + 1) % tabs.length, false);
        });
        if (tour) list.append(tour.button);
        function select(index, focus) {
            active = index;
            if (list.scrollWidth > list.clientWidth) list.scrollTo({ left: tabs[index].offsetLeft - 16, behavior: "smooth" });
            players[index]?.show(0);
            tabs.forEach((tab, position) => {
                const active = position === index;
                tab.setAttribute("aria-selected", String(active));
                tab.tabIndex = active ? 0 : -1;
                rows[position].hidden = !active;
            });
            if (focus) tabs[index].focus();
        }
        list.addEventListener("keydown", (event) => {
            const index = tabs.indexOf(document.activeElement);
            if (index < 0) return;
            tour?.restart();
            if (event.key === "ArrowRight") select((index + 1) % tabs.length, true);
            else if (event.key === "ArrowLeft") select((index - 1 + tabs.length) % tabs.length, true);
            else if (event.key === "Home") select(0, true);
            else if (event.key === "End") select(tabs.length - 1, true);
            else return;
            event.preventDefault();
        });
        select(0, false);
    }

    const pair = document.querySelector("#protection .pair");
    if (pair) slideshow(pair);
    const gallery = document.querySelector("#gallery .gallery");
    if (gallery) slideshow(gallery, { thumbnails: true });
})();

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
