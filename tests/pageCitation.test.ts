import { describe, expect, it } from "vitest";
import {
  bibtexFromPageCitation,
  extractPageCitation,
  mergeCrossrefWork,
} from "@/lib/preview/pageCitation";
import { zoteroItemFromPage } from "@/lib/zotero/fromPage";

const SCHOLAR = `<!doctype html><html lang="en">
<head>
  <title>Ignored</title>
  <meta name="citation_title" content="Creating Capabilities">
  <meta name="citation_author" content="Nussbaum, Martha C.">
  <meta name="citation_author" content="Smith, John">
  <meta name="citation_journal_title" content="Ethics">
  <meta name="citation_volume" content="12">
  <meta name="citation_issue" content="3">
  <meta name="citation_firstpage" content="10">
  <meta name="citation_lastpage" content="20">
  <meta name="citation_publication_date" content="2011/05/02">
  <meta name="citation_doi" content="10.1000/capabilities">
  <meta name="citation_issn" content="0014-1704">
  <meta property="og:site_name" content="Journals">
</head></html>`;

const NEWS = `<!doctype html><html lang="en">
<head>
  <meta property="og:title" content="City Desk">
  <meta property="og:site_name" content="The Paper">
  <meta property="og:description" content="A reported story.">
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"NewsArticle","headline":"City Desk","datePublished":"2024-03-01T15:00:00Z","author":{"@type":"Person","name":"Ada Lovelace"},"publisher":{"@type":"Organization","name":"The Paper"}}
  </script>
</head></html>`;

describe("page citation extract", () => {
  it("reads Highwire citation tags into a journal item", () => {
    const citation = extractPageCitation(SCHOLAR, "https://journals.example/a");
    expect(citation.itemType).toBe("journalArticle");
    expect(citation.title).toBe("Creating Capabilities");
    expect(citation.creators).toEqual([
      { firstName: "Martha C.", lastName: "Nussbaum" },
      { firstName: "John", lastName: "Smith" },
    ]);
    expect(citation.publicationTitle).toBe("Ethics");
    expect(citation.volume).toBe("12");
    expect(citation.issue).toBe("3");
    expect(citation.pages).toBe("10-20");
    expect(citation.date).toBe("2011-05-02");
    expect(citation.doi).toBe("10.1000/capabilities");
    expect(citation.language).toBe("en");
    const bib = bibtexFromPageCitation(citation);
    expect(bib?.bibtex).toContain("@article{");
    expect(bib?.bibtex).toContain("journal = {Ethics}");
    expect(bib?.bibtex).toContain("author = {Nussbaum, Martha C. and Smith, John}");
  });

  it("reads NewsArticle JSON-LD when citation tags are absent", () => {
    const citation = extractPageCitation(NEWS, "https://paper.example/city", {
      title: "City Desk",
      siteName: "The Paper",
      description: "A reported story.",
    });
    expect(citation.itemType).toBe("newspaperArticle");
    expect(citation.title).toBe("City Desk");
    expect(citation.creators[0]).toEqual({ firstName: "Ada", lastName: "Lovelace" });
    expect(citation.date).toBe("2024-03-01");
    expect(citation.publicationTitle).toBe("The Paper");
    expect(citation.abstract).toBe("A reported story.");
  });

  it("fills gaps from Crossref without replacing a real title", () => {
    const merged = mergeCrossrefWork(
      {
        itemType: "webpage",
        title: "Creating Capabilities",
        creators: [],
        url: "https://doi.org/10.1000/capabilities",
        doi: "10.1000/capabilities",
      },
      {
        type: "journal-article",
        title: ["Other title"],
        author: [{ given: "Martha C.", family: "Nussbaum" }],
        "container-title": ["Ethics"],
        volume: "12",
        page: "10-20",
        issued: { "date-parts": [[2011, 5, 2]] },
        DOI: "10.1000/capabilities",
        abstract: "<jats:p>A claim.</jats:p>",
      }
    );
    expect(merged.itemType).toBe("journalArticle");
    expect(merged.title).toBe("Creating Capabilities");
    expect(merged.creators[0]?.lastName).toBe("Nussbaum");
    expect(merged.publicationTitle).toBe("Ethics");
    expect(merged.date).toBe("2011-05-02");
    expect(merged.abstract).toBe("A claim.");
  });

  it("maps a journal citation onto Zotero fields and drops webpage-only ones", () => {
    const item = zoteroItemFromPage(
      {
        itemType: "journalArticle",
        title: "Creating Capabilities",
        creators: [{ firstName: "Martha", lastName: "Nussbaum" }],
        publicationTitle: "Ethics",
        doi: "10.1000/capabilities",
        websiteTitle: "Should not be sent",
        date: "2011-05-02",
        url: "https://journals.example/a",
      },
      { url: "https://journals.example/a", accessDate: "2026-09-21" }
    );
    expect(item.itemType).toBe("journalArticle");
    expect(item.DOI).toBe("10.1000/capabilities");
    expect(item.publicationTitle).toBe("Ethics");
    expect(item.websiteTitle).toBeUndefined();
    expect(item.accessDate).toBe("2026-09-21");
    expect(item.creators).toEqual([
      { creatorType: "author", firstName: "Martha", lastName: "Nussbaum" },
    ]);
  });
});
