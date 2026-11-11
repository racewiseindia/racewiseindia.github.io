// RaceWise India — authenticated research queue endpoint
// Phase 1: validates an admin request and prepares auditable research tasks.
// This version does NOT scrape external sites, write to the database, or score runners.
// Deploy with Supabase Edge Functions; keep verify_jwt enabled.

import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://racewiseindia.com",
  "https://www.racewiseindia.com",
  "https://racewiseindia.github.io",
]);

const FACTOR_SOURCES: Record<string, string[]> = {
  recentForm: ["official_club", "indiarace", "licensed_provider"],
  speedAndTiming: ["official_club", "indiarace", "licensed_provider"],
  trackwork: ["official_club", "indiarace"],
  classAndOpposition: ["official_club", "indiarace", "licensed_provider"],
  distanceAndStamina: ["official_club", "indiarace", "pedigree_authority"],
  pedigree: ["indiarace", "pedigree_authority", "licensed_provider"],
  courseSuitability: ["official_club", "indiarace"],
  goingSuitability: ["official_club", "weather", "licensed_provider"],
  jockeyPerformance: ["official_club", "licensed_provider"],
  trainerPerformance: ["official_club", "licensed_provider"],
  jockeyTrainerCombination: ["official_club", "licensed_provider"],
  headToHead: ["official_club", "indiarace", "licensed_provider"],
  paceAndRunningStyle: ["official_club", "licensed_provider"],
  drawAssessment: ["official_club", "licensed_provider"],
  handicapAssessment: ["official_club"],
};

const sourceCatalog = [
  { id: "official_club", name: "Relevant turf club authority", status: "adapter_not_connected" },
  { id: "indiarace", name: "IndiaRace", status: "adapter_not_connected" },
  { id: "pedigree_authority", name: "Authorised studbook / pedigree source", status: "adapter_not_connected" },
  { id: "licensed_provider", name: "Licensed racing-data provider", status: "permission_and_adapter_required" },
  { id: "weather", name: "Weather / going observations", status: "adapter_not_connected" },
];

function json(data: unknown, status: number, origin: string | null) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(data), { status, headers });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (origin && !allowedOrigins.has(origin)) {
    return json({ error: "Origin not allowed." }, 403, null);
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST for an authenticated research request." }, 405, origin);
  }

  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "A signed-in RaceWise administrator session is required." }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return json({ error: "Supabase URL or public API key is not configured for this function." }, 500, origin);
  }

  const token = authorization.slice("Bearer ".length);
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return json({ error: "Session is invalid or expired. Please sign in again." }, 401, origin);
  }

  const { data: isAdmin, error: roleError } = await supabase.rpc("is_racewise_admin");
  if (roleError || isAdmin !== true) {
    return json({ error: "RaceWise administrator access could not be verified." }, 403, origin);
  }

  let payload: { meeting?: { centre?: string; raceDate?: string; races?: unknown[] } };
  try {
    const raw = await req.text();
    if (raw.length > 1_000_000) return json({ error: "Request is too large (1 MB maximum)." }, 413, origin);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400, origin);
  }

  const meeting = payload?.meeting;
  if (!meeting || !Array.isArray(meeting.races) || meeting.races.length < 1 || meeting.races.length > 20) {
    return json({ error: "Provide meeting.races with between 1 and 20 races." }, 400, origin);
  }

  const tasks: Array<Record<string, unknown>> = [];
  let runnerCount = 0;
  for (const raceValue of meeting.races) {
    if (!raceValue || typeof raceValue !== "object") return json({ error: "Each race must be an object." }, 400, origin);
    const race = raceValue as { raceNumber?: unknown; runners?: unknown };
    if (!Array.isArray(race.runners) || race.runners.length > 30) {
      return json({ error: "Each race must contain an array of no more than 30 runners." }, 400, origin);
    }
    for (const runnerValue of race.runners) {
      if (!runnerValue || typeof runnerValue !== "object") return json({ error: "Each runner must be an object." }, 400, origin);
      const runner = runnerValue as { horseName?: unknown; horseNumber?: unknown };
      if (typeof runner.horseName !== "string" || !runner.horseName.trim()) {
        return json({ error: "Every runner needs a non-empty horseName." }, 400, origin);
      }
      runnerCount++;
      if (runnerCount > 400) return json({ error: "Meeting exceeds the 400-runner safety limit." }, 400, origin);

      for (const [factor, sourceIds] of Object.entries(FACTOR_SOURCES)) {
        for (const sourceId of sourceIds) {
          tasks.push({
            raceNumber: race.raceNumber ?? null,
            horseName: runner.horseName.trim(),
            horseNumber: runner.horseNumber ?? null,
            factor,
            sourceId,
            status: "not_checked",
            evidence: null,
            sourceUrl: null,
            retrievedAt: null,
            verification: "not_verified",
          });
        }
      }
    }
  }

  return json({
    ok: true,
    function: "racewise-research",
    phase: "authenticated_research_queue",
    meeting: { centre: meeting.centre ?? null, raceDate: meeting.raceDate ?? null },
    runnerCount,
    taskCount: tasks.length,
    sourceCatalog,
    tasks,
    safeguards: {
      externalSourcesFetched: false,
      evidenceVerified: false,
      databaseWrites: false,
      selectionsProduced: false,
      noInventedData: true,
      onlyVerifiedEvidenceMayEnterScoring: true,
    },
    message: "Research tasks prepared only. Source adapters must be implemented and tested before any source can be marked checked or verified.",
  }, 200, origin);
});
