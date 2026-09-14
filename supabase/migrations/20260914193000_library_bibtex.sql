-- Persist pasted / uploaded BibTeX in the Library (same table as PDFs and
-- site bookmarks). Text-only; does not count against Storage quota.

alter table library_items drop constraint if exists library_items_kind_check;
alter table library_items add constraint library_items_kind_check
  check (kind in ('pdf', 'link', 'bibtex'));

alter table library_items add column if not exists bibtex text;
alter table library_items add column if not exists cite_key text;

create unique index if not exists library_items_user_bibtex_key_uidx
  on library_items (user_id, cite_key)
  where kind = 'bibtex' and cite_key is not null;
