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

    raceHeaders.forEach((race, position) => {
      const nextRace = raceHeaders[position + 1];
      const end = nextRace ? nextRace.index : lines.length;
      const section = lines.slice(race.index, end);
      const runnerStarts = findRunnerStarts(section);
      totalRunnerCandidates += runnerStarts.length;

      const card = document.createElement("section");
      card.style.cssText =
        "border:1px solid #c9ad70;padding:12px;margin:14px 0;border-radius:8px";

      addText(card, "h3", race.title);
      addText(card, "p", "Race number: " + race.number);
      addText(card, "p", "Distance: " + race.distance + " metres");

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

      addText(
        card,
        "h4",
        runnerStarts.length + " runner candidates detected from age/description rows"
      );

      runnerStarts.forEach((runner, runnerIndex) => {
        const nextRunner = runnerStarts[runnerIndex + 1];
        const blockEnd = nextRunner ? nextRunner.nameIndex : section.length;
        const rawBlock = section.slice(runner.nameIndex, blockEnd);

        const item = document.createElement("div");
        item.style.cssText =
          "background:#f4f5f7;padding:10px;margin:9px 0;border-radius:6px";

        addText(item, "strong", runner.name);
        addText(
          item,
          "p",
          "Runner number: " +
            (runner.number === null ? "Not confidently detected" : runner.number) +
            " | Age: " + runner.age + " years"
        );
        addText(
          item,
          "p",
          "Owner / trainer / jockey / weight / rating: Manual verification required. No shifted columns have been assigned."
        );
        addText(item, "p", "Original runner text:");

        const raw = document.createElement("pre");
        raw.style.cssText =
          "white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px";
        raw.textContent = rawBlock.join("\n");
        item.appendChild(raw);

        addText(item, "p", "Review required before structured entry.");
        card.appendChild(item);
      });

      preview.appendChild(card);
    });

    addText(
      preview,
      "h3",
      "Preview diagnostic: " + raceHeaders.length +
        " race sections | " + totalRunnerCandidates +
        " runner candidates. Review-only; no database writes."
    );
  });
})();
