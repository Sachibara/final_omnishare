(() => {
  "use strict";

  const SUPABASE_URL = "https://taizmxigaeyrxtvnnzbw.supabase.co";
  const SUPABASE_KEY = "sb_publishable_EmCXMq9_SNjG-ISf6_9v7Q_iHZsLz29";
  const BUCKET = "omnishare-files";
  const CURRENT_MAX_FILE_SIZE = 50 * 1024 * 1024;
  const DESIGNED_MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
  const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
  const TUS_ENDPOINT = "https://taizmxigaeyrxtvnnzbw.storage.supabase.co/storage/v1/upload/resumable";
  const THEME_KEY = "omnishare-theme";
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  if (!window.supabase || !window.supabase.createClient) {
    document.addEventListener("DOMContentLoaded", function () {
      alert("OmniShare cloud services could not load. Please refresh the page.");
    });
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const state = {
    user: null,
    selectedFile: null,
    createdShareId: null,
    files: [],
    activity: []
  };

  const views = {
    dashboard: ["Dashboard", "Overview"],
    upload: ["Upload", "Store a file"],
    retrieve: ["Retrieve", "Download by ID"],
    library: ["Library", "Stored files"],
    activity: ["Activity", "Audit trail"]
  };

  function el(id) { return document.getElementById(id); }
  function all(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatBytes(bytes) {
    let size = Number(bytes) || 0;
    if (size < 1024) return size + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let value = size / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return value.toFixed(digits) + " " + units[index];
  }

  function formatDate(value) {
    if (!value) return "Never";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function relativeTime(value) {
    const diff = Date.now() - new Date(value).getTime();
    const abs = Math.abs(diff);
    const choices = [["day", 86400000], ["hour", 3600000], ["minute", 60000]];
    for (const pair of choices) {
      if (abs >= pair[1]) {
        return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
          .format(-Math.round(diff / pair[1]), pair[0]);
      }
    }
    return "just now";
  }

  function extension(name) {
    const parts = String(name || "").split(".");
    return parts.length < 2 ? "FILE" : (parts.pop().slice(0, 5).toUpperCase() || "FILE");
  }

  function normalizeId(value) {
    let raw = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9:-]/g, "");

    raw = raw.replace(/^OMNI[:\-]*/, "").replace(/-/g, "");

    if (/^[A-HJ-NP-Z2-9]{8}$/.test(raw)) {
      return "OMNI-" + raw.slice(0, 4) + "-" + raw.slice(4);
    }

    return String(value || "").trim().toUpperCase();
  }

  function randomSegment() {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, function (byte) {
      return ALPHABET[byte % ALPHABET.length];
    }).join("");
  }

  function createShareId() {
    return "OMNI-" + randomSegment() + "-" + randomSegment();
  }

  function safeName(name) {
    const cleaned = String(name || "file")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^\.+/, "");
    return (cleaned || "file").slice(-160);
  }

  function expiresAt(hours) {
    const numeric = Number(hours);
    return numeric > 0 ? new Date(Date.now() + numeric * 3600000).toISOString() : null;
  }

  function isExpired(file) {
    return !!(file.expiresAt && new Date(file.expiresAt).getTime() <= Date.now());
  }

  function expiryState(file) {
    if (!file.expiresAt) return { label: "No expiry", css: "active" };
    const remaining = new Date(file.expiresAt).getTime() - Date.now();
    if (remaining <= 0) return { label: "Expired", css: "expired" };
    if (remaining <= 86400000) return { label: "Expiring soon", css: "warning" };
    return { label: "Active", css: "active" };
  }

  function mapFile(row) {
    return {
      id: row.id,
      shareId: row.share_id,
      storagePath: row.storage_path,
      name: row.original_name,
      size: Number(row.size_bytes || 0),
      type: row.mime_type || "application/octet-stream",
      note: row.note || "",
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      downloadCount: Number(row.download_count || 0),
      lastDownloadedAt: row.last_downloaded_at
    };
  }

  function toast(title, message, type) {
    const region = el("toastRegion");
    if (!region) return;
    const node = document.createElement("div");
    node.className = "toast " + (type || "info");

    const symbol = document.createElement("div");
    symbol.className = "toast-symbol";
    symbol.textContent = type === "error" || type === "warning" ? "!" : "✓";

    const body = document.createElement("div");
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    strong.textContent = title;
    span.textContent = message || "";
    body.append(strong, span);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "×";
    close.addEventListener("click", function () { node.remove(); });

    node.append(symbol, body, close);
    region.appendChild(node);
    setTimeout(function () { node.remove(); }, 5200);
  }

  function applyTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    if (el("themeIcon")) el("themeIcon").textContent = next === "dark" ? "☼" : "☾";
    if (el("themeLabel")) el("themeLabel").textContent = next === "dark" ? "Light mode" : "Dark mode";
  }

  function setView(name, focus) {
    if (!views[name]) return;
    all("[data-view-panel]").forEach(function (panel) {
      panel.classList.toggle("active", panel.dataset.viewPanel === name);
    });
    all("[data-view]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === name);
    });
    el("viewTitle").textContent = views[name][0];
    el("viewEyebrow").textContent = views[name][1];
    if (focus !== false) document.querySelector("main").scrollIntoView({ behavior: "smooth", block: "start" });
    if (el("sidebar")) el("sidebar").classList.remove("open");
    if (name === "dashboard") renderDashboard();
    if (name === "library") renderLibrary();
    if (name === "activity") renderActivity();
  }

  function setProgress(percent, text) {
    if (el("uploadProgress")) el("uploadProgress").style.width = Math.max(0, Math.min(100, percent)) + "%";
    if (el("uploadProgressText")) el("uploadProgressText").textContent = text;
  }

  function selectFile(file) {
    if (!file) {
      state.selectedFile = null;
      el("selectedFileCard").classList.add("hidden");
      el("dropzone").classList.remove("hidden");
      el("saveFileBtn").disabled = true;
      el("fileInput").value = "";
      el("uploadHint").textContent = state.user ? "Choose a file to continue." : "Sign in, then choose a file to upload.";
      return;
    }

    if (file.size > CURRENT_MAX_FILE_SIZE) {
      toast(
        "Current backend limit reached",
        "This Supabase Free project currently allows up to 50 MB per file. OmniShare is already designed for files up to 5 GB once the Storage plan/global limit is increased.",
        "warning"
      );
      return;
    }

    state.selectedFile = file;
    el("selectedFileName").textContent = file.name;
    el("selectedFileMeta").textContent = formatBytes(file.size) + " • " + (file.type || "Unknown type");
    el("selectedFileIcon").textContent = extension(file.name);
    el("dropzone").classList.add("hidden");
    el("selectedFileCard").classList.remove("hidden");
    el("saveFileBtn").disabled = false;
    el("uploadHint").textContent = state.user ? "Ready to upload securely to your cloud vault." : "Sign in is required before upload.";
  }

  function buildAuthDialog() {
    if (el("authButton")) return;

    const button = document.createElement("button");
    button.id = "authButton";
    button.type = "button";
    button.className = "secondary-btn compact";
    button.textContent = "Sign in";
    document.querySelector(".topbar-actions").appendChild(button);

    const dialog = document.createElement("dialog");
    dialog.id = "authDialog";
    dialog.className = "share-dialog auth-dialog";
    dialog.innerHTML =
      '<div class="dialog-card auth-card">' +
        '<div class="dialog-heading">' +
          '<div><p class="section-kicker">OmniShare Cloud</p><h2>Account access</h2></div>' +
          '<button class="icon-button" id="authCloseBtn" type="button" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="auth-tabs">' +
          '<button class="secondary-btn compact active" type="button" data-auth-tab="signin">Sign in</button>' +
          '<button class="secondary-btn compact" type="button" data-auth-tab="signup">Create account</button>' +
        '</div>' +
        '<form id="signInForm" class="auth-form">' +
          '<label class="field"><span>Email</span><input id="signInEmail" type="email" autocomplete="email" required></label>' +
          '<label class="field"><span>Password</span><input id="signInPassword" type="password" autocomplete="current-password" minlength="6" required></label>' +
          '<button class="primary-btn" type="submit">Sign in</button>' +
        '</form>' +
        '<form id="signUpForm" class="auth-form hidden">' +
          '<label class="field"><span>Email</span><input id="signUpEmail" type="email" autocomplete="email" required></label>' +
          '<label class="field"><span>Password</span><input id="signUpPassword" type="password" autocomplete="new-password" minlength="8" required></label>' +
          '<button class="primary-btn" type="submit">Create free account</button>' +
        '</form>' +
        '<p class="auth-message" id="authMessage">Accounts protect uploads and cloud libraries. Recipients do not need an account to retrieve a shared file.</p>' +
      '</div>';
    document.body.appendChild(dialog);

    el("authCloseBtn").addEventListener("click", function () { dialog.close(); });

    all("[data-auth-tab]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        const signup = tab.dataset.authTab === "signup";
        all("[data-auth-tab]").forEach(function (item) { item.classList.toggle("active", item === tab); });
        el("signInForm").classList.toggle("hidden", signup);
        el("signUpForm").classList.toggle("hidden", !signup);
        authMessage(signup ? "Create a free account to upload and manage files." : "Sign in to access your cloud library.", false);
      });
    });

    el("signInForm").addEventListener("submit", async function (event) {
      event.preventDefault();
      authMessage("Signing in...", false);
      const result = await client.auth.signInWithPassword({
        email: el("signInEmail").value.trim(),
        password: el("signInPassword").value
      });
      if (result.error) return authMessage(result.error.message, true);
      dialog.close();
      toast("Signed in", "Your OmniShare cloud library is ready.");
    });

    el("signUpForm").addEventListener("submit", async function (event) {
      event.preventDefault();
      authMessage("Creating account...", false);
      const result = await client.auth.signUp({
        email: el("signUpEmail").value.trim(),
        password: el("signUpPassword").value,
        options: { emailRedirectTo: window.location.origin }
      });
      if (result.error) return authMessage(result.error.message, true);
      if (result.data.session) {
        dialog.close();
        toast("Account created", "You are signed in and ready to upload.");
      } else {
        authMessage("Account created. Check your email for the confirmation link, then return here and sign in.", false);
      }
    });

    button.addEventListener("click", async function () {
      if (!state.user) return openAuth();
      if (confirm("Sign out of OmniShare?")) await client.auth.signOut();
    });
  }

  function authMessage(message, error) {
    const box = el("authMessage");
    if (!box) return;
    box.textContent = message;
    box.classList.toggle("error", !!error);
  }

  function openAuth() {
    authMessage("Sign in to upload files and access your cloud library.", false);
    el("authDialog").showModal();
  }

  function requireAuth() {
    if (state.user) return true;
    openAuth();
    toast("Sign in required", "Uploading and library management require a free OmniShare account.", "warning");
    return false;
  }

  async function loadFiles() {
    if (!state.user) {
      state.files = [];
      return;
    }
    const result = await client
      .from("omnishare_files")
      .select("id,share_id,storage_path,original_name,size_bytes,mime_type,note,created_at,expires_at,download_count,last_downloaded_at")
      .order("created_at", { ascending: false });
    if (result.error) throw result.error;
    state.files = (result.data || []).map(mapFile);
  }

  async function loadActivity() {
    if (!state.user) {
      state.activity = [];
      return;
    }
    const result = await client
      .from("omnishare_activity")
      .select("id,event_type,share_id,file_name,detail,created_at")
      .order("created_at", { ascending: false })
      .limit(250);
    if (result.error) throw result.error;
    state.activity = result.data || [];
  }

  async function syncAuth(session) {
    state.user = session ? session.user : null;
    el("authButton").textContent = state.user ? "Sign out · " + (state.user.email || "account") : "Sign in";

    if (el("cloudStatus")) {
      el("cloudStatus").innerHTML = '<span class="status-dot"></span>' + (state.user ? " Signed in" : " Cloud ready");
    }
    if (!state.selectedFile) {
      el("uploadHint").textContent = state.user ? "Choose a file to continue." : "Sign in, then choose a file to upload.";
    }

    await Promise.all([loadFiles(), loadActivity()]);
    renderDashboard();
    renderLibrary();
    renderActivity();
  }

  async function addActivity(type, file, detail) {
    if (!state.user) return;
    const result = await client.from("omnishare_activity").insert({
      owner_id: state.user.id,
      file_id: file.id || null,
      event_type: type,
      share_id: file.shareId,
      file_name: file.name,
      detail: detail || {}
    });
    if (result.error) console.warn("Activity log failed:", result.error.message);
  }

  async function storagePathForFile(file) {
    const source = [
      state.user.id,
      file.name,
      file.size,
      file.lastModified || 0,
      file.type || "application/octet-stream"
    ].join("|");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    const hex = Array.from(new Uint8Array(digest), function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
    return state.user.id + "/uploads/" + hex.slice(0, 32) + "-" + safeName(file.name);
  }

  async function uploadWithTus(path, file) {
    if (!window.tus || !window.tus.Upload) {
      throw new Error("Resumable upload engine could not load. Refresh the page and try again.");
    }

    const sessionResult = await client.auth.getSession();
    const session = sessionResult.data && sessionResult.data.session;
    if (!session || !session.access_token) {
      throw new Error("Your session expired. Sign in again before uploading.");
    }

    return new Promise(function (resolve, reject) {
      const upload = new window.tus.Upload(file, {
        endpoint: TUS_ENDPOINT,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: "Bearer " + session.access_token,
          apikey: SUPABASE_KEY,
          "x-upsert": "false"
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: {
          bucketName: BUCKET,
          objectName: path,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600"
        },
        onError: function (error) {
          reject(error);
        },
        onProgress: function (bytesUploaded, bytesTotal) {
          const percentage = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
          setProgress(15 + Math.round(percentage * 0.5), "Uploading " + percentage + "% • resumable");
        },
        onSuccess: function () {
          resolve();
        }
      });

      upload.findPreviousUploads()
        .then(function (previousUploads) {
          if (previousUploads.length) {
            upload.resumeFromPreviousUpload(previousUploads[0]);
            toast("Upload resumed", "Continuing from the last successfully uploaded chunk.");
          }
          upload.start();
        })
        .catch(reject);
    });
  }

  async function uploadToStorage(path, file) {
    if (file.size > RESUMABLE_THRESHOLD) {
      return uploadWithTus(path, file);
    }

    const upload = await client.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream",
      upsert: false
    });
    if (upload.error) throw upload.error;
  }

  async function uploadSelected() {
    if (!state.selectedFile) return;
    if (!requireAuth()) return;

    const file = state.selectedFile;
    const path = await storagePathForFile(file);
    const existing = state.files.find(function (item) {
      return item.storagePath === path && !isExpired(item);
    });
    if (existing) {
      toast("Already uploaded", "This exact file is already available as " + existing.shareId + ".", "warning");
      return;
    }

    el("saveFileBtn").disabled = true;
    el("uploadProgressWrap").classList.remove("hidden");
    setProgress(15, "Connecting to private cloud storage…");

    try {
      if (file.size > RESUMABLE_THRESHOLD) {
        setProgress(15, "Preparing resumable upload…");
      } else {
        setProgress(15, "Uploading securely…");
      }
      await uploadToStorage(path, file);

      setProgress(65, "Creating secure OmniShare ID…");

      let created = null;
      let lastError = null;
      for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
        const shareId = createShareId();
        const insert = await client.from("omnishare_files").insert({
          share_id: shareId,
          owner_id: state.user.id,
          storage_path: path,
          original_name: file.name,
          size_bytes: file.size,
          mime_type: file.type || "application/octet-stream",
          note: el("fileNote").value.trim().slice(0, 120) || null,
          expires_at: expiresAt(el("expirationSelect").value)
        }).select().single();

        if (!insert.error) created = mapFile(insert.data);
        else if (insert.error.code === "23505") lastError = insert.error;
        else throw insert.error;
      }

      if (!created) throw lastError || new Error("Could not create a unique share ID.");

      await addActivity("upload", created, { source: "cloud" });
      state.createdShareId = created.shareId;

      setProgress(100, "Upload complete.");
      el("createdFileId").textContent = created.shareId;
      el("shareDialog").showModal();
      toast("File uploaded", file.name + " is available as " + created.shareId);

      await Promise.all([loadFiles(), loadActivity()]);
      renderDashboard();
      renderLibrary();
      renderActivity();

      setTimeout(function () {
        selectFile(null);
        el("fileNote").value = "";
        el("expirationSelect").value = "24";
        el("uploadProgressWrap").classList.add("hidden");
        setProgress(0, "Preparing…");
      }, 400);
    } catch (error) {
      await client.storage.from(BUCKET).remove([path]);
      el("saveFileBtn").disabled = false;
      el("uploadProgressWrap").classList.add("hidden");
      setProgress(0, "Preparing…");
      toast("Upload failed", error.message || "The file could not be uploaded.", "error");
    }
  }

  async function publicLookup(shareId, action) {
    const id = normalizeId(shareId);
    const response = await fetch(SUPABASE_URL + "/functions/v1/omnishare-retrieve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY
      },
      body: JSON.stringify({ shareId: id, action: action || "info" })
    });

    const payload = await response.json().catch(function () {
      return { error: "Invalid server response." };
    });

    if (!response.ok) throw new Error(payload.error || "File could not be retrieved.");
    return payload;
  }

  function startSignedDownload(url) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function retrieveFile() {
    const id = normalizeId(el("retrieveIdInput").value);
    if (!id) return;

    const box = el("retrieveResult");
    box.className = "retrieve-result empty-state";
    box.innerHTML = '<div class="empty-icon">⌕</div><h3>Looking up file…</h3><p>Checking the secure OmniShare cloud.</p>';

    try {
      const payload = await publicLookup(id);
      const file = payload.file;

      box.className = "retrieve-result";
      box.innerHTML =
        '<div class="retrieve-file">' +
          '<div class="file-type-icon">' + escapeHtml(extension(file.name)) + '</div>' +
          '<div class="retrieve-file-info">' +
            '<h3>' + escapeHtml(file.name) + '</h3>' +
            '<code>' + escapeHtml(file.shareId) + '</code>' +
            '<p>' + escapeHtml(file.note || "Shared through OmniShare") + '</p>' +
            '<div class="retrieve-meta">' +
              '<span><b>Size</b> ' + escapeHtml(formatBytes(file.size)) + '</span>' +
              '<span><b>Expires</b> ' + escapeHtml(file.expiresAt ? formatDate(file.expiresAt) : "No expiry") + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="retrieve-actions">' +
            (previewKind(file) ? '<button class="secondary-btn" id="publicPreviewBtn" type="button">Preview</button>' : '') +
            '<button class="primary-btn" id="publicDownloadBtn" type="button">Download file</button>' +
          '</div>' +
        '</div>';

      if (el("publicPreviewBtn")) {
        el("publicPreviewBtn").addEventListener("click", function () {
          openPreview(file);
        });
      }

      el("publicDownloadBtn").addEventListener("click", async function () {
        try {
          const download = await publicLookup(file.shareId, "download");
          startSignedDownload(download.signedUrl);
        } catch (error) {
          toast("Download failed", error.message || "The file could not be downloaded.", "error");
        }
      });
    } catch (error) {
      box.className = "retrieve-result empty-state";
      box.innerHTML = '<div class="empty-icon">!</div><h3>File unavailable</h3><p>' + escapeHtml(error.message) + '</p>';
    }
  }

  async function downloadOwn(file) {
    const payload = await publicLookup(file.shareId, "download");
    startSignedDownload(payload.signedUrl);
    await Promise.all([loadFiles(), loadActivity()]);
    renderDashboard();
    renderActivity();
  }

  function renderDashboard() {
    const active = state.files.filter(function (file) { return !isExpired(file); });
    const total = state.files.reduce(function (sum, file) { return sum + file.size; }, 0);
    const downloads = state.files.reduce(function (sum, file) { return sum + file.downloadCount; }, 0);
    const soon = active.filter(function (file) {
      return file.expiresAt && new Date(file.expiresAt).getTime() - Date.now() <= 86400000;
    }).length;

    el("storedFilesStat").textContent = state.user ? active.length : "—";
    el("storageUsedStat").textContent = state.user ? formatBytes(total) : "—";
    el("downloadsStat").textContent = state.user ? downloads : "—";
    el("expiringStat").textContent = state.user ? soon : "—";
    el("storageQuotaDetail").textContent = state.user ? "Private cloud storage used by your files" : "Sign in to view cloud usage";
    el("storageUsedLabel").textContent = state.user ? formatBytes(total) + " stored" : "Sign in to view storage";
    el("storageQuotaLabel").textContent = "Current Free backend: 50 MB/file • app architecture ready for 5 GB";
    el("storageFill").style.width = Math.min(100, total / (1024 * 1024 * 1024) * 100) + "%";

    const list = el("recentFilesList");
    list.innerHTML = "";

    if (!state.user) {
      list.innerHTML = '<div class="empty-state compact-empty"><h3>Cloud library locked</h3><p>Sign in to see your uploaded files.</p></div>';
      return;
    }

    active.slice(0, 5).forEach(function (file) {
      const row = document.createElement("div");
      row.className = "compact-row";
      const left = document.createElement("div");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      const small = document.createElement("small");
      strong.textContent = file.name;
      span.textContent = file.shareId + " · " + formatBytes(file.size);
      small.textContent = relativeTime(file.createdAt);
      left.append(strong, span);
      row.append(left, small);
      list.appendChild(row);
    });

    if (!active.length) {
      list.innerHTML = '<div class="empty-state compact-empty"><h3>No cloud files yet</h3><p>Upload your first file to create a shareable OmniShare ID.</p></div>';
    }
  }

  function renderLibrary() {
    const grid = el("libraryGrid");
    if (!grid) return;

    if (!state.user) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">☁</div><h3>Sign in to your cloud library</h3><p>Your uploads are private and only visible to your account.</p></div>';
      return;
    }

    const query = String(el("librarySearch").value || "").trim().toLowerCase();
    const sort = el("librarySort").value || "newest";

    let files = state.files.filter(function (file) {
      return !query || [file.name, file.shareId, file.note].join(" ").toLowerCase().includes(query);
    });

    files.sort(function (a, b) {
      if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "size") return b.size - a.size;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    grid.innerHTML = "";
    const template = el("fileCardTemplate");

    files.forEach(function (file) {
      const card = template.content.firstElementChild.cloneNode(true);
      const status = expiryState(file);
      card.dataset.fileId = file.id;
      card.querySelector(".file-card-icon").textContent = extension(file.name);
      card.querySelector(".file-card-status").innerHTML = '<span class="status-badge ' + status.css + '">' + escapeHtml(status.label) + '</span>';
      card.querySelector(".file-card-name").textContent = file.name;
      card.querySelector(".file-card-id").textContent = file.shareId;
      card.querySelector(".file-card-note").textContent = file.note || "No note";
      card.querySelector(".file-card-size").textContent = formatBytes(file.size);
      card.querySelector(".file-card-date").textContent = formatDate(file.createdAt);
      card.querySelector(".file-card-expiry").textContent = file.expiresAt ? formatDate(file.expiresAt) : "Never";
      card.querySelector(".download-action").disabled = isExpired(file);
      const previewButton = card.querySelector(".preview-action");
      if (previewButton) {
        previewButton.disabled = isExpired(file) || !previewKind(file);
        previewButton.title = previewKind(file) ? "Open secure inline preview" : "No inline preview for this file type";
      }
      grid.appendChild(card);
    });

    if (!files.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">☁</div><h3>No matching files</h3><p>Upload a file or adjust your search.</p></div>';
    }
  }

  function renderActivity() {
    const list = el("activityList");
    if (!list) return;

    if (!state.user) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">↺</div><h3>Sign in to view activity</h3><p>Your cloud activity log is private to your account.</p></div>';
      return;
    }

    list.innerHTML = "";
    state.activity.forEach(function (item) {
      const row = document.createElement("div");
      row.className = "activity-row";
      const symbol = item.event_type === "upload" ? "↑" : item.event_type === "download" ? "↓" : item.event_type === "share" ? "↗" : "×";
      const label = item.event_type.charAt(0).toUpperCase() + item.event_type.slice(1);
      row.innerHTML =
        '<div class="activity-symbol">' + symbol + '</div>' +
        '<div><strong>' + escapeHtml(label + " · " + item.file_name) + '</strong><span>' + escapeHtml(item.share_id) + '</span></div>' +
        '<time>' + escapeHtml(relativeTime(item.created_at)) + '</time>';
      list.appendChild(row);
    });

    if (!state.activity.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">↺</div><h3>No activity yet</h3><p>Your file events will appear here.</p></div>';
    }
  }

  async function deleteFile(file) {
    if (!confirm("Delete " + file.name + " permanently from OmniShare?")) return;

    const removed = await client.storage.from(BUCKET).remove([file.storagePath]);
    if (removed.error) return toast("Delete failed", removed.error.message, "error");

    await addActivity("delete", file, { source: "library" });
    const deleted = await client.from("omnishare_files").delete().eq("id", file.id);
    if (deleted.error) return toast("Delete failed", deleted.error.message, "error");

    await Promise.all([loadFiles(), loadActivity()]);
    renderDashboard();
    renderLibrary();
    renderActivity();
    toast("File deleted", file.name);
  }

  async function clearExpired() {
    if (!requireAuth()) return;
    const expired = state.files.filter(isExpired);
    if (!expired.length) return toast("Nothing to clear", "There are no expired files.");
    if (!confirm("Delete " + expired.length + " expired file(s) permanently?")) return;

    for (const file of expired) {
      const removed = await client.storage.from(BUCKET).remove([file.storagePath]);
      if (!removed.error) {
        await addActivity("delete", file, { source: "expired_cleanup" });
        await client.from("omnishare_files").delete().eq("id", file.id);
      }
    }

    await Promise.all([loadFiles(), loadActivity()]);
    renderDashboard();
    renderLibrary();
    renderActivity();
    toast("Expired files cleared", expired.length + " file(s) processed.");
  }

  async function copyText(text, title) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    toast(title || "Copied", text);
  }

  async function shareFile(file) {
    const url = window.location.origin + window.location.pathname + "?id=" + encodeURIComponent(file.shareId) + "#retrieve";
    const payload = {
      title: "OmniShare: " + file.name,
      text: "Secure OmniShare ID: " + file.shareId,
      url: url
    };

    if (navigator.share) {
      try {
        await navigator.share(payload);
        await addActivity("share", file, { method: "web_share" });
        await loadActivity();
        renderActivity();
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }

    await copyText(file.shareId + "\n" + url, "Share details copied");
    await addActivity("share", file, { method: "clipboard" });
    await loadActivity();
    renderActivity();
  }

  function previewKind(file) {
    const type = String(file.type || "").toLowerCase();
    const ext = String(file.name || "").split(".").pop().toLowerCase();

    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    if (type === "application/pdf" || ext === "pdf") return "pdf";
    if (
      type.startsWith("text/") ||
      ["txt","md","json","csv","xml","js","ts","css","py","java","c","cpp","h","log","yaml","yml"].includes(ext)
    ) return "text";
    return null;
  }

  function ensurePreviewDialog() {
    if (el("previewDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "previewDialog";
    dialog.className = "share-dialog preview-dialog";
    dialog.innerHTML =
      '<div class="dialog-card preview-card">' +
        '<div class="dialog-heading">' +
          '<div><p class="section-kicker">Secure preview</p><h2 id="previewTitle">Preview</h2></div>' +
          '<button class="icon-button" id="previewCloseBtn" type="button" aria-label="Close preview">×</button>' +
        '</div>' +
        '<div class="preview-stage" id="previewStage"></div>' +
        '<p class="dialog-note">Preview links are temporary and the underlying storage bucket remains private.</p>' +
      '</div>';
    document.body.appendChild(dialog);
    el("previewCloseBtn").addEventListener("click", function () {
      dialog.close();
    });
    dialog.addEventListener("close", function () {
      el("previewStage").innerHTML = "";
    });
  }

  async function openPreview(file) {
    const kind = previewKind(file);
    if (!kind) {
      toast("Preview unavailable", "This file type can be downloaded but does not have an inline browser preview.", "warning");
      return;
    }

    ensurePreviewDialog();
    el("previewTitle").textContent = file.name;
    const stage = el("previewStage");
    stage.innerHTML = '<div class="empty-state"><div class="empty-icon">⌕</div><h3>Preparing secure preview…</h3></div>';
    el("previewDialog").showModal();

    try {
      const payload = await publicLookup(file.shareId, "preview");
      const url = payload.signedUrl;

      if (kind === "image") {
        stage.innerHTML = '<img class="preview-image" alt="">';
        stage.querySelector("img").src = url;
        stage.querySelector("img").alt = file.name;
      } else if (kind === "video") {
        stage.innerHTML = '<video class="preview-video" controls preload="metadata"></video>';
        stage.querySelector("video").src = url;
      } else if (kind === "audio") {
        stage.innerHTML = '<div class="preview-audio-wrap"><div class="file-type-icon">AUDIO</div><audio class="preview-audio" controls></audio></div>';
        stage.querySelector("audio").src = url;
      } else if (kind === "pdf") {
        stage.innerHTML = '<iframe class="preview-pdf" title="PDF preview"></iframe>';
        stage.querySelector("iframe").src = url;
      } else if (kind === "text") {
        if (Number(file.size || 0) > 2 * 1024 * 1024) {
          stage.innerHTML = '<div class="empty-state"><h3>Text preview limited to 2 MB</h3><p>Download the file to view the complete content.</p></div>';
          return;
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error("Text preview could not be loaded.");
        const textContent = await response.text();
        stage.innerHTML = '<pre class="preview-text"></pre>';
        stage.querySelector("pre").textContent = textContent;
      }
    } catch (error) {
      stage.innerHTML = '<div class="empty-state"><div class="empty-icon">!</div><h3>Preview unavailable</h3><p>' + escapeHtml(error.message || "The preview could not be loaded.") + '</p></div>';
    }
  }

  function bindEvents() {
    all("[data-view]").forEach(function (button) {
      button.addEventListener("click", function () {
        window.location.hash = button.dataset.view;
        setView(button.dataset.view, true);
      });
    });

    all("[data-go]").forEach(function (button) {
      button.addEventListener("click", function () {
        window.location.hash = button.dataset.go;
        setView(button.dataset.go, true);
      });
    });

    el("sidebarToggle").addEventListener("click", function () {
      el("sidebar").classList.toggle("open");
    });

    el("themeToggle").addEventListener("click", function () {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });

    const dropzone = el("dropzone");
    const input = el("fileInput");

    dropzone.addEventListener("click", function () { input.click(); });
    dropzone.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", function () { selectFile(input.files && input.files[0] ? input.files[0] : null); });

    ["dragenter", "dragover"].forEach(function (name) {
      dropzone.addEventListener(name, function (event) {
        event.preventDefault();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach(function (name) {
      dropzone.addEventListener(name, function (event) {
        event.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", function (event) {
      const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
      if (file) selectFile(file);
    });

    el("clearSelectedFile").addEventListener("click", function () { selectFile(null); });
    el("saveFileBtn").addEventListener("click", uploadSelected);
    el("findFileBtn").addEventListener("click", retrieveFile);
    el("retrieveIdInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") retrieveFile();
    });
    el("librarySearch").addEventListener("input", renderLibrary);
    el("librarySort").addEventListener("change", renderLibrary);
    el("clearExpiredBtn").addEventListener("click", clearExpired);

    el("libraryGrid").addEventListener("click", async function (event) {
      const card = event.target.closest(".file-card");
      if (!card) return;
      const file = state.files.find(function (item) { return item.id === card.dataset.fileId; });
      if (!file) return;

      try {
        if (event.target.closest(".preview-action")) await openPreview(file);
        else if (event.target.closest(".download-action")) await downloadOwn(file);
        else if (event.target.closest(".copy-action")) await copyText(file.shareId, "File ID copied");
        else if (event.target.closest(".share-action")) await shareFile(file);
        else if (event.target.closest(".delete-action")) await deleteFile(file);
      } catch (error) {
        toast("Action failed", error.message || "Please try again.", "error");
      }
    });

    el("clearActivityBtn").addEventListener("click", async function () {
      if (!requireAuth()) return;
      if (!confirm("Clear your OmniShare activity history?")) return;

      const result = await client.from("omnishare_activity").delete().eq("owner_id", state.user.id);
      if (result.error) return toast("Could not clear activity", result.error.message, "error");

      await loadActivity();
      renderActivity();
      toast("Activity cleared");
    });

    el("copyCreatedIdBtn").addEventListener("click", function () {
      if (state.createdShareId) copyText(state.createdShareId, "File ID copied");
    });

    el("shareCreatedFileBtn").addEventListener("click", async function () {
      const file = state.files.find(function (item) { return item.shareId === state.createdShareId; });
      if (file) await shareFile(file);
    });

    window.addEventListener("hashchange", function () {
      const name = window.location.hash.replace("#", "");
      if (views[name]) setView(name, false);
    });
  }

  async function initialize() {
    applyTheme(localStorage.getItem(THEME_KEY) || "light");
    buildAuthDialog();
    bindEvents();

    const sessionResult = await client.auth.getSession();
    await syncAuth(sessionResult.data.session);

    client.auth.onAuthStateChange(function (_event, session) {
      setTimeout(function () {
        syncAuth(session).catch(function (error) {
          toast("Cloud sync failed", error.message || "Please refresh.", "error");
        });
      }, 0);
    });

    const hash = window.location.hash.replace("#", "");
    setView(views[hash] ? hash : "dashboard", false);

    const sharedId = new URLSearchParams(window.location.search).get("id");
    if (sharedId) {
      el("retrieveIdInput").value = normalizeId(sharedId);
      setView("retrieve", false);
      await retrieveFile();
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initialize().catch(function (error) {
      console.error(error);
      toast("OmniShare could not initialize", error.message || "Cloud connection failed.", "error");
    });
  });
})();