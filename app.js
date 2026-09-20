(() => {
  "use strict";

  const DB_NAME = "omnishare-local";
  const DB_VERSION = 1;
  const FILE_STORE = "files";
  const ACTIVITY_STORE = "activity";
  const MAX_FILE_SIZE = 100 * 1024 * 1024;
  const THEME_KEY = "omnishare-theme";

  const viewMeta = {
    dashboard: { title: "Dashboard", eyebrow: "Overview" },
    upload: { title: "Upload", eyebrow: "Store a file" },
    retrieve: { title: "Retrieve", eyebrow: "Download by ID" },
    library: { title: "Library", eyebrow: "Stored files" },
    activity: { title: "Activity", eyebrow: "Audit trail" }
  };

  const state = {
    db: null,
    selectedFile: null,
    createdFileId: null,
    currentView: "dashboard",
    files: []
  };

  const el = (id) => document.getElementById(id);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("Database transaction was aborted"));
      transaction.onerror = () => reject(transaction.error || new Error("Database transaction failed"));
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("This browser does not support IndexedDB."));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(FILE_STORE)) {
          const files = db.createObjectStore(FILE_STORE, { keyPath: "id" });
          files.createIndex("createdAt", "createdAt");
          files.createIndex("expiresAt", "expiresAt");
          files.createIndex("name", "name");
        }

        if (!db.objectStoreNames.contains(ACTIVITY_STORE)) {
          const activity = db.createObjectStore(ACTIVITY_STORE, {
            keyPath: "eventId",
            autoIncrement: true
          });
          activity.createIndex("timestamp", "timestamp");
          activity.createIndex("type", "type");
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open OmniShare storage."));
      request.onblocked = () => reject(new Error("OmniShare storage is blocked by another open tab."));
    });
  }

  async function getAllFiles() {
    const tx = state.db.transaction(FILE_STORE, "readonly");
    const store = tx.objectStore(FILE_STORE);
    const result = await requestToPromise(store.getAll());
    await transactionDone(tx);
    return result || [];
  }

  async function getFile(id) {
    const tx = state.db.transaction(FILE_STORE, "readonly");
    const store = tx.objectStore(FILE_STORE);
    const result = await requestToPromise(store.get(id));
    await transactionDone(tx);
    return result || null;
  }

  async function putFile(record) {
    const tx = state.db.transaction(FILE_STORE, "readwrite");
    tx.objectStore(FILE_STORE).put(record);
    await transactionDone(tx);
  }

  async function removeFile(id) {
    const tx = state.db.transaction(FILE_STORE, "readwrite");
    tx.objectStore(FILE_STORE).delete(id);
    await transactionDone(tx);
  }

  async function addActivity(type, file, extra = {}) {
    const tx = state.db.transaction(ACTIVITY_STORE, "readwrite");
    tx.objectStore(ACTIVITY_STORE).add({
      type,
      fileId: file.id,
      name: file.name,
      size: file.size,
      timestamp: Date.now(),
      ...extra
    });
    await transactionDone(tx);
  }

  async function getActivity() {
    const tx = state.db.transaction(ACTIVITY_STORE, "readonly");
    const result = await requestToPromise(tx.objectStore(ACTIVITY_STORE).getAll());
    await transactionDone(tx);
    return (result || []).sort((a, b) => b.timestamp - a.timestamp);
  }

  async function clearActivity() {
    const tx = state.db.transaction(ACTIVITY_STORE, "readwrite");
    tx.objectStore(ACTIVITY_STORE).clear();
    await transactionDone(tx);
  }

  function normalizeId(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/^OMNI:?/, "OMNI-")
      .replace(/[^A-Z0-9-]/g, "");
  }

  function randomSegment(length = 4) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

  async function generateUniqueId() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const id = `OMNI-${randomSegment()}-${randomSegment()}`;
      if (!(await getFile(id))) return id;
    }
    return `OMNI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  function getExtension(name) {
    const parts = String(name).split(".");
    if (parts.length < 2) return "FILE";
    return parts.pop().slice(0, 5).toUpperCase() || "FILE";
  }

  function formatBytes(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = size / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[index]}`;
  }

  function formatDate(timestamp) {
    if (!timestamp) return "Never";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(timestamp));
  }

  function formatRelativeTime(timestamp) {
    const diff = Date.now() - Number(timestamp);
    const abs = Math.abs(diff);
    const units = [
      ["day", 86400000],
      ["hour", 3600000],
      ["minute", 60000]
    ];

    for (const [unit, ms] of units) {
      if (abs >= ms) {
        const value = Math.round(diff / ms);
        return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-value, unit);
      }
    }
    return "just now";
  }

  function isExpired(file) {
    return Boolean(file.expiresAt && file.expiresAt <= Date.now());
  }

  function getExpiryStatus(file) {
    if (!file.expiresAt) {
      return { label: "No expiry", className: "active" };
    }

    const remaining = file.expiresAt - Date.now();
    if (remaining <= 0) {
      return { label: "Expired", className: "expired" };
    }

    if (remaining <= 24 * 60 * 60 * 1000) {
      return { label: "Expiring soon", className: "warning" };
    }

    return { label: "Active", className: "active" };
  }

  function calculateExpiry(hours) {
    const numeric = Number(hours);
    return numeric > 0 ? Date.now() + numeric * 60 * 60 * 1000 : null;
  }

  function toast(title, message = "", type = "info") {
    const region = el("toastRegion");
    const node = document.createElement("div");
    node.className = `toast ${type}`;

    const symbol = document.createElement("div");
    symbol.className = "toast-symbol";
    symbol.textContent = type === "error" ? "!" : type === "warning" ? "!" : "✓";

    const body = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = title;
    const span = document.createElement("span");
    span.textContent = message;
    body.append(strong, span);

    const close = document.createElement("button");
    close.className = "toast-close";
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "×";
    close.addEventListener("click", () => node.remove());

    node.append(symbol, body, close);
    region.appendChild(node);

    setTimeout(() => node.remove(), 5000);
  }

  function setView(name, { focus = true } = {}) {
    if (!viewMeta[name]) return;

    state.currentView = name;
    qa("[data-view-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.viewPanel === name);
    });

    qa("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === name);
    });

    el("viewTitle").textContent = viewMeta[name].title;
    el("viewEyebrow").textContent = viewMeta[name].eyebrow;

    if (focus) {
      document.querySelector("main")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    el("sidebar").classList.remove("open");

    if (name === "dashboard") refreshDashboard().catch(handleError);
    if (name === "library") refreshLibrary().catch(handleError);
    if (name === "activity") renderActivity().catch(handleError);
  }

  function applyTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    el("themeIcon").textContent = next === "dark" ? "☼" : "☾";
    el("themeLabel").textContent = next === "dark" ? "Light mode" : "Dark mode";
  }

  function preferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function setSelectedFile(file) {
    if (!file) {
      state.selectedFile = null;
      el("selectedFileCard").classList.add("hidden");
      el("dropzone").classList.remove("hidden");
      el("saveFileBtn").disabled = true;
      el("uploadHint").textContent = "Choose a file to continue.";
      el("fileInput").value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast("File is too large", "The maximum supported size is 100 MB.", "error");
      return;
    }

    state.selectedFile = file;
    el("selectedFileName").textContent = file.name;
    el("selectedFileMeta").textContent = `${formatBytes(file.size)} • ${file.type || "Unknown type"}`;
    el("selectedFileIcon").textContent = getExtension(file.name);
    el("dropzone").classList.add("hidden");
    el("selectedFileCard").classList.remove("hidden");
    el("saveFileBtn").disabled = false;
    el("uploadHint").textContent = "Ready to save securely in this browser.";
  }

  async function storageEstimate() {
    if (!navigator.storage?.estimate) {
      return { usage: state.files.reduce((sum, file) => sum + (file.size || 0), 0), quota: null };
    }

    try {
      const result = await navigator.storage.estimate();
      return {
        usage: Number(result.usage) || 0,
        quota: Number(result.quota) || null
      };
    } catch {
      return { usage: state.files.reduce((sum, file) => sum + (file.size || 0), 0), quota: null };
    }
  }

  async function ensureCapacity(fileSize) {
    const estimate = await storageEstimate();
    if (!estimate.quota) return;

    const projected = estimate.usage + fileSize;
    if (projected > estimate.quota * 0.95) {
      throw new Error("Your browser does not have enough available storage for this file.");
    }
  }

  function setUploadProgress(percent, text) {
    const bounded = Math.min(100, Math.max(0, percent));
    el("uploadProgress").style.width = `${bounded}%`;
    el("uploadProgressText").textContent = text;
  }

  async function saveSelectedFile() {
    const file = state.selectedFile;
    if (!file) return;

    el("saveFileBtn").disabled = true;
    el("uploadProgressWrap").classList.remove("hidden");
    setUploadProgress(12, "Checking browser storage…");

    try {
      await ensureCapacity(file.size);
      setUploadProgress(35, "Generating secure file ID…");

      const id = await generateUniqueId();
      const expirationHours = Number(el("expirationSelect").value);
      const record = {
        id,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        extension: getExtension(file.name),
        note: el("fileNote").value.trim().slice(0, 120),
        createdAt: Date.now(),
        expiresAt: calculateExpiry(expirationHours),
        blob: file
      };

      setUploadProgress(62, "Writing file to IndexedDB…");
      await putFile(record);
      await addActivity("upload", record);

      setUploadProgress(100, "Saved successfully.");
      state.createdFileId = id;
      state.files = await getAllFiles();

      el("createdFileId").textContent = id;
      el("shareDialog").showModal();

      toast("File saved", `${file.name} is now available as ${id}.`);
      await refreshDashboard();
      await refreshLibrary();

      setTimeout(() => {
        setSelectedFile(null);
        el("fileNote").value = "";
        el("expirationSelect").value = "24";
        el("uploadProgressWrap").classList.add("hidden");
        setUploadProgress(0, "Preparing…");
      }, 400);
    } catch (error) {
      toast("Upload failed", error.message || "The file could not be stored.", "error");
      el("saveFileBtn").disabled = false;
      el("uploadProgressWrap").classList.add("hidden");
      setUploadProgress(0, "Preparing…");
    }
  }

  async function triggerDownload(file) {
    if (!file) return;

    if (isExpired(file)) {
      toast("File expired", "This file can no longer be downloaded.", "warning");
      return;
    }

    if (!(file.blob instanceof Blob)) {
      toast("File data is missing", "This entry does not contain downloadable file data.", "error");
      return;
    }

    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    await addActivity("download", file);
    toast("Download started", file.name);
    await refreshDashboard();
  }

  async function copyText(text, successMessage = "Copied to clipboard") {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    toast(successMessage, text);
  }

  async function shareFile(file) {
    if (!file) return;
    if (isExpired(file)) {
      toast("File expired", "Expired files cannot be shared.", "warning");
      return;
    }

    const shareFileObject = new File([file.blob], file.name, { type: file.type });
    const payload = {
      title: `OmniShare: ${file.name}`,
      text: `Shared from OmniShare • ID ${file.id}`,
      files: [shareFileObject]
    };

    if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
      try {
        await navigator.share(payload);
        await addActivity("share", file);
        toast("Share completed", file.name);
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    await copyText(file.id, "File ID copied");
    toast(
      "Native file sharing unavailable",
      "The file ID was copied instead. IDs work only in this browser profile.",
      "warning"
    );
  }

  function createEmptyState(title, text, symbol = "□") {
    const wrapper = document.createElement("div");
    wrapper.className = "empty-state";
    const icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = symbol;
    const heading = document.createElement("h3");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = text;
    wrapper.append(icon, heading, copy);
    return wrapper;
  }

  function buildCompactFile(file) {
    const row = document.createElement("div");
    row.className = "compact-file";

    const icon = document.createElement("div");
    icon.className = "compact-file-icon";
    icon.textContent = file.extension || getExtension(file.name);

    const body = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = file.name;
    const meta = document.createElement("span");
    meta.textContent = `${formatBytes(file.size)} • ${file.id}`;
    body.append(name, meta);

    const time = document.createElement("time");
    time.dateTime = new Date(file.createdAt).toISOString();
    time.textContent = formatRelativeTime(file.createdAt);

    row.append(icon, body, time);
    return row;
  }

  async function refreshDashboard() {
    state.files = await getAllFiles();
    const activeFiles = state.files.filter((file) => !isExpired(file));
    const expiring = activeFiles.filter(
      (file) => file.expiresAt && file.expiresAt - Date.now() <= 24 * 60 * 60 * 1000
    );
    const activity = await getActivity();
    const downloads = activity.filter((item) => item.type === "download").length;
    const estimate = await storageEstimate();

    el("storedFilesStat").textContent = activeFiles.length.toLocaleString();
    el("storageUsedStat").textContent = formatBytes(estimate.usage);
    el("downloadsStat").textContent = downloads.toLocaleString();
    el("expiringStat").textContent = expiring.length.toLocaleString();

    if (estimate.quota) {
      const ratio = Math.min(100, (estimate.usage / estimate.quota) * 100);
      el("storageFill").style.width = `${ratio.toFixed(2)}%`;
      el("storageUsedLabel").textContent = `${formatBytes(estimate.usage)} used`;
      el("storageQuotaLabel").textContent = `${formatBytes(estimate.quota)} available quota`;
      el("storageQuotaDetail").textContent = `${ratio.toFixed(1)}% of browser quota`;
    } else {
      el("storageFill").style.width = "0%";
      el("storageUsedLabel").textContent = `${formatBytes(estimate.usage)} used`;
      el("storageQuotaLabel").textContent = "Quota unavailable";
      el("storageQuotaDetail").textContent = "Browser quota unavailable";
    }

    const recent = [...state.files]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);

    const list = el("recentFilesList");
    list.replaceChildren();

    if (!recent.length) {
      list.append(
        createEmptyState(
          "No files yet",
          "Your latest uploads will appear here after you store a file.",
          "↑"
        )
      );
      return;
    }

    recent.forEach((file) => list.append(buildCompactFile(file)));
  }

  function createFileCard(file) {
    const template = el("fileCardTemplate");
    const card = template.content.firstElementChild.cloneNode(true);
    const status = getExpiryStatus(file);

    card.dataset.fileId = file.id;
    card.querySelector(".file-card-icon").textContent = file.extension || getExtension(file.name);

    const statusNode = card.querySelector(".file-card-status");
    statusNode.textContent = status.label;
    statusNode.classList.add(status.className);

    card.querySelector(".file-card-name").textContent = file.name;
    card.querySelector(".file-card-id").textContent = file.id;
    card.querySelector(".file-card-note").textContent = file.note || "No note";
    card.querySelector(".file-card-size").textContent = formatBytes(file.size);
    card.querySelector(".file-card-date").textContent = formatDate(file.createdAt);
    card.querySelector(".file-card-expiry").textContent = file.expiresAt
      ? formatDate(file.expiresAt)
      : "Never";

    const download = card.querySelector(".download-action");
    const share = card.querySelector(".share-action");

    if (isExpired(file)) {
      download.disabled = true;
      download.textContent = "Expired";
      share.disabled = true;
    }

    if (!navigator.share) {
      share.textContent = "Copy ID";
    }

    return card;
  }

  async function refreshLibrary() {
    state.files = await getAllFiles();

    const search = el("librarySearch").value.trim().toLowerCase();
    const sort = el("librarySort").value;

    let files = state.files.filter((file) => {
      if (!search) return true;
      return file.name.toLowerCase().includes(search) || file.id.toLowerCase().includes(search);
    });

    files.sort((a, b) => {
      if (sort === "oldest") return a.createdAt - b.createdAt;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "size") return b.size - a.size;
      return b.createdAt - a.createdAt;
    });

    const grid = el("libraryGrid");
    grid.replaceChildren();

    if (!files.length) {
      grid.append(
        createEmptyState(
          search ? "No matching files" : "Your library is empty",
          search
            ? "Try a different file name or OmniShare ID."
            : "Upload a file to begin building your local library.",
          "▦"
        )
      );
      return;
    }

    files.forEach((file) => grid.append(createFileCard(file)));
  }

  function renderRetrieveEmpty() {
    const result = el("retrieveResult");
    result.className = "retrieve-result empty-state";
    result.replaceChildren(
      ...createEmptyState(
        "Enter a file ID",
        "File information and download controls will appear here.",
        "⌕"
      ).childNodes
    );
  }

  async function findForRetrieve() {
    const id = normalizeId(el("retrieveIdInput").value);
    el("retrieveIdInput").value = id;

    if (!id) {
      toast("Enter a file ID", "Example: OMNI-A1B2-C3D4", "warning");
      return;
    }

    const file = await getFile(id);
    const result = el("retrieveResult");
    result.replaceChildren();
    result.className = "retrieve-result";

    if (!file) {
      result.classList.add("empty-state");
      result.append(
        createEmptyState(
          "File not found",
          "This ID is not stored in this browser profile.",
          "?"
        )
      );
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "retrieve-file";

    const icon = document.createElement("div");
    icon.className = "file-type-icon";
    icon.textContent = file.extension || getExtension(file.name);

    const main = document.createElement("div");
    main.className = "retrieve-file-main";

    const name = document.createElement("h3");
    name.textContent = file.name;

    const idNode = document.createElement("code");
    idNode.className = "retrieve-file-id";
    idNode.textContent = file.id;

    const meta = document.createElement("div");
    meta.className = "retrieve-meta";
    const items = [
      `Size: ${formatBytes(file.size)}`,
      `Added: ${formatDate(file.createdAt)}`,
      `Expires: ${file.expiresAt ? formatDate(file.expiresAt) : "Never"}`
    ];
    items.forEach((value) => {
      const span = document.createElement("span");
      span.textContent = value;
      meta.appendChild(span);
    });

    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = file.note || "No note attached.";

    const actions = document.createElement("div");
    actions.className = "retrieve-actions";

    const download = document.createElement("button");
    download.type = "button";
    download.className = "primary-btn";
    download.textContent = isExpired(file) ? "File expired" : "Download file";
    download.disabled = isExpired(file);
    download.addEventListener("click", () => triggerDownload(file).catch(handleError));

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "secondary-btn";
    copy.textContent = "Copy ID";
    copy.addEventListener("click", () => copyText(file.id, "File ID copied"));

    const share = document.createElement("button");
    share.type = "button";
    share.className = "secondary-btn";
    share.textContent = navigator.share ? "Share file" : "Copy ID";
    share.disabled = isExpired(file);
    share.addEventListener("click", () => shareFile(file).catch(handleError));

    actions.append(download, copy, share);
    main.append(name, idNode, meta, note, actions);
    wrap.append(icon, main);
    result.append(wrap);
  }

  async function deleteStoredFile(id) {
    const file = await getFile(id);
    if (!file) return;

    const confirmed = window.confirm(
      `Delete "${file.name}" from this browser? This permanently removes its stored file data.`
    );
    if (!confirmed) return;

    await removeFile(id);
    await addActivity("delete", file);
    state.files = await getAllFiles();

    toast("File deleted", file.name);
    await refreshLibrary();
    await refreshDashboard();

    if (normalizeId(el("retrieveIdInput").value) === id) {
      renderRetrieveEmpty();
    }
  }

  async function clearExpiredFiles() {
    const files = await getAllFiles();
    const expired = files.filter(isExpired);

    if (!expired.length) {
      toast("Nothing to clear", "There are no expired files in your library.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${expired.length} expired file${expired.length === 1 ? "" : "s"} permanently?`
    );
    if (!confirmed) return;

    for (const file of expired) {
      await removeFile(file.id);
      await addActivity("delete", file, { reason: "expired-cleanup" });
    }

    toast("Expired files cleared", `${expired.length} file${expired.length === 1 ? "" : "s"} removed.`);
    await refreshLibrary();
    await refreshDashboard();
  }

  function activityDescription(item) {
    const labels = {
      upload: "Stored file",
      download: "Downloaded file",
      share: "Shared file",
      delete: "Deleted file"
    };
    return labels[item.type] || "File activity";
  }

  function activitySymbol(type) {
    return {
      upload: "↑",
      download: "↓",
      share: "↗",
      delete: "×"
    }[type] || "•";
  }

  async function renderActivity() {
    const activity = await getActivity();
    const list = el("activityList");
    list.replaceChildren();

    if (!activity.length) {
      list.append(
        createEmptyState(
          "No activity yet",
          "Uploads, downloads, shares, and deletions will appear here.",
          "↺"
        )
      );
      return;
    }

    activity.slice(0, 100).forEach((item) => {
      const row = document.createElement("div");
      row.className = "activity-item";

      const icon = document.createElement("div");
      icon.className = "activity-icon";
      icon.textContent = activitySymbol(item.type);

      const main = document.createElement("div");
      main.className = "activity-main";
      const strong = document.createElement("strong");
      strong.textContent = activityDescription(item);
      const span = document.createElement("span");
      span.textContent = `${item.name} • ${item.fileId}`;
      main.append(strong, span);

      const time = document.createElement("time");
      time.className = "activity-time";
      time.dateTime = new Date(item.timestamp).toISOString();
      time.textContent = formatRelativeTime(item.timestamp);

      row.append(icon, main, time);
      list.append(row);
    });
  }

  function handleHash() {
    const raw = location.hash.replace(/^#/, "");
    const params = new URLSearchParams(raw);
    const id = params.get("download");
    if (!id) return;

    setView("retrieve", { focus: false });
    el("retrieveIdInput").value = normalizeId(id);
    findForRetrieve().catch(handleError);
  }

  function handleError(error) {
    console.error(error);
    toast(
      "Something went wrong",
      error?.message || "OmniShare could not complete that action.",
      "error"
    );
  }

  function bindEvents() {
    qa("[data-view]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });

    qa("[data-go]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.go));
    });

    el("sidebarToggle").addEventListener("click", () => {
      el("sidebar").classList.toggle("open");
    });

    el("themeToggle").addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });

    const dropzone = el("dropzone");
    const input = el("fileInput");

    dropzone.addEventListener("click", () => input.click());
    dropzone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        input.click();
      }
    });

    input.addEventListener("change", () => setSelectedFile(input.files?.[0] || null));

    ["dragenter", "dragover"].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((name) => {
      dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) setSelectedFile(file);
    });

    el("clearSelectedFile").addEventListener("click", () => setSelectedFile(null));
    el("saveFileBtn").addEventListener("click", () => saveSelectedFile().catch(handleError));

    el("findFileBtn").addEventListener("click", () => findForRetrieve().catch(handleError));
    el("retrieveIdInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter") findForRetrieve().catch(handleError);
    });

    el("librarySearch").addEventListener("input", () => refreshLibrary().catch(handleError));
    el("librarySort").addEventListener("change", () => refreshLibrary().catch(handleError));
    el("clearExpiredBtn").addEventListener("click", () => clearExpiredFiles().catch(handleError));

    el("libraryGrid").addEventListener("click", async (event) => {
      const card = event.target.closest(".file-card");
      if (!card) return;
      const file = await getFile(card.dataset.fileId);
      if (!file) return;

      if (event.target.closest(".download-action")) {
        await triggerDownload(file);
      } else if (event.target.closest(".copy-action")) {
        await copyText(file.id, "File ID copied");
      } else if (event.target.closest(".share-action")) {
        await shareFile(file);
      } else if (event.target.closest(".delete-action")) {
        await deleteStoredFile(file.id);
      }
    });

    el("clearActivityBtn").addEventListener("click", async () => {
      const confirmed = window.confirm("Clear the OmniShare activity log on this browser?");
      if (!confirmed) return;
      await clearActivity();
      toast("Activity cleared");
      await renderActivity();
      await refreshDashboard();
    });

    el("copyCreatedIdBtn").addEventListener("click", () => {
      if (state.createdFileId) copyText(state.createdFileId, "File ID copied");
    });

    el("shareCreatedFileBtn").addEventListener("click", async () => {
      if (!state.createdFileId) return;
      const file = await getFile(state.createdFileId);
      if (file) await shareFile(file);
    });

    window.addEventListener("hashchange", handleHash);
  }

  async function initialize() {
    applyTheme(preferredTheme());
    bindEvents();

    try {
      state.db = await openDatabase();
      state.files = await getAllFiles();
      await refreshDashboard();
      await refreshLibrary();
      await renderActivity();
      handleHash();
    } catch (error) {
      console.error(error);
      toast(
        "Storage unavailable",
        "OmniShare needs browser IndexedDB access to store real files.",
        "error"
      );
      el("saveFileBtn").disabled = true;
    }
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
