// Claude Browser Bridge - Popup Script

const secretInput = document.getElementById("secret-input");
const portInput = document.getElementById("port-input");
const toggleSecretBtn = document.getElementById("toggle-secret");
const saveBtn = document.getElementById("save-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const tabList = document.getElementById("tab-list");
const tabCount = document.getElementById("tab-count");
const closeAllBtn = document.getElementById("close-all-btn");

// ─── Load saved config ──────────────────────────────────────────────────────

async function loadConfig() {
  const data = await browser.storage.local.get(["secret", "port"]);
  if (data.secret) secretInput.value = data.secret;
  if (data.port) portInput.value = data.port;
}

// ─── Save config and reconnect ──────────────────────────────────────────────

saveBtn.addEventListener("click", async () => {
  const secret = secretInput.value.trim();
  const port = parseInt(portInput.value) || 7865;

  await browser.storage.local.set({ secret, port });
  saveBtn.textContent = "Saved!";
  setTimeout(() => {
    saveBtn.textContent = "Save & Reconnect";
  }, 1500);

  // Tell background to reconnect
  browser.runtime.sendMessage({ type: "reconnect" });
});

// ─── Toggle secret visibility ───────────────────────────────────────────────

toggleSecretBtn.addEventListener("click", () => {
  if (secretInput.type === "password") {
    secretInput.type = "text";
  } else {
    secretInput.type = "password";
  }
});

// ─── Poll status ────────────────────────────────────────────────────────────

async function updateStatus() {
  try {
    const response = await browser.runtime.sendMessage({ type: "get_status" });
    if (response.connected) {
      statusDot.className = "dot connected";
      statusText.textContent = "Connected";
    } else {
      statusDot.className = "dot disconnected";
      statusText.textContent = "Disconnected";
    }

    // Update tab list
    const tabs = response.trackedTabs || [];
    tabCount.textContent = `(${tabs.length})`;
    closeAllBtn.disabled = tabs.length === 0;

    tabList.innerHTML = "";
    if (tabs.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No Claude-managed tabs";
      li.style.color = "#6c7086";
      li.style.fontStyle = "italic";
      tabList.appendChild(li);
    } else {
      // Fetch tab details
      for (const tabId of tabs) {
        try {
          const tab = await browser.tabs.get(tabId);
          const li = document.createElement("li");
          li.innerHTML = `<span class="tab-id">#${tabId}</span> ${escapeHtml(tab.title || tab.url || "New Tab")}`;
          li.title = tab.url || "";
          li.style.cursor = "pointer";
          li.addEventListener("click", () => {
            browser.tabs.update(tabId, { active: true });
          });
          tabList.appendChild(li);
        } catch {
          // Tab no longer exists
        }
      }
    }
  } catch (e) {
    statusDot.className = "dot disconnected";
    statusText.textContent = "Error";
  }
}

// ─── Close all Claude tabs ──────────────────────────────────────────────────

closeAllBtn.addEventListener("click", async () => {
  closeAllBtn.disabled = true;
  closeAllBtn.textContent = "Closing...";
  await browser.runtime.sendMessage({ type: "close_all_claude_tabs" });
  closeAllBtn.textContent = "Close All Claude Tabs";
  updateStatus();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ─── Init ───────────────────────────────────────────────────────────────────

loadConfig();
updateStatus();
// Refresh status every 2 seconds while popup is open
setInterval(updateStatus, 2000);
