// The drawing of the mummy of Mumbin (the logo): a little ghost made of bandages. Pure text, so that
// the program, the website builder and the icon script can all use it; mascot.js turns it into elements.
// How it moves is in mascot.css.

let counter = 0;

const CREAM = "#f3eee3";
const SHADE = "#d3c7ae";
const LINE = "#cfc3a8";
const RED = "#e50914";
const RED_DARK = "#b30710";
const DARK = "#1a0d0f";

const HEM = "Q89 100 82 108Q71 100 60 108Q49 100 38 108Q31 100 24 108Z";
const BODY = `M24 108V52Q24 10 60 10Q96 10 96 52V108${HEM}`;

const ARM_LEFT = "M27 76Q12 84 15 99";
const ARM_RIGHT = "M93 76Q108 84 105 99";
const ARM_WAVING = "M93 76Q113 72 111 50";

const arm = (d, className = "") =>
    `<g class="mm-arm ${className}" fill="none" stroke-linecap="round"><path d="${d}" stroke="${SHADE}" stroke-width="13" transform="translate(0 2)"/><path d="${d}" stroke="${CREAM}" stroke-width="12"/></g>`;

const strand = (d, width) =>
    `<g class="mm-strand" fill="none" stroke-linecap="round"><path d="${d}" stroke="${SHADE}" stroke-width="${width + 0.8}" transform="translate(0 1.8)"/><path d="${d}" stroke="${CREAM}" stroke-width="${width}"/></g>`;

/** One eye: the white, the pupil with its glint and (for the moving moods) an eyelid. */
const eye = (side, cx, cy, r, px, py, lid) =>
    `<g class="mm-eye"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/><g class="mm-pupil"><circle cx="${cx + px}" cy="${cy + py}" r="${(r * 0.48).toFixed(2)}" fill="${DARK}"/><circle cx="${(cx + px + 0.9).toFixed(2)}" cy="${(cy + py - 1.3).toFixed(2)}" r="${(r * 0.16).toFixed(2)}" fill="#fff"/></g>${lid ? `<rect class="mm-lid mm-lid-${side}" x="${cx - r - 0.5}" y="${cy - r - 0.5}" width="${2 * r + 1}" height="${2 * r + 1}" fill="${DARK}"/>` : ""}</g>`;

const shutEye = (cx, cy) => `<path d="M${cx - 8} ${cy - 1}Q${cx} ${cy + 7} ${cx + 8} ${cy - 1}" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>`;

const WRAPS = `<g fill="none" stroke-linecap="round" stroke="${LINE}" stroke-width="2.6"><path d="M18 22Q60 36 102 18"/><path d="M18 45Q60 50 102 41"/><path d="M18 91Q60 86 102 95"/><path d="M18 101Q60 97 102 105"/></g>`;
const FOREHEAD = `<path d="M18 33Q60 46 102 29" fill="none" stroke="${RED_DARK}" stroke-width="10" stroke-linecap="round" transform="translate(0 2)"/><path d="M18 33Q60 46 102 29" fill="none" stroke="${RED}" stroke-width="9.5" stroke-linecap="round"/>`;
const GAP = `<rect x="28" y="55" width="64" height="25" rx="12.5" fill="${DARK}"/>`;

const TUFT = "M64 11Q66 1 80 4";
const TAIL = "M31 106Q22 114 27 119";

/** The ghost itself (without the surrounding svg). */
function figure(mood, clip) {
    const moving = mood === "awake" || mood === "wave" || mood === "asleep";
    const asleep = mood === "asleep";
    const waving = mood === "wave";
    const tilt = asleep ? -12 : -8;
    const eyes = asleep
        ? eye("left", 44, 67.5, 7, 1.4, -0.6, true) + eye("right", 76, 67, 9.2, 2, -1.2, true) + `<g class="mm-shut">${shutEye(44, 67)}${shutEye(76, 67)}</g>`
        : eye("left", 44, 67.5, 7, waving ? 1.8 : 1.4, waving ? -0.4 : -0.6, moving) + eye("right", 76, 67, 9.2, waving ? 1.6 : 2, waving ? -1 : -1.2, moving);
    const dream = asleep
        ? `<g class="mm-dream" fill="${CREAM}" font-weight="500" font-family="sans-serif"><text class="mm-z" x="96" y="22" font-size="14">z</text><text class="mm-z mm-z2" x="106" y="11" font-size="10">z</text></g>`
        : "";
    return `<g class="mm-breathe"><g transform="rotate(${tilt} 60 62)">${arm(ARM_LEFT)}${arm(waving ? ARM_WAVING : ARM_RIGHT, "mm-arm-right")}<path d="${BODY}" fill="${SHADE}"/><g clip-path="url(#${clip})"><path d="${BODY}" transform="translate(-6 -2)" fill="${CREAM}"/>${WRAPS}${FOREHEAD}${GAP}</g>${eyes}${strand(TUFT, 6)}${strand(TAIL, 6.5)}${dream}</g></g>`;
}

