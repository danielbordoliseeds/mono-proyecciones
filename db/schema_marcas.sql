-- ============================================================
-- Seeds · Marcas compartidas de extensiones y bajas (dupla vendedor + CS)
-- Ejecutar en: Supabase Studio → SQL Editor → New query → Run  (una vez, después de schema.sql)
--
-- Una fila por contrato y trimestre. El vendedor o el CS de la cuenta pueden marcarla;
-- queda la última que se guardó, así la extensión o la baja se cuenta UNA sola vez
-- (en la cartera de retención de la cuenta: el CS, o el vendedor si la cuenta no tiene CS).
-- ============================================================
create table if not exists public.retention_marks (
  quarter     text not null,                    -- ej. '2026-Q4'
  ckey        text not null,                    -- cliente|profesional|modelo (mismo que la app)
  client      text not null,
  mark        jsonb not null default '{}'::jsonb,  -- { unchecked, extTicket, extDur, extStart, churn, by, at }
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now(),
  primary key (quarter, ckey)
);

alter table public.retention_marks enable row level security;

-- Lectura: cualquier usuario logueado (la app muestra a cada uno solo sus cuentas).
drop policy if exists marks_select on public.retention_marks;
create policy marks_select on public.retention_marks for select
  using (auth.uid() is not null);

-- Escritura: admin y comerciales (incluye CS). Talent queda en solo lectura.
drop policy if exists marks_insert on public.retention_marks;
create policy marks_insert on public.retention_marks for insert
  with check (public.current_role_name() in ('admin','comercial'));

drop policy if exists marks_update on public.retention_marks;
create policy marks_update on public.retention_marks for update
  using (public.current_role_name() in ('admin','comercial'))
  with check (public.current_role_name() in ('admin','comercial'));
