
/*
 * RACEWISE INDIA
 * National Racing Centre Configuration
 *
 * IMPORTANT:
 * This file registers racing centres only.
 * It does not assume or invent official handicap rules.
 * A centre must be verified before official calculations
 * can be enabled.
 */

window.RACEWISE_CENTRES = {
  version: "1.0.0",

  centres: {
    hyderabad: {
      name: "Hyderabad",
      authority: "Hyderabad Race Club",
      status: "verification_required",
      officialRulesVerified: false,
      authorisedDataVerified: false
    },

    bangalore: {
      name: "Bangalore",
      authority: "Bangalore Turf Club",
      status: "verification_required",
      officialRulesVerified: false,
      authorisedDataVerified: false
    },

    mysore: {
      name: "Mysore",
      authority: "Mysore Race Club",
      status: "verification_required",
      officialRulesVerified: false,
      authorisedDataVerified: false
    },

    mumbai: {
      name: "Mumbai",
      authority: "Royal Western India Turf Club",
      status: "verification_required",
      officialRulesVerified: false,
      authorisedDataVerified: false
    },

    pune: {
      name: "Pune",
      authority: "Royal Western India Turf Club",
      status: "verification_required",
      officialRulesVerified: false,
      authorisedDataVerified: false
    },

    chennai: {
      name: "Chennai",
      authority: "Madras Race Club",
      status: "verification_required",
      officialRulesVerified: false,
      authorisedDataVerified: false
    },

    kolkata: {
      name: "Kolkata",
      authority: "Royal Calcutta Turf Club",
      status: "verification_required",
      officialRulesVerified: false,
      authorisedDataVerified: false
    }
  },

  requiredRaceCardFields: [
    "centre",
    "raceDate",
    "raceNumber",
    "raceName",
    "distance",
    "class",
    "going",
    "horseName",
    "horseAge",
    "draw",
    "jockey",
    "trainer",
    "officialRating",
    "allocatedWeight"
  ],

  handicapInputs: [
    "publishedRating",
    "allocatedWeight",
    "apprenticeClaim",
    "penalty",
    "allowance",
    "weightForAge",
    "raceConditions",
    "officialRuleReference"
  ],

  analysisFactors: [
    "recentForm",
    "speedAndTiming",
    "trackwork",
    "classAndOpposition",
    "distanceAndStamina",
    "pedigree",
    "courseSuitability",
    "goingSuitability",
    "jockeyPerformance",
    "trainerPerformance",
    "headToHead",
    "paceAndRunningStyle",
    "draw"
  ],

  dataPolicy: {
    missingData: "mark_unavailable",
    unverifiedData: "mark_unverified",
    inventedData: false,
    officialHandicapSeparateFromRaceWiseScore: true,
    preserveOriginalPreRaceAnalysis: true,
    requireSourcesForOfficialCalculations: true
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = RACEWISE_CENTRES;
}
