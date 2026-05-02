const form = document.querySelector("#runForm");
const runButton = document.querySelector("#runButton");
const dependencyStatus = document.querySelector("#dependencyStatus");
const runStatus = document.querySelector("#runStatus");
const uploadStatus = document.querySelector("#uploadStatus");
const logOutput = document.querySelector("#logOutput");
const resultGrid = document.querySelector("#resultGrid");
const imageInput = document.querySelector("#images");
const variantTabs = document.querySelector("#variantTabs");

let activeVariant = "clean";
let latestResults = { clean: [], dither: [], strong: [], outline: [] };
let pollTimer = null;
let currentOut = "s25";

function formOptions() {
  const data = new FormData(form);
  return {
    src: data.get("src") || "s",
    out: data.get("out") || "s25",
    low: Number(data.get("low") || 100),
    scale: Number(data.get("scale") || 30),
    colors: Number(data.get("colors") || 32),
    cropSquare: data.get("cropSquare") === "on",
    palette: data.get("palette") || "",
    jobs: Number(data.get("jobs") || 4)
  };
}

function setRunEnabled(enabled) {
  runButton.disabled = !enabled;
}

function renderLogs(state) {
  if (!state.logs?.length) {
    logOutput.textContent = "Ready.";
    return;
  }
  logOutput.textContent = state.logs.map((entry) => `[${entry.time}] ${entry.text}`).join("\n");
  logOutput.scrollTop = logOutput.scrollHeight;
}

function renderResults() {
  const items = latestResults[activeVariant] || [];
  if (!items.length) {
    resultGrid.innerHTML = `<div class="empty-state">No ${activeVariant} results yet.</div>`;
    return;
  }

  resultGrid.innerHTML = items.map((item) => {
    const url = `${item.url}?out=${encodeURIComponent(currentOut)}&v=${Date.now()}`;
    return `
      <article class="result-card">
        <div class="thumb">
          <img src="${url}" alt="${item.file}">
        </div>
        <div class="result-meta">
          <strong>${item.file}</strong>
          <a href="${url}" target="_blank" rel="noreferrer">Open image</a>
        </div>
      </article>
    `;
  }).join("");
}

async function refreshResults() {
  const out = formOptions().out;
  currentOut = out;
  const response = await fetch(`/api/results?out=${encodeURIComponent(out)}`);
  const payload = await response.json();
  latestResults = payload.variants;
  renderResults();
}

async function refreshRunState() {
  const response = await fetch("/api/run-state");
  const state = await response.json();
  renderLogs(state);
  runStatus.textContent = state.running
    ? "Running"
    : state.exitCode === 0
      ? "Finished"
      : state.exitCode === null
        ? "Idle"
        : "Failed";
  setRunEnabled(!state.running && !dependencyStatus.classList.contains("missing"));

  if (!state.running) {
    clearInterval(pollTimer);
    pollTimer = null;
    await refreshResults();
  }
}

async function loadStatus() {
  const response = await fetch("/api/status");
  const status = await response.json();
  const missing = [];
  if (!status.script.exists) missing.push("script");
  if (!status.dependencies.magick) missing.push("magick");
  if (!status.dependencies.parallel) missing.push("parallel");

  const jobsInput = form.elements.namedItem("jobs");
  if (jobsInput && status.defaults?.jobs) {
    jobsInput.value = status.defaults.jobs;
  }

  dependencyStatus.classList.toggle("ready", missing.length === 0);
  dependencyStatus.classList.toggle("missing", missing.length > 0);
  dependencyStatus.textContent = missing.length === 0
    ? "Tools ready"
    : `Missing ${missing.join(", ")}`;
  setRunEnabled(missing.length === 0 && !status.running);
}

imageInput.addEventListener("change", async () => {
  if (!imageInput.files.length) return;
  uploadStatus.textContent = "Uploading...";

  const uploadData = new FormData();
  uploadData.append("src", formOptions().src);
  for (const file of imageInput.files) {
    uploadData.append("images", file);
  }

  const response = await fetch("/api/upload", {
    method: "POST",
    body: uploadData
  });
  const payload = await response.json();
  uploadStatus.textContent = `${payload.saved.length} image(s) added to ${payload.src}`;
  imageInput.value = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setRunEnabled(false);
  runStatus.textContent = "Starting";
  logOutput.textContent = "Starting...";

  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formOptions())
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    runStatus.textContent = "Blocked";
    logOutput.textContent = payload.error || "Unable to start conversion.";
    setRunEnabled(true);
    return;
  }

  pollTimer = setInterval(refreshRunState, 800);
  await refreshRunState();
});

variantTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-variant]");
  if (!button) return;
  activeVariant = button.dataset.variant;
  for (const tab of variantTabs.querySelectorAll("button")) {
    tab.classList.toggle("active", tab === button);
  }
  renderResults();
});

await loadStatus();
await refreshRunState();
await refreshResults();
