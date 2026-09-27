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
export const SUBSTACK_POETRY_START = "{poetry}";
export const SUBSTACK_POETRY_END = "{/poetry}";

/**
 * Compact IIFE. No template interpolation — pasted into bookmarklets as-is.
 *
 * Passes run in order, each in its own try/catch so one schema surprise
 * does not block the rest, and each only acts on markers the copy left:
 *
 * 1. `{sup:27}` / `{sub:2}` → superscript/subscript marks (or Unicode).
 * 2. A paragraph that is only `$$…$$` → Substack's LaTeX block, if any.
 * 3. `{poetry}` … `{/poetry}` → Substack's poem block, if any.
 * 4. `[1]` markers + Notes list → insertFootnote().
 * 5. Image audit: images still hosted outside Substack.
 *
 * Substack's node names are not documented, so 2 and 3 look node types up
 * by name at run time and report what they found instead of guessing.
 */
export const SUBSTACK_FOOTNOTE_HELPER = `(() => {
  const pm = document.querySelector(".ProseMirror");
  const editor = pm && pm.editor;
  if (!editor || !editor.view) {
    alert("Open a Substack post editor first, then run this again.");
    return;
  }
  const view = editor.view;
  const schema = view.state.schema;
  const report = [];

  function findType(group, re) {
    const names = Object.keys(schema[group]);
    const name = names.find((n) => re.test(n));
    return name ? schema[group][name] : null;
  }

  function headingPos() {
    let found = null;
    let pos = 0;
    view.state.doc.forEach((child) => {
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
    const heading = headingPos();
    const lists = [];
    let pos = 0;
    view.state.doc.forEach((child) => {
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

  function notesCutoff() {
    const notes = findNotesList();
    if (!notes) return Infinity;
    return notes.heading ? notes.heading.pos : notes.list.pos;
  }

  function paragraphs(test, cutoff) {
    const out = [];
    view.state.doc.descendants((node, pos) => {
      if (pos >= cutoff) return false;
      if (node.type.name === "paragraph") {
        if (test(node.textContent.trim())) out.push({ node: node, pos: pos });
        return false;
      }
    });
    return out;
  }

  const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" };
  const SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎" };
  function unicode(text, kind) {
    const map = kind === "sup" ? SUP : SUB;
    let out = "";
    for (const ch of text) {
      if (!map[ch]) return null;
      out += map[ch];
    }
    return out;
  }

  function runScripts() {
    const supMark = findType("marks", /^(superscript|sup)$/i);
    const subMark = findType("marks", /^(subscript|sub)$/i);
    let marked = 0;
    let plain = 0;
    for (let i = 0; i < 5000; i++) {
      let hit = null;
      view.state.doc.descendants((node, pos) => {
        if (hit) return false;
        if (!node.isText || !node.text) return;
        const m = /\\{(sup|sub):([^{}]+)\\}/.exec(node.text);
        if (m) hit = { from: pos + m.index, to: pos + m.index + m[0].length, kind: m[1], text: m[2], marks: node.marks };
      });
      if (!hit) break;
      const markType = hit.kind === "sup" ? supMark : subMark;
      let textNode;
      if (markType) {
        textNode = schema.text(hit.text, markType.create().addToSet(hit.marks));
        marked += 1;
      } else {
        textNode = schema.text(unicode(hit.text, hit.kind) || hit.text, hit.marks);
        plain += 1;
      }
      view.dispatch(view.state.tr.replaceWith(hit.from, hit.to, textNode));
    }
    if (marked) report.push("Superscripts: " + marked + " formatted.");
    if (plain) report.push("Superscripts: " + plain + " as plain/Unicode text (no superscript mark in this editor).");
  }

  function runMath() {
    const found = paragraphs((t) => /^\\$\\$[\\s\\S]+\\$\\$$/.test(t), notesCutoff());
    if (!found.length) return;
    const type = Object.values(schema.nodes).find((t) => t.isBlock && /latex|math|equation/i.test(t.name));
    if (!type) {
      report.push("LaTeX: " + found.length + " $$…$$ block(s) left as text (no LaTeX block in this editor; use Substack's Insert → LaTeX).");
      return;
    }
    const attrKey = Object.keys(type.spec.attrs || {}).find((k) => /expr|latex|tex|formula|source|value|content|code/i.test(k));
    let done = 0;
    found.reverse().forEach((hit) => {
      const latex = hit.node.textContent.trim().slice(2, -2).trim();
      let node = null;
      try {
        if (attrKey) {
          const attrs = {};
          attrs[attrKey] = latex;
          node = type.createAndFill(attrs);
        } else {
          node = type.createAndFill(null, schema.text(latex));
        }
      } catch (err) {
        node = null;
      }
      if (!node) return;
      view.dispatch(view.state.tr.replaceWith(hit.pos, hit.pos + hit.node.nodeSize, node));
      done += 1;
    });
    report.push("LaTeX: " + done + " of " + found.length + " block(s) converted (" + type.name + ").");
  }

  function runPoetry() {
    const cutoff = notesCutoff();
    const starts = paragraphs((t) => t === "{poetry}", cutoff);
    if (!starts.length) return;
    const type = Object.values(schema.nodes).find((t) => t.isBlock && /poe|verse/i.test(t.name));
    let wrapped = 0;
    let unwrapped = 0;
    for (let i = 0; i < 200; i++) {
      const start = paragraphs((t) => t === "{poetry}", notesCutoff())[0];
      if (!start) break;
      const $start = view.state.doc.resolve(start.pos);
      const parent = $start.parent;
      const index = $start.index();
      let endIndex = -1;
      for (let j = index + 1; j < parent.childCount; j++) {
        if (parent.child(j).textContent.trim() === "{/poetry}") {
          endIndex = j;
          break;
        }
      }
      if (endIndex < 0) {
        view.dispatch(view.state.tr.delete(start.pos, start.pos + start.node.nodeSize));
        continue;
      }
      const inner = [];
      let endPos = start.pos + start.node.nodeSize;
      for (let j = index + 1; j < endIndex; j++) {
        inner.push(parent.child(j));
        endPos += parent.child(j).nodeSize;
      }
      const endNode = parent.child(endIndex);
      const rangeEnd = endPos + endNode.nodeSize;
      let poem = null;
      if (type && inner.length) {
        try {
          poem = type.createAndFill(null, inner);
        } catch (err) {
          poem = null;
        }
        if (!poem) {
          try {
            const inline = [];
            const br = findType("nodes", /^(hard_?break|hardBreak|br)$/i);
            inner.forEach((p, k) => {
              if (k > 0 && br) inline.push(br.create(), br.create());
              p.forEach((child) => inline.push(child));
            });
            poem = type.createAndFill(null, inline);
          } catch (err) {
            poem = null;
          }
        }
      }
      if (poem) {
        view.dispatch(view.state.tr.replaceWith(start.pos, rangeEnd, poem));
        wrapped += 1;
      } else {
        let tr = view.state.tr.delete(endPos, rangeEnd);
        tr = tr.delete(start.pos, start.pos + start.node.nodeSize);
        view.dispatch(tr);
        unwrapped += 1;
      }
    }
    if (wrapped) report.push("Poetry: " + wrapped + " poem(s) set as " + type.name + ".");
    if (unwrapped) report.push("Poetry: " + unwrapped + " poem(s) kept as line-broken paragraphs (" + (type ? type.name + " rejected the content" : "no poem block in this editor") + ").");
  }

  function findMarker() {
    const cutoff = notesCutoff();
    let found = null;
    view.state.doc.descendants((node, pos) => {
      if (found) return false;
      if (pos >= cutoff) return false;
      if (/code/i.test(node.type.name)) return false;
      if (node.type.name === "paragraph" && node.textContent.trim().startsWith("$$")) return false;
      if (!node.isText || !node.text) return;
      const m = /\\[\\^?(\\d+)\\]/.exec(node.text);
      if (!m) return;
      let from = pos + m.index;
      const to = from + m[0].length;
      if (from > 0 && view.state.doc.textBetween(from - 1, from, "") === " ") from -= 1;
      found = { num: +m[1], from: from, to: to };
    });
    return found;
  }

  function runFootnotes() {
    const packed = findNotesList();
    if (!findMarker()) return;
    if (typeof editor.commands.insertFootnote !== "function") {
      report.push("Footnotes: this Substack editor has no insertFootnote command. [1] markers left as text.");
      return;
    }
    if (!packed || !packed.list.items.length) {
      report.push("Footnotes: found [1] markers but no Notes list after them. Nothing inserted.");
      return;
    }
    const notes = {};
    packed.list.items.forEach((item, i) => {
      notes[i + 1] = item;
    });
    let inserted = 0;
    let missing = 0;
    for (let i = 0; i < 500; i++) {
      const marker = findMarker();
      if (!marker) break;
      const entry = notes[marker.num];
      if (!entry) missing += 1;
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
    if (inserted) {
      const leftover = findNotesList();
      if (leftover) {
        const from = leftover.heading ? leftover.heading.pos : leftover.list.pos;
        const to = leftover.list.pos + leftover.list.size;
        view.dispatch(view.state.tr.delete(from, to));
      }
    }
    report.push("Footnotes: " + inserted + " inserted" + (missing ? ", " + missing + " had no matching note" : "") + ".");
  }

  function auditImages() {
    let total = 0;
    let outside = 0;
    view.state.doc.descendants((node) => {
      const src = node.attrs && node.attrs.src;
      if (!src || !/image/i.test(node.type.name)) return;
      total += 1;
      if (!/substack/i.test(src)) outside += 1;
    });
    if (!total) return;
    report.push(outside
      ? "Images: " + outside + " of " + total + " still load from outside Substack. Re-upload them (links from BlogIDE expire)."
      : "Images: all " + total + " hosted by Substack.");
  }

  [["Superscripts", runScripts], ["LaTeX", runMath], ["Poetry", runPoetry], ["Footnotes", runFootnotes], ["Images", auditImages]].forEach((pass) => {
    try {
      pass[1]();
    } catch (err) {
      report.push(pass[0] + ": failed (" + (err && err.message ? err.message : err) + "). Other steps still ran.");
    }
  });
  alert(report.length ? "BlogIDE helper\\n\\n" + report.join("\\n") : "BlogIDE helper: no markers found. Paste the text with markers first.");
})();`;

export function substackFootnoteBookmarklet(): string {
  return `javascript:${encodeURIComponent(SUBSTACK_FOOTNOTE_HELPER)}`;
}
