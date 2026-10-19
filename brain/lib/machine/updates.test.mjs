/** Tests of updates.mjs over simulated commands. Run: node --test --experimental-test-module-mocks <this file>. */
import { after, before, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import * as context from "./context.mjs";

const APT_EMPTY = "Listing...\n";
const APT_PENDING = [
	"Listing...",
	"gnome-shell-common/resolute-updates 50.1-0ubuntu1.4 all [upgradable from: 50.1-0ubuntu1.3]",
	"openssl/resolute-updates,resolute-security 3.0.2-2 amd64 [upgradable from: 3.0.2-1]",
	"libssl3/resolute-security 3.0.2-2 amd64 [upgradable from: 3.0.2-1]",
].join("\n");
const SNAP_TABLE = "Name     Version  Rev   Size   Publisher  Notes\nfirefox  158.0-2  9057  298MB  mozilla**  -\n";
const APT_FAILED = "No se pudo consultar apt";
const FLATPAK_FAILED = "No se pudo consultar flatpak";

describe("updates run", () => {
	const outputs = {};
	let mocked;
	let run;

	/** Runs the module with the given stdout per command; `null` simulates a failed command. */
	const runWith = ({ apt = APT_EMPTY, flatpak = "" } = {}) => {
		Object.assign(outputs, { apt, flatpak, snap: SNAP_TABLE });

		return run();
	};

	const starting = (findings, prefix) => findings.filter(f => f.area === "updates" && f.message.startsWith(prefix));

	before(async () => {
		mocked = mock.module(new URL("./context.mjs", import.meta.url).href, {
			exports: {
				...context,
				sh: cmd => cmd in outputs ? outputs[cmd] : null,
				has: cmd => cmd === "snap" || cmd === "flatpak",
			},
		});
		({ run } = await import("./updates.mjs?mocked"));
	});

	after(() => mocked.restore());

	it("failed apt warns, no metrics", () => {
		const { findings, metrics } = runWith({ apt: null });

		assert.deepEqual(starting(findings, APT_FAILED).map(f => f.level), ["aviso"]);
		assert.equal(metrics.aptPending, undefined);
		assert.equal(metrics.aptSecurity, undefined);
		assert.equal(starting(findings, "apt: no hay paquetes").length, 0);
		assert.equal(findings.filter(f => /paquete\(s\) de apt|seguridad de apt/.test(f.message)).length, 0);
	});

	it("empty apt records zero", () => {
		const { findings, metrics } = runWith({ apt: APT_EMPTY });

		assert.equal(metrics.aptPending.value, 0);
		assert.equal(metrics.aptSecurity.value, 0);
		assert.deepEqual(starting(findings, "apt: no hay paquetes").map(f => f.level), ["info"]);
		assert.equal(starting(findings, APT_FAILED).length, 0);
	});

	it("counts pending apt packages", () => {
		const { findings, metrics } = runWith({ apt: APT_PENDING });

		assert.equal(metrics.aptPending.value, 3);
		assert.deepEqual(starting(findings, "3 paquete(s) de apt").map(f => [f.level, f.message]),
			[["info", "3 paquete(s) de apt por actualizar: gnome-shell-common, openssl, libssl3."]]);
	});

	it("keeps security classification", () => {
		const { findings, metrics } = runWith({ apt: APT_PENDING });

		assert.equal(metrics.aptSecurity.value, 2);
		assert.deepEqual(starting(findings, "2 actualizacion(es) de seguridad").map(f => [f.level, f.message]),
			[["aviso", "2 actualizacion(es) de seguridad de apt pendientes: openssl, libssl3."]]);
	});

	it("over fifty packages warns", () => {
		const lines = Array.from({ length: 51 }, (_, i) => `pkg${i}/resolute-updates 1.1 amd64 [upgradable from: 1.0]`);
		const { findings } = runWith({ apt: ["Listing...", ...lines].join("\n") });

		assert.equal(starting(findings, "51 paquete(s) de apt")[0].level, "aviso");
	});

	it("failed flatpak warns, no metric", () => {
		const { findings, metrics } = runWith({ flatpak: null });

		assert.deepEqual(starting(findings, FLATPAK_FAILED).map(f => f.level), ["aviso"]);
		assert.equal(metrics.flatpakPending, undefined);
	});

	it("empty flatpak records zero", () => {
		const { findings, metrics } = runWith({ flatpak: "" });

		assert.equal(metrics.flatpakPending.value, 0);
		assert.equal(starting(findings, FLATPAK_FAILED).length, 0);
		assert.equal(findings.filter(f => f.message.includes("flatpak(s)")).length, 0);
	});

	it("counts pending flatpaks", () => {
		const { findings, metrics } = runWith({ flatpak: "org.gnome.Platform\norg.mozilla.firefox\n" });

		assert.equal(metrics.flatpakPending.value, 2);
		assert.deepEqual(starting(findings, "2 flatpak(s)").map(f => f.message), ["2 flatpak(s) por actualizar: org.gnome.Platform, org.mozilla.firefox."]);
	});

	it("failed apt keeps flatpak", () => {
		const { metrics } = runWith({ apt: null, flatpak: "org.gnome.Platform\n" });

		assert.equal(metrics.aptPending, undefined);
		assert.equal(metrics.flatpakPending.value, 1);
		assert.equal(metrics.snapPending.value, 1);
		assert.ok(metrics.kernelsInstalled);
	});

	it("failed flatpak keeps apt", () => {
		const { metrics } = runWith({ apt: APT_PENDING, flatpak: null });

		assert.equal(metrics.flatpakPending, undefined);
		assert.equal(metrics.aptPending.value, 3);
		assert.equal(metrics.aptSecurity.value, 2);
		assert.equal(metrics.snapPending.value, 1);
	});
});
