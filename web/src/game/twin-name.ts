// Twin names: a real-looking name, not an empty box or keyboard mashing. Used by the Create/Edit
// screen and by the API, so a junk name can't be saved either way. Plain rules.

export const TWIN_NAME_MAX = 20;

/** Trimmed, with runs of spaces collapsed. */
export const cleanTwinName = (raw: string) => raw.trim().replace(/\s+/g, " ");

const MASHES = ["qwert", "asdf", "sdfg", "dfgh", "fghj", "ghjk", "hjkl", "zxcv", "xcvb", "jkl;", "lkjh"];

/** Why a name won't do, in plain words, or null if it's fine. */
export function twinNameProblem(raw: string): string | null {
  const name = cleanTwinName(raw);
  if (!name) return "Give your twin a name.";
  if (name.length > TWIN_NAME_MAX) return `Keep it to ${TWIN_NAME_MAX} characters.`;
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)) return "Use letters only (spaces, . ' and - are fine).";
  if ((name.match(/\p{L}/gu) ?? []).length < 2) return "Use at least 2 letters.";
  if (!name.split(/[ .'-]+/).some((w) => (w.match(/\p{L}/gu) ?? []).length >= 2)) return "Use at least 2 letters in a row.";
  if (/(\p{L})\1\1/iu.test(name)) return "That looks like a typo. Try a real name.";
  const lower = name.toLowerCase();
  if (MASHES.some((m) => lower.includes(m))) return "That looks like keyboard mashing. Try a real name.";
  // Names written in English letters have vowels and no long consonant runs ("klsdjfj" has neither).
  for (const word of lower.split(/[ .'-]+/)) {
    if (!/^[a-z]+$/.test(word) || word.length < 3) continue;
    if (!/[aeiouy]/.test(word) || /[^aeiouy]{5,}/.test(word)) return "That doesn't look like a name. Try a real one.";
  }
  return null;
}
