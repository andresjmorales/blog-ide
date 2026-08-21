/**
 * Script that runs inside the Substack post editor and turns leftover
 * `[1]` / `[^1]` markers plus a trailing Notes list into native
 * `insertFootnote()` nodes.
 *
 * Substack's paste sanitizer does not recreate footnoteAnchor / footnote
 * nodes from HTML, so this is the supported path for native notes.
 * Keep it self-contained: Substack's CSP blocks scripts loaded from
 * other origins, and Playwright cookie-stealing does not belong in the app.
 */

export const SUBSTACK_NOTES_HEADING = "Notes";

/** Compact IIFE. No template interpolation — pasted into bookmarklets as-is. */
export const SUBSTACK_FOOTNOTE_HELPER = `(() => {
  const pm = document.querySelector(".ProseMirror");
  const editor = pm && pm.editor;
  if (!editor || !editor.view) {
    alert("Open a Substack post editor first, then run this again.");
    return;
  }
  const view = editor.view;
  const schema = view.state.schema;
  if (typeof editor.commands.insertFootnote !== "function") {
    alert("This Substack editor has no insertFootnote command.");
    return;
  }

  function headingPos() {
    let found = null;
    const doc = view.state.doc;
    let pos = 0;
    doc.forEach((child) => {
      if (found) return;
      const name = child.type.name;
      const text = child.textContent.replace(/\\s+/g, " ").trim();
      if ((name === "paragraph" || name === "heading") && (text === "Notes" || text === "Footnotes")) {
        found = { pos: pos, size: child.nodeSize };
      }
      pos += child.nodeSize;
    });
    return found;
  }

  function findNotesList() {
    const doc = view.state.doc;
    const heading = headingPos();
    const lists = [];
    let pos = 0;
    doc.forEach((child) => {
      if (child.type.name === "orderedList") {
        const items = [];
        child.forEach((item) => {
          const contentJSON = [];
          item.forEach((block) => contentJSON.push(block.toJSON()));
          items.push({ text: item.textContent, contentJSON: contentJSON });
        });
        lists.push({ pos: pos, size: child.nodeSize, items: items });
      }
      pos += child.nodeSize;
    });
    if (!lists.length) return null;
    if (heading) {
      const after = lists.find((list) => list.pos >= heading.pos + heading.size);
      if (after) return { list: after, heading: heading };
    }
    return { list: lists[lists.length - 1], heading: heading };
  }

  function findMarker() {
    let found = null;
    view.state.doc.descendants((node, pos) => {
      if (found || !node.isText || !node.text) return;
      const m = /\\[\\^?(\\d+)\\]/.exec(node.text);
      if (!m) return;
      let from = pos + m.index;
      const to = from + m[0].length;
      if (from > 0 && view.state.doc.textBetween(from - 1, from, "") === " ") from -= 1;
      found = { num: +m[1], from: from, to: to };
    });
    return found;
  }

  const packed = findNotesList();
  if (!packed || !packed.list.items.length) {
    alert("No Notes list found. Use Cleanup → Publish → Copy markers, paste into Substack, then run this.");
    return;
  }
  const notes = {};
  packed.list.items.forEach((item, i) => {
    notes[i + 1] = item;
  });

  let inserted = 0;
  for (let i = 0; i < 200; i++) {
    const marker = findMarker();
    if (!marker) break;
    const entry = notes[marker.num];
    view.dispatch(view.state.tr.delete(marker.from, marker.to));
    editor.commands.setTextSelection(marker.from);
    if (!editor.commands.insertFootnote()) continue;
    let lastFn = null;
    view.state.doc.descendants((node, nodePos) => {
      if (node.type.name === "footnote") lastFn = { pos: nodePos, size: node.nodeSize };
    });
    if (!lastFn) continue;
    let nodes;
    try {
      nodes = entry && entry.contentJSON
        ? entry.contentJSON.map((json) => schema.nodeFromJSON(json))
        : null;
    } catch (err) {
      nodes = null;
    }
    if (!nodes || !nodes.length) {
      const text = entry && entry.text ? String(entry.text).replace(/^\\s*\\d+[.)]\\s*/, "") : "";
      nodes = [schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)];
    }
    view.dispatch(view.state.tr.replaceWith(lastFn.pos + 1, lastFn.pos + lastFn.size - 1, nodes));
    inserted += 1;
  }

  const leftover = findNotesList();
  if (leftover) {
    const from = leftover.heading ? leftover.heading.pos : leftover.list.pos;
    const to = leftover.list.pos + leftover.list.size;
    view.dispatch(view.state.tr.delete(from, to));
  }
  alert(inserted ? "Inserted " + inserted + " Substack footnotes." : "No [1] markers found in the draft.");
})();`;

export function substackFootnoteBookmarklet(): string {
  return `javascript:${encodeURIComponent(SUBSTACK_FOOTNOTE_HELPER)}`;
}
