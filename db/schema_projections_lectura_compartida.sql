-- ============================================================
-- Seeds · Lectura compartida de "nuevos a vender" entre duplas
-- Ejecutar en: Supabase Studio → SQL Editor → New query → Run
--
-- Hoy un comercial solo puede LEER su propia fila de projections (RLS). Para que,
-- en una cuenta compartida, el vendedor pueda ver lo que cargó el CS (y viceversa)
-- en "Nuevos a vender", hace falta que cualquier usuario logueado pueda LEER todas
-- las filas de projections — la app filtra del lado del cliente cuáles mostrar
-- (solo las de cuentas donde la dupla coincide). Mismo patrón que ya usan
-- retention_marks y revenue_snapshots (select abierto a cualquier logueado).
--
-- La escritura NO cambia: cada uno solo puede insertar/editar su propia fila
-- (o el admin, cualquiera).
-- ============================================================
drop policy if exists proj_select on public.projections;
create policy proj_select on public.projections for select
  using (auth.uid() is not null);
