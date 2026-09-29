/** Shared helpers for the machine checks: command runner, /proc and /sys readers, finding shape. */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const C_LOCALE = { ...process.env, LC_ALL: "C", LANG: "C", LANGUAGE: "C" };

/** Runs a command in the C locale. `null` if missing, timed out or failed (unless `anyStatus`). */
export function sh(cmd, args = [], { timeout = 20000, anyStatus = false } = {}) {
	const r = spawnSync(cmd, args, { encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024, env: C_LOCALE });

	if (r.error || r.signal)
		return null;

	return r.status === 0 || anyStatus ? r.stdout : null;
}

/** True if the command is on the PATH. */
export function has(cmd) {
	return sh("sh", ["-c", `command -v ${cmd}`]) !== null;
}

/** File content trimmed, or `null` if it cannot be read. */
export function read(path) {
	try {
		return readFileSync(path, "utf8").trim();
	}
	catch {
		return null;
	}
}

/** File content as a number, or `null`. */
export function num(path) {
	const text = read(path);

	return text === null || text === "" || isNaN(Number(text)) ? null : Number(text);
}

/** Entries of a directory; empty if it does not exist. */
export function list(dir) {
	try {
		return readdirSync(dir);
	}
	catch {
		return [];
	}
}

/** A finding: `error` breaks something today, `aviso` degrades it, `info` is context. */
export function finding(level, area, message, fix) {
	return fix ? { level, area, message, fix } : { level, area, message };
}

/** A numeric measurement saved in the history and compared between runs. */
export function metric(label, value, unit = "") {
	return { label, value: Math.round(value * 100) / 100, unit };
}

/** Bytes as a short human size: `2.5 GB`. */
export function size(bytes) {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let i = 0;

	while (value >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}

	return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Parses sizes like `2.497GB`, `181.4MiB` or `2.8G` into bytes. `0` if it does not parse. */
export function bytes(text) {
	const m = String(text).match(/([\d.]+)\s*([KMGTP]?)i?B?/i);

	if (!m)
		return 0;

	return Number(m[1]) * 1024 ** " KMGTP".indexOf((m[2] || " ").toUpperCase());
}
