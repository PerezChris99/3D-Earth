import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const started = new Date().toISOString();

  try {
    const response = await fetch("https://volcanoes.usgs.gov/vsc/api/volcanoApi/geojson", {
      headers: { "User-Agent": "3D-Earth/1.0 (+https://github.com/PerezChris99/3D-Earth)" }
    });
    if (!response.ok) throw new Error(`USGS volcano HTTP ${response.status}`);

    const fc = await response.json();
    const { data: source, error: sourceError } = await supabase
      .from("data_sources")
      .select("id")
      .eq("name", "USGS Volcano Hazards")
      .single();
    if (sourceError) throw sourceError;

    const rows = (fc.features ?? []).map((feature: any) => {
      const p = feature.properties ?? {};
      const c = feature.geometry?.coordinates ?? [];
      return {
        source_id: source.id,
        volcano_id: p.vnum,
        volcano_name: p.volcanoName,
        observed_at: p.colorDate || p.alertDate || new Date().toISOString(),
        latitude: c[1],
        longitude: c[0],
        alert_level: p.alertLevel,
        color_code: p.colorCode,
        threat_level: p.nvewsThreat,
        synopsis: p.noticeSynopsis,
        notice_id: p.noticeId,
        notice_url: p.noticeUrl,
        metadata: p
      };
    }).filter((row: any) =>
      row.volcano_id &&
      row.volcano_name &&
      Number.isFinite(Number(row.latitude)) &&
      Number.isFinite(Number(row.longitude))
    );

    const { error } = await supabase
      .from("volcano_observations")
      .upsert(rows, { onConflict: "source_id,volcano_id,observed_at" });
    if (error) throw error;

    await supabase.from("ingestion_runs").insert({
      source_id: source.id,
      job_name: "usgs-volcanoes-edge",
      started_at: started,
      completed_at: new Date().toISOString(),
      status: "success",
      records_received: fc.features?.length ?? 0,
      records_accepted: rows.length
    });

    return Response.json({ ok: true, received: fc.features?.length ?? 0, accepted: rows.length });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 502 });
  }
});