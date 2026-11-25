/** Tests of environment-guard.mjs for Oracle clients, over a fake registry. Run: node --test <this file>. */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = join(dirname(fileURLToPath(import.meta.url)), "environment-guard.mjs");
const ROOT = mkdtempSync(join(tmpdir(), "guard-test-"));
const TNS = join(ROOT, "tns");

const REGISTRY = {
	servers: {},
	environments: {
		desa: { hosts: [], ssh: [], paths: [], mcp: [], databases: [{ host: "10.20.0.4", port: "1521", db: "ARQDESA" }] },
		prod: { hosts: [], ssh: [], paths: [], mcp: [], databases: [{ host: "10.20.0.5", port: "1521", db: "ARQPROD" }] },
	},
	alwaysAllowed: { hosts: [], paths: [] },
};

/** Writes `content` to `path` under the test root, creating its folders. */
const put = (path, content) => {
	mkdirSync(dirname(join(ROOT, path)), { recursive: true });
	writeFileSync(join(ROOT, path), content);
};

put("brain/environments.json", JSON.stringify(REGISTRY));
put("cache/environment/state.json", JSON.stringify({ environment: "desa", mode: "lectura" }));
put("tns/tnsnames.ora", "# comment\nARQPROD.WORLD, ARQPROD =\n  (DESCRIPTION =\n    (ADDRESS = (PROTOCOL = TCP)(HOST = 10.20.0.5)(PORT = 1521))\n    (CONNECT_DATA = (SERVICE_NAME = ARQPROD)))\n");
put("work/read.sql", "select * from dual;\n");
put("work/block.sql", "BEGIN\n  pkg_cartera.recalcular;\nEND;\n/\n");

/** Guard decision for a Bash command: `allow`, `ask` or `deny`. */
const decide = (command) => {
	const event = { tool_name: "Bash", tool_input: { command }, cwd: join(ROOT, "work") };
	const run = spawnSync("node", [GUARD], {
		input: JSON.stringify(event),
		encoding: "utf8",
		env: { ...process.env, ENVIRONMENT_DIR: ROOT, TNS_ADMIN: TNS, TWO_TASK: "" },
	});

	return run.stdout.trim() ? JSON.parse(run.stdout).hookSpecificOutput.permissionDecision : "allow";
};

after(() => rmSync(ROOT, { recursive: true, force: true }));

describe("environment-guard with Oracle", () => {
	it("denies sqlplus to another environment by EZConnect", () => {
		assert.equal(decide("sqlplus -S app/secret@10.20.0.5:1521/ARQPROD @read.sql"), "deny");
		assert.equal(decide("sqlplus app/secret@//10.20.0.5/ARQPROD"), "deny");
	});

	it("denies SQLcl the same way", () => {
		assert.equal(decide("sql -s app/secret@10.20.0.5:1521/ARQPROD"), "deny");
	});

	it("resolves a TNS alias before classifying it", () => {
		assert.equal(decide("sqlplus app/secret@ARQPROD @read.sql"), "deny");
	});

	it("denies a TNS alias it cannot resolve", () => {
		assert.equal(decide("sqlplus app/secret@NOEXISTE @read.sql"), "deny");
	});

	it("follows CONNECT inside a heredoc", () => {
		assert.equal(decide("sqlplus -S /nolog <<EOF\nconnect app/secret@10.20.0.5:1521/ARQPROD\nselect 1 from dual;\nEOF"), "deny");
	});

	it("follows TWO_TASK when the logon has no connect identifier", () => {
		assert.equal(decide("TWO_TASK=10.20.0.5:1521/ARQPROD sqlplus app/secret @read.sql"), "deny");
	});

	it("reads JDBC thin and connect descriptors", () => {
		assert.equal(decide("java -jar etl.jar jdbc:oracle:thin:@10.20.0.5:1521:ARQPROD"), "deny");
		assert.equal(decide("sqlplus 'app/secret@(DESCRIPTION=(ADDRESS=(HOST=10.20.0.5)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=ARQPROD)))'"), "deny");
	});

	it("allows a query in the active environment in read mode", () => {
		assert.equal(decide("sqlplus -S app/secret@10.20.0.4:1521/ARQDESA @read.sql"), "allow");
		assert.equal(decide("sqlplus -S app/secret@10.20.0.4:1521/ARQDESA <<EOF\nselect count(*) from cuentas;\nEOF"), "allow");
	});

	it("treats DML and PL/SQL blocks as writes in read mode", () => {
		assert.equal(decide("sqlplus -S app/secret@10.20.0.4:1521/ARQDESA <<EOF\nupdate cuentas set estado = 'I' where id = 1;\nEOF"), "deny");
		assert.equal(decide("sqlplus -S app/secret@10.20.0.4:1521/ARQDESA @block.sql"), "deny");
	});

	it("asks when a script it cannot read decides the write", () => {
		assert.equal(decide("sqlplus -S app/secret@10.20.0.4:1521/ARQDESA @missing.sql"), "ask");
	});

	it("allows a local container and unrelated commands", () => {
		assert.equal(decide("docker exec oracle-xe sqlplus app/secret@localhost:1521/XEPDB1 @block.sql"), "allow");
		assert.equal(decide("npm i @types/node && grep -r sql src"), "allow");
	});
});
