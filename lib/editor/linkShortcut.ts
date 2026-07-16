import { Extension, type Editor } from "@tiptap/core";

type LinkPrompt = (previous: string | undefined) => Promise<string | null>;

let linkPrompt: LinkPrompt | null = null;

/** Register async UI for Ctrl+K / toolbar link (BlogIDE dialog). */
export function setLinkPromptHandler(handler: LinkPrompt | null) {
  linkPrompt = handler;
}

export async function promptForLink(editor: Editor): Promise<boolean> {
  const previous = editor.getAttributes("link").href as string | undefined;
  const url = linkPrompt
    ? await linkPrompt(previous)
    : window.prompt("Link URL", previous ?? "https://");
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
      "Mod-k": () => {
        void promptForLink(this.editor);
        return true;
      },
    };
  },
});
