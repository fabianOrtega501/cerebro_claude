/** Tests of history.mjs `save()` over an in-memory filesystem. Run: node --test --experimental-test-module-mocks <this file>. */
import { after, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as context from "./context.mjs";

const REAL_DIR = join(homedir(), ".claude", "brain", "machine", "history");
const KEEP = 200;

describe("history save", () => {
	const files = new Map();
	const realBefore = existsSync(REAL_DIR) ? readdirSync(REAL_DIR).sort() : [];
	let mocks;
	let save;

	const nameOf = path => path.split("/").at(-1);
	const fileName = date => `${date.replace(/[:.]/g, "-")}.json`;

	/** Fills the fake history with `n` snapshots, one minute apart from `start`, oldest first. */
	const seed = (n, start = "2026-01-01T00:00:00.000Z") => {
		const dates = Array.from({ length: n }, (_, i) => new Date(Date.parse(start) + i * 60000).toISOString());

		for (const date of dates)
			files.set(fileName(date), JSON.stringify({ date }));

		return dates;
	};

	before(async () => {
		mocks = [
			mock.module(new URL("./context.mjs", import.meta.url).href, {
				exports: { ...context, list: () => [...files.keys()] },
			}),
			mock.module("node:fs", {
				exports: {
					mkdirSync: () => undefined,
					writeFileSync: (path, data) => files.set(nameOf(path), data),
					readFileSync: path => files.get(nameOf(path)),
					unlinkSync: path => files.delete(nameOf(path)),
				},
			}),
		];
		({ save } = await import("./history.mjs?mocked"));
	});

	after(() => mocks.forEach(m => m.restore()));

	beforeEach(() => files.clear());

	it("writes the snapshot file", () => {
		const snapshot = { date: "2026-10-18T10:00:00.000Z", modules: ["storage"], metrics: {}, findings: [] };
		const path = save(snapshot);

		assert.equal(nameOf(path), "2026-10-18T10-00-00-000Z.json");
		assert.deepEqual(JSON.parse(files.get(nameOf(path))), snapshot);
	});

	it("199 existing keeps all", () => {
		const dates = seed(199);

		save({ date: "2026-12-01T00:00:00.000Z" });

		assert.equal(files.size, KEEP);
		assert.ok(dates.every(d => files.has(fileName(d))));
	});

	it("200 existing drops oldest", () => {
		const dates = seed(200);
		const path = save({ date: "2026-12-01T00:00:00.000Z" });

		assert.equal(files.size, KEEP);
		assert.ok(files.has(nameOf(path)));
		assert.equal(files.has(fileName(dates[0])), false);
		assert.ok(files.has(fileName(dates[1])));
	});

	it("201 existing drops two oldest", () => {
		const dates = seed(201);
		const path = save({ date: "2026-12-01T00:00:00.000Z" });

		assert.equal(files.size, KEEP);
		assert.ok(files.has(nameOf(path)));
		assert.equal(files.has(fileName(dates[0])), false);
		assert.equal(files.has(fileName(dates[1])), false);
		assert.ok(files.has(fileName(dates[2])));
	});

	it("older new snapshot survives pruning", () => {
		const dates = seed(200);
		const path = save({ date: "2000-01-01T00:00:00.000Z" });

		assert.equal(files.size, KEEP);
		assert.ok(files.has(nameOf(path)));
		assert.equal(files.has(fileName(dates[0])), false);
		assert.ok(files.has(fileName(dates.at(-1))));
	});

	it("real history stays untouched", () => {
		seed(200);
		save({ date: "2000-01-01T00:00:00.000Z" });

		assert.deepEqual(existsSync(REAL_DIR) ? readdirSync(REAL_DIR).sort() : [], realBefore);
	});
});
