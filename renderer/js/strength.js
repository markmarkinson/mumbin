// How hard a passphrase is to guess, as a rough estimate in bits and a level from 0 to 4.
// No network, no word list download: a short list of the worst offenders plus a model in which
// a passphrase of ordinary words costs about as much as one dictionary word per word.
// It is a guide for the person, not a promise; the real protection is Argon2id plus length.

/** Passphrases that are in every attacker's first list (lower case, letters and digits only). */
const COMMON = new Set([
    "passwort", "password", "passwort1", "password1", "123456", "12345678", "123456789", "1234567890", "qwertz", "qwerty", "qwertzui",
    "qwertyuiop", "asdfghjk", "abc123", "abcd1234", "iloveyou", "ichliebedich", "letmein", "willkommen", "hallo", "hallo123", "geheim",
    "geheim123", "admin", "admin123", "welcome", "monkey", "dragon", "sonne", "sommer", "winter", "fussball", "football", "master",
    "login", "test1234", "mumbin", "notizen", "notizbuch", "tresor",
]);

const SEQUENCES = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertzuiopasdfghjklyxcvbnm", "qwertyuiopasdfghjklzxcvbnm"];

const log2 = Math.log2;

/** Bits for a run of characters picked at random from the classes it uses. */
function randomBits(token) {
    let pool = 0;
    if (/\p{Ll}/u.test(token)) pool += 26;
    if (/\p{Lu}/u.test(token)) pool += 26;
    if (/\p{Nd}/u.test(token)) pool += 10;
    if (/[^\p{L}\p{Nd}]/u.test(token)) pool += 33;
    return [...token].length * log2(Math.max(pool, 2));
}

/** Looks like a word of a language (vowels in a normal share), so it costs one word, not one random string. */
function looksLikeWord(token) {
    const letters = [...token.toLowerCase()];
    if (letters.length < 2 || !/^\p{L}+$/u.test(token)) return false;
    const vowels = letters.filter((c) => "aeiouyäöüéèàáíóú".includes(c)).length;
    return vowels / letters.length >= 0.2 && !/[^aeiouyäöüéèàáíóú]{5,}/i.test(token.replace(/sch|tsch|ch|ck|ng|ss|pf/gi, "x"));
}

/** Runs like 1234, abcd, qwert that are walked along the keyboard or the alphabet. */
function hasSequence(text) {
    const lower = text.toLowerCase();
    for (const sequence of SEQUENCES) {
        for (let i = 0; i + 4 <= sequence.length; i += 1) {
            const part = sequence.slice(i, i + 4);
            if (lower.includes(part) || lower.includes([...part].reverse().join(""))) return true;
        }
    }
    return false;
}

/**
 * @returns {{bits: number, level: 0|1|2|3|4}} level: 0 very weak, 1 weak, 2 fair, 3 good, 4 strong
 */
export function passphraseStrength(passphrase) {
    const text = String(passphrase ?? "").normalize("NFC");
    if (!text) return { bits: 0, level: 0 };
    const plain = text.toLowerCase().replace(/[^\p{L}\p{Nd}]/gu, "");
    if (COMMON.has(plain) || COMMON.has(plain.replace(/\d+$/u, "")) || new Set([...plain]).size <= 2) return { bits: Math.min(10, randomBits(text)), level: 0 };

    const seen = new Set();
    let bits = 0;
    for (const token of text.split(/[\s_\-.,;:]+/u).filter(Boolean)) {
        const key = token.toLowerCase();
        if (seen.has(key)) {
            bits += 1;
            continue;
        }
        seen.add(key);
        const random = randomBits(token);
        const word = 12.5 + 0.8 * Math.max(0, [...token].length - 6);
        bits += looksLikeWord(token) ? Math.min(random, word) : random;
        // Digits after a word are guessable (summer2026): a year or counter costs a few bits only.
        if (/^\p{L}+\d{1,4}[^\p{L}\p{Nd}]?$/u.test(token)) bits -= Math.max(0, randomBits(token) - word - 14);
    }
    if (hasSequence(text)) bits = Math.min(bits, 24);
    bits = Math.max(0, Math.min(bits, randomBits(text)));
    const level = bits < 28 ? 0 : bits < 40 ? 1 : bits < 56 ? 2 : bits < 72 ? 3 : 4;
    return { bits: Math.round(bits), level };
}
