// Builds the static website into docs/: German at the root, English under en/.
// Texts live in docs-src/copy/{de,en}.js, the style sheet in docs-src/site.css, the
// screenshots in docs/assets/shots (made by tests/e2e/siteScreenshots.mjs).

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const REPO = "https://github.com/markmarkinson/mumbin";
const SITE = "https://markmarkinson.github.io/mumbin/";
const DOWNLOAD = `${REPO}/releases/download/current/mumbin.exe`;
const RELEASE = `${REPO}/releases/tag/current`;
const copy = { de: require("../docs-src/copy/de"), en: require("../docs-src/copy/en") };
const articles = { de: require("../docs-src/copy/articles.de"), en: require("../docs-src/copy/articles.en") };
// Guides and articles are one blog: one folder per language. These folders held them before (kept as redirects).
const BLOG_DIR = { de: "blog", en: "blog" };
const OLD_FOLDERS = { de: ["anleitungen", "ratgeber"], en: ["guides"] };
// The date the static pages were last changed in substance (for the sitemap and the structured data).
const SITE_UPDATED = "2026-11-20";
// Which articles the home page shows (positions in the list).
const FEATURED = [2, 3, 0];
const OG_LOCALE = { de: "de_DE", en: "en_US" };
// The mummy: drawn once for the program and the website.
let mascotMarkup = () => "";
/** The mummy with its sign: the logo of the website (the same as in the title bar of the program). */
const brand = (href, label = "Mumbin") => `<a class="brand" href="${href}" aria-label="${label}"><span class="brand-ghost mascot" aria-hidden="true">${mascotMarkup("holder")}</span><span class="brand-sign" aria-hidden="true"><span class="brand-board">Mumbin</span></span></a>`;
const mummy = (mood, className = "", follow = false) => `<span class="mascot ${className}" aria-hidden="true">${mascotMarkup(mood, follow ? "mm-follow" : "")}</span>`;

const GITHUB_ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

// The flag of the language a link switches to (SVG: Windows has no flag emoji).
const FLAGS = {
    de: '<svg viewBox="0 0 5 3" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="5" height="3" fill="#ffce00"/><rect width="5" height="2" fill="#dd0000"/><rect width="5" height="1" fill="#000"/></svg>',
    en: '<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><clipPath id="flag-frame"><path d="M0,0 v30 h60 v-30 z"/></clipPath><clipPath id="flag-diagonals"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><g clip-path="url(#flag-frame)"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#flag-diagonals)" stroke="#c8102e" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#c8102e" stroke-width="6"/></g></svg>',
};

const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const write = (file, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
};

/** Where a page sits: its folder (relative to docs/) and the way back to docs/. */
function place(lang, ...parts) {
    const folders = [lang === "de" ? "" : "en", ...parts.slice(0, -1)].filter(Boolean);
    return { file: [...folders, parts.at(-1)].join("/"), up: folders.length === 0 ? "./" : "../".repeat(folders.length) };
}

