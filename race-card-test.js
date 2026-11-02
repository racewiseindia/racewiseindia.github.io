
/*
 * RACEWISE INDIA
 * Race Card Test Module
 * Version 1.0.0
 *
 * Synthetic test data only.
 * Never use these records for real race predictions.
 */

window.RACEWISE_TEST = {
  version: "1.0.0",

  createSampleMeeting() {
    return {
      centre: "hyderabad",
      raceDate: "TEST-DATE",
      raceCount: 2,
      sourceFiles: ["SYNTHETIC-TEST-DATA"],
      sourceVerified: true,

      races: [
        {
          raceNumber: 1,
          raceName: "Synthetic Test Race One",
          distanceMetres: 1400,
          class: "TEST",
          runners: [
            {
              horseName: "TEST HORSE ALPHA",
              horseAge: 4,
              jockey: "TEST JOCKEY ONE",
              trainer: "TEST TRAINER ONE",
              allocatedWeightKg: 56,
              officialRating: 70,
              draw: 3
            },
            {
              horseName: "TEST HORSE BETA",
              horseAge: 5,
              jockey: "TEST JOCKEY TWO",
              trainer: "TEST TRAINER TWO",
              allocatedWeightKg: 55,
              officialRating: 65,
              draw: 5
            }
          ]
        },
        {
          raceNumber: 2,
          raceName: "Synthetic Test Race Two",
          distanceMetres: 1600,
          class: "TEST",
          runners: [
            {
              horseName: "TEST HORSE GAMMA",
              horseAge: 3,
              jockey: "TEST JOCKEY THREE",
              trainer: "TEST TRAINER THREE",
              allocatedWeightKg: 54,
              officialRating: 60,
              draw: 2
            }
          ]
        }
      ]
    };
  },

  createMissingDataTest() {
    const meeting = this.createSampleMeeting();

    meeting.races[0].runners[0].jockey = null;
    meeting.races[0].runners[0].officialRating = null;

    return meeting;
  },

  createDuplicateHorseTest() {
    const meeting = this.createSampleMeeting();

    meeting.races[0].runners[1].horseName =
      meeting.races[0].runners[0].horseName;

    return meeting;
  },

  createDuplicateRaceTest() {
    const meeting = this.createSampleMeeting();

    meeting.races[1].raceNumber = 1;

    return meeting;
  },

  runAll() {
    const validator = window.RACEWISE_VALIDATOR;

    if (!validator) {
      return {
        success: false,
        message: "RaceWise validator is not loaded."
      };
    }

    const tests = [
      {
        name: "Valid multi-race meeting",
        meeting: this.createSampleMeeting()
      },
      {
        name: "Missing data detection",
        meeting: this.createMissingDataTest()
      },
      {
        name: "Duplicate horse detection",
        meeting: this.createDuplicateHorseTest()
      },
      {
        name: "Duplicate race detection",
        meeting: this.createDuplicateRaceTest()
      }
    ];

    return tests.map(test => ({
      name: test.name,
      result: validator.validateMeeting(test.meeting)
    }));
  }
};
