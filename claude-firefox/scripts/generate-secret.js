import { randomBytes } from "crypto";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const configDir = process.env.CLAUDE_FIREFOX_HOME || join(homedir(), ".claude-firefox");
const secretPath = join(configDir, "secret.txt");
const memoryPath = join(configDir, "memory.json");

mkdirSync(configDir, { recursive: true });

const secret = randomBytes(32).toString("hex");
writeFileSync(secretPath, secret, "utf-8");

if (!existsSync(memoryPath)) {
  writeFileSync(memoryPath, "{}", "utf-8");
}

console.log(secret);
