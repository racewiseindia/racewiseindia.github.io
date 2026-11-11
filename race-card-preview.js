/*
 * RACEWISE INDIA
 * Conservative race-card preview
 * Review only — no database writes
 *
 * Detects race sections from race-title / number / distance layout.
 * Detects runner candidates from the age/description row and preserves
 * the complete original text block for manual verification.
 */
(function () {
  const button = document.getElementById("buildRacePreviewBtn");
  const preview = document.getElementById("raceCardPreview");

  if (!button || !preview) return;

  const cleanLine = value =>
    String(value || "")
      .replace(/\s*\|\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  function buildLines(layoutPages) {
    const lines = [];

    layoutPages.forEach(page => {
      const items = (page.items || [])
        .filter(item => item && String(item.text || "").trim())
        .slice()
        .sort((a, b) => b.y - a.y || a.x - b.x);

      let currentLine = [];
      let currentY = null;

      items.forEach(item => {
        if (currentY === null || Math.abs(item.y - currentY) <= 2.5) {
          currentLine.push(item);
          currentY = currentLine.reduce(
            (sum, entry) => sum + entry.y, 0
          ) / currentLine.length;
        } else {
          currentLine.sort((a, b) => a.x - b.x);
          lines.push(currentLine.map(entry => entry.text).join(" | "));
          currentLine = [item];
          currentY = item.y;
        }
      });

      if (currentLine.length) {
        currentLine.sort((a, b) => a.x - b.x);
        lines.push(currentLine.map(entry => entry.text).join(" | "));
      }

      // Keep page boundaries explicit without changing the source text.
      lines.push("");
    });

    return lines;
  }

  function findRaceHeaders(lines) {
    const headers = [];

    lines.forEach((line, index) => {
      const title = cleanLine(line);
      if (!/^The\b/i.test(title)) return;

      const limit = Math.min(lines.length, index + 9);
      let raceNumber = null;
      let distance = null;
      let numberLineIndex = -1;
      let distanceLineIndex = -1;

      for (let j = index + 1; j < limit; j++) {
        const candidate = cleanLine(lines[j]);

        const combined = candidate.match(
          /^(\d{1,2})\s+(\d{3,4})\s*M\b/i
        );

        if (combined) {
          raceNumber = Number(combined[1]);
          distance = Number(combined[2]);
          numberLineIndex = j;
          distanceLineIndex = j;
          break;
        }

        if (raceNumber === null && /^\d{1,2}$/.test(candidate)) {
          raceNumber = Number(candidate);
          numberLineIndex = j;
          continue;
        }

        const distanceMatch = candidate.match(/\b(\d{3,4})\s*M\b/i);
        if (distance === null && distanceMatch) {
          distance = Number(distanceMatch[1]);
          distanceLineIndex = j;
        }

        if (raceNumber !== null && distance !== null) break;
      }

      if (
        raceNumber === null ||
        distance === null ||
        numberLineIndex < 0 ||
        distanceLineIndex < 0
      ) return;

      // Some official race titles continue on the line after the distance.
      let fullTitle = title;
      const continuation = cleanLine(lines[distanceLineIndex + 1]);
      if (/^(Memorial Trophy|Memorial Cup|Cup)$/i.test(continuation)) {
        fullTitle += " " + continuation;
      }

      headers.push({
        index,
        title: fullTitle,
        number: raceNumber,
        distance,
        numberLineIndex,
        distanceLineIndex
      });
    });

    return headers;
  }

  function findRunnerStarts(section) {
    const starts = [];

    section.forEach((line, index) => {
      const rawLine = String(line || "");
      const ageMatch = rawLine.match(/\b(\d{1,2})\s*y\b/i);
      if (!ageMatch) return;

      const prefix = rawLine.slice(0, ageMatch.index);
      let nameParts = prefix
        .split("|")
        .map(part => part.trim())
        .filter(part => part && part !== "-" && part !== "–");

      let runnerNumber = null;
      if (nameParts.length && /^\d{1,2}$/.test(nameParts[0])) {
        runnerNumber = Number(nameParts.shift());
      }

      // A wrapped PDF row can place the runner number on the next pedigree line.
      // Accept it only when that line starts with a small integer followed by
      // an explicit pedigree-style token such as Dali(USA) or Dreamfield(GB).
      if (runnerNumber === null) {
        const followingLine = cleanLine(section[index + 1]);
        const wrappedNumber = followingLine.match(
          /^(\d{1,2})\s+(.+)$/
        );
        if (
          wrappedNumber &&
          Number(wrappedNumber[1]) <= 20 &&
          /[A-Za-z]+\([^)]{2,8}\)/.test(wrappedNumber[2])
        ) {
          runnerNumber = Number(wrappedNumber[1]);
        }
      }

      const horseName = nameParts.join(" ")
        .replace(/\s+/g, " ")
        .trim();

      // An age row without a readable name is retained for review, not guessed.
      starts.push({
        name: horseName || "Horse name not confidently detected",
        number: runnerNumber,
        age: Number(ageMatch[1]),
        nameIndex: index,
        details: section.slice(index).join("\n")
      });
    });

    return starts;
  }


  function findCoordinateRunnerCandidates(layoutPages) {
    const candidates = [];
    let activeFile = null;
    let columnMap = null;

    function findHeaderMap(page) {
      const items = page.items || [];
      const horseHeader = items.find(item =>
        /^Horse\/Pedigree$/i.test(String(item.text || "").trim())
      );
      if (!horseHeader) return null;

      const headerRow = items.filter(item =>
        Math.abs(item.y - horseHeader.y) <= 2.5
      );

      function xOf(label) {
        const item = headerRow.find(entry =>
          String(entry.text || "").trim().toLowerCase() === label.toLowerCase()
        );
        return item ? item.x : null;
      }

      // Some IndiaRace PDFs merge the two printed headings into one
      // positioned text item: "Desc Owner(s)". Preserve that layout by
      // deriving the description and owner boundaries from the combined label.
      const descOwnerHeader = headerRow.find(entry =>
        /^Desc\s+Owner\(s\)$/i.test(String(entry.text || "").trim())
      );

      const map = {
        no: xOf("No"),
        silk: xOf("Silk"),
        horse: xOf("Horse/Pedigree"),
        desc: xOf("Desc") ?? (descOwnerHeader ? descOwnerHeader.x : null),
        owner: xOf("Owner(s)") ?? (descOwnerHeader ? descOwnerHeader.x + 24.5 : null),
        trainer: xOf("Trainer"),
        jockey: xOf("Jockey"),
        wt: xOf("Wt"),
        al: xOf("Al"),
        rating: xOf("Rtg")
      };

      return Object.values(map).every(value => Number.isFinite(value))
        ? map
        : null;
    }

    layoutPages.forEach(page => {
      const fileName = page.fileName || "";
      if (fileName !== activeFile) {
        activeFile = fileName;
        columnMap = null;
      }

      columnMap = findHeaderMap(page) || columnMap;

      const items = (page.items || []).filter(item =>
        item && String(item.text || "").trim()
      );

      const descMin = columnMap ? columnMap.desc - 10 : 185;
      const ownerMin = columnMap ? columnMap.owner - 10 : 230;

      const ageItems = items
        .filter(item =>
          /^\d{1,2}y\b/i.test(String(item.text || "").trim()) &&
          item.x >= descMin &&
          item.x < ownerMin
        )
        .slice()
        .sort((a, b) => b.y - a.y || a.x - b.x);

      // Race titles are centred and may sit to the right of the Horse/Pedigree column.
      // Missing this boundary lets the final runner absorb the next race's prize-money.
      const titleYs = items
        .filter(item =>
          /^The\b/i.test(String(item.text || "").trim()) &&
          item.x >= (columnMap ? columnMap.horse - 10 : 65) &&
          item.x < (columnMap ? columnMap.desc + 180 : 420)
        )
        .map(item => item.y);

      ageItems.forEach((ageItem, index) => {
        const nextAgeY = ageItems[index + 1]
          ? ageItems[index + 1].y
          : null;

        const nextTitleY = titleYs
          .filter(y => y < ageItem.y - 3)
          .sort((a, b) => b - a)[0];

        const boundaries = [nextAgeY, nextTitleY]
          .filter(y => Number.isFinite(y) && y < ageItem.y - 3);

        const nearestBoundary = boundaries.length
          ? Math.max(...boundaries)
          : null;

        const lowerY = nearestBoundary === null
          ? -Infinity
          : nearestBoundary + 3;

        const inRunnerBlock = item =>
          item.y <= ageItem.y + 1 && item.y > lowerY;

        const sortedText = (list) => list
          .slice()
          .sort((a, b) => b.y - a.y || a.x - b.x)
          .map(item => String(item.text || "").trim())
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        const name = sortedText(items.filter(item =>
          item.x >= (columnMap ? columnMap.horse - 10 : 70) &&
          item.x < descMin &&
          item.y >= ageItem.y - 1 &&
          item.y <= ageItem.y + 5
        )).replace(/^[-–]\s*/, "").trim();

        // The first printed field may contain horse number and draw together,
        // for example "3(2)". Keep these as separate values; never infer a
        // draw from the horse number when the PDF does not print one.
        const numberItem = items.find(item =>
          item.x >= 20 &&
          item.x < 60 &&
          Math.abs(item.y - ageItem.y) <= 3 &&
          /^\d{1,2}$/.test(String(item.text || "").trim())
        );
        // IndiaRace prints the draw in parentheses on a separate line below
        // the horse number, e.g. horse 1 followed by "(1)". Search only inside
        // this runner's vertical block and number column, not the race header.
        const drawItem = items
          .filter(item =>
            item.x >= 20 &&
            item.x < 60 &&
            item.y < ageItem.y - 2 &&
            item.y > lowerY &&
            /^\(\s*\d{1,2}\s*\)$/.test(String(item.text || "").trim())
          )
          .sort((a, b) => b.y - a.y)[0];
        const drawMatch = drawItem
          ? String(drawItem.text || "").match(/\(\s*(\d{1,2})\s*\)/)
          : null;
        const drawNumber = drawMatch ? Number(drawMatch[1]) : null;

        let owner = "";
        let trainer = "";
        let jockey = "";
        let weight = "";
        let rating = "";
        let relativePerformance = "";

        if (columnMap) {
          const columnText = (left, right) => sortedText(items.filter(item =>
            item.x >= left &&
            item.x < right &&
            inRunnerBlock(item)
          ));

          owner = columnText(columnMap.owner - 10, columnMap.trainer - 8);
          trainer = columnText(columnMap.trainer - 8, columnMap.jockey - 8);
          jockey = columnText(columnMap.jockey - 8, columnMap.wt - 5);

          const weightItem = items.find(item =>
            item.x >= columnMap.wt - 5 &&
            item.x < columnMap.al - 2 &&
            Math.abs(item.y - ageItem.y) <= 3 &&
            /^\d+(?:\.\d+)?$/.test(String(item.text || "").trim())
          );

          // The printed Rtg value sits directly under the Rtg heading.
          // A second number immediately to its right is a separate relative-
          // performance figure, not the official rating.
          const ratingItem = items.find(item =>
            item.x >= columnMap.rating - 1 &&
            item.x < columnMap.rating + 8 &&
            Math.abs(item.y - ageItem.y) <= 3 &&
            /^\d{1,3}$/.test(String(item.text || "").trim())
          );
          const relativePerformanceItem = items.find(item =>
            item.x >= columnMap.rating + 8 &&
            item.x < columnMap.rating + 28 &&
            Math.abs(item.y - ageItem.y) <= 8 &&
            /^\d{1,3}$/.test(String(item.text || "").trim())
          );

          weight = weightItem ? String(weightItem.text).trim() : "";
          rating = ratingItem ? String(ratingItem.text).trim() : "";
          relativePerformance = relativePerformanceItem
            ? String(relativePerformanceItem.text).trim()
            : "";

          // In some PDF rows, the jockey, weight and allowance are merged
          // into one positioned text item. Split only a clear trailing
          // numeric weight (with an optional allowance suffix); keep the
          // untouched original runner text below for manual checking.
          if (!weight) {
            const mergedWeight = jockey.match(
              /^(.+?)\s+(\d{2}(?:\.\d+)?)(?:\s+[-–]?\d+(?:\.\d+)?(?:\s+[A-Z]+)?)?$/
            );
            if (mergedWeight) {
              jockey = mergedWeight[1].trim();
              weight = mergedWeight[2];
            }
          }
        }

        candidates.push({
          name,
          number: numberItem ? Number(numberItem.text) : null,
          drawNumber,
          age: Number((String(ageItem.text).match(/^(\d{1,2})/i) || [])[1]),
          owner,
          trainer,
          jockey,
          weight,
          rating,
          relativePerformance,
          pageBoundary: nearestBoundary === null
        });
      });
    });

    return candidates;
  }

  button.addEventListener("click", function () {
    const layoutPages = window.RACEWISE_PDF_LAYOUT || [];

    preview.replaceChildren();
    preview.style.display = "block";

    if (!layoutPages.length) {
      preview.textContent =
        "No PDF layout data found. Please read the PDF again first.";
      return;
    }

    const lines = buildLines(layoutPages);
    const raceHeaders = findRaceHeaders(lines);
    const coordinateRunners = findCoordinateRunnerCandidates(layoutPages);
    const normalizeHorseKey = (name, age) =>
      String(name || "").toUpperCase().replace(/[^A-Z0-9]/g, "") +
      "|" + String(age || "");
    const coordinateByHorse = new Map();
    coordinateRunners.forEach(candidate => {
      const key = normalizeHorseKey(candidate.name, candidate.age);
      if (!key.startsWith("|")) {
        if (!coordinateByHorse.has(key)) coordinateByHorse.set(key, []);
        coordinateByHorse.get(key).push(candidate);
      }
    });

    function addText(parent, tag, value) {
      const element = document.createElement(tag);
      element.textContent = value;
      parent.appendChild(element);
      return element;
    }

    addText(
      preview,
      "p",
      "REVIEW-ONLY PREVIEW — Nothing is saved to the database."
    );

    if (!raceHeaders.length) {
      addText(
        preview,
        "p",
        "No race sections confidently detected. Keep the extracted PDF text and check the source layout."
      );
      return;
    }

    let totalRunnerCandidates = 0;
    const structuredMeeting = {
      // Confirmed for the current Bangalore card review; keep source verification
      // separate because the PDF metadata still requires a human check.
      centre: "Bangalore",
      raceDate: "2026-11-08",
      sourceVerified: false,
      sourceMode: "PDF extraction — review required",
      races: []
    };

    raceHeaders.forEach((race, position) => {
      const nextRace = raceHeaders[position + 1];
      const end = nextRace ? nextRace.index : lines.length;
      const section = lines.slice(race.index, end);
      const runnerStarts = findRunnerStarts(section);
      totalRunnerCandidates += runnerStarts.length;
      const structuredRace = {
        raceNumber: race.number,
        raceName: race.title,
        distanceMetres: race.distance,
        runners: []
      };

      const card = document.createElement("section");
      card.style.cssText =
        "border:1px solid #c9ad70;padding:12px;margin:14px 0;border-radius:8px";

      const titleRow = document.createElement("div");
      titleRow.style.cssText =
        "display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap";
      const title = addText(titleRow, "h3", race.title);
      title.style.margin = "0";
      const raceLabel = addText(titleRow, "span", "RACE " + race.number);
      raceLabel.style.cssText =
        "color:#d7b46a;font-weight:700;white-space:nowrap;letter-spacing:1px";
      card.appendChild(titleRow);
      addText(card, "p", "Distance: " + race.distance + " metres");

      // Prize money belongs to the race, not to individual runners.
      const prizeLine = section
        .map(cleanLine)
        .find(line => /^Winner\s*:/i.test(line) && /Second\s*:/i.test(line)) || "";
      if (prizeLine) {
        addText(card, "p", "Race prize money (not individual horse earnings): " + prizeLine);
      }

      let timeText = "Not confidently detected";
      for (
        let i = Math.max(0, race.distanceLineIndex - race.index);
        i < Math.min(section.length, race.distanceLineIndex - race.index + 9);
        i++
      ) {
        const timeMatch = cleanLine(section[i]).match(/\b(\d{1,2}:\d{2})\b/);
        if (!timeMatch) continue;

        let period = "";
        for (let j = i; j < Math.min(section.length, i + 4); j++) {
          const periodMatch = cleanLine(section[j]).match(/\b(AM|PM)\b/i);
          if (periodMatch) {
            period = periodMatch[1].toUpperCase();
            break;
          }
        }
        timeText = timeMatch[1] + (period ? " " + period : "");
        break;
      }
      addText(card, "p", "Scheduled time candidate: " + timeText);

      const conditionLines = [];
      const conditionStart = Math.max(
        1,
        race.distanceLineIndex - race.index + 1
      );

      for (let i = conditionStart; i < section.length; i++) {
        const line = cleanLine(section[i]);
        if (
          /^Winner\s*:/i.test(line) ||
          /^Record Time\s*:/i.test(line) ||
          /^No\s+Silk/i.test(line) ||
          /^Previous Runs/i.test(line)
        ) break;
        if (line) conditionLines.push(section[i]);
        if (conditionLines.length >= 6) break;
      }

      addText(card, "p", "Race conditions — original extracted text:");
      const conditions = document.createElement("pre");
      conditions.style.cssText =
        "white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px";
      conditions.textContent = conditionLines.length
        ? conditionLines.join("\n")
        : "Not confidently detected";
      card.appendChild(conditions);

      addText(card, "h4", runnerStarts.length + " runners");
      const tableWrap = document.createElement("div");
      tableWrap.style.cssText = "overflow-x:auto;width:100%";
      const table = document.createElement("table");
      table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;min-width:260px";
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      ["No.", "Draw", "Horse", "Age", "Review"].forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        th.style.cssText = "text-align:left;padding:7px 5px;border-bottom:1px solid #c9ad70;color:#d7b46a";
        headRow.appendChild(th);
      });
      head.appendChild(headRow);
      table.appendChild(head);
      const tbody = document.createElement("tbody");
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      card.appendChild(tableWrap);

      runnerStarts.forEach((runner, runnerIndex) => {
        const coordinateKey = normalizeHorseKey(runner.name, runner.age);
        const matchingCandidates = coordinateByHorse.get(coordinateKey) || [];
        const structured = matchingCandidates.length ? matchingCandidates.shift() : null;
        if (structured && runner.number === null && structured.number !== null) runner.number = structured.number;
        if (structured && runner.drawNumber == null && structured.drawNumber != null) runner.drawNumber = structured.drawNumber;
        const nextRunner = runnerStarts[runnerIndex + 1];
        const blockEnd = nextRunner ? nextRunner.nameIndex : section.length;
        const rawBlock = section.slice(runner.nameIndex, blockEnd).filter(line => {
          const value = cleanLine(line).replace(/[.|]/g, "").trim();
          return !(runner.number !== null && /^\d{1,2}$/.test(value) && Number(value) === runner.number);
        });

        structuredRace.runners.push({
          horseName: runner.name, horseNumber: runner.number, drawNumber: runner.drawNumber ?? null, horseAge: runner.age,
          owner: structured ? structured.owner : null,
          trainer: structured ? structured.trainer : null,
          jockey: structured ? structured.jockey : null,
          allocatedWeightKg: structured && structured.weight ? Number(structured.weight) : null,
          officialRating: structured && structured.rating ? Number(structured.rating) : null,
          relativePerformance: structured && structured.relativePerformance ? Number(structured.relativePerformance) : null,
          declaredStatus: "unverified", raceWiseStudy: {}, evidence: [],
          missingData: ["Historical form", "Verified timing", "Trackwork", "Pedigree and distance evidence", "Course/going suitability", "Jockey/trainer statistics", "Head-to-head", "Pace and draw evidence"]
        });

        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #e1e1e1";
        const no = document.createElement("td");
        no.textContent = runner.number === null ? "—" : String(runner.number);
        no.style.cssText = "padding:7px 5px;vertical-align:top";
        const draw = document.createElement("td");
        draw.textContent = runner.drawNumber == null ? "—" : String(runner.drawNumber);
        draw.style.cssText = "padding:7px 5px;vertical-align:top";
        const horse = document.createElement("td");
        horse.textContent = runner.name;
        horse.style.cssText = "padding:7px 5px;font-weight:600;vertical-align:top";
        const age = document.createElement("td");
        age.textContent = String(runner.age);
        age.style.cssText = "padding:7px 5px;vertical-align:top";
        const review = document.createElement("td");
        review.style.cssText = "padding:7px 5px;vertical-align:top";
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Details";
        summary.style.cssText = "cursor:pointer;color:#8a6b2f";
        details.appendChild(summary);
        const body = document.createElement("div");
        body.style.cssText = "padding:6px 0;overflow-wrap:anywhere";
        const status = document.createElement("p");
        status.textContent = "Review required — extracted fields are not verified.";
        body.appendChild(status);
        if (structured) {
          [["Owner", structured.owner], ["Trainer", structured.trainer], ["Jockey", structured.jockey], ["Weight candidate (kg)", structured.weight], ["Rating candidate", structured.rating], ["Relative performance candidate", structured.relativePerformance]].forEach(([label, value]) => {
            const p = document.createElement("p");
            p.textContent = label + ": " + (value || "Not confidently detected");
            body.appendChild(p);
          });
        } else {
          const p = document.createElement("p");
          p.textContent = "Structured columns not confidently mapped.";
          body.appendChild(p);
        }
        const rawDetails = document.createElement("details");
        const rawSummary = document.createElement("summary");
        rawSummary.textContent = "View original PDF text";
        rawSummary.style.cssText = "cursor:pointer;color:#8a6b2f;margin:6px 0";
        rawDetails.appendChild(rawSummary);
        const raw = document.createElement("pre");
        raw.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px";
        raw.textContent = rawBlock.join("\n");
        rawDetails.appendChild(raw);
        body.appendChild(rawDetails);
        details.appendChild(body);
        review.appendChild(details);
        tr.append(no, draw, horse, age, review);
        tbody.appendChild(tr);
      });

      structuredMeeting.races.push(structuredRace);
      preview.appendChild(card);
    });

    // Connect extracted race-card runners to the evidence scoring module.
    // No factor scores are fabricated: without verified sourced history the
    // engine correctly returns unranked runners and explicit missing factors.
    window.RACEWISE_LAST_MEETING = structuredMeeting;
    if (window.RACEWISE_ANALYSIS) {
      const analysisPanel = document.createElement("section");
      analysisPanel.style.cssText = "border:1px solid #c9ad70;padding:12px;margin:16px 0;border-radius:8px";
      addText(analysisPanel, "h3", "RACEWISE ANALYSIS READINESS");
      addText(analysisPanel, "p", "Extracted runners are connected to the scoring engine. Historical evidence is not yet attached, so no selections are published.");
      structuredMeeting.races.forEach(raceData => {
        const result = window.RACEWISE_ANALYSIS.rankRace(raceData);
        const verifiedCount = result.unranked.reduce((sum, runner) => sum + runner.verifiedFactorCount, 0) + result.rankings.reduce((sum, runner) => sum + runner.verifiedFactorCount, 0);
        const possibleCount = raceData.runners.length * window.RACEWISE_ANALYSIS.factors.length;
        addText(analysisPanel, "p", "Race " + raceData.raceNumber + ": " + raceData.runners.length + " runners | " + verifiedCount + "/" + possibleCount + " verified factor entries | " + result.rankings.length + " ranked. " + (result.rankings.length ? "Evidence-based ranking available." : "No ranking — verified historical evidence required."));
      });
      preview.appendChild(analysisPanel);
    }

    // Prepare a transparent source-by-source research queue.
    // This is a checklist only; no source has been fetched or verified yet.
    if (window.RACEWISE_RESEARCH_QUEUE) {
      const queue = window.RACEWISE_RESEARCH_QUEUE.build(structuredMeeting);
      window.RACEWISE_RESEARCH_PLAN = queue;
      const researchPanel = document.createElement("section");
      researchPanel.style.cssText = "border:1px solid #c9ad70;padding:12px;margin:16px 0;border-radius:8px";
      addText(researchPanel, "h3", "RACEWISE SOURCE RESEARCH QUEUE");
      addText(researchPanel, "p",
        queue.runnerCount + " runners mapped to " + queue.factors.length +
        " study factors. " + queue.taskCount +
        " source-check tasks prepared.");
      addText(researchPanel, "p",
        "Status: local checklist prepared. Use the secure backend action below to validate this meeting and prepare the server-side research task list. This does not fetch or verify external evidence.");

      const researchButton = document.createElement("button");
      researchButton.type = "button";
      researchButton.textContent = "Send Meeting to Secure Research Backend";
      researchButton.style.cssText = "background:#07172e;color:#d6ad55;border:1px solid #d6ad55;padding:11px 14px;border-radius:7px;font-weight:700;cursor:pointer;margin:8px 0";
      researchPanel.appendChild(researchButton);

      const backendStatus = document.createElement("p");
      backendStatus.setAttribute("role", "status");
      backendStatus.style.cssText = "white-space:pre-wrap;font-size:13px;line-height:1.5";
      backendStatus.textContent = "Waiting for an authenticated administrator request.";
      researchPanel.appendChild(backendStatus);

      const sourceDetails = document.createElement("details");
      sourceDetails.style.cssText = "margin:10px 0";
      const sourceSummary = document.createElement("summary");
      sourceSummary.textContent = "View source checks and runner-by-runner review";
      sourceSummary.style.cssText = "cursor:pointer;color:#d7b46a;font-weight:700;padding:8px 0";
      sourceDetails.appendChild(sourceSummary);
      const sourceLinksPanel = document.createElement("div");
      sourceLinksPanel.style.cssText = "font-size:13px;line-height:1.5;overflow-wrap:anywhere";
      sourceDetails.appendChild(sourceLinksPanel);
      researchPanel.appendChild(sourceDetails);

      researchButton.addEventListener("click", async function () {
        if (window.RACEWISE_ADMIN_VERIFIED !== true || !window.RACEWISE_SUPABASE_CLIENT) {
          backendStatus.textContent = "Please sign in and complete RaceWise administrator verification first.";
          return;
        }
        researchButton.disabled = true;
        researchButton.textContent = "Preparing secure research queue…";
        backendStatus.textContent = "Sending the extracted meeting to the authenticated Supabase function. No database records will be changed.";
        try {
          const result = await window.RACEWISE_SUPABASE_CLIENT.functions.invoke(
            "racewise-research",
            { body: { meeting: structuredMeeting } }
          );
          if (result.error) throw result.error;
          const data = result.data || {};
          if (data.ok !== true) {
            throw new Error(data.error || "The research function returned an unexpected response.");
          }
          window.RACEWISE_RESEARCH_RESPONSE = data;
          const sourceChecks = data.sourceChecks || [];
          const btc = sourceChecks.find(function (source) {
            return source.sourceId === "official_club";
          });
          const btcRaceCard = sourceChecks.find(function (source) {
            return source.sourceId === "official_club_racecard";
          });
          backendStatus.textContent =
            "BACKEND CONNECTION SUCCESSFUL\\n" +
            "Meeting validated: " + (data.meeting && data.meeting.centre ? data.meeting.centre : "Centre not specified") + "\\n" +
            "Race date: " + (data.meeting && data.meeting.raceDate ? data.meeting.raceDate : "Not specified") + "\\n" +
            "Runners accepted: " + data.runnerCount + "\\n" +
            "Research tasks prepared: " + data.taskCount + "\\n\\n" +
            "Official BTC homepage: " + (btc ? btc.status.replace(/_/g, " ") : "not checked") + "\\n" +
            "Dated BTC race card: " + (btcRaceCard ? btcRaceCard.status.replace(/_/g, " ") : "not returned") + "\\n" +
            "Runner-name presence is preliminary only; no horse identity or racing evidence has been verified.\\n" +
            "No database writes; no selections produced.";
          sourceLinksPanel.replaceChildren();
          if (btc) {
            addText(sourceLinksPanel, "p", "BTC homepage: " + (btc.pageUrl || "Not available"));
            if (btc.retrievedAt) addText(sourceLinksPanel, "p", "Homepage retrieved at: " + btc.retrievedAt);
            (btc.links || []).forEach(function (link) {
              const row = document.createElement("p");
              const anchor = document.createElement("a");
              anchor.href = link.url;
              anchor.textContent = link.label + " — " + link.url;
              anchor.target = "_blank";
              anchor.rel = "noopener noreferrer";
              row.appendChild(anchor);
              sourceLinksPanel.appendChild(row);
            });
            if (!btc.links || !btc.links.length) {
              addText(sourceLinksPanel, "p", btc.note || "No relevant public links were discovered.");
            }
          }
          if (btcRaceCard) {
            addText(sourceLinksPanel, "p", "BTC dated race card: " + (btcRaceCard.pageUrl || "Not available"));
            if (btcRaceCard.retrievedAt) addText(sourceLinksPanel, "p", "Race card retrieved at: " + btcRaceCard.retrievedAt);
            if (btcRaceCard.pageTitle) addText(sourceLinksPanel, "p", "Page title: " + btcRaceCard.pageTitle);
            addText(sourceLinksPanel, "p", "Runners in extracted card: " + (btcRaceCard.expectedRunnerCount ?? "unknown") + " | Page mentions: " + (btcRaceCard.pageMentionCount ?? "unknown") + " | Unique source rows: " + (btcRaceCard.uniqueRunnerRowCount ?? "unknown"));
            addText(sourceLinksPanel, "p", btcRaceCard.note || "No verification status supplied.");
            const checks = btcRaceCard.runnerChecks || [];
            const reviewByRace = new Map();
            checks.forEach(function (check) {
              const key = String(check.expectedRaceNumber ?? "Race not identified");
              if (!reviewByRace.has(key)) reviewByRace.set(key, []);
              reviewByRace.get(key).push(check);
            });
            Array.from(reviewByRace.entries()).forEach(function ([raceNumber, raceChecks]) {
              const section = document.createElement("section");
              section.style.cssText = "border:1px solid #c9ad70;border-radius:7px;padding:9px;margin:10px 0";
              addText(section, "h4", "RACE " + raceNumber + " — " + raceChecks.length + " extracted runners");
              raceChecks.forEach(function (check) {
                const candidates = check.candidates || {};
                const comparisons = check.comparisons || {};
                const item = document.createElement("div");
                item.style.cssText = "border-top:1px solid #ddd;padding:7px 0";
                addText(item, "strong", check.horseName + (check.expectedHorseNumber == null ? "" : " (" + check.expectedHorseNumber + ")"));
                addText(item, "p", "BTC page mention: " + (check.pageMentionFound ? "Yes" : "No") + " | Unique source row: " + (check.uniqueRunnerRowFound ? "Yes" : "No") + " | Matching rows: " + (check.matchingRowCount ?? 0));
                addText(item, "p", "Horse number candidate: " + (candidates.horseNumber ?? "Not isolated") + " [" + comparisons.horseNumber + "] | Age candidate: " + (candidates.age ?? "Not isolated") + " [" + comparisons.age + "] | Race number candidate: " + (candidates.raceNumber ?? "Not isolated") + " [" + comparisons.raceNumber + "]");
                addText(item, "p", "Weight candidate: " + (candidates.allocatedWeightKg ?? "Not confidently labelled") + " kg | Official rating candidate: " + (candidates.officialRating ?? "Not confidently labelled"));
                addText(item, "p", "Jockey candidate: " + (candidates.jockey ?? "Not confidently labelled") + " | Trainer candidate: " + (candidates.trainer ?? "Not confidently labelled"));
                if (check.sourceRowText) addText(item, "p", "BTC source row: " + check.sourceRowText);
                addText(item, "p", "Status: manual review required; no field is treated as verified.");
                section.appendChild(item);
              });
              sourceLinksPanel.appendChild(section);
            });
          }
          researchButton.textContent = "Research Queue Prepared";
        } catch (error) {
          backendStatus.textContent = "Backend request failed: " +
            (error && error.message ? error.message : String(error)) +
            "\nNo evidence has been verified and no selections have been produced.";
          researchButton.disabled = false;
          researchButton.textContent = "Retry Secure Research Request";
        }
      });

      queue.sourceCatalog.forEach(function (source) {
        addText(researchPanel, "p", source.name + " — " + source.status.replace(/_/g, " "));
      });
      addText(researchPanel, "p",
        "Next backend stage: connect permitted source access, retrieve only relevant evidence, retain source links and timestamps, resolve horse identity, and verify each record before scoring.");
      preview.appendChild(researchPanel);
    }

    addText(
      preview,
      "h3",
      "Preview diagnostic: " + raceHeaders.length +
        " race sections | " + totalRunnerCandidates +
        " runner candidates. Review-only; no database writes."
    );
  });
})();
