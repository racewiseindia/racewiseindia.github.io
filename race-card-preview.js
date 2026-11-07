/*
 * RACEWISE INDIA
 * Conservative race-card preview
 * Review only — no database writes
 */

(function () {
  const output = document.getElementById("pdfTextOutput");
  const button = document.getElementById("buildRacePreviewBtn");
  const preview = document.getElementById("raceCardPreview");

  if (!output || !button || !preview) return;

  button.addEventListener("click", function () {
    const lines = output.textContent
      .split("\n")
      .map(line => line.trim())
      .filter(line =>
        line &&
        !/^===== PAGE \d+ =====$/.test(line)
      );

    const raceHeaders = [];

    lines.forEach((line, index) => {
      const match = line.match(
        /^(\d{1,2})\s*\|\s*(\d{3,4})\s*M\b/i
      );

      if (match) {
        const possibleTitle = index > 0 ? lines[index - 1] : "";

        raceHeaders.push({
          index,
          title: /^The\b/i.test(possibleTitle)
            ? possibleTitle
            : "Race " + Number(match[1]),
          number: Number(match[1]),
          distance: Number(match[2])
        });
      }
    });

    preview.replaceChildren();
    preview.style.display = "block";

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
      addText(preview, "p", "No race sections confidently detected.");
      return;
    }

    raceHeaders.forEach((race, position) => {
      const nextRace = raceHeaders[position + 1];

      // End this race before the next race's title.
      const end = nextRace
        ? Math.max(race.index + 1, nextRace.index - 1)
        : lines.length;

      const section = lines.slice(race.index, end);

      const card = document.createElement("section");
      card.style.cssText =
        "border:1px solid #c9ad70;padding:12px;margin:14px 0;border-radius:8px";

      addText(card, "h3", race.title);
      addText(card, "p", "Race number: " + race.number);
      addText(card, "p", "Distance: " + race.distance + " metres");

      // Preserve the original condition lines instead of guessing.
      const conditionLines = [];

      for (let i = 1; i < section.length; i++) {
        const line = section[i];

        if (
          /^Winner\s*:/i.test(line) ||
          /^Record Time\s*:/i.test(line) ||
          /^No\s*\|\s*Silk/i.test(line) ||
          /^Previous Runs/i.test(line)
        ) {
          break;
        }

        conditionLines.push(line);

        if (conditionLines.length >= 6) break;
      }

      addText(
        card,
        "p",
        "Race conditions — original extracted text:"
      );

      const conditions = document.createElement("pre");
      conditions.style.cssText =
        "white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px";
      conditions.textContent = conditionLines.length
        ? conditionLines.join("\n")
        : "Not confidently detected";

      card.appendChild(conditions);

      // Find the scheduled time near the race heading.
      let timeText = "Not confidently detected";

      for (let i = 0; i < Math.min(section.length, 12); i++) {
        const match = section[i].match(/\b(\d{1,2}:\d{2})\b/);

        if (!match) continue;

        let period = "";

        for (
          let j = i;
          j < Math.min(section.length, i + 4);
          j++
        ) {
          const periodMatch = section[j].match(/\b(AM|PM)\b/i);

          if (periodMatch) {
            period = periodMatch[1].toUpperCase();
            break;
          }
        }

        timeText = match[1] + (period ? " " + period : "");
        break;
      }

      addText(card, "p", "Scheduled time candidate: " + timeText);

      // Detect runner blocks without assigning shifting columns.
      const runnerStarts = [];

      for (let i = 1; i < section.length; i++) {
        const details = section[i];

        if (!details.includes("|")) continue;
        if (!/\b\d{1,2}y\b/i.test(details)) continue;

        const possibleName = section[i - 1];

        if (
          /^[A-Z][A-Z0-9 .'-]{1,45}$/.test(possibleName) &&
          !/^(LAST|PREVIOUS|TRACK|WINNER|RECORD|HORSE|CLASS)$/i.test(possibleName)
        ) {
          runnerStarts.push({
            nameIndex: i - 1,
            detailsIndex: i,
            name: possibleName,
            details: details
          });
        }
      }

      addText(
        card,
        "h4",
        runnerStarts.length + " detected runner blocks"
      );

      runnerStarts.forEach((runner, runnerIndex) => {
        const item = document.createElement("div");

        item.style.cssText =
          "background:#f4f5f7;padding:10px;margin:9px 0;border-radius:6px";

        addText(item, "strong", runner.name);

        addText(
          item,
          "p",
          "Structured owner / trainer / jockey / weight: Not parsed — manual verification required."
        );

        const fields = runner.details
          .split("|")
          .map(value => value.trim());

        const lastField = fields[fields.length - 1];

        addText(
          item,
          "p",
          /^\d{1,3}$/.test(lastField)
            ? "Last numeric field candidate: " + lastField +
              " — verify against the official Rtg column."
            : "Rating: Not confidently detected."
        );

        const nextRunner = runnerStarts[runnerIndex + 1];

        const blockEnd = nextRunner
          ? nextRunner.nameIndex
          : section.length;

        const rawBlock = section.slice(
          runner.nameIndex,
          blockEnd
        );

        addText(item, "p", "Original runner text:");

        const raw = document.createElement("pre");

        raw.style.cssText =
          "white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px";

        raw.textContent = rawBlock.join("\n");
        item.appendChild(raw);

        addText(item, "p", "Manual verification required.");

        card.appendChild(item);
      });

      preview.appendChild(card);
    });
  });
})();
