# Motor de Proyección de Ventas — Seeds

Herramienta interna de proyección de ventas del equipo comercial de Seeds.
Este repo contiene la **v1 en producción** y la **especificación de la v2** (ver `V2_SPEC.md`).

> **Mantenedores:** Daniel Bordoli y Gastón Salinas se encargan del desarrollo
> de la v2 y de la conexión con las APIs. Cualquier duda de contexto, hablar con Mono.

---

## Qué es

App web de un solo archivo (`web/index.html`) que corre sobre:
- **Supabase** — autenticación (magic-link por email) + base de datos (proyecciones, objetivos, snapshots de revenue).
- **Netlify** — hosting del sitio estático, conectado a este repo (cada push a `main` se publica solo).

El revenue ya **no se sube a mano**: el sync nocturno (`sync/`) lo trae de la plataforma con la dupla
vendedor + CS de cada cuenta. El pipeline de HubSpot todavía entra por CSV desde la app. Detalle en `V2_SPEC.md`.

## Estructura

```
app/    → la aplicación (fuente)
  seeds-proyeccion-produccion.html ← plantilla canónica (claves placeholder) — TODA edición va acá
  build.sh                         ← genera web/index.html inyectando la URL y la clave pública
web/    → LO QUE PUBLICA NETLIFY (ver netlify.toml): favicon.ico + index.html (lo genera el build, no se commitea)
sync/   → sync nocturno plataforma → Supabase (Lambda en AWS, ver sync/README.md)
db/     → esquema de Supabase (correr en orden)
  schema.sql            ← base: profiles, projections, revenue_snapshots, RLS, triggers
  schema_objetivos.sql  ← tabla de objetivos
  schema_talent.sql     ← rol 'talent' (solo lectura)
docs/   → guías de la v1
  GUIA_PASO_A_PASO.md
  README_PRODUCCION.md
V2_SPEC.md → especificación y plan de la v2 (leer esto para continuar el desarrollo)
```

## Flujo de desarrollo

El único archivo que se edita es **`app/seeds-proyeccion-produccion.html`** (la plantilla, con las claves en
placeholder). `web/index.html` no está en el repo: lo genera Netlify en cada push con `app/build.sh`, que inyecta
la URL y la clave **publishable** de Supabase, chequea que solo cambien esas 2 líneas y que los `<script>`
parseen. Si algo falla, Netlify no publica y queda la versión anterior.

- **Desde el navegador:** en GitHub abrir `app/seeds-proyeccion-produccion.html` → lápiz (*Edit*) → editar →
  *Commit changes* a `main`. En 1–2 minutos está publicado (misma URL).
- **Desde tu máquina:** `git pull`, editar la plantilla, probar con `bash app/build.sh` (genera
  `web/index.html` local), y `git push` a `main`.
- Antes de editar, `git pull` (o editar en GitHub), así no se pisan cambios entre quienes editan.
- **No** arrastrar zips a Netlify: el próximo push los pisa.

## Notas importantes

- La clave del HTML es la **anon / publishable** de Supabase → es segura para exponer en el cliente.
  **Nunca** poner la `service_role` / `sb_secret` en el HTML ni en el front. Esa va solo del lado servidor.
- Los datos (proyecciones, objetivos, revenue) viven en **Supabase**. Re-desplegar el `index.html`
  cambia solo la app, nunca los datos.
- Login = magic-link por email. La fila en `profiles` se crea al primer login; recién ahí se le
  puede asignar rol por SQL.

## Conectar Netlify al repo (una vez)

En Netlify, sitio **illustrious-pothos-8c3ca9** → *Site configuration → Build & deploy → Link repository*:
GitHub → `danielbordoliseeds/mono-proyecciones` → rama `main`. La carpeta a publicar (`web`) y el build vacío
ya vienen de `netlify.toml`. Desde ahí cada push a `main` se publica solo y Netlify guarda el historial de
versiones (se puede volver a una anterior desde *Deploys*).
