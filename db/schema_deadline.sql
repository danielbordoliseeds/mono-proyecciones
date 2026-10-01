-- ============================================================
-- Seeds · Fecha límite por trimestre (freeze visual de proyecciones)
-- Ejecutar en: Supabase Studio → SQL Editor → New query → Run  (una vez, después de schema.sql)
--
-- Una fila por trimestre. Mientras freeze_at sea null (o no haya llegado), el trimestre
-- sigue editable. Pasada esa fecha, la app deja de mostrar los inputs de edición y
-- contrasta directo contra el resultado real. Es un freeze solo de UI: no hay política
-- de escritura nueva en projections/retention_marks, siguen como estaban.
-- ============================================================
create table if not exists public.quarter_deadlines (
  quarter    text primary key,                  -- ej. '2026-Q4'
  freeze_at  timestamptz,                        -- null = sin fecha límite todavía
  set_by     uuid references auth.users(id),
  set_at     timestamptz not null default now()
);

alter table public.quarter_deadlines enable row level security;

-- Lectura: cualquier usuario logueado (la app decide qué mostrar según su rol).
drop policy if exists qd_select on public.quarter_deadlines;
create policy qd_select on public.quarter_deadlines for select
  using (auth.uid() is not null);

-- Escritura: solo admin.
drop policy if exists qd_admin_write on public.quarter_deadlines;
create policy qd_admin_write on public.quarter_deadlines for all
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');
