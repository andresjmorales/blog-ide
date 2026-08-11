/**
 * Apply browser spellcheck + lang on a contenteditable (TipTap) root.
 * Chrome often ignores a bare attribute flip; toggling the property and
 * briefly disabling spellcheck forces a dictionary refresh when `lang` changes.
 */

export function applySpellcheckDom(
  dom: HTMLElement,
  enabled: boolean,
  lang: string
): void {
  const prevLang = dom.getAttribute("lang") ?? "";
  const langChanged = prevLang !== lang;

  dom.setAttribute("lang", lang);
  dom.lang = lang;

  if (!enabled) {
    dom.setAttribute("spellcheck", "false");
    dom.spellcheck = false;
    return;
  }

  if (langChanged && dom.spellcheck) {
    // Pulse off→on so the browser rebinds the dictionary for the new lang.
    dom.setAttribute("spellcheck", "false");
    dom.spellcheck = false;
    requestAnimationFrame(() => {
      dom.setAttribute("spellcheck", "true");
      dom.spellcheck = true;
    });
    return;
  }

  dom.setAttribute("spellcheck", "true");
  dom.spellcheck = true;
}
