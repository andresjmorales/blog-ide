export const HARPER_DICTIONARY_MAX = 2000;
export const HARPER_DICTIONARY_WORD_MAX = 80;

export function normalizeHarperWord(raw: string): string | null {
  const word = raw.trim().replace(/\s+/g, " ");
  if (!word || word.length > HARPER_DICTIONARY_WORD_MAX) return null;
  if (/[\n\r]/.test(word)) return null;
  return word;
}

export function wordKey(word: string): string {
  return word.toLocaleLowerCase("en");
}

export function normalizeHarperDictionary(
  words: string[] | undefined
): string[] {
  if (!Array.isArray(words)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    if (typeof raw !== "string") continue;
    const word = normalizeHarperWord(raw);
    if (!word) continue;
    const key = wordKey(word);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= HARPER_DICTIONARY_MAX) break;
  }
  return out;
}

export function addHarperDictionaryWord(
  words: string[],
  raw: string
): string[] {
  const word = normalizeHarperWord(raw);
  if (!word) return normalizeHarperDictionary(words);
  return normalizeHarperDictionary([...words, word]);
}

export function removeHarperDictionaryWord(
  words: string[],
  raw: string
): string[] {
  const key = wordKey(raw.trim());
  if (!key) return normalizeHarperDictionary(words);
  return normalizeHarperDictionary(words).filter((item) => wordKey(item) !== key);
}

export function sameWordList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(wordKey).sort();
  const right = b.map(wordKey).sort();
  return left.every((item, index) => item === right[index]);
}

export function dictionaryHasWord(
  words: Iterable<string>,
  raw: string
): boolean {
  const key = wordKey(raw.trim());
  if (!key) return false;
  for (const item of words) {
    if (wordKey(item) === key) return true;
  }
  return false;
}