const langPrefix = (lang) => (lang === "de" ? "" : "en/");
const guideFile = (lang, slug) => `${BLOG_DIR[lang]}/${slug}.html`;
const articleFile = (lang, slug) => `${BLOG_DIR[lang]}/${slug}.html`;
const blogIndexPath = (lang) => `${langPrefix(lang)}${BLOG_DIR[lang]}/`;
const plain = (html) => String(html).replace(/<[^>]+>/g, "").replaceAll("&nbsp;", " ").replace(/\s+/g, " ").trim();
/** Structured data for search engines (JSON-LD); a data block, so the script rule of the page does not apply to it. */
const jsonLd = (items) =>
    items
        .filter(Boolean)
        .map((item) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...item }).replaceAll("<", "\\u003c")}</script>`)
        .join("\n");
const breadcrumbs = (trail) => ({
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, urlPath], index) => ({ "@type": "ListItem", position: index + 1, name, item: SITE + urlPath })),
});
const publisher = { "@type": "Organization", name: "Mumbin", url: SITE, logo: { "@type": "ImageObject", url: `${SITE}assets/apple-touch-icon.png` } };
const faqData = (items) => ({ "@type": "FAQPage", mainEntity: items.map(([question, answer]) => ({ "@type": "Question", name: plain(question), acceptedAnswer: { "@type": "Answer", text: plain(answer) } })) });

function head({ lang, c, title, description, up, urlPath, alternates, type = "website", published = "", data = [], robots = "index,follow,max-image-preview:large,max-snippet:-1" }) {
    const url = SITE + urlPath;
    const image = `${SITE}assets/${lang === "en" ? "social-en" : "social"}.png`;
    const imageAlt = lang === "en" ? "Mumbin: the mummy ghost holds a sign with the name of the app" : "Mumbin: die Geist-Mumie hält ein Schild mit dem Namen der App";
    const links = alternates.length > 1 && !alternates.some(([hreflang]) => hreflang === "x-default") ? [...alternates, ["x-default", alternates.find(([hreflang]) => hreflang === "de")?.[1] ?? alternates[0][1]]] : alternates;
    return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0a0a0a">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
<meta property="og:site_name" content="Mumbin">
<meta property="og:locale" content="${OG_LOCALE[lang]}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${type}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(imageAlt)}">
${published ? `<meta property="article:published_time" content="${published}">\n` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${esc(imageAlt)}">
<link rel="canonical" href="${url}">
${links.map(([hreflang, href]) => `<link rel="alternate" hreflang="${hreflang}" href="${SITE}${href}">`).join("\n")}
<link rel="icon" type="image/svg+xml" href="${up}assets/favicon.svg?v=2">
<link rel="icon" type="image/png" sizes="32x32" href="${up}assets/favicon-32.png?v=2">
<link rel="shortcut icon" href="${up}assets/favicon.ico?v=2">
<link rel="apple-touch-icon" href="${up}assets/apple-touch-icon.png?v=2">
<link rel="preload" href="${up}assets/fonts/plus-jakarta-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${up}assets/mascot.css">
<link rel="stylesheet" href="${up}assets/site.css">
<script src="${up}assets/site.js" defer></script>
${jsonLd(data)}
</head>`;
}

function nav({ lang, c, up, switchHref, home, onHome = false }) {
    const anchor = (id) => (onHome ? `#${id}` : `${home}#${id}`);
    const items = [[anchor("features"), c.nav.features], [anchor("protection"), c.nav.protection], [anchor("speed"), c.nav.speed], [`${up}${blogIndexPath(lang)}`, c.nav.blog], [anchor("faq"), c.nav.faq]];
    return `<a class="skip" href="#main">${c.skip}</a>
<nav class="nav" aria-label="${lang === "de" ? "Hauptnavigation" : "Main navigation"}"><div class="nav-inner wrap">
${brand(home)}
<div class="nav-links">${items.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</div>
<div class="nav-actions"><a class="icon-link" href="${REPO}" aria-label="GitHub" title="GitHub">${GITHUB_ICON}</a><a class="language" href="${switchHref}" hreflang="${lang === "de" ? "en" : "de"}" title="${c.nav.languageTitle}">${FLAGS[lang === "de" ? "en" : "de"]}<span>${c.nav.language}</span></a><a class="button primary small" href="${anchor("download")}">${c.nav.download}</a></div>
</div></nav>`;
}

function footer({ lang, c, up }) {
    return `<footer class="footer wrap"><span>Mumbin <span aria-hidden="true">/</span> ${c.footer.tagline}</span><div class="footer-links"><a href="${up}${blogIndexPath(lang)}">${c.nav.blog}</a><a href="${REPO}">GitHub ↗</a><a href="https://discreveal.com/">DiscReveal ↗</a><a href="${up}${lang === "de" ? "" : "en/"}privacy.html">${c.footer.privacy}</a><a href="${REPO}/blob/main/LICENSE">${c.footer.license}</a><a href="${up}third-party-notices.html">${c.footer.licenses}</a></div></footer>
<div class="legal-line wrap">${c.footer.rights}</div>`;
}

const shotFigure = (c, up, name, { eager = false, caption = true } = {}) => {
    const [alt, text] = c.shots[name];
    return `<figure class="frame"><a href="${up}assets/shots/${c.lang === "en" ? "en/" : ""}${name}.webp"><img src="${up}assets/shots/${c.lang === "en" ? "en/" : ""}${name}.webp" width="1920" height="1200" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}></a>${caption ? `<figcaption>${esc(text)}</figcaption>` : ""}</figure>`;
};

