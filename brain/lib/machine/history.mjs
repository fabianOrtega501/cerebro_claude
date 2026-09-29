/** History of machine checks: one JSON per run in brain/machine/history, compared metric by metric. */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { list } from "./context.mjs";

const DIR = join(homedir(), ".claude", "brain", "machine", "history");
const KEEP = 200;

/** Saved snapshots, newest first. */
function snapshots() {
	return list(DIR).filter(f => f.endsWith(".json")).sort().reverse()
		.map(f => {
			try {
				return JSON.parse(readFileSync(join(DIR, f), "utf8"));
			}
			catch {
				return null;
			}
		})
		.filter(Boolean);
}

/** Changes above 5% of each metric against the latest earlier snapshot that measured it. */
export function compare(metrics) {
	const past = snapshots();
	const changes = [];

	for (const [key, now] of Object.entries(metrics)) {
		const before = past.find(s => s.metrics?.[key]);

		// Below 5% the difference is sampling noise, not a trend.
		if (before && Math.abs(now.value - before.metrics[key].value) > Math.abs(before.metrics[key].value) * 0.05)
			changes.push({ key, label: now.label, unit: now.unit, before: before.metrics[key].value, after: now.value, since: before.date });
	}

	return changes;
}

/** Writes the snapshot and prunes beyond `KEEP`. Returns the file path. */
export function save(snapshot) {
	mkdirSync(DIR, { recursive: true });

	const file = join(DIR, `${snapshot.date.replace(/[:.]/g, "-")}.json`);

	writeFileSync(file, JSON.stringify(snapshot, null, 2));

	for (const old of list(DIR).filter(f => f.endsWith(".json")).sort().reverse().slice(KEEP))
		unlinkSync(join(DIR, old));

	return file;
}
