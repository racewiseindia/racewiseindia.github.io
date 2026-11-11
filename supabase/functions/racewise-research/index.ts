// RaceWise India — authenticated research queue endpoint
// Phase 1: validates an admin request, prepares auditable tasks, and discovers
// relevant links from the public Bangalore Turf Club homepage only.
// It does not open linked pages, verify racing evidence, write to the database, or score runners.
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
  { id: "official_club", name: "Relevant turf club authority", status: "public_link_discovery_enabled" },
  { id: "indiarace", name: "IndiaRace", status: "adapter_not_connected" },
  { id: "pedigree_authority", name: "Authorised studbook / pedigree source", status: "adapter_not_connected" },
  { id: "licensed_provider", name: "Licensed racing-data provider", status: "permission_and_adapter_required" },
  { id: "weather", name: "Weather / going observations", status: "adapter_not_connected" },
];

// Conservative first-stage BTC connector: fetch the publicly accessible
// official homepage once, discover same-site racing links, and retain provenance.
// It does not open those links or treat homepage text as horse/race evidence.
let lastBtcHomepageFetchAt = 0;
async function discoverBtcPublicLinks() {
  const pageUrl = "https://www.bangaloreraces.com/home";
  const now = Date.now();
  if (now - lastBtcHomepageFetchAt < 60_000) {
    return {
      sourceId: "official_club",
      status: "cooldown",
      pageUrl,
      retrievedAt: new Date(now).toISOString(),
      links: [],
      evidenceVerified: false,
      note: "A homepage request was made recently; retry after the 60-second cooldown.",
    };
  }
  lastBtcHomepageFetchAt = now;
  const retrievedAt = new Date(now).toISOString();
  try {
    const response = await fetch(pageUrl, {
      method: "GET",
      redirect: "manual",
      headers: { "Accept": "text/html" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return {
        sourceId: "official_club",
        status: "http_error",
        pageUrl,
        httpStatus: response.status,
        retrievedAt,
        links: [],
        evidenceVerified: false,
        note: "The official homepage did not return a successful response.",
      };
    }
    const html = await response.text();
    if (html.length > 2_000_000) {
      return {
        sourceId: "official_club",
        status: "page_too_large",
        pageUrl,
        retrievedAt,
        links: [],
        evidenceVerified: false,
        note: "Homepage exceeded the 2 MB safety limit.",
      };
    }
    const links: Array<{ label: string; url: string }> = [];
    const anchorPattern = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
    const relevant = /prospectus|entries|handicap|acceptance|race.?card|declaration|result|rating|incident|track|weather/i;
    for (const match of html.matchAll(anchorPattern)) {
      const rawHref = match[1] ?? match[2] ?? match[3] ?? "";
      const label = (match[4] || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
      if (!rawHref || !label || !relevant.test(label)) continue;
      try {
        const resolved = new URL(rawHref, pageUrl);
        if (resolved.protocol !== "https:" || resolved.hostname !== "www.bangaloreraces.com") continue;
        if (!links.some((item) => item.url === resolved.href)) links.push({ label, url: resolved.href });
      } catch { /* Ignore malformed or non-URL links. */ }
      if (links.length >= 40) break;
    }
    return {
      sourceId: "official_club",
      status: "fetched",
      pageUrl,
      httpStatus: response.status,
      retrievedAt,
      links,
      evidenceVerified: false,
      note: "Public link discovery only. Linked pages were not opened and no horse or race evidence was collected.",
    };
  } catch (error) {
    return {
      sourceId: "official_club",
      status: "fetch_error",
      pageUrl,
      retrievedAt,
      links: [],
      evidenceVerified: false,
      note: error instanceof Error ? error.message : "Homepage fetch failed.",
    };
  }
}

 
// Phase 2: retrieve the dated official BTC race-card page and perform a
// conservative exact-name presence check. A name mention is not identity
// verification and must not be treated as verified form, timing, or results.
async function fetchBtcRaceCard(
  raceDate: string | undefined,
  races: Array<{ raceNumber?: unknown; runners?: unknown }>,
) {
  const expected = races.flatMap((race) =>
    (Array.isArray(race.runners) ? race.runners : []).map((runnerValue) => {
      const runner = runnerValue as Record<string, unknown>;
      return {
        raceNumber: race.raceNumber ?? null,
        horseName: String(runner.horseName ?? "").trim(),
        horseNumber: runner.horseNumber ?? null,
        horseAge: runner.horseAge ?? null,
      };
    })
  ).filter((runner) => runner.horseName);

  if (!raceDate || !/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) {
    return {
      sourceId: "official_club_racecard",
      status: "date_unavailable",
      pageUrl: null,
      retrievedAt: new Date().toISOString(),
      runnerChecks: [],
      evidenceVerified: false,
      note: "A valid meeting date is required to request the official BTC race card.",
    };
  }

  const pageUrl = `https://www.bangaloreraces.com/racing/racecard?d=${encodeURIComponent(raceDate)}`;
  const retrievedAt = new Date().toISOString();
  try {
    const response = await fetch(pageUrl, {
      method: "GET",
      redirect: "manual",
      headers: { "Accept": "text/html" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return {
        sourceId: "official_club_racecard",
        status: "http_error",
        pageUrl,
        httpStatus: response.status,
        retrievedAt,
        runnerChecks: [],
        evidenceVerified: false,
        note: "The dated official BTC race-card page did not return a successful response.",
      };
    }

    const html = await response.text();
    if (html.length > 4_000_000) {
      return {
        sourceId: "official_club_racecard",
        status: "page_too_large",
        pageUrl,
        retrievedAt,
        runnerChecks: [],
        evidenceVerified: false,
        note: "Race-card page exceeded the 4 MB safety limit.",
      };
    }

    const decode = (value: string) => value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
      .replace(/\s+/g, " ")
      .trim();

    const normalize = (value: string) => decode(value)
      .toUpperCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? decode(titleMatch[1]).slice(0, 180) : null;

    // Keep source rows intact. Do not infer jockey/trainer/weight/rating from
    // an unknown column position; expose labelled candidates only.
    const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => {
      const rowHtml = match[1];
      const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cell) => decode(cell[1]))
        .filter(Boolean);
      return { text: decode(rowHtml), cells };
    }).filter((row) => row.text);

    const pageText = normalize(html);
    const runnerChecks = expected.map((runner) => {
      const target = normalize(runner.horseName);
      const matchingRows = rows.filter((row) =>
        normalize(row.text).split(" ").join(" ").includes(target)
      );
      const row = matchingRows.length === 1 ? matchingRows[0] : null;
      const allMentions = target.length >= 3 && pageText.includes(target);
      const rowText = row?.text ?? null;
      const raceNumberCandidates = rowText
        ? [...rowText.matchAll(/\b(?:race|r)\s*#?\s*(\d{1,2})\b/gi)].map((m) => Number(m[1]))
        : [];
      const numberCandidate = row?.cells
        .map((cell) => cell.trim())
        .find((cell) => /^\d{1,2}$/.test(cell) && Number(cell) >= 1 && Number(cell) <= 30);
      const ageCandidate = row?.cells
        .map((cell) => cell.match(/\b(?:age\s*[:\-]?\s*)?([2-9])\s*(?:years?|yrs?)?\b/i))
        .find(Boolean)?.[1] ?? null;
      const weightCandidate = row?.cells
        .map((cell) => cell.match(/\b(\d{2}(?:\.\d+)?)\s*kg\b/i)?.[1])
        .find(Boolean) ?? null;
      const labelledRating = rowText?.match(/\b(?:official\s+)?rating\s*[:\-]\s*(\d{1,3})\b/i)?.[1] ?? null;
      const labelledJockey = rowText?.match(/\bjockey\s*[:\-]\s*([^,;|]+?)(?=\s+(?:trainer|weight|rating)\s*[:\-]|[,;|]|$)/i)?.[1]?.trim() ?? null;
      const labelledTrainer = rowText?.match(/\btrainer\s*[:\-]\s*([^,;|]+?)(?=\s+(?:jockey|weight|rating)\s*[:\-]|[,;|]|$)/i)?.[1]?.trim() ?? null;

      return {
        expectedRaceNumber: runner.raceNumber,
        horseName: runner.horseName,
        expectedHorseNumber: runner.horseNumber,
        expectedAge: runner.horseAge,
        pageMentionFound: allMentions,
        uniqueRunnerRowFound: matchingRows.length === 1,
        matchingRowCount: matchingRows.length,
        sourceRowCells: row?.cells ?? [],
        sourceRowText: rowText?.slice(0, 700) ?? null,
        candidates: {
          horseNumber: numberCandidate ?? null,
          age: ageCandidate,
          allocatedWeightKg: weightCandidate,
          officialRating: labelledRating,
          jockey: labelledJockey,
          trainer: labelledTrainer,
          raceNumber: raceNumberCandidates.length === 1 ? raceNumberCandidates[0] : null,
        },
        comparisons: {
          horseNumber: runner.horseNumber != null && numberCandidate != null
            ? (String(runner.horseNumber) === numberCandidate ? "match" : "conflict")
            : "not_comparable",
          age: runner.horseAge != null && ageCandidate != null
            ? (String(runner.horseAge) === ageCandidate ? "match" : "conflict")
            : "not_comparable",
          raceNumber: runner.raceNumber != null && raceNumberCandidates.length === 1
            ? (String(runner.raceNumber) === String(raceNumberCandidates[0]) ? "match" : "conflict")
            : "not_comparable",
        },
        verification: "manual_review_required",
      };
    });

    return {
      sourceId: "official_club_racecard",
      status: "fetched",
      pageUrl,
      httpStatus: response.status,
      pageTitle,
      retrievedAt,
      expectedRunnerCount: expected.length,
      pageMentionCount: runnerChecks.filter((check) => check.pageMentionFound).length,
      uniqueRunnerRowCount: runnerChecks.filter((check) => check.uniqueRunnerRowFound).length,
      runnerChecks,
      evidenceVerified: false,
      note: "BTC page rows are exposed for race-by-race review. Field candidates are extracted only when explicitly labelled or safely isolated; table column meanings and horse identity remain unverified until manual/structured validation.",
    };
  } catch (error) {
    return {
      sourceId: "official_club_racecard",
      status: "fetch_error",
      pageUrl,
      retrievedAt,
      runnerChecks: [],
      evidenceVerified: false,
      note: error instanceof Error ? error.message : "Race-card page fetch failed.",
    };
  }
}
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

  const isBangalore = String(meeting.centre ?? "").toLowerCase().includes("bangalore");
  const officialClubDiscovery = isBangalore
    ? await discoverBtcPublicLinks()
    : {
        sourceId: "official_club",
        status: "not_applicable",
        pageUrl: null,
        retrievedAt: new Date().toISOString(),
        links: [],
        evidenceVerified: false,
        note: "The first official-club connector currently supports Bangalore only.",
      };

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

  const btcRaceCardCheck = isBangalore
    ? await fetchBtcRaceCard(
        meeting.raceDate,
        meeting.races as Array<{ raceNumber?: unknown; runners?: unknown }>,
      )
    : null;

  return json({
    ok: true,
    function: "racewise-research",
    phase: "authenticated_research_queue",
    meeting: { centre: meeting.centre ?? null, raceDate: meeting.raceDate ?? null },
    runnerCount,
    taskCount: tasks.length,
    sourceCatalog: sourceCatalog.map((source) =>
      source.id === "official_club"
        ? { ...source, status: officialClubDiscovery.status }
        : source
    ),
    sourceChecks: btcRaceCardCheck ? [officialClubDiscovery, btcRaceCardCheck] : [officialClubDiscovery],
    tasks,
    safeguards: {
      externalSourcesFetched: officialClubDiscovery.status === "fetched" || btcRaceCardCheck?.status === "fetched",
      racingEvidenceFetched: btcRaceCardCheck?.status === "fetched",
      evidenceVerified: false,
      databaseWrites: false,
      selectionsProduced: false,
      noInventedData: true,
      onlyVerifiedEvidenceMayEnterScoring: true,
    },
    message: btcRaceCardCheck?.status === "fetched"
      ? "Official BTC homepage and dated race-card page fetched. Race-by-race source rows and preliminary field candidates are returned for review; no horse identity or racing evidence has been verified."
      : officialClubDiscovery.status === "fetched"
      ? "Official BTC homepage links discovered, but the dated race-card page was not successfully fetched. No racing evidence was verified."
      : "Research tasks prepared. The official BTC homepage connector did not return links; no racing evidence was verified.",
  }, 200, origin);
});
