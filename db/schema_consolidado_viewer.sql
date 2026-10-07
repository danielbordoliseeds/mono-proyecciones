-- ============================================================
-- Seeds · Ver Consolidado sin ser admin
-- Ejecutar en: Supabase Studio → SQL Editor → New query → Run  (una vez)
--
-- Nuevo permiso aparte del rol: alguien 'comercial' puede ver el Consolidado
-- (y clickear a la pestaña de cualquier persona desde ahí) sin volverse admin
-- (sigue sin poder editar meta de crecimiento, objetivos o fecha límite de otros).
-- ============================================================
alter table public.profiles
  add column if not exists can_view_consolidado boolean not null default false;

-- Asignación (ejecutar tras crear cada caso):
-- update public.profiles set can_view_consolidado = true where email = 'cami@weareseeders.com';
