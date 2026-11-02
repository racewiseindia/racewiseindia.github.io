/*
 * RACEWISE INDIA
 * Race Card Data Entry Module
 * Version 1.0.0
 *
 * Stores meeting, race and runner details in memory.
 * Missing information remains blank.
 * No invented racing data.
 */

window.RACEWISE_ENTRY = {
  version: "1.0.0",

  createMeeting() {
    return {
      centre: "",
      raceDate: "",
      sourceFiles: [],
      sourceVerified: false,
      races: []
    };
  },

  createRace(raceNumber) {
    return {
      raceNumber: raceNumber || "",
      raceName: "",
      scheduledTime: "",
      distanceMetres: "",
      class: "",
      ageRestriction: "",
      going: "",
      trackCondition: "",
      raceConditions: "",
      runners: []
    };
  },

  createRunner() {
    return {
      horseName: "",
      horseAge: "",
      sex: "",
      draw: "",
      jockey: "",
      trainer: "",
      owner: "",
      allocatedWeightKg: "",
      officialRating: "",
      declaredStatus: "unverified",
      missingData: []
    };
  },

  addRace(meeting) {
    if (!meeting || !Array.isArray(meeting.races)) {
      throw new Error("Invalid meeting structure.");
    }

    meeting.races.push(
      this.createRace(meeting.races.length + 1)
    );

    return meeting;
  },

  addRunner(race) {
    if (!race || !Array.isArray(race.runners)) {
      throw new Error("Invalid race structure.");
    }

    race.runners.push(this.createRunner());

    return race;
  },

  getSummary(meeting) {
    const raceCount = meeting.races.length;

    const runnerCount = meeting.races.reduce(
      (total, race) => total + race.runners.length,
      0
    );

    return {
      centre: meeting.centre || "Not entered",
      raceDate: meeting.raceDate || "Not entered",
      raceCount,
      runnerCount
    };
  }
};
