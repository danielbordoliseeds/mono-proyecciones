// Arma la fila `dataset` de revenue_snapshots desde la plataforma, con las reglas acordadas con Mono
// (sep-2026, ver V2_SPEC.md):
//  - Net revenue = grower − seeder de offers firmadas, pagos no borrados ni cancelados (misma base que
//    el header de En Curso en PlantedSeeders). El mes es el invoiceDate.
//  - Meses pasados con el TC de ese mes; meses futuros con el último TC. ARS → ARS-CCL.
//  - Moneda sin TC (ej. PYG): ese mes del contrato no se cuenta.
//  - Quilmes se agrupa en AB InBev; Magnum queda separado. Nombres de cliente sin espacios sobrantes.
//  - Una fila por cliente + talento + tipo, como el export de Power BI.

export const CLIENT_GROUP = { "Cervecería y Maltería Quilmes": "AB InBev", "Cervecería Quilmes": "AB InBev" };

// Nombre del usuario de la plataforma → nombre con el que figura en la herramienta (profiles.comercial_name).
const TOOL_NAME = {
  "Tomás Barale": "Tomi Barale",
  "Cami Jordan": "Camila Jordan",
  "Jose María Imaz del Río": "Jose María Imaz (Mono)",
};
const toolName = (n) => (n ? TOOL_NAME[n] || n : null);

// Dupla por cliente: vendedor (Account Executive) y CS (Customer Success) de la ficha del cliente.
export const SQL_OWNERS = `
  select cl.id, trim(cl.client) as client,
    nullif(trim(coalesce(ae."firstName", '') || ' ' || coalesce(ae."lastName", '')), '') as vendedor,
    nullif(trim(coalesce(cs."firstName", '') || ' ' || coalesce(cs."lastName", '')), '') as cs
  from clients cl
  left join seeds_admin_users ae on ae.id = cl."accountExecutiveId"
  left join seeds_admin_users cs on cs.id = cl."customerSuccessId"
  where cl."deletedAt" is null`;

const amtToUsd = (amount, currency, dateExpr) => `case ${currency} when 'USD' then ${amount}
  else ${amount} / nullif((select mer.value from monthly_exchange_rates mer
    where mer.currency = case ${currency} when 'ARS' then 'ARS-CCL' else ${currency} end
    order by (to_char(mer."createdAt", 'YYYY-MM') <= to_char(${dateExpr}, 'YYYY-MM')) desc, mer."createdAt" desc
    limit 1), 0) end`;
const toUsd = (a) => amtToUsd(`${a}.rate`, `${a}.currency`, `${a}."invoiceDate"`);

const legs = (table, a, sign) => `
  select o."plantedSeederId" as ps_id, to_char(${a}."invoiceDate", 'YYYY-MM') as m, ${sign} * ${toUsd(a)} as usd
  from offers o join ${table} ${a} on ${a}."offerId" = o.id
  where o."deletedAt" is null and o.status = 'A'
    and ${a}."deletedAt" is null and ${a}.status <> 'C'
    and to_char(${a}."invoiceDate", 'YYYY-MM') between $1 and $2`;

// Parámetros: $1 = primer mes, $2 = último mes (AAAA-MM).
export const SQL = `
  with nr as (
    select ps_id, m, case when bool_or(usd is null) then null else sum(usd) end as usd
    from (${legs("grower_payments", "gp", 1)} union all ${legs("payments", "p", -1)}) x group by ps_id, m
  )
  select ps.id as ps_id, trim(ps."clientName") as client, ps."clientId" as client_id, ps.type as ctype, nullif(trim(ps."seederRole"), '') as role,
    trim(regexp_replace(ps."seederLastName" || ' ' || ps."seederFirstName", '\\s+', ' ', 'g')) as person,
    json_object_agg(nr.m, round(nr.usd::numeric, 2)) as by_month
  from nr join planted_seeders ps on ps.id = nr.ps_id and ps."deletedAt" is null
  group by ps.id`;

