-- Module 7: Read-only query execution for text-to-SQL tool

-- Function to execute read-only SQL queries safely
-- SECURITY DEFINER so it can run dynamic SQL on behalf of the user
create or replace function execute_readonly_query(query_text text, query_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  normalized text;
begin
  -- Normalize: trim whitespace, remove trailing semicolons
  normalized := rtrim(trim(query_text), ';');

  -- Only allow SELECT statements
  if not (lower(normalized) ~ '^select\s') then
    raise exception 'Only SELECT statements are allowed';
  end if;

  -- Block dangerous keywords
  if lower(normalized) ~ '\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|execute|exec)\b' then
    raise exception 'Statement contains disallowed keywords';
  end if;

  -- Execute with hard row limit and return as JSONB
  execute format('select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) from (select * from (%s) sub limit 50) t', normalized)
    into result;

  return result;
end;
$$;
