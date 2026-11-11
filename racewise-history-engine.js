/*
 * RACEWISE INDIA — Historical Performance Evidence Engine
 * Version 1.0.0
 *
 * Accepts explicitly sourced, verified historical results and derives only
 * metrics supported by those records. Race-level time is NOT treated as an
 * individual horse time. No external data is fetched and no facts are guessed.
 */
(function () {
  "use strict";

  const isPositive = value => Number.isFinite(Number(value)) && Number(value) > 0;
  const isFiniteNumber = value => value !== null && value !== "" &&
    Number.isFinite(Number(value));

  function validateRecord(record) {
    const errors = [];
    const warnings = [];
    if (!record || typeof record !== "object") {
      return { valid: false, errors: ["Historical record is missing."], warnings };
    }
    if (!record.horseName || !String(record.horseName).trim()) errors.push("Horse name is required.");
    if (!record.raceDate || !/^\d{4}-\d{2}-\d{2}$/.test(record.raceDate)) errors.push("Race date must be YYYY-MM-DD.");
    if (!record.centre) errors.push("Racing centre is required.");
    if (!isPositive(Number(record.distanceMetres))) errors.push("Valid race distance is required.");
    if (!isFiniteNumber(record.finishingPosition) || Number(record.finishingPosition) < 1) errors.push("Valid finishing position is required.");
    if (!isFiniteNumber(record.fieldSize) || Number(record.fieldSize) < Number(record.finishingPosition)) errors.push("Field size must be at least the finishing position.");
    if (!record.source || record.source.verified !== true || !String(record.source.sourceName || "").trim()) {
      errors.push("A verified source name is required.");
    }
    if (record.individualTimeSeconds !== null && record.individualTimeSeconds !== undefined && record.individualTimeSeconds !== "" && !isPositive(Number(record.individualTimeSeconds))) {
      errors.push("Individual time, when supplied, must be positive.");
    }
    if (record.officialRaceTimeSeconds && !isPositive(Number(record.officialRaceTimeSeconds))) {
      errors.push("Official race time must be positive.");
    }
    if (record.officialRaceTimeSeconds && !record.individualTimeSeconds) {
      warnings.push("Only race-level time supplied. It will not be used as the horse's individual speed.");
    }
    return { valid: errors.length === 0, errors, warnings };
  }

  function normalisedName(name) {
    return String(name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function matchingRecords(runner, records) {
    const key = normalisedName(runner && runner.horseName);
    return (Array.isArray(records) ? records : []).filter(record =>
      validateRecord(record).valid && normalisedName(record.horseName) === key
    ).sort((a, b) => b.raceDate.localeCompare(a.raceDate));
  }

  function evidence(score, sourceName, evidenceNote, sourceUrl) {
    return {
      score: Math.max(0, Math.min(100, Number(score))),
      verified: true,
      sourceName,
      evidenceNote,
      sourceUrl: sourceUrl || null
    };
  }

  function derive(runner, records, targetRace) {
    const matches = matchingRecords(runner, records);
    const factors = {};
    const warnings = [];
    if (!matches.length) {
      return {
        factors,
        matchedRecordCount: 0,
        warnings: ["No verified historical result records matched this horse name. Exact horse identity must be confirmed."]
      };
    }

    // Use the five latest valid results. The normalized finishing position
    // is a transparent descriptive indicator, not a calibrated win probability.
    const recent = matches.slice(0, 5);
    const formScores = recent.map(record =>
      ((Number(record.fieldSize) - Number(record.finishingPosition)) /
        Math.max(1, Number(record.fieldSize) - 1)) * 100
    );
    const avgForm = formScores.reduce((sum, value) => sum + value, 0) / formScores.length;
    factors.recentForm = evidence(
      avgForm,
      "Verified historical result records",
      recent.length + " latest verified finishes; normalized by field size. Results used: " +
        recent.map(r => r.raceDate + " " + r.finishingPosition + "/" + r.fieldSize).join("; ")
    );

    const individualTimed = recent.filter(r => isPositive(Number(r.individualTimeSeconds)));
    if (individualTimed.length) {
      const speeds = individualTimed.map(r =>
        Number(r.distanceMetres) / Number(r.individualTimeSeconds)
      );
      const averageSpeed = speeds.reduce((sum, value) => sum + value, 0) / speeds.length;
      // Absolute m/s is retained as evidence. A 0–100 speed score is not
      // generated without a validated distance/track/going/class benchmark.
      warnings.push("Individual speed calculated, but comparative speed score awaits a validated benchmark for distance, track and going.");
      factors.speedAndTiming = evidence(
        50,
        "Verified individual-time records",
        "Individual average speed " + averageSpeed.toFixed(3) +
          " m/s across " + individualTimed.length +
          " records. Neutral placeholder score is deliberately not used for ranking; comparative benchmark required."
      );
      delete factors.speedAndTiming;
    } else {
      warnings.push("No verified individual horse times; official race times are not substituted.");
    }

    if (targetRace && isPositive(Number(targetRace.distanceMetres))) {
      const targetDistance = Number(targetRace.distanceMetres);
      const comparable = recent.filter(r =>
        Math.abs(Number(r.distanceMetres) - targetDistance) <= Math.max(200, targetDistance * 0.15)
      );
      if (comparable.length) {
        const scores = comparable.map(r =>
          ((Number(r.fieldSize) - Number(r.finishingPosition)) /
            Math.max(1, Number(r.fieldSize) - 1)) * 100
        );
        factors.distanceAndStamina = evidence(
          scores.reduce((sum, value) => sum + value, 0) / scores.length,
          "Verified historical result records",
          comparable.length + " results within approximately 15% (minimum 200 m) of target distance " +
            targetDistance + " m. This is distance-nearby form, not a pedigree stamina conclusion."
        );
      }
    }

    const targetCentre = String(targetRace && targetRace.centre || "").toLowerCase();
    const courseRecords = targetCentre ? recent.filter(r =>
      String(r.centre || "").toLowerCase() === targetCentre
    ) : [];
    if (courseRecords.length) {
      const scores = courseRecords.map(r =>
        ((Number(r.fieldSize) - Number(r.finishingPosition)) /
          Math.max(1, Number(r.fieldSize) - 1)) * 100
      );
      factors.courseSuitability = evidence(
        scores.reduce((sum, value) => sum + value, 0) / scores.length,
        "Verified historical result records",
        courseRecords.length + " verified results at the target centre. Track-specific conditions still require review."
      );
    }

    return {
      factors,
      matchedRecordCount: matches.length,
      warnings
    };
  }

  window.RACEWISE_HISTORY = {
    version: "1.0.0",
    validateRecord,
    matchingRecords,
    derive
  };
})();
