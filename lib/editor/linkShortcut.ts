import { Extension, type Editor } from "@tiptap/core";
import { resolveLinkShortcutFocusField } from "@/lib/editor/linkFields";

export type LinkEditorOpenOptions = {
  /** When true and an href exists, show OG preview under the bubble. */
  allowPreview?: boolean;
  href?: string;
  /**
   * Focus the URL field (Ctrl+K / toolbar on named links or selected prose).
   * Click-to-open leaves focus in the editor so link text can still be edited.
   */
  focusUrl?: boolean;
  /**
   * Focus the display-text field (Ctrl+K on a naked pasted URL).
   */
  focusText?: boolean;
};

type LinkEditorOpener = (
  editor: Editor,
  options?: LinkEditorOpenOptions
) => void;

let linkEditorOpener: LinkEditorOpener | null = null;

/** Register the Docs-style link bubble opened by Ctrl+K / toolbar / link click. */
export function setLinkEditorOpener(handler: LinkEditorOpener | null) {
  linkEditorOpener = handler;
}

/**
 * Open the link editor bubble for the given editor (main or nested footnote).
 * Falls back to window.prompt when no opener is registered.
 */
export function openLinkEditor(
  editor: Editor,
  options?: LinkEditorOpenOptions
): boolean {
  if (linkEditorOpener) {
    linkEditorOpener(editor, options);
    return true;
  }

  const previous =
    options?.href ??
    (editor.getAttributes("link").href as string | undefined);
  const url = window.prompt("Link URL", previous ?? "https://");
  if (url === null) return true;

  if (url.trim() === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return true;
  }

  const chain = editor.chain().focus();
  if (editor.isActive("link")) {
    chain.extendMarkRange("link");
  }
  chain.setLink({ href: url.trim() }).run();
  return true;
}

/**
 * Ctrl/Cmd+K and toolbar: open the link bubble. Named links and selected
 * prose focus the URL field; a naked pasted URL focuses display text.
 * Preview / Open / Pin and read here / Library show when an http(s) href is present.
 */
export function promptForLink(editor: Editor): boolean {
  const href = editor.getAttributes("link").href as string | undefined;
  const focusField = resolveLinkShortcutFocusField(editor);
  return openLinkEditor(editor, {
    allowPreview: Boolean(href?.trim()),
    focusUrl: focusField === "url",
    focusText: focusField === "text",
    href,
  });
}

/** Standard editor hyperlink shortcut: Ctrl/Cmd+K. */
export const LinkShortcut = Extension.create({
  name: "linkShortcut",

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        promptForLink(this.editor);
        return true;
      },
    };
  },
});
