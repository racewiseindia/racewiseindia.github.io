/*
 * RACEWISE INDIA
 * Improved review-only race card preview
 * No database writes
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
        raceHeaders.push({
          index,
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
      const start = race.index;
      const end = position + 1 < raceHeaders.length
        ? raceHeaders[position + 1].index
        : lines.length;

      const section = lines.slice(start, end);

      const card = document.createElement("section");
      card.style.cssText =
        "border:1px solid #c9ad70;padding:12px;margin:14px 0;border-radius:8px";

      const titleLine = start > 0 ? lines[start - 1] : "";

      addText(
        card,
        "h3",
        titleLine && !/^\d+$/.test(titleLine)
          ? titleLine
          : "Race " + race.number
      );

      addText(card, "p", "Race number: " + race.number);
      addText(card, "p", "Distance: " + race.distance + " metres");

      const classLine = section.find(line =>
        /\bClass\s+\d+\b/i.test(line)
      );

      addText(
        card,
        "p",
        "Class / conditions candidate: " +
          (classLine || "Not confidently detected")
      );

      let timeText = "Not confidently detected";

      for (let i = 0; i < Math.min(section.length, 8); i++) {
        const match = section[i].match(/\b(\d{1,2}:\d{2})\b/);

        if (match) {
          let period = "";

          for (let j = i; j < Math.min(section.length, i + 3); j++) {
            const periodMatch = section[j].match(/\b(AM|PM)\b/i);
            if (periodMatch) {
              period = periodMatch[1].toUpperCase();
              break;
            }
          }

          timeText = match[1] + (period ? " " + period : "");
          break;
        }
      }

      addText(card, "p", "Scheduled time candidate: " + timeText);

      const runnerStarts = [];

      for (let i = 1; i < section.length; i++) {
        const details = section[i];

        if (!/\|\s*/.test(details)) continue;
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

        const fields = runner.details
          .split("|")
          .map(value => value.trim());

        addText(
          item,
          "p",
          "Age / colour: " + (fields[0] || "Not detected")
        );

        addText(
          item,
          "p",
          "Owner: " + (fields[1] || "Not detected")
        );

        addText(
          item,
          "p",
          "Trainer: " + (fields[2] || "Not detected")
        );

        addText(
          item,
          "p",
          "Jockey: " + (fields[3] || "Not detected")
        );

        addText(
          item,
          "p",
          "Weight: " + (fields[4] || "Not detected")
        );

        if (fields.length >= 9) {
          addText(item, "p", "Allowance: " + fields[5]);
          addText(item, "p", "Shoe: " + fields[6]);
          addText(item, "p", "Equipment: " + fields[7]);
        } else if (fields.length >= 8) {
          addText(item, "p", "Shoe: " + fields[5]);
          addText(item, "p", "Equipment: " + fields[6]);
        }

        const rating = fields[fields.length - 1];

        addText(
          item,
          "p",
          /^\d{1,3}$/.test(rating)
            ? "Card rating candidate: " + rating
            : "Card rating: Not confidently detected"
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