/** Fills the placeholders of a guide or article: screenshots, links to other articles and guides, downloads. */
function fillBody(lang, up, html) {
    const c = copy[lang];
    return html
        .replace(/\[\[shot:([\w-]+)\]\]/g, (_, name) => shotFigure(c, up, name))
        .replace(/\{\{article:([\w-]+)\}\}/g, (_, slug) => {
            if (!articles[lang].some((article) => article.slug === slug)) throw new Error(`Unknown article ${slug} (${lang})`);
            return `${up}${langPrefix(lang)}${articleFile(lang, slug)}`;
        })
        .replace(/\{\{guideLink:([\w-]+)\}\}/g, (_, slug) => {
            const guide = c.guideList.find((entry) => entry.slug === slug);
            if (!guide) throw new Error(`Unknown guide ${slug} (${lang})`);
            return `<a class="text-link" href="${up}${langPrefix(lang)}${guideFile(lang, slug)}">${c.blog.quoteOpen}${guide.short}${c.blog.quoteClose}</a>`;
        })
        .replaceAll("{{download}}", DOWNLOAD)
        .replaceAll("{{tool}}", `${up}downloads/mumbin_decrypt.py`);
}

/** All posts of a language: articles first, then the step-by-step guides; the n-th post is the translation partner of the n-th post of the other language. */
const posts = (lang) => [
    ...articles[lang].map((article) => ({ ...article, kind: "article" })),
    ...copy[lang].guideList.map((guide) => ({ ...guide, kind: "guide", description: guide.lead, date: SITE_UPDATED })),
];
const postFile = (lang, post) => articleFile(lang, post.slug);
const postCard = (lang, up, post) => {
    const c = copy[lang];
    const kind = post.kind === "guide" ? c.blog.kindGuide : c.blog.kindArticle;
    return `<a class="guide-card" href="${up}${langPrefix(lang)}${postFile(lang, post)}"><span class="meta">${kind} · ${post.minutes} ${c.blog.minutes}</span><h3>${post.title}</h3><p>${post.card}</p><span class="more">${c.blog.read}</span></a>`;
};
const formatDate = (date, c) => new Date(`${date}T00:00:00Z`).toLocaleDateString(c.locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

const section = (id, label, title, lead, body) =>
    `<section class="section wrap" id="${id}"><div class="section-head"><span class="eyebrow">${label}</span><h2>${title}</h2>${lead ? `<p class="lead">${lead}</p>` : ""}</div>${body}</section>`;

function homePage(lang) {
    const c = copy[lang];
    const { file, up } = place(lang, "index.html");
    const otherHome = lang === "de" ? "en/" : "../";
    const fig = (name, options) => shotFigure(c, up, name, options);
    const downloadButton = (label) => `<a class="button primary" href="${DOWNLOAD}">↓ &nbsp;${label}</a>`;

    const hero = `<header class="hero wrap"><div><span class="badge">${c.hero.badge}</span><h1>${c.hero.title}</h1><p class="lead">${c.hero.lead}</p><div class="ctas">${downloadButton(c.hero.download)}<a class="button" href="${REPO}">${c.hero.source}</a></div><div class="chips">${c.hero.chips.map((chip) => `<span>${chip}</span>`).join("")}</div><p class="fine">${c.hero.fine}</p></div><div class="hero-visual">${mummy("awake", "hero-mascot", true)}${fig("overview", { eager: true, caption: false })}</div></header>`;

    const intro = section("intro", c.intro.label, c.intro.title, c.intro.lead, `<ul class="benefits">${c.intro.benefits.map((text) => `<li>${text}</li>`).join("")}</ul>`);

    const rows = c.features.rows
        .map(
            (row) =>
                `<article class="row"><div class="row-copy"><span class="eyebrow">${row.label}</span><h3>${row.title}</h3><p>${row.text}</p><ul class="points">${row.points.map((point) => `<li>${point}</li>`).join("")}</ul></div><div class="shots">${row.shots.map((name) => fig(name)).join("")}</div></article>`,
        )
        .join("");
    const features = section("features", c.features.label, c.features.title, c.features.lead, rows);

    const p = c.protection;
    const protection = section(
        "protection",
        p.label,
        p.title,
        p.lead,
        `${mummy("asleep", "head-mascot")}` +
        `<div class="cards">${p.cards.map((card, index) => `<article class="card"><span class="num">0${index + 1}</span><h3>${card.title}</h3><p>${card.text}</p></article>`).join("")}</div>
<div class="table-wrap"><table><thead><tr>${p.table.head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${p.table.rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<div class="pair">${p.shots.map((name) => fig(name)).join("")}</div>`,
    );

    const speed = section("speed", c.speed.label, c.speed.title, c.speed.lead, `<div class="stats">${c.speed.stats.map(([value, text]) => `<div class="stat"><strong>${value}</strong><span>${text}</span></div>`).join("")}</div><p class="method">${c.speed.method}</p>`);

    const privacy = section("privacy", c.privacy.label, c.privacy.title, "", `<div class="cards">${c.privacy.cards.map((card) => `<article class="card"><h3>${card.title}</h3><p>${card.text}</p></article>`).join("")}</div>`);

    const d = c.download;
    const downloadSection = section(
        "download",
        d.label,
        d.title,
        d.text,
        `<div class="download-panel">${mummy("awake", "panel-mascot", true)}<span class="bubble panel-bubble">${d.psst}</span><div><h3>${d.file}</h3><div class="ctas">${downloadButton(d.button)}<a class="button" href="${RELEASE}">${d.release}</a></div><p class="fine">${d.verify}</p><div class="code">${d.command}</div><p class="fine"><a class="text-link" href="${up}downloads/mumbin_decrypt.py" download>${d.tool}</a> &nbsp;·&nbsp; <a class="text-link" href="${up}${langPrefix(lang)}${guideFile(lang, copy[lang].guideList[2].slug)}">${d.toolGuide.replace(" ↗", "")}</a></p></div><dl class="specs">${d.specs.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join("")}</dl></div>
<ol class="steps">${d.steps.map(([title, text]) => `<li><h3>${title}</h3><p>${text}</p></li>`).join("")}</ol>`,
    );

    const gallery = section("gallery", c.gallery.label, c.gallery.title, c.gallery.lead, `<div class="gallery">${Object.keys(c.shots).map((name) => fig(name)).join("")}</div>`);

    const featured = [...FEATURED.map((index) => articles[lang][index]).map((article) => ({ ...article, kind: "article" })), ...posts(lang).filter((post) => post.kind === "guide")];
    const blog = section("blog", c.blog.label, c.blog.title, c.blog.lead, `<div class="cards">${featured.map((post) => postCard(lang, up, post)).join("")}</div><p class="more-row"><a class="button" href="${up}${blogIndexPath(lang)}">${c.blog.all}</a></p>`);

    const fit = section("fit", c.fit.label, c.fit.title, "", `<div class="fit single"><article class="card"><h3>${c.fit.yesTitle}</h3><ul class="points">${c.fit.yes.map((text) => `<li>${text}</li>`).join("")}</ul></article></div>`);

    const faq = section("faq", c.faq.label, c.faq.title, "", `<div class="faq">${c.faq.items.map(([question, answer]) => `<details><summary>${question}</summary><p>${answer}</p></details>`).join("")}</div>`);

    const closing = `<section class="closing wrap">${mummy("awake", "closing-mascot", true)}<span class="bubble closing-bubble">${c.closing.peek}</span><h2>${c.closing.title}</h2><p>${c.closing.text}</p><div class="ctas">${downloadButton(c.hero.download)}<a class="button" href="${REPO}">${c.hero.source}</a></div></section>`;

    const alternates = [["de", ""], ["en", "en/"], ["x-default", ""]];
    const homeUrl = SITE + (lang === "de" ? "" : "en/");
    const data = [
        { "@type": "WebSite", name: "Mumbin", url: homeUrl, inLanguage: lang },
        {
            "@type": "SoftwareApplication",
            name: "Mumbin",
            url: homeUrl,
            description: c.description,
            applicationCategory: "ProductivityApplication",
            operatingSystem: "Windows 10, Windows 11",
            softwareVersion: "0.1.0",
            fileSize: "4.3 MB",
            inLanguage: [lang, lang === "de" ? "en" : "de"],
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
            downloadUrl: DOWNLOAD,
            license: `${REPO}/blob/main/LICENSE`,
            featureList: c.intro.benefits.map(plain),
            image: `${SITE}assets/${lang === "en" ? "social-en" : "social"}.png`,
            screenshot: ["overview", "write", "tasks", "protect-menu"].map((name) => `${SITE}assets/shots/${lang === "en" ? "en/" : ""}${name}.webp`),
        },
        faqData(c.faq.items),
    ];
    const html = `${head({ lang, c, title: c.title, description: c.description, up, urlPath: lang === "de" ? "" : "en/", alternates, data })}
<body>
${nav({ lang, c, up, switchHref: otherHome, home: up, onHome: true })}
<main id="main">
${hero}
${intro}
${features}
${protection}
${speed}
${privacy}
${downloadSection}
${gallery}
${blog}
${fit}
${faq}
${closing}
</main>
${footer({ lang, c, up })}
</body>
</html>
`;
    write(path.join(root, "docs", file), html);
}

function postPages(lang) {
    const c = copy[lang];
    const otherLang = lang === "de" ? "en" : "de";
    const list = posts(lang);
    const otherList = posts(otherLang);
    list.forEach((post, index) => {
        const { file, up } = place(lang, BLOG_DIR[lang], `${post.slug}.html`);
        const ownPath = langPrefix(lang) + postFile(lang, post);
        const otherPath = langPrefix(otherLang) + postFile(otherLang, otherList[index]);
        const home = `${up}${lang === "de" ? "" : "en/"}`;
        const kind = post.kind === "guide" ? c.blog.kindGuide : c.blog.kindArticle;
        let body = fillBody(lang, up, post.body);
        // The questions of an article are part of the text (and of the structured data, which must match what is visible).
        if (post.faq?.length) body += `\n<h2>${c.blog.faqTitle}</h2>\n${post.faq.map(([question, answer]) => `<h3>${question}</h3>\n<p>${answer}</p>`).join("\n")}\n`;
        const next = list[(index + 1) % list.length];
        const data = [
            {
                "@type": post.kind === "guide" ? "TechArticle" : "BlogPosting",
                headline: plain(post.title),
                description: plain(post.description),
                inLanguage: lang,
                datePublished: post.date,
                dateModified: post.updated ?? post.date,
                image: `${SITE}assets/${lang === "en" ? "social-en" : "social"}.png`,
                author: publisher,
                publisher,
                mainEntityOfPage: SITE + ownPath,
                isAccessibleForFree: true,
            },
            breadcrumbs([[c.blog.home, langPrefix(lang)], [c.blog.label, blogIndexPath(lang)], [post.short ?? post.title, ownPath]]),
            post.faq?.length ? faqData(post.faq) : null,
        ];
        const html = `${head({ lang, c, title: post.seoTitle ?? `${post.title} – Mumbin`, description: post.description, up, urlPath: ownPath, alternates: [[lang, ownPath], [otherLang, otherPath]], type: "article", published: post.date, data })}
<body>
${nav({ lang, c, up, switchHref: `${up}${otherPath}`, home })}
<main id="main" class="wrap"><article class="article">
<p class="crumbs"><a href="${up}${blogIndexPath(lang)}">${c.blog.back}</a> / ${kind} / ${post.minutes} ${c.blog.minutes}</p>
<h1>${post.title}</h1>
<p class="lead">${post.lead}</p>
${body}
<div class="next"><span class="eyebrow">${c.guides.next}</span><a class="text-link" href="${up}${langPrefix(lang)}${postFile(lang, next)}">${next.title} →</a></div>
</article></main>
${footer({ lang, c, up })}
</body>
</html>
`;
        write(path.join(root, "docs", file), html);
    });
}

function blogIndexPage(lang) {
    const c = copy[lang];
    const otherLang = lang === "de" ? "en" : "de";
    const { file, up } = place(lang, BLOG_DIR[lang], "index.html");
    const ownPath = blogIndexPath(lang);
    const home = `${up}${lang === "de" ? "" : "en/"}`;
    const list = posts(lang);
    const data = [
        {
            "@type": "CollectionPage",
            name: plain(c.blog.indexTitle),
            description: plain(c.blog.indexDescription),
            inLanguage: lang,
            url: SITE + ownPath,
            hasPart: list.map((post) => ({ "@type": post.kind === "guide" ? "TechArticle" : "BlogPosting", headline: plain(post.title), url: SITE + langPrefix(lang) + postFile(lang, post), datePublished: post.date })),
        },
        breadcrumbs([[c.blog.home, langPrefix(lang)], [c.blog.label, ownPath]]),
    ];
    const html = `${head({ lang, c, title: c.blog.indexTitle, description: c.blog.indexDescription, up, urlPath: ownPath, alternates: [[lang, ownPath], [otherLang, blogIndexPath(otherLang)]], data })}
<body>
${nav({ lang, c, up, switchHref: `${up}${blogIndexPath(otherLang)}`, home })}
<main id="main" class="wrap"><div class="article index">
<p class="crumbs"><a href="${home}">${c.blog.home}</a> / ${c.blog.label}</p>
<h1>${c.blog.indexTitle}</h1>
<p class="lead">${c.blog.indexLead}</p>
<div class="cards">${list.map((post) => postCard(lang, up, post)).join("")}</div>
</div></main>
${footer({ lang, c, up })}
</body>
</html>
`;
    write(path.join(root, "docs", file), html);
}

/** The addresses the guides and articles had before they moved into the blog: small pages that lead to the new address. */
function redirects() {
    for (const lang of ["de", "en"]) {
        const list = posts(lang);
        const target = (path_) => SITE + path_;
        const stub = (fromFile, to) => {
            const depth = fromFile.split("/").length - 1;
            write(
                path.join(root, "docs", fromFile),
                `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">\n<title>Mumbin</title>\n<meta http-equiv="refresh" content="0;url=${target(to)}">\n<link rel="canonical" href="${target(to)}">\n<meta name="robots" content="noindex,follow">\n<link rel="stylesheet" href="${"../".repeat(depth)}assets/site.css">\n</head>\n<body>\n<main class="wrap not-found"><p class="lead"><a class="text-link" href="${target(to)}">${target(to)}</a></p></main>\n</body>\n</html>\n`,
            );
        };
        for (const folder of OLD_FOLDERS[lang]) {
            const base = lang === "de" ? folder : `${langPrefix(lang)}${folder}`;
            const kind = folder === "ratgeber" ? "article" : "guide";
            for (const post of list.filter((entry) => entry.kind === kind)) stub(`${base}/${post.slug}.html`, langPrefix(lang) + postFile(lang, post));
            if (folder === "ratgeber") stub(`${base}/index.html`, blogIndexPath(lang));
        }
    }
}

function privacyPage(lang) {
    const c = copy[lang];
    const { file, up } = place(lang, "privacy.html");
    const home = lang === "de" ? up : `${up}en/`;
    const html = `${head({ lang, c, title: c.privacyPage.seoTitle, description: c.privacyPage.body.slice(0, 150), up, urlPath: file, alternates: [["de", "privacy.html"], ["en", "en/privacy.html"]], data: [{ "@type": "WebPage", name: c.privacyPage.title, url: SITE + file, inLanguage: lang }] })}
<body>
<nav class="nav"><div class="nav-inner wrap">${brand(home)}</div></nav>
<main id="main" class="wrap"><article class="article"><h1>${c.privacyPage.title}</h1><p class="lead">${c.privacyPage.body}</p><p><a class="text-link" href="${home}">${c.privacyPage.back}</a></p></article></main>
${footer({ lang, c, up })}
</body>
</html>
`;
    write(path.join(root, "docs", file), html);
}

/** The page GitHub shows for an unknown address: the mummy looks around. Absolute paths, as it is shown at any depth. */
function notFoundPage() {
    const base = new URL(SITE).pathname;
    const c = copy.de;
    const html = `${head({ lang: "de", c, title: "404 – Mumbin", description: "Seite nicht gefunden / Page not found", up: base, urlPath: "404.html", alternates: [["de", "404.html"]], robots: "noindex,follow" })}
<body>
<nav class="nav"><div class="nav-inner wrap">${brand(base)}</div></nav>
<main id="main" class="wrap not-found">
${mummy("awake", "lost-mascot", true)}
<p class="code-404">404</p>
<h1>Diese Seite gibt es nicht.</h1>
<p class="lead">Die Mumie hat überall nachgesehen – hier ist nichts. <span lang="en">(Page not found.)</span></p>
<div class="ctas"><a class="button primary" href="${base}">Zur Startseite</a><a class="button" href="${base}en/">English version</a></div>
</main>
</body>
</html>
`;
    write(path.join(root, "docs", "404.html"), html);
}

function assets() {
    for (const name of ["site.css", "site.js"]) fs.copyFileSync(path.join(root, "docs-src", name), path.join(root, "docs", "assets", name));
    fs.copyFileSync(path.join(root, "renderer", "mascot.css"), path.join(root, "docs", "assets", "mascot.css"));
    fs.copyFileSync(path.join(root, "renderer", "icon.svg"), path.join(root, "docs", "assets", "mark.svg"));
    fs.copyFileSync(path.join(root, "renderer", "icon-small.svg"), path.join(root, "docs", "assets", "favicon.svg"));
    for (const name of ["favicon-32.png", "favicon.ico", "apple-touch-icon.png"]) fs.copyFileSync(path.join(root, "docs-src", name), path.join(root, "docs", "assets", name));
    const fonts = path.join(root, "docs", "assets", "fonts");
    fs.mkdirSync(fonts, { recursive: true });
    for (const name of ["plus-jakarta-sans-latin.woff2", "jetbrains-mono-latin.woff2", "LICENSE.txt"]) {
        fs.copyFileSync(path.join(root, "renderer", "fonts", name), path.join(fonts, name));
    }
    fs.mkdirSync(path.join(root, "docs", "downloads"), { recursive: true });
    fs.copyFileSync(path.join(root, "tools", "mumbin_decrypt.py"), path.join(root, "docs", "downloads", "mumbin_decrypt.py"));
    write(path.join(root, "docs", ".nojekyll"), "");
    write(path.join(root, "docs", "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);
}

function sitemap() {
    // [path in German, path in English, last change]
    const pages = [
        ["", "en/", SITE_UPDATED],
        [blogIndexPath("de"), blogIndexPath("en"), SITE_UPDATED],
        ["privacy.html", "en/privacy.html", SITE_UPDATED],
    ];
    posts("de").forEach((post, index) => pages.push([langPrefix("de") + postFile("de", post), langPrefix("en") + postFile("en", posts("en")[index]), post.updated ?? post.date]));
    const entry = (own, de, en, lastmod) =>
        `<url><loc>${SITE}${own}</loc><lastmod>${lastmod}</lastmod><xhtml:link rel="alternate" hreflang="de" href="${SITE}${de}"/><xhtml:link rel="alternate" hreflang="en" href="${SITE}${en}"/><xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${de}"/></url>`;
    const urls = pages.flatMap(([de, en, lastmod]) => [entry(de, de, en, lastmod), entry(en, de, en, lastmod)]);
    write(path.join(root, "docs", "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`);
}

(async () => {
    // The mummy is drawn in an ES module of the program; the website uses the same drawing.
    ({ mascotMarkup } = await import(require("node:url").pathToFileURL(path.join(root, "renderer", "js", "mascotMarkup.js")).href));
    // Generated folders are rebuilt from scratch, so that nothing of a removed page stays behind.
    for (const folder of ["blog", "en/blog", "anleitungen", "ratgeber", "en/guides"]) fs.rmSync(path.join(root, "docs", folder), { recursive: true, force: true });
    for (const lang of ["de", "en"]) {
        homePage(lang);
        postPages(lang);
        blogIndexPage(lang);
        privacyPage(lang);
    }
    notFoundPage();
    redirects();
    assets();
    sitemap();
    console.log("Built the German and English website in docs/");
})();
