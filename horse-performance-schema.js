/*
 * RACEWISE INDIA
 * Historical Horse Performance Schema
 * Version 1.0.0
 *
 * Stores sourced historical race performances.
 * Never invents missing times or individual speed figures.
 */

window.RACEWISE_PERFORMANCE_SCHEMA = {
  version: "1.0.0",

  performance: {
    horseName: null,
    horseId: null,

    raceDate: null,
    centre: null,
    raceNumber: null,
    raceName: null,

    distanceMetres: null,
    class: null,
    going: null,
    trackCondition: null,

    finishingPosition: null,
    fieldSize: null,
    carriedWeightKg: null,

    officialRaceTimeRaw: null,
    officialRaceTimeSeconds: null,

    individualTimeRaw: null,
    individualTimeSeconds: null,

    sectionals: [],

    speed: {
      raceAverageMps: null,
      raceAverageKmh: null,
      individualAverageMps: null,
      individualAverageKmh: null,
      calculationStatus: "not_calculated"
    },

    source: {
      name: null,
      url: null,
      documentReference: null,
      verified: false,
      verificationNotes: null
    },

    missingData: [],
    confidence: null
  },

  dataPolicy: {
    preserveOriginalTimes: true,
    distinguishRaceTimeFromIndividualTime: true,
    neverInventMissingData: true,
    requireVerifiedSource: true,
    adjustedSpeedRequiresValidatedMethod: true
  }
};
