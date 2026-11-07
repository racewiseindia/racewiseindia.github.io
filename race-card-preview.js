/*
 * RACEWISE INDIA
 * Review-only race card preview
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
      .filter(line => line && !/^===== PAGE \d+ =====$/.test(line));

    const headers = [];

    lines.forEach((line, index) => {
      const match = line.match(/^(\d{1,2})\s*\|\s*(\d{3,4})\s*M/i);
      if (match) {
        headers.push({
          index,
          number: Number(match[1]),
          distance: Number(match[2])
        });
      }
    });

    preview.replaceChildren();
    preview.style.display = "block";

    const note = document.createElement("p");
    note.textContent =
      "Review-only preview. Nothing is saved to the database.";
    preview.appendChild(note);

    if (!headers.length) {
      preview.append("No race sections confidently detected.");
      return;
    }

    headers.forEach((race, position) => {
      const end = position + 1 < headers.length
        ? headers[position + 1].index
        : lines.length;

      const section = lines.slice(race.index, end);

      const card = document.createElement("section");
      card.style.cssText =
        "border:1px solid #ddd;padding:12px;margin:12px 0;border-radius:8px";

      const heading = document.createElement("h3");
      heading.textContent = "Race " + race.number;
      card.appendChild(heading);

      const distance = document.createElement("p");
      distance.textContent =
        "Distance candidate: " + race.distance + " metres";
      card.appendChild(distance);

      const candidates = [];

      for (let i = 0; i < section.length - 1; i++) {
        if (!/^(0|[1-9]\d{0,2})$/.test(section[i])) continue;

        const name = section[i + 1];

        if (/^[A-Z][A-Z0-9 .'-]{1,35}$/.test(name)) {
          candidates.push({
            rating: section[i],
            name: name,
            context: section.slice(i, i + 5).join("\n")
          });
        }
      }

      const count = document.createElement("p");
      count.textContent =
        candidates.length + " possible runner names — not verified";
      card.appendChild(count);

      candidates.forEach(candidate => {
        const item = document.createElement("div");
        item.style.cssText =
          "background:#f5f5f5;padding:9px;margin:8px 0";

        const name = document.createElement("strong");
        name.textContent =
          candidate.name + " | Rating candidate: " + candidate.rating;
        item.appendChild(name);

        const raw = document.createElement("pre");
        raw.style.whiteSpace = "pre-wrap";
        raw.textContent = candidate.context;
        item.appendChild(raw);

        const warning = document.createElement("p");
        warning.textContent = "Needs manual review";
        item.appendChild(warning);

        card.appendChild(item);
      });

      preview.appendChild(card);
    });
  });
})();
