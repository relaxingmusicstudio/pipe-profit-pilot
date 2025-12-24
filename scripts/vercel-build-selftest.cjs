const { execSync, spawnSync } = require("node:child_process");

const logLine = (message) => {
  process.stdout.write(`${message}\n`);
};

const nodeVersion = process.version;
let npmVersion = "unknown";
try {
  npmVersion = execSync("npm -v", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  npmVersion = "unknown";
}

logLine(`Node: ${nodeVersion}`);
logLine(`npm: ${npmVersion}`);

const result = spawnSync("npm run build", { stdio: "inherit", shell: true });
if (result.error) {
  logLine(`ERROR: ${result.error.message}`);
}
if (result.signal) {
  logLine(`SIGNAL: ${result.signal}`);
}

const status = typeof result.status === "number" ? result.status : 1;
const ok = status === 0;

logLine(`BUILD: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : status);
