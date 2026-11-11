# RaceWise India — Automatic Research Pipeline

## Objective
The uploaded race card is the meeting/runner seed. RaceWise must independently discover additional evidence for every declared runner and race from public or authorised sources, reconcile it, and produce a transparent pre-race study.

## Data-source policy
See `racewise-research-sources.json` for the initial source registry and factor mapping. The Bangalore Turf Club website exposes public racing information including forms/downloads, ratings, trainer and jockey lists, racing updates, videos and rules. IndiaRace is an additional racing-information source. Their public availability does not itself grant unrestricted scraping, republication, or API access. Each adapter must respect the relevant terms, access controls, rate limits and copyright.

## Required system architecture
1. **Race-card seed:** parse the official card; validate race/runner counts and retain the original PDF/page references.
2. **Identity resolution:** use an official horse identifier where available. Otherwise compare exact name, sire/dam, age, sex, owner/trainer history and centre/date context. Ambiguous matches are not attached automatically.
3. **Source discovery:** query the registered sources for every horse, jockey, trainer, race and course. Record attempted sources and unavailable/blocked outcomes.
4. **Ingestion adapters:** use permitted APIs/downloads or approved feeds. Browser-only client code must not hold provider secrets or bypass CORS/access restrictions; use a secured server-side function for provider credentials and scheduled collection.
5. **Normalisation:** standardise dates, metres, seconds, weights, ratings, finishing status, track/going labels and entity names while retaining original values.
6. **Reconciliation:** deduplicate records, flag conflicting values, and prefer the relevant official authority for declarations, handicaps, results and incidents. Never silently overwrite a conflict.
7. **Evidence derivation:** calculate form, speed, class, distance/course/going, jockey/trainer, combination, head-to-head, pace and draw metrics only where the underlying observations support them. Race-level time is not an individual horse time.
8. **Pedigree research:** retrieve sire/dam and siblings/half-siblings only where identity is reliable; label pedigree-based inference separately from demonstrated race performance.
9. **Handicap assessment:** implement centre- and race-condition-specific official rules only after verifying the applicable rulebook and inputs. Keep official handicap separate from the independent RaceWise performance score.
10. **Study output:** per race show first and second choice only when evidence coverage permits, the comparative edge, factor breakdown, source links, confidence/coverage and missing/conflicting evidence. Otherwise say no reliable ranking yet.
11. **Audit:** preserve an immutable pre-race snapshot, source timestamps, algorithm version and later results separately so the study can be evaluated without hindsight contamination.

## Hard safeguards
- No invented records, scores, horse identities, sectionals, individual times or trackwork.
- No selection based solely on official rating.
- No data marked verified merely because a page was fetched; source authority and record-level checks are required.
- Withdrawals/non-runners are status records, not finishing positions.
- Keep all missing, ambiguous, blocked and conflicting fields visible.
- Results are used for post-race evaluation only, never to contaminate a pre-race study snapshot.

## Implementation status
This commit establishes the source registry and engineering contract only. It does **not** yet implement live source adapters, background crawling, licensed feeds, automatic identity resolution or full race selections. Those require a secured backend and, for some data, provider permission/licensing. The current static GitHub Pages browser page cannot safely perform every source integration by itself.
