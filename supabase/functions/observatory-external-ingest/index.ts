import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const K = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const R = U.replace(/\/$/, "") + "/rest/v1";
const H = { accept: "application/json", apikey: K, Authorization: "Bearer " + K };

async function api(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { ...H, "user-agent": "3D-Earth-Observatory/1.0", ...(init.headers || {}) } });
  if (!r.ok) throw Error(url + " -> " + r.status + " " + await r.text());
  return r;
}
async function json(url: string, init: RequestInit = {}) { return (await api(url, init)).json(); }
async function sourceId(slug: string) {
  const rows = await json(R + "/observatory_sources?slug=eq." + encodeURIComponent(slug) + "&select=id");
  if (!rows[0]?.id) throw Error("missing source " + slug);
  return rows[0].id;
}
async function authorized(req: Request) {
  const supplied = req.headers.get("x-observatory-ingest-token") || "";
  if (!supplied) return false;
  const rows = await json(R + "/observatory_ingest_credentials?active=eq.true&select=token_hash&limit=1");
  const expected = rows[0]?.token_hash;
  if (!expected) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied));
  const hash = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
  return hash === expected;
}
async function put(rows: any[]) {
  let count = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    await api(R + "/observatory_observations?on_conflict=source_id%2Cexternal_id%2Cobserved_at", {
      method: "POST",
      headers: { "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch)
    });
    count += batch.length;
  }
  return count;
}
async function volcano() {
  const s = await sourceId("usgs-volcanoes");
  const p = await json("https://volcanoes.usgs.gov/vsc/api/volcanoApi/vhpstatus");
  const t = new Date().toISOString();
  return put((Array.isArray(p) ? p : []).map((v: any) => ({
    source_id: s, sector: "volcanoes", external_id: String(v.vnum ?? v.volcanoCd ?? v.vName), observed_at: t,
    latitude: Number(v.lat) || null, longitude: Number(v.long) || null, metric: "volcano_status",
    unit: "categorical", freshness_sla_seconds: 3600, quality_status: "valid",
    payload: { ...v, provider: "USGS Volcano Hazards Program" }
  })));
}
async function eo() {
  const s = await sourceId("copernicus-stac"), out: any[] = [];
  const from = new Date(Date.now() - 7 * 86400000).toISOString(), to = new Date().toISOString();
  for (const c of ["sentinel-1-grd", "sentinel-2-l2a", "sentinel-3-olci"]) {
    const u = "https://stac.dataspace.copernicus.eu/v1/collections/" + c + "/items?limit=25&datetime=" + encodeURIComponent(from + "/" + to);
    try {
      const p = await json(u);
      for (const i of p.features || []) {
        const q = i.properties || {}, z = q["proj:centroid"];
        out.push({
          source_id: s, sector: "earth_observation", external_id: String(i.id),
          observed_at: new Date(q.datetime || q.start_datetime || q.created || Date.now()).toISOString(),
          latitude: z?.lat ?? null, longitude: z?.lon ?? null, metric: "eo_product", unit: "catalogue_item",
          freshness_sla_seconds: 86400, quality_status: "valid",
          payload: { collection: c, item: i, provider: "Copernicus Data Space" }
        });
      }
    } catch (_) {}
  }
  return put(out);
}
Deno.serve(async req => {
  if (req.method !== "POST" || !(await authorized(req))) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  const b = await req.json().catch(() => ({})), sources = new Set(b.sources || []), r: any = { ok: true };
  if (sources.has("volcanoes") || sources.has("all")) { try { r.volcanoes = await volcano(); } catch (e) { r.volcanoes_error = String(e); } }
  if (sources.has("earth_observation") || sources.has("all")) { try { r.earth_observation = await eo(); } catch (e) { r.earth_observation_error = String(e); } }
  return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
});