// Mes en que se VENDIÓ cada planted seeder (oferta firmada por cliente y talento — no el primer mes que
// factura): para que una oferta aceptada en septiembre pero que arranca a facturar en octubre cuente
// como venta nueva de Q3, no de Q4. Misma lógica que usa el conector de Seeds para "fecha de venta":
// el primer cambio de estado a 'A' (Aprobada) de una offer no-extensión; si no hay registro de firma
// pero la offer está aceptada, cae a la fecha de confirmación del candidato (contratos viejos sin logs).
export const SQL_VENTA = `
  with firma_offer as materialized (
    select a."offerId" as offer_id, min(a."createdAt") as firma
    from offer_audit_logs a join offer_logs ol on ol."offerAuditLogId" = a.id
    where ol."changedProperty" = 'status' and ol."newValue" = 'A'
    group by a."offerId"
  )
  select ps.id as ps_id,
    to_char(
      coalesce(
        min(fo.firma) filter (where not coalesce(o."isExtension", false)),
        case when bool_or(o.status = 'A') then (
          select coalesce(min(l."createdAt") filter (where l.status = 'CON'),
                  min(l."createdAt") filter (where l.status in ('WO','DO','H','FTE')))
          from staffing_candidate_status_logs l where l."staffingCandidateId" = ps."staffingCandidateId"
        ) end
      ), 'YYYY-MM'
    ) as venta_mes
  from planted_seeders ps
  left join offers o on o."plantedSeederId" = ps.id and o."deletedAt" is null
  left join firma_offer fo on fo.offer_id = o.id
  where ps."deletedAt" is null
  group by ps.id`;

// Placements FTE (DIRECT_HIRING): contratación directa con fee único, sin offer ni planted_seeder —
// por eso no aparecen en SQL ni en SQL_VENTA (ambas parten de planted_seeders). La venta es el paso del
// candidato a estado FTE/H (igual criterio que net_sales_confirmados); el fee lo guarda el propio
// staffing_candidate (fteFee/fteFeeCurrency). Parámetros: $1 = primer mes, $2 = último mes (AAAA-MM).
export const SQL_FTE = `
  select sc.id as sc_id, trim(cl.client) as client, cl.id as client_id,
    trim(regexp_replace(sd."firstName" || ' ' || sd."lastName", '\\s+', ' ', 'g')) as person,
    trim(sr.title) as role, to_char(f.contratado, 'YYYY-MM') as venta_mes,
    round((${amtToUsd('sc."fteFee"', 'sc."fteFeeCurrency"', "f.contratado")})::numeric, 2) as fee_usd
  from staffing_candidates sc
  join seeders sd on sd.id = sc."seederId"
  join staffing_requests sr on sr.id = sc."staffingRequestId" and sr.type = 'DIRECT_HIRING'
  join lateral (
    select min(l."createdAt") filter (where l.status in ('FTE', 'H'))::date as contratado
    from staffing_candidate_status_logs l where l."staffingCandidateId" = sc.id
  ) f on f.contratado is not null
  left join lateral (
    select cc."clientId" from staffing_request_client_access acc
    join client_contacts cc on cc.id = acc."clientContactId"
    where acc."staffingRequestId" = sr.id and acc."isOwner" = true and acc."deletedAt" is null limit 1
  ) own on true
  left join clients cl on cl.id = own."clientId"
  where sc."deletedAt" is null and sc."fteFee" is not null and cl.id is not null
    and to_char(f.contratado, 'YYYY-MM') between $1 and $2`;

export function monthRange(from, to) {
  const months = [];
  for (let d = new Date(from + "-01T00:00:00Z"); d.toISOString().slice(0, 7) <= to; d.setUTCMonth(d.getUTCMonth() + 1))
    months.push(d.toISOString().slice(0, 7));
  return months;
}

// Las proyecciones guardadas referencian contratos por `cliente|talento|tipo`. Para no romperlas, a los
// talentos que ya están cargados se les deja el nombre exacto que tienen (el de Power BI, mayúsculas
// incluidas); los nuevos van como "Apellido Nombre".
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const personKey = (client, person) =>
  `${norm(client).replace(/[^a-z0-9]/g, "")}|${norm(person).split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ")}`;