/**
 * The small version for 16 to 32 px: no wraps and no tail, bigger eyes, a broader band. With `hold` the right
 * arm reaches out and grips a pole (the sign with the name of the program is made of HTML beside it);
 * with `moving` the eyes get lids and can blink.
 */
function smallFigure(clip, { hold = false, moving = false } = {}) {
    const eyes = eye("left", 44, 69, 10, 1.6, -1, moving) + eye("right", 76, 68.5, 11, 2, -1.2, moving);
    const rightArm = hold
        ? `<g fill="none" stroke-linecap="round"><path d="M93 78Q103 84 112 75" stroke="${SHADE}" stroke-width="15"/><path d="M93 76Q103 82 112 73" stroke="${CREAM}" stroke-width="14"/></g><circle cx="113" cy="73" r="8.5" fill="${CREAM}"/>`
        : `<g fill="none" stroke-linecap="round"><path d="M93 78Q107 84 104 98" stroke="${SHADE}" stroke-width="15"/><path d="M93 76Q107 82 104 96" stroke="${CREAM}" stroke-width="14"/></g>`;
    return `<g transform="rotate(-8 60 62)"><g fill="none" stroke-linecap="round"><path d="M27 78Q13 84 16 98" stroke="${SHADE}" stroke-width="15"/><path d="M27 76Q13 82 16 96" stroke="${CREAM}" stroke-width="14"/></g>${rightArm}<path d="${BODY}" fill="${SHADE}"/><g clip-path="url(#${clip})"><path d="${BODY}" transform="translate(-7 -2)" fill="${CREAM}"/><path d="M18 36Q60 50 102 31" fill="none" stroke="${RED}" stroke-width="15" stroke-linecap="round"/><rect x="26" y="54" width="68" height="30" rx="15" fill="${DARK}"/></g>${eyes}</g>`;
}

/**
 * SVG markup of the mummy.
 * `mood`: "awake" (blinks, looks around; the standard), "wave" (the same, and it waves hello), "asleep"
 * (eyes shut, dreaming), "holder" (small, holds the pole of the name sign in the title bar), "icon" and
 * "icon-small" (still pictures on a dark tile for the application icon).
 * `extra` adds classes, for example "mm-follow" (the eyes follow the pointer).
 */
export function mascotMarkup(mood = "awake", extra = "") {
    counter += 1;
    const clip = `mm-body-${counter}`;
    const defs = `<defs><clipPath id="${clip}"><path d="${BODY}"/></clipPath></defs>`;
    const open = (className) => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" viewBox="-2 0 124 124" aria-hidden="true">`;
    if (mood === "icon" || mood === "icon-small") {
        const small = mood === "icon-small";
        const scale = small ? 0.94 : 0.84;
        const tile = `<rect x="-2" y="0" width="124" height="124" rx="${small ? 28 : 32}" fill="#1c1515"/>` + (small ? "" : `<rect x="-1" y="1" width="122" height="122" rx="31" fill="none" stroke="#3a2c2c" stroke-width="2"/>`);
        const inner = small ? smallFigure(clip) : figure("static", clip);
        return `${open("mm")}${defs}${tile}<g transform="translate(${(60 * (1 - scale)).toFixed(2)} ${(62 * (1 - scale) + (small ? 1 : 3)).toFixed(2)}) scale(${scale})">${inner}</g></svg>`;
    }
    if (mood === "holder") return `${open(["mm", "mm-awake", "mm-holder", extra].filter(Boolean).join(" "))}${defs}${smallFigure(clip, { hold: true, moving: true })}</svg>`;
    const classes = ["mm", mood === "wave" ? "mm-awake mm-wave" : `mm-${mood}`, extra].filter(Boolean).join(" ");
    return `${open(classes)}${defs}${figure(mood, clip)}</svg>`;
}
