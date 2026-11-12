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
        (` ${normalize(row.text)} `).includes(` ${target} `)
      );
      const allMentions = target.length >= 3 && pageText.includes(target);

      // BTC currently exposes some runner details as concatenated text rather
      // than reliably separable, semantically labelled cells. Do not guess
      // horse number, age, weight, rating, jockey, trainer, or race from digits
      // or column position. Preserve raw row candidates for human review only.
      const singleNameMatchingRow = matchingRows.length === 1 ? matchingRows[0] : null;

      return {
        expectedRaceNumber: runner.raceNumber,
        horseName: runner.horseName,
        expectedHorseNumber: runner.horseNumber,
        expectedAge: runner.horseAge,
        pageMentionFound: allMentions,
        matchingRowCount: matchingRows.length,
        singleNameMatchingRowFound: matchingRows.length === 1,
        uniqueRunnerRowFound: false,
        sourceRowCells: singleNameMatchingRow?.cells ?? [],
        sourceRowText: singleNameMatchingRow?.text.slice(0, 700) ?? null,
        candidates: {
          horseNumber: null,
          age: null,
          allocatedWeightKg: null,
          officialRating: null,
          jockey: null,
          trainer: null,
          raceNumber: null,
        },
        comparisons: {
          horseNumber: "not_comparable",
          age: "not_comparable",
          raceNumber: "not_comparable",
        },
        verification: "manual_review_required",
        reason: "BTC row fields are not yet mapped to verified table headers and race-specific row context; no numeric or positional inference is allowed.",
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
      note: "BTC source rows are exposed for manual review only. Numeric and positional field inference is disabled until reliable table headers and race-specific row context can be mapped. Horse identity and all racing fields remain unverified.",
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

  let payload: { action?: string; raceDate?: string; centres?: unknown[]; meeting?: { centre?: string; raceDate?: string; races?: unknown[] } };
  try {
    const raw = await req.text();
    if (raw.length > 1_000_000) return json({ error: "Request is too large (1 MB maximum)." }, 413, origin);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400, origin);
  }


  // Date-first discovery: one date may contain multiple independent centre meetings.
  // Fixture presence is not treated as a race-card parse or evidence verification.
  async function discoverBtcMeetingFixture(raceDate: string) {
    const pageUrl = "https://www.bangaloreraces.com/Club/Fixtures";
    const retrievedAt = new Date().toISOString();
    try {
      const response = await fetch(pageUrl, {
        method: "GET",
        redirect: "manual",
        headers: { "Accept": "text/html" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        return { centre: "Bangalore", status: "source_error", fixtureFound: false, raceCount: null,
          pageUrl, httpStatus: response.status, retrievedAt, evidenceVerified: false };
      }
      const html = await response.text();
      if (html.length > 2_000_000) {
        return { centre: "Bangalore", status: "page_too_large", fixtureFound: false, raceCount: null,
          pageUrl, retrievedAt, evidenceVerified: false };
      }
      const plain = html
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ");
      const fixtureFound = plain.includes(raceDate);
      return {
        centre: "Bangalore",
        status: fixtureFound ? "fixture_listed" : "no_fixture_listed",
        fixtureFound,
        raceCount: null,
        raceCardStatus: fixtureFound ? "not_yet_parsed" : "not_applicable",
        pageUrl,
        retrievedAt,
        evidenceVerified: false,
        note: fixtureFound
          ? "The official BTC fixtures page contains this date. Race count and race details still require the dated race card."
          : "No matching date was found on the official BTC fixtures page checked."
      };
    } catch (error) {
      return { centre: "Bangalore", status: "fetch_error", fixtureFound: false, raceCount: null,
        pageUrl, retrievedAt, evidenceVerified: false,
        note: error instanceof Error ? error.message : "Fixture lookup failed." };
    }
  }

  // HRC November 2026 calendar transcription supplied by the user and
  // confirmed by them as copied from the official HRC calendar.
  // This is a dated snapshot, not a live fetch or an independently archived copy.
  async function discoverHyderabadMeetingFixture(raceDate: string) {
    const pageUrl = "https://www.hydraces.com/calendar";
    const retrievedAt = new Date().toISOString();
    const hrcNovember2026: Record<string, string[]> = {
      "2026-11-05": ["Pune"],
      "2026-11-08": ["Bangalore"],
      "2026-11-09": ["Hyderabad"],
      "2026-11-13": ["Bangalore"],
      "2026-11-14": ["Kolkata"],
      "2026-11-15": ["Hyderabad", "Pune"],
      "2026-11-16": ["Hyderabad"],
      "2026-11-17": ["Kolkata"],
      "2026-11-20": ["Bangalore"],
      "2026-11-21": ["Kolkata"],
      "2026-11-22": ["Hyderabad"],
      "2026-11-23": ["Hyderabad"],
      "2026-11-27": ["Bangalore"],
      "2026-11-28": ["Bangalore", "Kolkata"],
      "2026-11-29": ["Hyderabad", "Mumbai"],
      "2026-11-30": ["Hyderabad"],
    };
    const centres = hrcNovember2026[raceDate];
    if (!centres) {
      return {
        centre: "Hyderabad",
        status: "date_unresolved",
        fixtureFound: null,
        raceCount: null,
        pageUrl,
        retrievedAt,
        evidenceVerified: false,
        sourceMethod: "no_matching_entry_in_supplied_snapshot",
        note: "No matching entry was available in the user-confirmed November 2026 HRC calendar transcription. This is not a live calendar check and does not prove that no meeting exists.",
      };
    }
    const fixtureFound = centres.some((name) => name.toLowerCase() === "hyderabad");
    return {
      centre: "Hyderabad",
      status: fixtureFound ? "fixture_listed_snapshot" : "not_listed_in_snapshot",
      fixtureFound,
      raceCount: null,
      pageUrl,
      retrievedAt,
      evidenceVerified: false,
      sourceMethod: "user_confirmed_transcription_of_official_hrc_calendar",
      calendarCentresOnDate: centres,
      note: fixtureFound
        ? "Hyderabad is listed on this date in the user-confirmed transcription of the official HRC calendar. This is a calendar snapshot, not a live website fetch; race count, race card and runners remain unverified."
        : "Hyderabad is not listed on this date in the user-confirmed transcription of the official HRC calendar. This snapshot is not a live check; no race count or horse evidence was verified.",
    };
  }

  // RWITC official pre-race handicaps archive adapter.
  // Uses the club's dated archive route; raw source rows are retained for review.
  async function fetchRwItcHandicaps(raceDate: string) {
    const pageUrl = `https://www.rwitc.com/new/erp_handcaps.php?date=${encodeURIComponent(raceDate)}`;
    const retrievedAt = new Date().toISOString();
    try {
      const response = await fetch(pageUrl, {
        method: "GET",
        redirect: "follow",
        headers: { "Accept": "text/html" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        return { sourceId: "rwitc_official_handicaps", status: "source_error",
          pageUrl, httpStatus: response.status, retrievedAt, evidenceVerified: false,
          races: [], runnerRows: [], note: "RWITC handicap archive could not be retrieved." };
      }
      const html = await response.text();
      if (html.length > 4_000_000) {
        return { sourceId: "rwitc_official_handicaps", status: "page_too_large",
          pageUrl, retrievedAt, evidenceVerified: false, races: [], runnerRows: [],
          note: "RWITC handicap archive exceeded the safe parsing limit." };
      }
      const decode = (value: string) => value
        .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
        .replace(/&#(\\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([\\da-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
      const strip = (value: string) => decode(value.replace(/<script\\b[\\s\\S]*?<\\/script>/gi, " ")
        .replace(/<style\\b[\\s\\S]*?<\\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim());
      const titleMatch = html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i);
      const pageText = strip(html);
      const looksLikeHandicaps = /handicaps/i.test(pageText) &&
        /royal western india turf club|rwitc/i.test(pageText);
      if (!response.url.includes("rwitc.com") || !looksLikeHandicaps ||
          /404|page not found/i.test(titleMatch ? strip(titleMatch[1]) : "")) {
        return { sourceId: "rwitc_official_handicaps", status: "content_unrecognised",
          pageUrl: response.url, requestedUrl: pageUrl, retrievedAt,
          pageTitle: titleMatch ? strip(titleMatch[1]) : null,
          evidenceVerified: false, races: [], runnerRows: [],
          note: "The response did not match a recognisable official RWITC handicaps page; no race or runner data was accepted." };
      }

      const headings: string[] = [];
      for (const match of html.matchAll(/<h[1-6]\\b[^>]*>([\\s\\S]*?)<\\/h[1-6]>/gi)) {
        const heading = strip(match[1]);
        if (heading) headings.push(heading);
      }
      const tableRows: Array<{ cells: string[]; rowText: string }> = [];
      for (const rowMatch of html.matchAll(/<tr\\b[^>]*>([\\s\\S]*?)<\\/tr>/gi)) {
        const cells = [...rowMatch[1].matchAll(/<t[dh]\\b[^>]*>([\\s\\S]*?)<\\/t[dh]>/gi)]
          .map((cell) => strip(cell[1])).filter(Boolean);
        if (cells.length) tableRows.push({ cells, rowText: cells.join(" | ") });
      }
      const runnerRows = tableRows.filter((row) =>
        row.cells.length >= 5 && row.cells.some((cell) => /[A-Z]{3}/i.test(cell)) &&
        row.cells.some((cell) => /\\d/.test(cell))
      );
      return {
        sourceId: "rwitc_official_handicaps",
        status: "fetched",
        pageUrl: response.url,
        requestedUrl: pageUrl,
        httpStatus: response.status,
        retrievedAt,
        pageTitle: titleMatch ? strip(titleMatch[1]) : null,
        pageHeadings: headings,
        tableRowCount: tableRows.length,
        candidateRunnerRowCount: runnerRows.length,
        runnerRows,
        pageText: pageText.slice(0, 120_000),
        evidenceVerified: false,
        verification: "source_fetched_structured_rows_pending_field_mapping",
        note: "Official RWITC handicap archive fetched. Table rows and page text are retained as source evidence for field mapping; rows are not yet identity-verified or eligible for scoring. Handicap weights/ratings and terms-race entries must remain distinct.",
      };
    } catch (error) {
      return { sourceId: "rwitc_official_handicaps", status: "fetch_error",
        pageUrl, retrievedAt, evidenceVerified: false, races: [], runnerRows: [],
        note: error instanceof Error ? error.message : "RWITC handicap archive fetch failed." };
    }
  }

  // RWITC official Racing Fixtures page adapter for Pune.
  // The page may render its calendar client-side; absence of a date in the
  // fetched HTML is therefore unresolved, never treated as proof of no fixture.
  async function discoverPuneMeetingFixture(raceDate: string) {
    const pageUrl = "https://www.rwitc.com/calendar.php";
    const retrievedAt = new Date().toISOString();
    const [year, month, day] = raceDate.split("-").map(Number);
    const monthName = new Date(Date.UTC(year, month - 1, day))
      .toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
    const monthShort = monthName.slice(0, 3);
    const ordinal = day % 10 === 1 && day % 100 !== 11 ? "st"
      : day % 10 === 2 && day % 100 !== 12 ? "nd"
      : day % 10 === 3 && day % 100 !== 13 ? "rd" : "th";
    try {
      const response = await fetch(pageUrl, {
        method: "GET",
        redirect: "follow",
        headers: { "Accept": "text/html" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        return {
          centre: "Pune", status: "source_error", fixtureFound: null,
          raceCount: null, pageUrl, httpStatus: response.status, retrievedAt,
          evidenceVerified: false,
          note: "The official RWITC Racing Fixtures page could not be retrieved. Fixture status remains unresolved.",
        };
      }
      const html = await response.text();
      if (html.length > 2_000_000) {
        return {
          centre: "Pune", status: "page_too_large", fixtureFound: null,
          raceCount: null, pageUrl, retrievedAt, evidenceVerified: false,
          note: "The official RWITC calendar response exceeded the safe parsing limit. Fixture status remains unresolved.",
        };
      }
      const plain = html
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .toLowerCase();
      const dateForms = [
        `${day}/${String(month).padStart(2, "0")}/${year}`,
        `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
        `${day}/${String(month).padStart(2, "0")}`,
        `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`,
        `${day} ${monthName} ${year}`,
        `${day}${ordinal} ${monthName} ${year}`,
        `${monthName} ${day}, ${year}`,
        `${day} ${monthShort} ${year}`,
      ].map((value) => value.toLowerCase());
      const matchedDate = dateForms.some((value) => plain.includes(value));
      const hasCalendarContent = /racing fixtures|race calendar|fixtures/i.test(plain);
      return {
        centre: "Pune",
        status: matchedDate ? "fixture_listed_official" : "date_unresolved",
        fixtureFound: matchedDate ? true : null,
        raceCount: null,
        raceCardStatus: matchedDate ? "not_yet_parsed" : "not_checked",
        pageUrl,
        retrievedAt,
        evidenceVerified: false,
        sourceMethod: "official_rwItc_racing_fixtures_page_html_check",
        note: matchedDate
          ? "The requested date appears on the official RWITC Racing Fixtures page. Race count, dated race card and runners still require separate verification."
          : hasCalendarContent
          ? "The official RWITC Racing Fixtures page was retrieved, but its fetched HTML did not expose this date. The calendar may load dynamically; fixture status remains unresolved, not a confirmed no-fixture result."
          : "The official RWITC page did not expose readable fixture-calendar content in the fetched HTML. Fixture status remains unresolved.",
      };
    } catch (error) {
      return {
        centre: "Pune", status: "fetch_error", fixtureFound: null,
        raceCount: null, pageUrl, retrievedAt, evidenceVerified: false,
        note: error instanceof Error ? error.message : "RWITC fixture lookup failed. Fixture status remains unresolved.",
      };
    }
  }

  if (payload?.action === "fetch_rwItc_handicaps") {
    const raceDate = String((payload as any).raceDate ?? "");
    const centre = String((payload as any).centre ?? "Pune").trim().toLowerCase();
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(raceDate) || centre !== "pune") {
      return json({ error: "Provide a valid raceDate (YYYY-MM-DD) and centre: Pune." }, 400, origin);
    }
    const sourceCheck = await fetchRwItcHandicaps(raceDate);
    return json({
      ok: sourceCheck.status === "fetched",
      action: "fetch_rwItc_handicaps",
      centre: "Pune",
      raceDate,
      sourceCheck,
      safeguards: {
        officialSourceOnly: true,
        rawRowsPreserved: true,
        runnerIdentityVerified: false,
        evidenceVerified: false,
        databaseWrites: false,
        selectionsProduced: false
      }
    }, sourceCheck.status === "fetched" ? 200 : 502, origin);
  }

  const meeting = payload?.meeting;

  if (payload?.action === "discover_meetings") {
    const raceDate = String((payload as any).raceDate ?? "");
    const centres = (payload as any).centres;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raceDate) || !Array.isArray(centres) ||
        centres.length < 1 || centres.length > 10 ||
        centres.some((centre: unknown) => typeof centre !== "string" || !centre.trim())) {
      return json({ error: "Provide raceDate (YYYY-MM-DD) and 1–10 centre names." }, 400, origin);
    }
    const uniqueCentres = [...new Set(centres.map((centre: string) => centre.trim()))];
    const meetings = await Promise.all(uniqueCentres.map(async (centre: string) => {
      const normalized = centre.toLowerCase();
      if (normalized === "bangalore" || normalized === "bengaluru") {
        return await discoverBtcMeetingFixture(raceDate);
      }
      if (normalized === "hyderabad") {
        return await discoverHyderabadMeetingFixture(raceDate);
      }
      if (normalized === "pune") {
        return await discoverPuneMeetingFixture(raceDate);
      }
      return {
        centre,
        status: "adapter_not_connected",
        fixtureFound: null,
        raceCount: null,
        raceCardStatus: "not_checked",
        pageUrl: null,
        retrievedAt: new Date().toISOString(),
        evidenceVerified: false,
        note: "An authorised official fixture adapter for this centre has not yet been connected."
      };
    }));
    return json({
      ok: true,
      action: "discover_meetings",
      raceDate,
      meetingCount: meetings.filter((item) => item.fixtureFound === true).length,
      meetings,
      safeguards: {
        multipleCentresSupported: true,
        raceCountsInvented: false,
        evidenceVerified: false,
        selectionsProduced: false
      }
    }, 200, origin);
  }

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
      ? "Official BTC homepage and dated race-card page fetched. Raw name-matching rows are returned for manual review only; field inference is disabled and no horse identity or racing evidence has been verified."
      : officialClubDiscovery.status === "fetched"
      ? "Official BTC homepage links discovered, but the dated race-card page was not successfully fetched. No racing evidence was verified."
      : "Research tasks prepared. The official BTC homepage connector did not return links; no racing evidence was verified.",
  }, 200, origin);
});
