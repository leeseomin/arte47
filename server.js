import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);
const SCRIPT = path.join(ROOT, "pixel_art_batch.sh");
const START_PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_PORT_ATTEMPTS = 20;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"]);
const VARIANTS = ["clean", "dither", "strong", "outline"];
const MAX_LOG_LINES = 500;

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 50,
    fileSize: 80 * 1024 * 1024
  }
});

let runState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  options: defaultOptions(),
  logs: []
};

function defaultOptions() {
  return {
    src: "s",
    out: "s25",
    low: 100,
    scale: 30,
    colors: 32,
    cropSquare: false,
    palette: "",
    jobs: os.cpus().length || 4
  };
}

function pushLog(line) {
  const text = String(line).replace(/\r?\n$/, "");
  if (!text) return;
  runState.logs.push({
    time: new Date().toISOString(),
    text
  });
  if (runState.logs.length > MAX_LOG_LINES) {
    runState.logs = runState.logs.slice(-MAX_LOG_LINES);
  }
}

function safeRelativePath(value, fallback) {
  const raw = String(value || fallback).trim();
  const normalized = path.normalize(raw).replace(/^(\.\.[/\\])+/, "");
  if (!normalized || normalized === "." || path.isAbsolute(normalized) || normalized.startsWith("..")) {
    return fallback;
  }
  return normalized;
}

function absoluteInsideRoot(relativePath) {
  const target = path.resolve(ROOT, relativePath);
  if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error("Path must stay inside the project folder.");
  }
  return target;
}

function readPositiveInteger(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < min || number > max) {
    return fallback;
  }
  return number;
}

function normalizeOptions(body = {}) {
  const defaults = defaultOptions();
  return {
    src: safeRelativePath(body.src, defaults.src),
    out: safeRelativePath(body.out, defaults.out),
    low: readPositiveInteger(body.low, defaults.low, 16, 1000),
    scale: readPositiveInteger(body.scale, defaults.scale, 1, 100),
    colors: readPositiveInteger(body.colors, defaults.colors, 2, 256),
    cropSquare: body.cropSquare === true || body.cropSquare === "true" || body.cropSquare === "1",
    palette: safeRelativePath(body.palette, ""),
    jobs: readPositiveInteger(body.jobs, defaults.jobs, 1, 64)
  };
}

function shellCheck(command) {
  return new Promise((resolve) => {
    const child = spawn("zsh", ["-lc", `command -v ${command}`], {
      cwd: ROOT,
      stdio: "ignore"
    });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function statusPayload() {
  const [magick, parallel] = await Promise.all([
    shellCheck("magick"),
    shellCheck("parallel")
  ]);
  return {
    root: ROOT,
    script: {
      path: "pixel_art_batch.sh",
      exists: fs.existsSync(SCRIPT),
      executable: fs.existsSync(SCRIPT) && (fs.statSync(SCRIPT).mode & 0o111) !== 0
    },
    dependencies: {
      magick,
      parallel
    },
    defaults: defaultOptions(),
    running: runState.running
  };
}

function imageFilesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function resultPayload(outDir = runState.options.out || "s25") {
  const out = safeRelativePath(outDir, "s25");
  const results = {};
  for (const variant of VARIANTS) {
    const dir = absoluteInsideRoot(path.join(out, variant));
    results[variant] = imageFilesIn(dir).map((file) => ({
      file,
      variant,
      url: `/outputs/${variant}/${encodeURIComponent(file)}`
    }));
  }
  return { out, variants: results };
}

app.use(express.json());
app.use(express.static(path.join(ROOT, "public")));

app.get("/api/status", async (_req, res) => {
  res.json(await statusPayload());
});

app.get("/api/run-state", (_req, res) => {
  res.json(runState);
});

app.post("/api/upload", upload.array("images"), (req, res) => {
  const src = safeRelativePath(req.body?.src, "s");
  const srcDir = absoluteInsideRoot(src);
  fs.mkdirSync(srcDir, { recursive: true });

  const files = (req.files || []).filter((file) => {
    return IMAGE_EXTENSIONS.has(path.extname(file.originalname).toLowerCase());
  });

  const saved = files.map((file) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "image";
    const filename = `${base}_${crypto.randomBytes(4).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(srcDir, filename), file.buffer);
    return filename;
  });

  res.json({ src, saved });
});

app.post("/api/run", async (req, res) => {
  if (runState.running) {
    res.status(409).json({ error: "A conversion run is already in progress.", state: runState });
    return;
  }

  const status = await statusPayload();
  if (!status.script.exists || !status.dependencies.magick || !status.dependencies.parallel) {
    res.status(400).json({ error: "Missing required script or dependencies.", status });
    return;
  }

  const options = normalizeOptions(req.body);
  absoluteInsideRoot(options.src);
  absoluteInsideRoot(options.out);
  if (options.palette) {
    absoluteInsideRoot(options.palette);
  }

  runState = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    options,
    logs: []
  };
  pushLog(`Starting pixel_art_batch.sh with SRC=${options.src} OUT=${options.out}`);

  const env = {
    ...process.env,
    SRC: options.src,
    OUT: options.out,
    LOW: String(options.low),
    SCALE: String(options.scale),
    COLORS: String(options.colors),
    CROP_SQUARE: options.cropSquare ? "1" : "0",
    PALETTE: options.palette,
    JOBS: String(options.jobs)
  };

  const child = spawn("./pixel_art_batch.sh", {
    cwd: ROOT,
    env,
    shell: false
  });

  child.stdout.on("data", (chunk) => {
    String(chunk).split(/\r?\n/).forEach(pushLog);
  });
  child.stderr.on("data", (chunk) => {
    String(chunk).split(/\r?\n/).forEach((line) => pushLog(line ? `stderr: ${line}` : ""));
  });
  child.on("error", (error) => {
    pushLog(`Failed to start: ${error.message}`);
  });
  child.on("close", (code) => {
    runState.running = false;
    runState.finishedAt = new Date().toISOString();
    runState.exitCode = code;
    pushLog(code === 0 ? "Run finished successfully." : `Run failed with exit code ${code}.`);
  });

  res.status(202).json({ accepted: true, state: runState });
});

app.get("/api/results", (req, res) => {
  res.json(resultPayload(req.query.out));
});

app.get("/outputs/:variant/:file", (req, res) => {
  const variant = String(req.params.variant);
  if (!VARIANTS.includes(variant)) {
    res.status(404).send("Unknown result variant.");
    return;
  }
  const file = path.basename(String(req.params.file));
  const out = safeRelativePath(req.query.out || runState.options.out, "s25");
  const target = absoluteInsideRoot(path.join(out, variant, file));
  res.sendFile(target, (error) => {
    if (error && !res.headersSent) {
      res.status(404).send("Image not found.");
    }
  });
});

function listenOnAvailablePort(port, attemptsLeft = MAX_PORT_ATTEMPTS) {
  const server = app.listen(port, HOST, () => {
    console.log(`arte47 pixel GUI running at http://${HOST}:${port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 1) {
      console.log(`Port ${port} is in use. Trying ${port + 1}...`);
      listenOnAvailablePort(port + 1, attemptsLeft - 1);
      return;
    }
    throw error;
  });
}

listenOnAvailablePort(START_PORT);
