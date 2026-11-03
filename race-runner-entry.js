/*
 * RACEWISE INDIA
 * Race Runner Entry Module
 * Version 1.0.0
 *
 * Adds and validates runners within individual races.
 * Uses the existing RACEWISE_ENTRY data structure.
 * Missing information is never invented.
 */

(function () {
  "use strict";

  const runnerFields = [
    "horseName",
    "horseAge",
    "sex",
    "draw",
    "jockey",
    "trainer",
    "owner",
    "allocatedWeightKg",
    "officialRating"
  ];

  function getMissingData(runner) {
    return runnerFields.filter(function (field) {
      return runner[field] === "" ||
        runner[field] === null ||
        runner[field] === undefined;
    });
  }

  function validateRunner(race, runner) {
    const errors = [];
    const warnings = [];

    if (!race || !Array.isArray(race.runners)) {
      errors.push("Invalid race structure.");
      return { valid: false, errors, warnings };
    }

    if (!runner || typeof runner !== "object") {
      errors.push("Invalid runner details.");
      return { valid: false, errors, warnings };
    }

    if (!runner.horseName || !runner.horseName.trim()) {
      errors.push("Horse name is required.");
    }

    if (!runner.jockey || !runner.jockey.trim()) {
      errors.push("Jockey name is required.");
    }

    const horseName = (runner.horseName || "").trim().toLowerCase();

    if (horseName && race.runners.some(function (existing) {
      return (existing.horseName || "").trim().toLowerCase() === horseName;
    })) {
      errors.push("Duplicate horse name in this race.");
    }

    const missing = getMissingData(runner);

    if (missing.length) {
      warnings.push("Missing information: " + missing.join(", "));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      missingData: missing
    };
  }

  window.RACEWISE_RUNNERS = {
    version: "1.0.0",

    addRunner: function (race, details) {
      if (!window.RACEWISE_ENTRY) {
        throw new Error("RaceWise entry module not loaded.");
      }

      const runner = window.RACEWISE_ENTRY.createRunner();

      Object.keys(runnerFields).forEach(function () {});

      runnerFields.forEach(function (field) {
        if (details && details[field] !== undefined &&
            details[field] !== null) {
          runner[field] = details[field];
        }
      });

      runner.horseName = String(runner.horseName || "").trim();
      runner.jockey = String(runner.jockey || "").trim();
      runner.trainer = String(runner.trainer || "").trim();
      runner.owner = String(runner.owner || "").trim();

      const validation = validateRunner(race, runner);

      if (!validation.valid) {
        return {
          success: false,
          runner: null,
          validation
        };
      }

      runner.missingData = validation.missingData;
      race.runners.push(runner);

      return {
        success: true,
        runner,
        validation
      };
    },

    validateRunner: validateRunner,

    getMissingData: getMissingData,

    getRunners: function (race) {
      return race && Array.isArray(race.runners)
        ? race.runners
        : [];
    },

    getSummary: function (race) {
      const runners = this.getRunners(race);

      return {
        raceNumber: race ? race.raceNumber : null,
        runnerCount: runners.length,
        completeRunners: runners.filter(function (runner) {
          return runner.missingData.length === 0;
        }).length,
        runnersWithMissingData: runners.filter(function (runner) {
          return runner.missingData.length > 0;
        }).length
      };
    }
  };
})();
