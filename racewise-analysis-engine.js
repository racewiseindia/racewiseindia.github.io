/*
 * RACEWISE INDIA — Evidence-based RaceWise scoring engine
 * Version 1.0.0
 *
 * Independent performance score only. This does NOT calculate official
 * handicaps, predict certainty, or infer missing evidence.
 *
 * A factor contributes only when it has:
 *   score: number from 0 to 100
 *   verified: true
 *   sourceName: non-empty source description
 *   evidenceNote: non-empty note describing the evidence
 *
 * Optional sourceUrl is retained for audit. No factor is inferred from
 * official rating or allocated weight.
 */
(function () {
  "use strict";

  const FACTORS = Object.freeze([
    { key: "recentForm", label: "Recent form", weight: 17 },
    { key: "speedAndTiming", label: "Speed and timing", weight: 14 },
    { key: "trackwork", label: "Trackwork", weight: 8 },
    { key: "classAndOpposition", label: "Class and opposition", weight: 10 },
    { key: "distanceAndStamina", label: "Distance and stamina", weight: 12 },
    { key: "pedigree", label: "Pedigree", weight: 8 },
    { key: "courseSuitability", label: "Course suitability", weight: 6 },
    { key: "goingSuitability", label: "Going suitability", weight: 5 },
    { key: "jockeyPerformance", label: "Jockey performance", weight: 5 },
    { key: "trainerPerformance", label: "Trainer performance", weight: 4 },
    { key: "jockeyTrainerCombination", label: "Jockey/trainer combination", weight: 3 },
    { key: "headToHead", label: "Head-to-head", weight: 3 },
    { key: "paceAndRunningStyle", label: "Pace and running style", weight: 2 },
    { key: "drawAssessment", label: "Draw assessment", weight: 3 }
  ]);

  const MIN_COVERAGE = 50;
  const MIN_FACTORS = 3;

  function validFactor(value) {
    return !!value &&
      typeof value === "object" &&
      value.verified === true &&
      typeof value.score === "number" &&
      Number.isFinite(value.score) &&
      value.score >= 0 &&
      value.score <= 100 &&
      typeof value.sourceName === "string" &&
      value.sourceName.trim().length > 0 &&
      typeof value.evidenceNote === "string" &&
      value.evidenceNote.trim().length > 0;
  }

  function analyseRunner(runner) {
    const study = runner && runner.raceWiseStudy
      ? runner.raceWiseStudy
      : {};
    let weightedTotal = 0;
    let availableWeight = 0;
    const breakdown = [];
    const missing = [];

    FACTORS.forEach(function (factor) {
      const evidence = study[factor.key];

      if (validFactor(evidence)) {
        weightedTotal += evidence.score * factor.weight;
        availableWeight += factor.weight;
        breakdown.push({
          key: factor.key,
          label: factor.label,
          weight: factor.weight,
          score: evidence.score,
          weightedContribution: Number((evidence.score * factor.weight / 100).toFixed(2)),
          sourceName: evidence.sourceName.trim(),
          sourceUrl: evidence.sourceUrl || null,
          evidenceNote: evidence.evidenceNote.trim(),
          status: "verified"
        });
      } else {
        missing.push({
          key: factor.key,
          label: factor.label,
          weight: factor.weight,
          status: evidence ? "unverified_or_incomplete" : "not_available"
        });
      }
    });

    const coverage = availableWeight;
    const score = availableWeight
      ? Number((weightedTotal / availableWeight).toFixed(2))
      : null;

    const eligible = coverage >= MIN_COVERAGE &&
      breakdown.length >= MIN_FACTORS;

    let evidenceLevel = "Insufficient evidence";
    if (coverage >= 80) evidenceLevel = "Broad evidence coverage";
    else if (coverage >= 60) evidenceLevel = "Moderate evidence coverage";
    else if (eligible) evidenceLevel = "Limited evidence coverage";

    return {
      horseName: runner && runner.horseName ? runner.horseName : "Unnamed runner",
      score,
      evidenceCoveragePercent: coverage,
      verifiedFactorCount: breakdown.length,
      eligibleForRanking: eligible,
      evidenceLevel,
      breakdown,
      missingFactors: missing,
      warnings: eligible ? [] : [
        "Not ranked: requires at least " + MIN_COVERAGE +
        "% verified factor-weight coverage across at least " +
        MIN_FACTORS + " factors."
      ]
    };
  }

  function rankRace(race) {
    if (!race || !Array.isArray(race.runners) || race.runners.length === 0) {
      return {
        valid: false,
        raceNumber: race && race.raceNumber !== undefined ? race.raceNumber : null,
        rankings: [],
        unranked: [],
        warnings: ["No runners supplied for analysis."]
      };
    }

    const analyses = race.runners.map(analyseRunner);
    const ranked = analyses
      .filter(item => item.eligibleForRanking)
      .sort((a, b) => b.score - a.score);

    ranked.forEach((item, index) => {
      item.rank = index + 1;
      item.selectionLabel = index === 0 ? "Top RaceWise score" :
        index === 1 ? "Second-ranked" :
        index === 2 ? "Third-ranked" : "Ranked contender";
    });

    const unranked = analyses.filter(item => !item.eligibleForRanking);

    return {
      valid: true,
      raceNumber: race.raceNumber === undefined ? null : race.raceNumber,
      raceName: race.raceName || null,
      distanceMetres: race.distanceMetres || null,
      rankings: ranked,
      unranked,
      officialHandicap: {
        status: "not_calculated",
        note: "Official handicap assessment is separate and requires verified centre-specific rules and official inputs."
      },
      warnings: ranked.length
        ? ["Scores are evidence-weighted study scores, not probabilities or guarantees."]
        : ["No runner currently meets the minimum verified-evidence threshold."]
    };
  }

  window.RACEWISE_ANALYSIS = {
    version: "1.0.0",
    factors: FACTORS,
    minimumCoveragePercent: MIN_COVERAGE,
    minimumVerifiedFactors: MIN_FACTORS,
    analyseRunner: analyseRunner,
    rankRace: rankRace
  };
})();
