
/*
 * RACEWISE INDIA
 * Complete-Day Race Card Data Schema
 * Version 1.0.0
 *
 * Purpose:
 * Organise every race and runner from one day's
 * race card without inventing missing information.
 *
 * This is a data structure, not an OCR or prediction engine.
 */

window.RACEWISE_SCHEMA = {
  version: "1.0.0",

  meeting: {
    centre: null,
    raceDate: null,
    raceCount: null,
    sourceFiles: [],
    sourceVerified: false
  },

  race: {
    raceNumber: null,
    raceName: null,
    scheduledTime: null,
    distanceMetres: null,
    class: null,
    ageRestriction: null,
    going: null,
    trackCondition: null,
    raceConditions: null,
    runners: []
  },

  runner: {
    horseName: null,
    horseAge: null,
    sex: null,
    draw: null,
    jockey: null,
    trainer: null,
    owner: null,
    allocatedWeightKg: null,
    officialRating: null,
    declaredStatus: "unverified",

    handicap: {
      publishedRating: null,
      allocatedWeight: null,
      apprenticeClaim: null,
      penalty: null,
      allowance: null,
      weightForAge: null,
      effectiveWeight: null,
      officialRuleReference: null,
      calculationStatus: "not_calculated"
    },

    raceWiseStudy: {
      recentForm: null,
      speedAndTiming: null,
      trackwork: null,
      classAndOpposition: null,
      distanceAndStamina: null,
      pedigree: null,
      siblingPerformance: null,
      courseSuitability: null,
      goingSuitability: null,
      jockeyPerformance: null,
      trainerPerformance: null,
      jockeyTrainerCombination: null,
      headToHead: null,
      paceAndRunningStyle: null,
      drawAssessment: null,
      previousCourseWinners: null
    },

    evidence: [],
    missingData: [],
    confidence: null,
    raceWiseScore: null
  },

  analysisOutput: {
    firstChoice: null,
    secondChoice: null,
    thirdChoice: null,
    mainDanger: null,
    scoreBreakdown: [],
    confidence: null,
    reasons: [],
    risks: [],
    missingDataWarnings: [],
    sources: []
  },

  audit: {
    originalSnapshot: null,
    snapshotTimestamp: null,
    subsequentUpdates: [],
    withdrawals: [],
    resultsVerified: false
  },

  dataPolicy: {
    neverInventMissingData: true,
    keepOfficialHandicapSeparate: true,
    requireVerifiedRulesForHandicap: true,
    requireEvidenceForRatings: true,
    preserveOriginalPrediction: true,
    markUnverifiedInformation: true
  }
};
