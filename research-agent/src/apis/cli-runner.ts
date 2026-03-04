import { spawn } from "child_process";

const TIMEOUT_MS = 30_000;

interface CliResult {
  answer: string;
  raw: string;
}

function runCommand(
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(new Error(`Command "${command}" not found. Please install it and ensure it is on your PATH.`));
      } else {
        reject(err);
      }
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    // Manual timeout fallback in case spawn timeout doesn't kill it
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Command "${command}" timed out after ${TIMEOUT_MS / 1000} seconds`));
    }, TIMEOUT_MS + 1000);

    proc.on("close", () => clearTimeout(timer));
  });
}

export async function runGemini(query: string): Promise<CliResult> {
  try {
    const { stdout, stderr, exitCode } = await runCommand("gemini", [
      "-p",
      query,
      "--output-format",
      "json",
      "-y",
    ]);

    if (exitCode !== 0 && stderr) {
      console.error(`[cli-runner] gemini stderr: ${stderr}`);
    }

    const raw = stdout.trim();
    let answer = raw;

    // Try to parse JSON output and extract the answer text
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") {
        answer = parsed;
      } else if (parsed && typeof parsed === "object") {
        // Look for common answer fields
        answer =
          parsed.text ??
          parsed.answer ??
          parsed.response ??
          parsed.candidates?.[0]?.content?.parts?.[0]?.text ??
          raw;
      }
    } catch {
      // Not valid JSON — use raw output as the answer
      answer = raw;
    }

    return { answer, raw };
  } catch (error) {
    console.error("[cli-runner] gemini error:", error);
    throw error;
  }
}

export async function runKimi(query: string, kimiApiKey?: string): Promise<CliResult> {
  try {
    const env: Record<string, string> = {};
    if (kimiApiKey) {
      env["KIMI_API_KEY"] = kimiApiKey;
    }

    const { stdout, stderr, exitCode } = await runCommand(
      "kimi",
      ["--quiet", "--prompt", query],
      Object.keys(env).length > 0 ? env : undefined,
    );

    if (exitCode !== 0 && stderr) {
      console.error(`[cli-runner] kimi stderr: ${stderr}`);
    }

    const raw = stdout.trim();
    const answer = raw;

    return { answer, raw };
  } catch (error) {
    console.error("[cli-runner] kimi error:", error);
    throw error;
  }
}
