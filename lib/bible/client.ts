import { FetchClient, type BibleBookHtml } from "@gracious.tech/fetch-client";
import { PassageReference } from "@gracious.tech/bible-references";
import { FETCH_BIBLE_TRANSLATION_ID } from "@/lib/bible/constants";

let client: FetchClient | null = null;
const htmlBooks = new Map<string, Promise<BibleBookHtml>>();

function getClient(): FetchClient {
  if (!client) {
    client = new FetchClient({
      usage: {
        commercial: false,
        attributionless: false,
        derivatives: false,
        limitless: true,
      },
    });
  }
  return client;
}

function getHtmlBook(book: string): Promise<BibleBookHtml> {
  const key = `${FETCH_BIBLE_TRANSLATION_ID}:${book}`;
  let pending = htmlBooks.get(key);
  if (!pending) {
    pending = getClient().fetch_book(FETCH_BIBLE_TRANSLATION_ID, book, "html");
    htmlBooks.set(key, pending);
    pending.catch(() => {
      htmlBooks.delete(key);
    });
  }
  return pending;
}

export type BiblePassage = {
  html: string;
  text: string;
  label: string;
};

function htmlToPlain(html: string): string {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const root = document.createElement("div");
  root.innerHTML = html;
  for (const note of root.querySelectorAll(".fb-note, .fb-fr, .fb-ft, .fb-fqa")) {
    note.remove();
  }
  return (root.textContent ?? "").replace(/\s+/g, " ").trim();
}

export async function fetchBiblePassage(
  serialized: string
): Promise<BiblePassage> {
  const ref = PassageReference.from_serialized(serialized);
  if (!ref) {
    throw new Error("Could not parse that Bible reference.");
  }
  const book = await getHtmlBook(ref.book);
  const html = book.get_passage_from_ref(ref, { attribute: false });
  return {
    html,
    text: htmlToPlain(html),
    label: ref.toString(),
  };
}
