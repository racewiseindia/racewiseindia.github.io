
/*
 * RACEWISE INDIA
 * Race Card Validator
 * Version 1.0.0
 *
 * Validates extracted race-card data.
 * Does not invent missing information.
 * Does not calculate official handicaps.
 */

window.RACEWISE_VALIDATOR = {
  version: "1.0.0",

  requiredMeetingFields: [
    "centre",
    "raceDate"
  ],

  requiredRaceFields: [
    "raceNumber",
    "distanceMetres",
    "class"
  ],

  requiredRunnerFields: [
    "horseName",
    "horseAge",
    "jockey",
    "trainer",
    "allocatedWeightKg"
  ],

  validateMeeting(meeting) {
    const errors = [];
    const warnings = [];

    if (!meeting || typeof meeting !== "object") {
      return {
        valid: false,
        errors: ["Meeting information is missing."],
        warnings
      };
    }

    this.requiredMeetingFields.forEach(field => {
      if (!meeting[field]) {
        errors.push("Missing meeting field: " + field);
      }
    });

    if (!Array.isArray(meeting.races) || meeting.races.length === 0) {
      errors.push("No races have been extracted.");
    }

    if (meeting.sourceVerified !== true) {
      warnings.push("Original race-card source has not been verified.");
    }

    if (Array.isArray(meeting.races)) {
      const raceNumbers = meeting.races
        .map(race => race && race.raceNumber)
        .filter(value => value !== null && value !== undefined);

      if (new Set(raceNumbers).size !== raceNumbers.length) {
        errors.push("Duplicate race numbers detected.");
      }

      meeting.races.forEach((race, index) => {
        const result = this.validateRace(race);

        result.errors.forEach(error => {
          errors.push("Race " + (index + 1) + ": " + error);
        });

        result.warnings.forEach(warning => {
          warnings.push("Race " + (index + 1) + ": " + warning);
        });
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },

  validateRace(race) {
    const errors = [];
    const warnings = [];

    if (!race || typeof race !== "object") {
      return {
        valid: false,
        errors: ["Race information is missing."],
        warnings
      };
    }

    this.requiredRaceFields.forEach(field => {
      if (
        race[field] === null ||
        race[field] === undefined ||
        race[field] === ""
      ) {
        errors.push("Missing race field: " + field);
      }
    });

    if (
      race.distanceMetres !== null &&
      race.distanceMetres !== undefined &&
      (!Number.isFinite(Number(race.distanceMetres)) ||
       Number(race.distanceMetres) <= 0)
    ) {
      errors.push("Invalid race distance.");
    }

    if (!Array.isArray(race.runners) || race.runners.length === 0) {
      errors.push("No runners have been extracted.");
    } else {
      const names = race.runners
        .map(runner => runner && runner.horseName)
        .filter(Boolean)
        .map(name => String(name).trim().toLowerCase());

      if (new Set(names).size !== names.length) {
        errors.push("Duplicate horse names detected in this race.");
      }

      race.runners.forEach((runner, index) => {
        const result = this.validateRunner(runner);

        result.errors.forEach(error => {
          errors.push("Runner " + (index + 1) + ": " + error);
        });

        result.warnings.forEach(warning => {
          warnings.push("Runner " + (index + 1) + ": " + warning);
        });
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },

  validateRunner(runner) {
    const errors = [];
    const warnings = [];

    if (!runner || typeof runner !== "object") {
      return {
        valid: false,
        errors: ["Runner information is missing."],
        warnings
      };
    }

    this.requiredRunnerFields.forEach(field => {
      if (
        runner[field] === null ||
        runner[field] === undefined ||
        runner[field] === ""
      ) {
        errors.push("Missing runner field: " + field);
      }
    });

    if (
      runner.horseAge !== null &&
      runner.horseAge !== undefined &&
      (!Number.isFinite(Number(runner.horseAge)) ||
       Number(runner.horseAge) <= 0)
    ) {
      errors.push("Invalid horse age.");
    }

    if (
      runner.allocatedWeightKg !== null &&
      runner.allocatedWeightKg !== undefined &&
      (!Number.isFinite(Number(runner.allocatedWeightKg)) ||
       Number(runner.allocatedWeightKg) <= 0)
    ) {
      errors.push("Invalid allocated weight.");
    }

    if (!runner.officialRating) {
      warnings.push("Official rating is unavailable or unverified.");
    }

    if (!runner.draw) {
      warnings.push("Draw information is unavailable or unverified.");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
};
