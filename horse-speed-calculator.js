/*
 * RACEWISE INDIA
 * Historical Speed Calculator
 * Version 1.0.0
 */

(function () {
  "use strict";

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function calculateSpeed(distanceMetres, timeSeconds) {
    const distance = positiveNumber(distanceMetres);
    const time = positiveNumber(timeSeconds);

    if (!distance || !time) {
      return {
        valid: false,
        metresPerSecond: null,
        kilometresPerHour: null,
        error: "Valid positive distance and time required."
      };
    }

    const mps = distance / time;

    return {
      valid: true,
      metresPerSecond: Number(mps.toFixed(3)),
      kilometresPerHour: Number((mps * 3.6).toFixed(2)),
      error: null
    };
  }

  function validatePerformance(record) {
    const errors = [];
    const warnings = [];

    if (!record || typeof record !== "object") {
      return {
        valid: false,
        errors: ["Performance record is missing."],
        warnings
      };
    }

    if (!record.horseName) {
      errors.push("Horse name is missing.");
    }

    if (!positiveNumber(record.distanceMetres)) {
      errors.push("Valid distance is missing.");
    }

    if (!record.source || record.source.verified !== true) {
      warnings.push("Source is not verified.");
    }

    if (!positiveNumber(record.officialRaceTimeSeconds)) {
      warnings.push("Official race time unavailable or invalid.");
    }

    if (
      record.individualTimeSeconds !== null &&
      record.individualTimeSeconds !== undefined &&
      record.individualTimeSeconds !== "" &&
      !positiveNumber(record.individualTimeSeconds)
    ) {
      errors.push("Individual time must be positive.");
    }

    if (
      record.sectionals !== undefined &&
      !Array.isArray(record.sectionals)
    ) {
      errors.push("Sectionals must be an array.");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  function analysePerformance(record) {
    const validation = validatePerformance(record);

    const result = {
      validation,
      raceSpeed: null,
      individualSpeed: null,
      status: "insufficient_data"
    };

    if (!validation.valid) {
      result.status = "invalid_record";
      return result;
    }

    if (record.source && record.source.verified === true) {
      result.raceSpeed = calculateSpeed(
        record.distanceMetres,
        record.officialRaceTimeSeconds
      );
    }

    if (
      record.source &&
      record.source.verified === true &&
      positiveNumber(record.individualTimeSeconds)
    ) {
      result.individualSpeed = calculateSpeed(
        record.distanceMetres,
        record.individualTimeSeconds
      );
    }

    result.status = result.raceSpeed
      ? "race_speed_calculated"
      : "awaiting_verified_source";

    return result;
  }

  window.RACEWISE_SPEED = {
    version: "1.0.0",
    calculateSpeed,
    validatePerformance,
    analysePerformance
  };
})();
