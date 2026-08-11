/** Set contenteditable lang and force browser spellcheck off (Harper owns underlines). */
export function applyEditorDomLang(dom: HTMLElement, lang: string): void {
  dom.setAttribute("spellcheck", "false");
  dom.setAttribute("lang", lang);
  // Property assignment matters for Chromium beyond the HTML attributes.
  dom.spellcheck = false;
  dom.lang = lang;
}
