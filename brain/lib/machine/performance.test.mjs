/** Regression tests of performance.mjs. Run: node --test --experimental-test-module-mocks <this file>. */
import { after, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as context from "./context.mjs";
import { parseLoadavg } from "./performance.mjs";

const HUGE = "1".repeat(400);

describe("parseLoadavg invalid input", () => {
	const cases = [
		null, undefined, 42, {}, "", " ", "1.0 2.0", "1 2", "1", "a b c", "1 abc 3",
		"NaN 1 1", "Infinity 1 1", "-1 1 1", "1 -2 3", "1 2 -3", `${HUGE} 1 1`, `1 1 ${HUGE}`,
	];

	it("huge digits overflow to Infinity", () => {
		assert.equal(Number(HUGE), Infinity);
	});

	for (const input of cases)
		it(`rejects ${JSON.stringify(input)?.slice(0, 30) ?? "undefined"}`, () => {
			assert.deepEqual(parseLoadavg(input), { valid: false });
		});
});

describe("parseLoadavg valid input", () => {
	it("keeps zero load", () => {
		assert.deepEqual(parseLoadavg("0.00 0.00 0.00 1/500 1"), { valid: true, load1: 0, load5: 0, load15: 0 });
	});

	it("parses three averages", () => {
		assert.deepEqual(parseLoadavg("0.25 1.50 2.75 3/500 123"), { valid: true, load1: 0.25, load5: 1.5, load15: 2.75 });
	});

	it("accepts spaces and tabs", () => {
		assert.deepEqual(parseLoadavg("  0.25\t1.50 \t 2.75\t3/500  123\n"), { valid: true, load1: 0.25, load5: 1.5, load15: 2.75 });
	});

	it("returns numbers, not strings", () => {
		const { load1, load5, load15 } = parseLoadavg("0.25 1.50 2.75 3/500 123");

		for (const value of [load1, load5, load15])
			assert.equal(typeof value, "number");
	});

	it("accepts real /proc/loadavg", { skip: !existsSync("/proc/loadavg") && "/proc/loadavg does not exist" }, () => {
		const result = parseLoadavg(readFileSync("/proc/loadavg", "utf8"));

		assert.equal(result.valid, true);
	});
});

describe("module import", () => {
	it("exports parseLoadavg and run", async () => {
		const mod = await import("./performance.mjs");

		assert.equal(typeof mod.parseLoadavg, "function");
		assert.equal(typeof mod.run, "function");
	});
});

describe("run", () => {
	const loadFindings = findings => findings.filter(f => f.message.startsWith("Carga de "));

	it("measures valid load", async () => {
		const { run } = await import("./performance.mjs");
		const { findings, metrics } = run();

		assert.ok(metrics.load5);
		assert.ok(metrics.load5PerCore);
		assert.equal(loadFindings(findings).length, 1);
		assert.ok(metrics.memAvailablePct);
	});

	it("warns on failed read", async () => {
		const contextUrl = new URL("./context.mjs", import.meta.url).href;
		const mocked = mock.module(contextUrl, {
			exports: { ...context, read: path => path === "/proc/loadavg" ? null : context.read(path) },
		});

		try {
			const { run } = await import("./performance.mjs?invalid");
			const { findings, metrics } = run();
			const warnings = findings.filter(f => f.level === "aviso" && f.area === "performance" && f.message.startsWith("No se pudo medir la carga"));

			assert.equal(metrics.load5, undefined);
			assert.equal(metrics.load5PerCore, undefined);
			assert.equal(warnings.length, 1);
			assert.equal(loadFindings(findings).length, 0);
			assert.ok(metrics.memAvailablePct);
		}
		finally {
			mocked.restore();
		}
	});
});

describe("run with simulated meminfo", () => {
	const BASE = { MemTotal: 8000000, MemAvailable: 2000000, SwapTotal: 2097152, SwapFree: 1048576 };
	const RAM_WARNING = "No se pudo medir la memoria RAM";
	const SWAP_WARNING = "No se pudo medir el uso de swap";
	let meminfoText = null;
	let mocked;
	let run;

	/** Text of /proc/meminfo from `{ key: kB }`, dropping the keys listed in `drop`. */
	const meminfo = (values, drop = []) => Object.entries(values).filter(([k]) => !drop.includes(k)).map(([k, v]) => `${k}:  ${v} kB`).join("\n");

	/** Runs the module over the given /proc/meminfo text. */
	const runWith = text => {
		meminfoText = text;

		return run();
	};

	const starting = (findings, prefix) => findings.filter(f => f.area === "performance" && f.message.startsWith(prefix));
	const assertClean = findings => findings.forEach(f => assert.doesNotMatch(f.message, /NaN|Infinity|undefined/));

	before(async () => {
		mocked = mock.module(new URL("./context.mjs", import.meta.url).href, {
			exports: {
				...context,
				read: path => path === "/proc/meminfo" ? meminfoText : context.read(path),
				sh: () => null,
				has: () => false,
			},
		});
		({ run } = await import("./performance.mjs?meminfo"));
	});

	after(() => mocked.restore());

	it("records valid RAM and swap", () => {
		const { findings, metrics } = runWith(meminfo(BASE));

		assert.equal(metrics.memAvailablePct.value, 25);
		assert.equal(metrics.swapUsed.value, 1);
		assert.equal(metrics.swapUsed.unit, "GB");
		assert.deepEqual(starting(findings, "RAM: "), [{ level: "info", area: "performance", message: "RAM: 1.9 GB disponibles de 7.6 GB (25%); swap en uso 1.0 GB de 2.0 GB." }]);
		assert.equal(starting(findings, RAM_WARNING).length, 0);
		assert.equal(starting(findings, SWAP_WARNING).length, 0);
	});

	it("keeps RAM thresholds", () => {
		const low = runWith(meminfo({ ...BASE, MemAvailable: 320000 })).findings;
		const tight = runWith(meminfo({ ...BASE, MemAvailable: 640000 })).findings;

		assert.equal(starting(low, "RAM: ")[0].level, "error");
		assert.match(starting(low, "RAM: ")[0].message, /La memoria esta agotada\.$/);
		assert.equal(starting(tight, "RAM: ")[0].level, "aviso");
		assert.match(starting(tight, "RAM: ")[0].message, /Queda poca memoria\.$/);
	});

	for (const [name, text] of [
		["missing MemAvailable", meminfo(BASE, ["MemAvailable"])],
		["missing MemTotal", meminfo(BASE, ["MemTotal"])],
		["zero MemTotal", meminfo({ ...BASE, MemTotal: 0 })],
		["MemAvailable above MemTotal", meminfo({ ...BASE, MemAvailable: 9000000 })],
	])
		it(`invalid RAM: ${name}`, () => {
			const { findings, metrics } = runWith(text);

			assert.equal(metrics.memAvailablePct, undefined);
			assert.equal(starting(findings, "RAM: ").length, 0);
			assert.deepEqual(starting(findings, RAM_WARNING).map(f => f.level), ["aviso"]);
			assert.equal(metrics.swapUsed.value, 1);
			assert.deepEqual(starting(findings, "Swap: ").map(f => [f.level, f.message]), [["info", "Swap: swap en uso 1.0 GB de 2.0 GB."]]);
			assertClean(findings);
		});

	for (const [name, text] of [
		["missing SwapTotal", meminfo(BASE, ["SwapTotal"])],
		["missing SwapFree", meminfo(BASE, ["SwapFree"])],
		["SwapFree above SwapTotal", meminfo({ ...BASE, SwapFree: 3000000 })],
	])
		it(`invalid swap: ${name}`, () => {
			const { findings, metrics } = runWith(text);

			assert.equal(metrics.swapUsed, undefined);
			assert.deepEqual(starting(findings, SWAP_WARNING).map(f => f.level), ["aviso"]);
			assert.equal(metrics.memAvailablePct.value, 25);
			assert.deepEqual(starting(findings, "RAM: ").map(f => [f.level, f.message]), [["info", "RAM: 1.9 GB disponibles de 7.6 GB (25%)."]]);
			assert.equal(starting(findings, "Swap: ").length, 0);
			assertClean(findings);
		});

	it("both invalid, run completes", () => {
		const { findings, metrics } = runWith(null);

		assert.equal(metrics.memAvailablePct, undefined);
		assert.equal(metrics.swapUsed, undefined);
		assert.equal(starting(findings, RAM_WARNING).length, 1);
		assert.equal(starting(findings, SWAP_WARNING).length, 1);
		assert.equal(starting(findings, "RAM: ").length + starting(findings, "Swap: ").length, 0);
		assert.ok(metrics.load5);
		assert.ok(metrics.psi_cpu);
		assertClean(findings);
	});

	it("disabled swap records zero", () => {
		const { findings, metrics } = runWith(meminfo({ ...BASE, SwapTotal: 0, SwapFree: 0 }));

		assert.equal(metrics.swapUsed.value, 0);
		assert.equal(starting(findings, SWAP_WARNING).length, 0);
		assert.equal(starting(findings, "RAM: ")[0].message, "RAM: 1.9 GB disponibles de 7.6 GB (25%); swap en uso 0 B de 0 B.");
		assertClean(findings);
	});
});
