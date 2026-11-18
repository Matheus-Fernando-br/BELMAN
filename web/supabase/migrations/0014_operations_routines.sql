-- Operações: rotinas (tarefas que se repetem) e o "como fazer" (tarefa ligada a um processo).
alter table public.tasks add column if not exists recurrence text
  check (recurrence is null or recurrence in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly'));
alter table public.tasks add column if not exists wiki_page_id uuid references public.wiki_pages(id) on delete set null;
create index if not exists tasks_wiki_page_idx on public.tasks (wiki_page_id);

-- Ao concluir uma rotina, cria a próxima (com as permissões de quem concluiu).
create or replace function studio.repeat_task() returns trigger
language plpgsql set search_path = '' as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  nxt date;
begin
  if new.recurrence is null or new.status <> 'done' or old.status = 'done' then
    return new;
  end if;
  nxt := coalesce(new.due_date, today);
  loop
    nxt := case new.recurrence
      when 'daily' then nxt + 1
      when 'weekdays' then nxt + case extract(isodow from nxt)::int when 5 then 3 when 6 then 2 else 1 end
      when 'weekly' then nxt + 7
      when 'monthly' then (nxt + interval '1 month')::date
      else (nxt + interval '1 year')::date
    end;
    exit when nxt >= today;
  end loop;
  insert into public.tasks (entity_id, title, description, status, priority, assignee_id, due_date, project_id, customer_id, recurrence, wiki_page_id)
  values (new.entity_id, new.title, new.description, 'todo', new.priority, new.assignee_id, nxt, new.project_id, new.customer_id, new.recurrence, new.wiki_page_id);
  new.recurrence := null; -- a concluída vira histórico; a rotina segue na nova
  return new;
end $$;

drop trigger if exists tasks_repeat on public.tasks;
create trigger tasks_repeat before update of status on public.tasks
  for each row execute function studio.repeat_task();
