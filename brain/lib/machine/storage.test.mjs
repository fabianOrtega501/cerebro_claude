/** Tests of storage.mjs over simulated commands. Run: node --test --experimental-test-module-mocks <this file>. */
import { after, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import * as context from "./context.mjs";

const GB = 1024 ** 3;
const DF = [
	"Filesystem 1024-blocks Used Available Capacity Mounted on",
	"/dev/nvme0n1p2 100000000 70000000 30000000 70% /",
	"/dev/nvme0n1p1 1000000 900000 100000 90% /boot/efi",
	"/dev/sda1 1000000 960000 40000 96% /datos",
].join("\n");
const DF_INODES = [
	"Filesystem Inodes IUsed IFree IUse% Mounted on",
	"/dev/nvme0n1p2 1000 920 80 92% /",
	"/dev/sda1 1000 100 900 10% /datos",
].join("\n");
const JOURNAL = "Archived and active journals take up 726.1M in the file system.\n";

describe("storage run", () => {
	let state;
	let existing;
	let mocks;
	let run;

	/** Default command outputs; each test overrides what it needs. */
	const defaults = () => ({ df: DF, dfInodes: DF_INODES, journal: JOURNAL, cache: `${GB}\t/home/x/.cache\n`, apt: "0\t/var/cache/apt/archives\n", trash: "0\t/home/x/.local/share/Trash\n" });

	/** Simulated `sh`: df, journalctl and du answer from `state`; anything else fails. */
	const sh = (cmd, args = []) => {
		if (cmd === "df")
			return args.includes("-i") ? state.dfInodes : state.df;

		if (cmd === "journalctl")
			return state.journal;

		if (cmd === "du" && args[0] === "-sb") {
			const path = args[1];

			return path.endsWith(".cache") ? state.cache : path.endsWith("Trash") ? state.trash : state.apt;
		}

		return cmd === "du" ? "" : null;
	};

	const starting = (findings, prefix) => findings.filter(f => f.area === "storage" && f.message.startsWith(prefix));
	const levelOf = (findings, mount) => findings.find(f => f.message.startsWith(`${mount} al `))?.level;

	before(async () => {
		mocks = [
			mock.module(new URL("./context.mjs", import.meta.url).href, {
				exports: { ...context, sh, has: () => false, list: () => [] },
			}),
			mock.module("node:fs", { exports: { existsSync: path => existing.has(path) } }),
		];
		({ run } = await import("./storage.mjs?mocked"));
	});

	after(() => mocks.forEach(m => m.restore()));

	beforeEach(() => {
		state = defaults();
		existing = new Set();
	});

	it("keeps partition and inode thresholds", () => {
		const { findings, metrics } = run();

		assert.equal(levelOf(findings, "/"), "info");
		assert.equal(levelOf(findings, "/boot/efi"), "aviso");
		assert.equal(levelOf(findings, "/datos"), "error");
		assert.match(findings.find(f => f.message.startsWith("/datos al ")).message, /^\/datos al 96% \(.+ libres\)\. Casi lleno/);
		assert.equal(metrics["diskUsed_/"].value, Math.round(70000000 * 1024 / GB * 100) / 100);
		assert.deepEqual(starting(findings, "/ tiene ocupado").map(f => f.level), ["aviso"]);
		assert.equal(starting(findings, "/datos tiene ocupado").length, 0);
		assert.equal(starting(findings, "No se pudo").length, 0);
	});

	it("failed partitions keep inodes", () => {
		state.df = null;
		const { findings, metrics } = run();

		assert.deepEqual(starting(findings, "No se pudo consultar el uso").map(f => [f.level, f.message]),
			[["aviso", "No se pudo consultar el uso de las particiones con df."]]);
		assert.equal(Object.keys(metrics).filter(k => k.startsWith("diskUsed_")).length, 0);
		assert.equal(starting(findings, "/ tiene ocupado").length, 1);
	});

	it("failed inodes keep partitions", () => {
		state.dfInodes = null;
		const { findings, metrics } = run();

		assert.deepEqual(starting(findings, "No se pudo consultar el uso").map(f => f.message), ["No se pudo consultar el uso de los inodos con df."]);
		assert.equal(Object.keys(metrics).filter(k => k.startsWith("diskUsed_")).length, 3);
		assert.equal(levelOf(findings, "/datos"), "error");
		assert.equal(findings.filter(f => f.message.includes("inodos:")).length, 0);
	});

	it("both df fail, one warning", () => {
		Object.assign(state, { df: null, dfInodes: null });
		const { findings, metrics } = run();

		assert.deepEqual(starting(findings, "No se pudo consultar el uso").map(f => f.message), ["No se pudo consultar el uso de las particiones ni de los inodos con df."]);
		assert.equal(Object.keys(metrics).filter(k => k.startsWith("diskUsed_")).length, 0);
		assert.equal(findings.filter(f => / al \d+%|inodos:/.test(f.message)).length, 0);
		assert.ok(metrics.journal);
		assert.ok(metrics.homeCache);
	});

	it("failed cache du warns", () => {
		state.cache = null;
		const { findings, metrics } = run();

		assert.equal(metrics.homeCache, undefined);
		assert.deepEqual(starting(findings, "No se pudo medir").map(f => [f.level, f.message]), [["aviso", "No se pudo medir el tamano de ~/.cache con du."]]);
		assert.equal(findings.filter(f => f.message.includes("~/.cache:")).length, 0);
		assert.ok(metrics.journal);
	});

	it("valid cache du records size", () => {
		state.cache = `${3 * GB}\t/home/x/.cache\n`;
		const { findings, metrics } = run();

		assert.equal(metrics.homeCache.value, 3);
		assert.equal(findings.filter(f => f.message.startsWith("Espacio recuperable — ~/.cache: 3.0 GB")).length, 1);
	});

	it("partial du keeps total", () => {
		state.cache = `${GB}\t/home/x/.cache\n`;
		const { findings, metrics } = run();

		assert.equal(metrics.homeCache.value, 1);
		assert.equal(starting(findings, "No se pudo medir").length, 0);
	});

	it("missing folder stays zero", () => {
		Object.assign(state, { cache: "", trash: "", apt: "" });
		const { findings, metrics } = run();

		assert.equal(metrics.homeCache.value, 0);
		assert.equal(starting(findings, "No se pudo medir").length, 0);
		assert.equal(findings.filter(f => f.message.startsWith("Espacio recuperable")).length, 0);
	});

	it("unmeasurable existing folder warns", () => {
		Object.assign(state, { trash: "", apt: null });
		existing.add(join(homedir(), ".local/share/Trash"));
		const { findings } = run();

		assert.deepEqual(starting(findings, "No se pudo medir").map(f => f.message).sort(),
			["No se pudo medir el tamano de /var/cache/apt/archives con du.", "No se pudo medir el tamano de la papelera con du."]);
		assert.equal(findings.filter(f => /Papelera:|Paquetes descargados de apt/.test(f.message)).length, 0);
	});

	it("failed journal warns", () => {
		state.journal = null;
		const { findings, metrics } = run();

		assert.equal(metrics.journal, undefined);
		assert.deepEqual(starting(findings, "No se pudo consultar o interpretar").map(f => f.level), ["aviso"]);
		assert.ok(metrics.homeCache);
		assert.equal(Object.keys(metrics).filter(k => k.startsWith("diskUsed_")).length, 3);
	});

	it("unparsable journal warns", () => {
		state.journal = "No journal files were found.\n";
		const { findings, metrics } = run();

		assert.equal(metrics.journal, undefined);
		assert.equal(starting(findings, "No se pudo consultar o interpretar").length, 1);
	});

	it("valid journal records size", () => {
		const { findings, metrics } = run();

		assert.equal(metrics.journal.value, Math.round(726.1 / 1024 * 100) / 100);
		assert.equal(metrics.journal.unit, "GB");
		assert.equal(starting(findings, "No se pudo consultar o interpretar").length, 0);
	});

	it("unitless journal records zero", () => {
		state.journal = "Archived and active journals take up 512B in the file system.\n";
		const { findings, metrics } = run();

		assert.deepEqual(metrics.journal, { label: "Tamano del journal", value: 0, unit: "GB" });
		assert.equal(starting(findings, "No se pudo consultar o interpretar").length, 0);
	});
});
