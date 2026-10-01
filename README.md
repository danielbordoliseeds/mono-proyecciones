# Motor de Proyección de Ventas — Seeds

Herramienta interna de proyección de ventas del equipo comercial de Seeds.
Este repo contiene la **v1 en producción** y la **especificación de la v2** (ver `V2_SPEC.md`).

> **Mantenedores:** Daniel Bordoli y Gastón Salinas se encargan del desarrollo
> de la v2 y de la conexión con las APIs. Cualquier duda de contexto, hablar con Mono.

---

## Qué es

App web de un solo archivo (`web/index.html`) que corre sobre:
- **Supabase** — autenticación (magic-link por email) + base de datos (proyecciones, objetivos, snapshots de revenue).
- **Netlify** — hosting del sitio estático. Cada push a `main` lo publica la GitHub Action `.github/workflows/deploy.yml`.

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
  schema_marcas.sql     ← marcas compartidas de extensiones y bajas (dupla vendedor + CS)
docs/   → guías de la v1
  GUIA_PASO_A_PASO.md
  README_PRODUCCION.md
V2_SPEC.md → especificación y plan de la v2 (leer esto para continuar el desarrollo)
```

## Flujo de desarrollo

El único archivo que se edita es **`app/seeds-proyeccion-produccion.html`** (la plantilla, con las claves en
placeholder). `web/index.html` no está en el repo: lo genera la GitHub Action en cada push con `app/build.sh`, que inyecta
la URL y la clave **publishable** de Supabase, chequea que solo cambien esas 2 líneas y que los `<script>`
parseen, y lo sube a Netlify. Si algo falla, no se publica y queda la versión anterior.

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

## Publicación (GitHub Action → Netlify)

`.github/workflows/deploy.yml` corre en cada push a `main` (o a mano desde *Actions → Publicar en Netlify → Run
workflow*): genera `web/` y la sube al sitio **illustrious-pothos-8c3ca9** con la CLI de Netlify. No hace falta
linkear el sitio al repo en Netlify (con el repo en una cuenta personal, Netlify no lo ve desde la cuenta de otro).

Configuración (una vez, en GitHub → *Settings → Secrets and variables → Actions*):
- Secret **`NETLIFY_AUTH_TOKEN`** (o **`NETLIFY`**, el nombre con el que se cargó): token personal de Netlify (*User settings → Applications → Personal access
  tokens*). Es secreto: cargarlo directo acá, nunca por chat.
- Variable **`NETLIFY_SITE_ID`**: Site ID del sitio (*Site configuration → General → Site details*).

Sin esos dos, el workflow genera la web pero no publica (deja un aviso). Cada publicación queda en *Deploys* de
Netlify; desde ahí se puede volver a una versión anterior.