export function buildPayload(rows, months, prevContracts = [], owners = [], ventas = [], ftes = []) {
  const prevName = new Map(prevContracts.map((c) => [personKey(c.client, c.person), c.person]));
  // La dupla de un cliente agrupado (Quilmes → AB InBev) es la del cliente del grupo.
  const ownersByName = new Map(owners.map((o) => [o.client, o]));
  const ownersById = new Map(owners.map((o) => [o.id, o]));
  const ventaByPsId = new Map(ventas.map((v) => [v.ps_id, v.venta_mes]));
  const byKey = new Map();
  const sinTc = [];
  for (const r of rows) {
    const client = CLIENT_GROUP[r.client] || r.client;
    const person = prevName.get(personKey(client, r.person)) || r.person;
    if (Object.values(r.by_month).some((v) => v == null)) sinTc.push(`${client} / ${person}`);
    const k = `${client}|${person}|${r.ctype}`;
    const own = ownersByName.get(client) || ownersById.get(r.client_id) || {};
    const c = byKey.get(k) || {
      client, ctype: r.ctype, person, series: months.map(() => 0),
      vendedor: toolName(own.vendedor), cs: toolName(own.cs), roles: new Set(),
    };
    if (r.role) c.roles.add(r.role);
    months.forEach((m, i) => (c.series[i] = Math.round((c.series[i] + Number(r.by_month[m] ?? 0)) * 100) / 100));
    // mes de venta: el más reciente entre los planted seeders que se consolidan en este mismo
    // contrato (mismo cliente + persona + tipo) — una re-contratación años después de un contrato
    // viejo se consolida en la misma fila (mismo cliente/persona/tipo), y lo relevante para "a qué Q
    // pertenece esta venta" es la firma más nueva, no la original de hace años.
    const vm = ventaByPsId.get(r.ps_id);
    if (vm && (!c.ventaMes || vm > c.ventaMes)) c.ventaMes = vm;
    byKey.set(k, c);
  }
  // FTE (DIRECT_HIRING): fee único, no revenue mensual — se carga como contrato ctype "FTE" con el fee
  // puesto en el único mes de la venta. tcvOf/sumQ no distinguen ctype, así que cuenta igual que
  // Seeder/Hire para TCV y NRR (decisión de Mono), solo que nunca se mezcla con los contratos de SQL.
  for (const f of ftes) {
    const mi = months.indexOf(f.venta_mes);
    if (mi < 0 || f.fee_usd == null) {
      if (f.fee_usd == null) sinTc.push(`FTE: ${f.client} / ${f.person}`);
      continue;
    }
    const client = CLIENT_GROUP[f.client] || f.client;
    const person = prevName.get(personKey(client, f.person)) || f.person;
    const k = `${client}|${person}|FTE`;
    const own = ownersByName.get(client) || ownersById.get(f.client_id) || {};
    const c = byKey.get(k) || {
      client, ctype: "FTE", person, series: months.map(() => 0),
      vendedor: toolName(own.vendedor), cs: toolName(own.cs), roles: new Set(),
    };
    if (f.role) c.roles.add(f.role);
    c.series[mi] = Math.round((c.series[mi] + Number(f.fee_usd)) * 100) / 100;
    if (!c.ventaMes || f.venta_mes > c.ventaMes) c.ventaMes = f.venta_mes;
    byKey.set(k, c);
  }
  const contracts = [...byKey.values()]
    .filter((c) => c.series.some((v) => v !== 0))
    .map(({ roles, ...c }) => ({ ...c, role: [...roles].join(" / ") || null }))
    .sort((a, b) => a.client.localeCompare(b.client) || a.person.localeCompare(b.person));
  return { row: { quarter: "dataset", months, contracts, uploaded_by: null, created_at: new Date().toISOString() }, sinTc };
}

export function summarize(row, sinTc) {
  return {
    meses: `${row.months[0]}..${row.months.at(-1)}`,
    contratos: row.contracts.length,
    clientes: new Set(row.contracts.map((c) => c.client)).size,
    total_por_mes: Object.fromEntries(row.months.map((m, i) => [m, Math.round(row.contracts.reduce((s, c) => s + c.series[i], 0))])),
    sin_tc_excluidos: sinTc,
  };
}
