-- Version history restores failed with
--   function public.save_document(uuid, text, bigint, bytea, integer) does not exist
-- coalesce(rev_enc, 0) is typed integer, and save_document takes
-- p_enc smallint; Postgres will not narrow integer -> smallint when picking
-- an overload. Cast explicitly.
create or replace function public.restore_document_revision(
  p_node_id uuid,
  p_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur_version bigint;
  rev_markdown text;
  rev_cipher bytea;
  rev_enc smallint;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select version into cur_version
  from documents
  where node_id = p_node_id and user_id = uid;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select markdown, ciphertext, enc
    into rev_markdown, rev_cipher, rev_enc
  from document_revisions
  where node_id = p_node_id and user_id = uid and version = p_version;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'revision_not_found');
  end if;

  return public.save_document(
    p_node_id,
    coalesce(rev_markdown, ''),
    cur_version,
    rev_cipher,
    coalesce(rev_enc, 0)::smallint
  );
end;
$$;

revoke all on function public.restore_document_revision(uuid, bigint) from public;
grant execute on function public.restore_document_revision(uuid, bigint) to authenticated;
