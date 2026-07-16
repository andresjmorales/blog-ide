import { Extension, type Editor } from "@tiptap/core";

export function promptForLink(editor: Editor): boolean {
  const previous = editor.getAttributes("link").href as string | undefined;
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

/** Standard editor hyperlink shortcut: Ctrl/Cmd+K. */
export const LinkShortcut = Extension.create({
  name: "linkShortcut",

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => promptForLink(this.editor),
    };
  },
});
