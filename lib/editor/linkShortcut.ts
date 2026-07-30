import { Extension, type Editor } from "@tiptap/core";

export type LinkEditorOpenOptions = {
  /** When true and an href exists, show OG preview under the bubble. */
  allowPreview?: boolean;
  href?: string;
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

/** Ctrl/Cmd+K and toolbar: open bubble without preview until paste/apply. */
export function promptForLink(editor: Editor): boolean {
  return openLinkEditor(editor, { allowPreview: false });
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
