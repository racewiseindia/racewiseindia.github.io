/*
 * RACEWISE INDIA — Historical results import and analysis UI
 * Accepts user-selected JSON only. No network access or automatic database writes.
 */
(function () {
  "use strict";
  const fileInput = document.getElementById("historyJsonFile");
  const status = document.getElementById("historyJsonStatus");
  const button = document.getElementById("analyseWithHistoryBtn");
  const output = document.getElementById("historyRankingOutput");
  if (!fileInput || !status || !button || !output) return;

  let verifiedRecords = [];

  function show(parent, tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    parent.appendChild(node);
    return node;
  }

  fileInput.addEventListener("change", async function () {
    verifiedRecords = [];
    output.replaceChildren();
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      status.textContent = "No historical results file selected.";
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      if (!Array.isArray(records)) throw new Error('JSON must be an array or contain a "records" array.');
      const valid = [];
      const rejected = [];
      records.forEach((record, index) => {
        const check = window.RACEWISE_HISTORY.validateRecord(record);
        if (check.valid) valid.push(record);
        else rejected.push({ index: index + 1, errors: check.errors });
      });
      verifiedRecords = valid;
      status.textContent = valid.length + " verified-format records accepted; " +
        rejected.length + " rejected. Format validation does not independently authenticate the source or horse identity.";
      if (rejected.length) {
        const list = document.createElement("ul");
        rejected.slice(0, 12).forEach(item =>
          show(list, "li", "Record " + item.index + ": " + item.errors.join(" "))
        );
        status.appendChild(list);
      }
    } catch (error) {
      status.textContent = "Could not import JSON: " + error.message;
    }
  });

  button.addEventListener("click", function () {
    output.replaceChildren();
    const meeting = window.RACEWISE_LAST_MEETING;
    if (!meeting || !Array.isArray(meeting.races)) {
      status.textContent = "Build race cards first, then import and analyse historical results.";
      return;
    }
    if (!verifiedRecords.length) {
      status.textContent = "No valid historical records are loaded. Select a verified results JSON file first.";
      return;
    }
    const centreSelect = document.getElementById("centreSelect");
    const centre = centreSelect && centreSelect.value ? centreSelect.value : null;
    meeting.centre = centre;
    let matched = 0;
    let recordsAttached = 0;
    meeting.races.forEach(race => {
      race.centre = centre;
      race.runners.forEach(runner => {
        const derived = window.RACEWISE_HISTORY.derive(runner, verifiedRecords, race);
        runner.raceWiseStudy = Object.assign({}, runner.raceWiseStudy || {}, derived.factors);
        runner.historicalEvidenceSummary = {
          matchedRecordCount: derived.matchedRecordCount,
          warnings: derived.warnings
        };
        if (derived.matchedRecordCount) {
          matched++;
          recordsAttached += derived.matchedRecordCount;
        }
      });
      const result = window.RACEWISE_ANALYSIS.rankRace(race);
      const section = document.createElement("section");
      section.style.cssText = "border-top:1px solid #d8cfbb;padding:10px 0";
      show(section, "h3", "Race " + race.raceNumber + " — " + (result.rankings.length ? result.rankings.length + " ranked runners" : "No ranking yet"));
      show(section, "p", "Historical matches: " + race.runners.filter(r => r.historicalEvidenceSummary && r.historicalEvidenceSummary.matchedRecordCount).length + "/" + race.runners.length + " runners.");
      if (result.rankings.length) {
        result.rankings.forEach(item => {
          show(section, "p", item.rank + ". " + item.horseName + " — " + item.score.toFixed(1) +
            "/100 | evidence coverage " + item.evidenceCoveragePercent + "% | " + item.evidenceLevel);
        });
      } else {
        show(section, "p", "No runner meets the minimum verified-evidence threshold of " +
          window.RACEWISE_ANALYSIS.minimumCoveragePercent + "% across " +
          window.RACEWISE_ANALYSIS.minimumVerifiedFactors + " factors.");
      }
      result.unranked.forEach(item => {
        const notes = item.missingFactors.map(f => f.label).join(", ");
        show(section, "p", item.horseName + ": " + item.verifiedFactorCount +
          " verified factors; missing/unverified: " + notes + ".");
      });
      if (result.warnings && result.warnings.length) {
        show(section, "p", "Caution: " + result.warnings.join(" "));
      }
      output.appendChild(section);
    });
    status.textContent = "Evidence attached to " + matched + " runners from " +
      recordsAttached + " historical result records. Results are held in this page session only; no database write occurred.";
  });
})();
