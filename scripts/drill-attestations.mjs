// Parts of roadmap step 5 cannot be proven by a runner: an alert email has to
// arrive in a human's inbox, a real R2 upload needs real credentials, the live
// cutover must never be automated, and the incident-release path is only
// meaningful when a person runs it from a laptop. Those are recorded by hand in
// docs/backend/PRODUCTION_DRILL_LOG.md; this checks the record is real, complete,
// and recent enough to still mean something.

import { readFile } from "node:fs/promises";

const LOG_PATH = "docs/backend/PRODUCTION_DRILL_LOG.md";
const MAXIMUM_AGE_DAYS = 180;

const REQUIRED_DRILLS = [
  {
    id: "alert-delivery",
    needsElapsed: false,
    proves:
      "a CPU, memory, disk, or uptime alert actually reached an operator's inbox",
  },
  {
    id: "r2-upload",
    needsElapsed: false,
    proves:
      "both encrypted archives reached R2 and local copies past the retention horizon were pruned",
  },
  {
    id: "isolated-restore",
    needsElapsed: true,
    proves: "a timed isolated restore on the live host from a real archive",
  },
  {
    id: "live-cutover",
    needsElapsed: true,
    proves:
      "the offline cutover and rollback rehearsal on the live host, with its recovery duration",
  },
  {
    id: "incident-release",
    needsElapsed: false,
    proves:
      "release.sh shipped a revision from an operator's machine with GitHub Actions unused",
  },
];

const PLACEHOLDERS = new Set(["", "-", "--", "—", "n/a", "na", "tbd", "todo"]);

const isMissing = (value) => PLACEHOLDERS.has(value.trim().toLowerCase());

function parseRows(markdown) {
  const rows = new Map();
  for (const line of markdown.split("\n")) {
    if (!line.trim().startsWith("|")) {
      continue;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 5 || /^-+$/.test(cells[0])) {
      continue;
    }
    const id = cells[0].replaceAll("`", "");
    if (REQUIRED_DRILLS.some((drill) => drill.id === id)) {
      rows.set(id, {
        date: cells[1],
        operators: cells[2],
        elapsed: cells[3],
        evidence: cells[4],
      });
    }
  }
  return rows;
}

function checkRow(drill, row, today) {
  if (!row) {
    return [`has no row in ${LOG_PATH}`];
  }
  const problems = [];
  if (isMissing(row.date)) {
    problems.push("has no date");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
    problems.push(`has the date "${row.date}", which is not YYYY-MM-DD`);
  } else {
    const performed = new Date(`${row.date}T00:00:00Z`);
    if (Number.isNaN(performed.valueOf())) {
      problems.push(`has the unparseable date "${row.date}"`);
    } else if (performed > today) {
      problems.push(`is dated ${row.date}, which is in the future`);
    } else {
      const ageDays = Math.floor((today - performed) / 86_400_000);
      if (ageDays > MAXIMUM_AGE_DAYS) {
        problems.push(
          `was last performed ${ageDays} days ago, over the ${MAXIMUM_AGE_DAYS}-day limit`,
        );
      }
    }
  }
  if (isMissing(row.operators)) {
    problems.push("names no operator");
  }
  if (drill.needsElapsed && isMissing(row.elapsed)) {
    problems.push(
      "records no elapsed time, which this drill exists to measure",
    );
  }
  if (isMissing(row.evidence)) {
    problems.push("cites no evidence");
  }
  return problems;
}

const markdown = await readFile(LOG_PATH, "utf8");
const rows = parseRows(markdown);
const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

const failures = [];
for (const drill of REQUIRED_DRILLS) {
  const problems = checkRow(drill, rows.get(drill.id), today);
  if (problems.length === 0) {
    console.log(`attestation ok: ${drill.id} (${rows.get(drill.id).date})`);
  } else {
    failures.push(`${drill.id} ${problems.join("; ")}`);
  }
}

if (failures.length > 0) {
  console.error(
    `\n${failures.length} of ${REQUIRED_DRILLS.length} operator attestations are not satisfied:\n`,
  );
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error(
    `\nRecord each drill in ${LOG_PATH} after performing it. What each one must prove:\n`,
  );
  for (const drill of REQUIRED_DRILLS) {
    console.error(`  - ${drill.id}: ${drill.proves}`);
  }
  console.error(
    "\nNever record a PIN, QR URL, session token, private key, or child-level data.",
  );
  process.exit(1);
}

console.log(
  `\nAll ${REQUIRED_DRILLS.length} operator attestations are dated, attributed, and within ${MAXIMUM_AGE_DAYS} days.`,
);
