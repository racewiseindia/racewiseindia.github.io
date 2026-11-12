/*
 * RACEWISE INDIA — Research Queue Builder
 * Builds an auditable per-runner research checklist from an extracted card.
 * This module does NOT fetch websites or mark evidence verified.
 */
(function () {
  "use strict";

  const SOURCE_CATALOG = [
    { id: "official_club", name: "Relevant turf club authority", kind: "primary", status: "adapter_not_connected" },
    { id: "indiarace", name: "IndiaRace", kind: "publisher", status: "adapter_not_connected" },
    { id: "pedigree_authority", name: "Authorised studbook / pedigree source", kind: "pedigree", status: "adapter_not_connected" },
    { id: "licensed_provider", name: "Licensed structured racing-data provider", kind: "licensed", status: "permission_and_adapter_required" },
    { id: "weather", name: "Weather / going observations", kind: "environment", status: "adapter_not_connected" }
  ];

  const FACTORS = [
    "recentForm", "speedAndTiming", "trackwork", "classAndOpposition",
    "distanceAndStamina", "pedigree", "courseSuitability", "goingSuitability",
    "jockeyPerformance", "trainerPerformance", "jockeyTrainerCombination",
    "raceIncidents", "officialRatingMovement", "headToHead", "paceAndRunningStyle", "drawAssessment", "handicapAssessment"
  ];

  const FACTOR_SOURCES = {
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
    raceIncidents: ["official_club", "indiarace", "licensed_provider"],
    officialRatingMovement: ["official_club", "indiarace"],
    handicapAssessment: ["official_club"]
  };

  function build(meeting) {
    if (!meeting || !Array.isArray(meeting.races)) {
      return { valid: false, error: "No extracted meeting is available." };
    }

    const tasks = [];
    meeting.races.forEach(function (race) {
      (race.runners || []).forEach(function (runner) {
        FACTORS.forEach(function (factor) {
          (FACTOR_SOURCES[factor] || []).forEach(function (sourceId) {
            tasks.push({
              raceNumber: race.raceNumber,
              horseName: runner.horseName || null,
              horseNumber: runner.horseNumber ?? null,
              factor: factor,
              sourceId: sourceId,
              status: "not_checked",
              evidence: null,
              sourceUrl: null,
              retrievedAt: null,
              verification: "not_verified"
            });
          });
        });
      });
    });

    return {
      valid: true,
      meetingCentre: meeting.centre || null,
      meetingDate: meeting.raceDate || null,
      runnerCount: meeting.races.reduce(function (n, race) {
        return n + (race.runners || []).length;
      }, 0),
      taskCount: tasks.length,
      sourceCatalog: SOURCE_CATALOG,
      factors: FACTORS,
      tasks: tasks,
      policy: {
        noBulkDatabaseMirroring: true,
        evidenceOnlyForIndependentAnalysis: true,
        noAutomaticVerificationOnFetch: true,
        noScoreWithoutVerifiedEvidence: true,
        missingAndConflictingEvidenceMustRemainVisible: true
      }
    };
  }

  window.RACEWISE_RESEARCH_QUEUE = { version: "1.0.0", build: build };
})();
