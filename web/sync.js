// sync.js – automatisches Backup in ein privates GitHub-Gist.
// Nach jeder gespeicherten Änderung (Einheit, Workout …) wird das komplette
// Backup-JSON still in das Gist geschrieben. GitHub hebt jede Fassung als
// Revision auf – ältere Stände lassen sich dort jederzeit ansehen.
// Das Token (nur Recht „gist“) liegt ausschließlich in den lokalen
// Einstellungen und ist nie Teil des Backups.

const API = "https://api.github.com";
const FILE = "iron-journal-backup.json";
const DESC = "Iron Journal Backup";
const DEBOUNCE_MS = 2500;

async function gh(token, path, opts = {}) {
  const resp = await fetch(API + path, {
    ...opts,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!resp.ok) {
    const msg = resp.status === 401 ? "Token ungültig oder abgelaufen"
      : resp.status === 404 ? "Gist nicht gefunden (oder Token ohne Gist-Recht)"
      : `GitHub-Fehler ${resp.status}`;
    throw new Error(msg);
  }
  return resp.json();
}

/// Sucht ein bestehendes Iron-Journal-Gist des Nutzers (für Wiederherstellung
/// auf einem neuen Gerät). Liefert { id, updatedAt } oder null.
export async function findGist(token) {
  for (let page = 1; page <= 5; page++) {
    const list = await gh(token, `/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => g.files && g.files[FILE]);
    if (hit) return { id: hit.id, updatedAt: hit.updated_at };
    if (list.length < 100) break;
  }
  return null;
}

/// Liest den Backup-Inhalt aus dem Gist (große Dateien über raw_url).
export async function pullGist(token, id) {
  const g = await gh(token, `/gists/${id}`);
  const f = g.files && g.files[FILE];
  if (!f) throw new Error("Im Gist liegt kein Iron-Journal-Backup");
  if (!f.truncated) return f.content;
  const resp = await fetch(f.raw_url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Download fehlgeschlagen (${resp.status})`);
  return resp.text();
}

/// Schreibt den Inhalt ins Gist; legt es beim ersten Mal (privat) an.
/// Liefert die Gist-ID.
export async function pushGist(token, id, content) {
  const body = JSON.stringify({ description: DESC, files: { [FILE]: { content } } });
  if (id) return (await gh(token, `/gists/${id}`, { method: "PATCH", body })).id;
  const created = await gh(token, "/gists", {
    method: "POST",
    body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content } } }),
  });
  return created.id;
}

/// Verbindet den Store mit dem Gist: jede Änderung (store.onChange) löst nach
/// kurzer Verzögerung einen Upload aus. Offline bzw. bei Fehlern bleibt die
/// Änderung als „ausstehend“ markiert und wird beim nächsten Start oder
/// sobald wieder Netz da ist nachgeholt.
export function createSync(store, onStatus = () => {}) {
  let timer = null;
  let running = false;

  const cfg = () => store.settings.gist ?? null;
  const setCfg = (patch) => store.updateSettings({ gist: { ...(cfg() ?? {}), ...patch } });

  async function run() {
    const c = cfg();
    if (!c?.token || running) return;
    if (!navigator.onLine) { onStatus(); return; }
    running = true;
    const startedAt = Date.now();
    try {
      const id = await pushGist(c.token, c.id, store.exportData());
      // Nur als erledigt markieren, wenn währenddessen nichts Neues kam.
      const pending = (cfg()?.pendingSince ?? 0) > startedAt;
      setCfg({ id, lastSync: new Date().toISOString(), error: null, ...(pending ? {} : { pendingSince: null }) });
      if (pending) schedule();
    } catch (e) {
      setCfg({ error: e.message || String(e) });
    } finally {
      running = false;
      onStatus();
    }
  }

  function schedule() {
    if (!cfg()?.token) return;
    clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  }

  function markChanged() {
    if (!cfg()?.token) return;
    setCfg({ pendingSince: Date.now() });
    schedule();
  }

  window.addEventListener("online", () => { if (cfg()?.pendingSince) run(); });
  // Beim Verlassen der App (iOS: App-Wechsel) ausstehende Änderung sofort senden.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && cfg()?.pendingSince) { clearTimeout(timer); run(); }
  });
  if (cfg()?.pendingSince) schedule();

  return {
    markChanged,
    syncNow: run,
    config: cfg,
    async connect(token) {
      const found = await findGist(token);
      store.updateSettings({ gist: { token, id: found?.id ?? null, lastSync: null, error: null, pendingSince: null } });
      return found;
    },
    async restore() {
      const c = cfg();
      const json = await pullGist(c.token, c.id);
      if (!store.importData(json)) throw new Error("Backup im Gist ist ungültig");
      setCfg({ lastSync: new Date().toISOString(), error: null, pendingSince: null });
    },
    disconnect() { clearTimeout(timer); store.updateSettings({ gist: null }); },
  };
}
