#!/usr/bin/env bash
# Genera web/index.html (lo que publica Netlify) desde la plantilla app/seeds-proyeccion-produccion.html,
# inyectando la URL y la clave PÚBLICA (publishable) de Supabase. Toda edición va en la plantilla.
# Uso:  bash app/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SUPABASE_URL="https://xrqxikvhhkkxitsbqxkv.supabase.co"
SUPABASE_ANON_KEY="sb_publishable_OvpIQdhDrIpWeiWKIi85FA_so-ejx80" # pública: es la que usa el navegador

TPL="app/seeds-proyeccion-produccion.html"
OUT="web/index.html"
mkdir -p web
sed -e "s|const SUPABASE_URL = \"https://TU-PROYECTO.supabase.co\";|const SUPABASE_URL = \"${SUPABASE_URL}\";|" \
    -e "s|const SUPABASE_ANON_KEY = \"TU_ANON_KEY\";|const SUPABASE_ANON_KEY = \"${SUPABASE_ANON_KEY}\";|" \
    "$TPL" | tr -d '\r' > "$OUT"

# Solo deben cambiar las 2 líneas de configuración.
CHANGED=$(diff <(tr -d '\r' < "$TPL") "$OUT" | grep -c '^[<>]' || true)
[ "$CHANGED" = 4 ] || { echo "ERROR: se esperaban 2 líneas cambiadas y hay $((CHANGED / 2))"; exit 1; }

# Los <script> inline tienen que parsear (vm.Script compila sin ejecutar).
node -e "
const fs=require('fs'),vm=require('vm');const html=fs.readFileSync('$OUT','utf8');
const s=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
s.forEach((code,i)=>new vm.Script(code,{filename:'script-'+i}));"
echo "OK: $OUT generado ($(wc -c < "$OUT") bytes)"
