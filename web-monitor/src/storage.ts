import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import type { Monitor, MonitorStore } from "./types.js";

const STORE_DIR = join(homedir(), ".web-monitor");
const STORE_PATH = join(STORE_DIR, "monitors.json");

let store: MonitorStore = { monitors: {} };

export function loadMonitors(): MonitorStore {
  if (existsSync(STORE_PATH)) {
    try {
      store = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
    } catch {
      store = { monitors: {} };
    }
  } else {
    store = { monitors: {} };
  }
  return store;
}

export function saveMonitors(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function getMonitor(id: string): Monitor | undefined {
  return store.monitors[id];
}

export function getAllMonitors(): Record<string, Monitor> {
  return store.monitors;
}

export function addMonitor(monitor: Monitor): void {
  store.monitors[monitor.id] = monitor;
  saveMonitors();
}

export function removeMonitor(id: string): boolean {
  if (store.monitors[id]) {
    delete store.monitors[id];
    saveMonitors();
    return true;
  }
  return false;
}

export function updateMonitor(monitor: Monitor): void {
  store.monitors[monitor.id] = monitor;
  saveMonitors();
}
