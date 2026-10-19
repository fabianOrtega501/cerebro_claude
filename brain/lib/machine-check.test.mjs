/** Tests of machine-check.mjs over simulated modules and history. Run: node --test --experimental-test-module-mocks <this file>. */
import { after, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

const NAMES = ["performance", "updates", "hardware", "system", "storage"];
const SAVED_PATH = "/fake/history/2026-10-19T10-00-00-000Z.json";

describe("machine-check", () => {
	const mocks = [];
	let ran;
	let saves;
	let saveFails;
	let thrown;
	let runs = 0;

	/** Imports the script with the given arguments; returns stdout, stderr and the exit code (`null` if it ended normally). */
	const check = async (...args) => {
		const out = [];
		const err = [];
		const log = mock.method(console, "log", text => out.push(String(text)));
		const error = mock.method(console, "error", text => err.push(String(text)));
		const exit = mock.method(process, "exit", code => {
			throw { exitCode: code };
		});
		const argv = process.argv;
		let code = null;

		process.argv = ["node", "machine-check.mjs", ...args];

		try {
			await import(`./machine-check.mjs?run=${runs++}`);
		}
		catch (thrown) {
			if (!(thrown && "exitCode" in thrown))
				throw thrown;

			code = thrown.exitCode;
		}
		finally {
			process.argv = argv;
			[log, error, exit].forEach(m => m.mock.restore());
		}

		return { out: out.join("\n"), err: err.join("\n"), code };
	};

	before(() => {
		for (const name of NAMES)
			mocks.push(mock.module(new URL(`./machine/${name}.mjs`, import.meta.url).href, {
				exports: {
					run: () => {
						ran.push(name);

						return name === "storage"
							? { findings: [{ level: "error", area: "storage", message: "/ al 99% (1 GB libres). Casi lleno" }], metrics: { "diskUsed_/": { label: "Uso de /", value: 99, unit: "GB" } } }
							: { findings: [{ level: "info", area: name, message: `${name} ok` }], metrics: {} };
					},
				},
			}));

		mocks.push(mock.module(new URL("./machine/history.mjs", import.meta.url).href, {
			exports: {
				compare: () => [{ key: "diskUsed_/", label: "Uso de /", unit: "GB", before: 80, after: 99, since: "2026-10-18T10:00:00.000Z" }],
				save: snapshot => {
					if (saveFails)
						throw thrown;

					saves.push(snapshot);

					return SAVED_PATH;
				},
			},
		}));
	});

	after(() => mocks.forEach(m => m.restore()));

	beforeEach(() => {
		ran = [];
		saves = [];
		saveFails = false;
		thrown = new Error("ENOSPC: no space left on device");
	});

	it("text report survives save failure", async () => {
		saveFails = true;
		const { out, err, code } = await check();

		assert.equal(code, 1);
		assert.match(out, /^Diagnostico del computador \(performance, updates, hardware, system, storage\): 1 error/);
		assert.match(out, /ERROR \[storage\] \/ al 99%/);
		assert.match(out, /Uso de \/: 80 -> 99 GB/);
		assert.doesNotMatch(out, /Guardado en/);
		assert.match(err, /No se pudo guardar en el historial: ENOSPC/);
		assert.deepEqual(ran, NAMES);
	});

	it("json report survives save failure", async () => {
		saveFails = true;
		const { out, err, code } = await check("--json");
		const report = JSON.parse(out);

		assert.equal(code, 1);
		assert.equal(report.saved, null);
		assert.deepEqual(Object.keys(report), ["date", "modules", "metrics", "findings", "changes", "saved"]);
		assert.equal(report.findings[0].level, "error");
		assert.equal(report.changes.length, 1);
		assert.match(err, /No se pudo guardar en el historial: ENOSPC/);
	});

	it("non-Error throw still reported", async () => {
		saveFails = true;
		thrown = { code: "ENOSPC" };
		const text = await check();

		assert.equal(text.code, 1);
		assert.match(text.out, /ERROR \[storage\] \/ al 99%/);
		assert.doesNotMatch(text.out, /Guardado en/);
		assert.match(text.err, /No se pudo guardar en el historial: \{"code":"ENOSPC"\}/);

		thrown = undefined;
		const json = await check("--json");

		assert.equal(json.code, 1);
		assert.equal(JSON.parse(json.out).saved, null);
		assert.match(json.err, /No se pudo guardar en el historial: undefined/);
	});

	it("successful save keeps text output", async () => {
		const { out, err, code } = await check();

		assert.equal(code, null);
		assert.equal(saves.length, 1);
		assert.match(out, new RegExp(`Guardado en ${SAVED_PATH}`));
		assert.equal(err, "");
	});

	it("successful save keeps json output", async () => {
		const { out, err, code } = await check("--json");

		assert.equal(code, 0);
		assert.equal(JSON.parse(out).saved, SAVED_PATH);
		assert.equal(err, "");
	});

	it("no-save skips save", async () => {
		saveFails = true;
		const { out, err, code } = await check("--no-save");

		assert.equal(code, null);
		assert.equal(saves.length, 0);
		assert.doesNotMatch(out, /Guardado en/);
		assert.equal(err, "");
	});

	it("only without value fails", async () => {
		const { out, err, code } = await check("--only");

		assert.equal(code, 2);
		assert.equal(err, `Falta la lista de modulos despues de --only. Disponibles: ${NAMES.join(", ")}`);
		assert.equal(out, "");
		assert.deepEqual(ran, []);
		assert.equal(saves.length, 0);
	});

	it("only followed by flag fails", async () => {
		const { err, code } = await check("--only", "--json");

		assert.equal(code, 2);
		assert.match(err, /^Falta la lista de modulos despues de --only/);
		assert.doesNotMatch(err, /desconocido/);
		assert.deepEqual(ran, []);
		assert.equal(saves.length, 0);
	});

	it("valid only runs selection", async () => {
		const { out, code } = await check("--only", "storage", "--no-save");

		assert.equal(code, null);
		assert.deepEqual(ran, ["storage"]);
		assert.match(out, /^Diagnostico del computador \(storage\)/);
	});

	it("unknown module keeps message", async () => {
		const { err, code } = await check("--only", "storage,disco");

		assert.equal(code, 2);
		assert.equal(err, `Modulo(s) desconocido(s): disco. Disponibles: ${NAMES.join(", ")}`);
		assert.deepEqual(ran, []);
		assert.equal(saves.length, 0);
	});
});
