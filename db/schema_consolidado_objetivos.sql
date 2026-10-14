-- ============================================================
-- Seeds · Objetivo de la empresa (Consolidado) — una fila por trimestre
-- Ejecutar en: Supabase Studio → SQL Editor → New query → Run  (una vez, después de schema.sql)
--
-- Objetivo total de la empresa (ventas nuevas logos / ventas nuevas existentes / revenue),
-- visible para cualquier usuario logueado en la pestaña Consolidado — a diferencia de
-- `objectives`, que es un objetivo por persona y solo lo lee el admin o esa misma persona.
-- ============================================================
create table if not exists public.consolidado_objectives (
  quarter         text primary key,              -- ej. '2026-Q3'
  target_existing numeric not null default 0,    -- nuevas ventas en cuentas existentes (TCV, US$)
  target_logos    numeric not null default 0,    -- nuevas ventas en logos nuevos (TCV, US$)
  target_nrr      numeric not null default 0,    -- revenue objetivo de la empresa para el Q (US$)
  updated_by      uuid references auth.users(id),
  updated_at      timestamptz not null default now()
);

alter table public.consolidado_objectives enable row level security;

-- Lectura: cualquier usuario logueado (es el objetivo de toda la empresa).
drop policy if exists co_select on public.consolidado_objectives;
create policy co_select on public.consolidado_objectives for select
  using (auth.uid() is not null);

-- Escritura: solo admin.
drop policy if exists co_admin_write on public.consolidado_objectives;
create policy co_admin_write on public.consolidado_objectives for all
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');
