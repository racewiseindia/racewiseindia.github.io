# RaceWise research Edge Function

## Current phase

This is an authenticated research preparation endpoint. It validates the signed-in RaceWise administrator, accepts a meeting/runner payload, and returns auditable tasks mapped to the RaceWise study factors. For Bangalore meetings, it also makes one conservative read-only request to the public Bangalore Turf Club homepage and discovers relevant same-site links.

It deliberately does **not**:
- open linked racing pages or collect horse/race evidence;
- mark source records checked or verified;
- write to Supabase tables;
- calculate runner scores or publish selections.

The homepage link-discovery result includes its source URL, retrieval timestamp, response status, and discovered links. This is navigation metadata only, not racing evidence. Linked pages are not opened. Further adapters must be separately implemented and tested against source terms, identity matching, and evidence provenance. The BTC homepage request has a best-effort 60-second in-memory cooldown per function instance. Keep Supabase Edge Function JWT verification enabled.

## Deploy

The function source is maintained in this GitHub repository at:

`supabase/functions/racewise-research/index.ts`

A manual GitHub Actions workflow is provided at `.github/workflows/deploy-racewise-research.yml`. Before using it, add a GitHub Actions repository secret named `SUPABASE_ACCESS_TOKEN` containing a Supabase personal access token. Never commit this token, a service-role key, or a database password.

Then run the workflow from GitHub Actions using **Run workflow**. It deploys only this function to project `ldnmfaykekhigavqgwmf`. The workflow does not change database schema or table data.

Supabase supplies `SUPABASE_URL` and the project's public API key to Edge Functions. The function uses the caller's bearer token and the existing `is_racewise_admin` RPC to verify administrator access. Do not add a service-role key for this phase.

## Request shape

POST JSON:

```json
{
  "meeting": {
    "centre": "Bangalore",
    "raceDate": "2026-11-08",
    "races": [
      {
        "raceNumber": 1,
        "runners": [
          { "horseName": "Example Runner", "horseNumber": 1 }
        ]
      }
    ]
  }
}
```

Call it only with a signed-in administrator's Supabase access token. A successful response reports whether the BTC homepage was fetched for link discovery. It explicitly keeps racing-evidence fetching, evidence verification, database writes, and selections disabled.
