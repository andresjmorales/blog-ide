import { getTheme } from "@/lib/theme";
import {
  FETCH_BIBLE_APP_ORIGIN,
  FETCH_BIBLE_HUE,
  FETCH_BIBLE_TRANSLATION_ID,
} from "@/lib/bible/constants";

let iframe: HTMLIFrameElement | null = null;
let ready = false;
let pendingSearch: string | null = null;

export function bibleAppSrc(): string {
  const params = new URLSearchParams();
  params.set("trans", FETCH_BIBLE_TRANSLATION_ID);
  params.set("dark", getTheme() === "dark" ? "true" : "false");
  params.set("hue", FETCH_BIBLE_HUE);
  if (pendingSearch) params.set("search", pendingSearch);
  return `${FETCH_BIBLE_APP_ORIGIN}#${params.toString()}`;
}

export function registerBibleIframe(el: HTMLIFrameElement | null): void {
  iframe = el;
  ready = false;
}

export function queueBibleSearch(search: string): void {
  pendingSearch = search;
}

function postUpdate(extra: Record<string, string> = {}): void {
  if (!iframe?.contentWindow || !ready) return;
  iframe.contentWindow.postMessage(
    {
      type: "update",
      trans: FETCH_BIBLE_TRANSLATION_ID,
      dark: getTheme() === "dark" ? "true" : "false",
      ...(pendingSearch ? { search: pendingSearch } : {}),
      ...extra,
    },
    FETCH_BIBLE_APP_ORIGIN
  );
}

export function syncBibleTheme(): void {
  postUpdate();
}

export function navigateBibleApp(search: string): void {
  pendingSearch = search;
  postUpdate({ search });
}

export function onBibleAppMessage(event: MessageEvent): void {
  if (event.origin !== FETCH_BIBLE_APP_ORIGIN) return;
  const type = (event.data as { type?: string } | null)?.type;
  if (type === "ready") {
    ready = true;
    postUpdate();
  }
}
