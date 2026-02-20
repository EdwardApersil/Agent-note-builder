(() => {
  var SHEET_HTML_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQABWMd_ibWUmu5iTKWyMGyCKBWH6Yv1LJAehXcbNGTNhJ5BXuHipWUWlrUZLh_tLyC3kWk61nMstw0/pubhtml";
  var SHEET_PUB_URL = SHEET_HTML_URL.replace(/\/pubhtml(?:\?.*)?$/i, "/pub");
  var XCALLY_USER_KEY = "xcally_username";
  var ACTIVITY_CACHE_KEY = "fn_activity_v2"; // bumped to discard cache from old column layout
  var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  // Preferred display order for known columns. Any columns in the sheet that are NOT listed
  // here will still appear — they're appended after the known ones automatically.
  var METRICS_ORDER = [
    "AGENT", "REPORTING_DATE", "TOTAL_LOGIN", "TOTAL_PAUSE", "MEETING_TRAINING_PAUSE",
    "ADMIN_TIME", "DISPOSITION_TIME", "TALK_TIME", "DAILY_NAH", "CALLS_COUNT", "EXTRACTION_DATE"
  ];

  function normalizeHeader(text) {
    return String(text || "")
      .replace(/^\ufeff/, "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function normalizeUser(text) {
    return String(text || "").trim().toLowerCase();
  }

  function toCountryLabel(name, index) {
    var lower = String(name || "").toLowerCase();
    if (lower.indexOf("ghana") >= 0) { return "Ghana"; }
    if (lower.indexOf("uganda") >= 0) { return "Uganda"; }
    return index === 0 ? "Ghana" : index === 1 ? "Uganda" : String(name || ("Sheet " + (index + 1)));
  }

  function rowsToObjects(rows) {
    if (!rows || !rows.length) { return []; }
    var headerIndex = -1;
    for (var i = 0; i < rows.length; i++) {
      var normalized = rows[i].map(normalizeHeader);
      // Only require AGENT — any other columns (including EXTRACTION_DATE) can be renamed freely
      if (normalized.indexOf("AGENT") >= 0) {
        headerIndex = i;
        break;
      }
    }
    if (headerIndex < 0) { return []; }

    var headers = rows[headerIndex].map(normalizeHeader);
    var out = [];
    for (var r = headerIndex + 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row || !row.length) { continue; }
      var obj = {};
      var hasValue = false;
      for (var c = 0; c < headers.length; c++) {
        var key = headers[c];
        if (!key) { continue; }
        var value = String(row[c] || "").trim();
        obj[key] = value;
        if (value) { hasValue = true; }
      }
      if (hasValue && obj.AGENT) { out.push(obj); }
    }
    return out;
  }

  function parseSheetIndexFromHtml(html) {
    var source = String(html || "");
    var items = [];

    function pushItem(name, gid) {
      var safeName = String(name || "").trim();
      var safeGid = String(gid || "").trim();
      if (!safeGid) { return; }
      if (!safeName) { safeName = "Sheet " + (items.length + 1); }
      if (normalizeHeader(safeName) === "LIST") { return; }
      for (var i = 0; i < items.length; i++) {
        if (String(items[i].gid) === safeGid) { return; }
      }
      items.push({ name: safeName, gid: safeGid });
    }

    var scriptMatches = Array.from(
      source.matchAll(/items\.push\(\{[\s\S]*?["']?name["']?\s*:\s*["']([^"']+)["'][\s\S]*?["']?gid["']?\s*:\s*["']?([0-9-]+)["']?[\s\S]*?\}\)/g)
    );
    for (var s = 0; s < scriptMatches.length; s++) {
      pushItem(scriptMatches[s][1], scriptMatches[s][2]);
    }

    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(source, "text/html");
      var links = doc.querySelectorAll("a[href*='gid=']");
      for (var l = 0; l < links.length; l++) {
        var href = links[l].getAttribute("href") || "";
        var gidMatch = href.match(/[?&]gid=([0-9-]+)/i);
        if (!gidMatch) { continue; }
        pushItem(links[l].textContent, gidMatch[1]);
      }
    } catch (e) {
      console.warn("[FidoNote] Activity: failed to parse sheet index HTML", e);
    }

    var gidMatches = Array.from(source.matchAll(/(?:[?&]gid=|&amp;gid=|gid:\s*["']?)([0-9-]+)/g));
    for (var g = 0; g < gidMatches.length; g++) {
      pushItem("", gidMatches[g][1]);
    }

    return items;
  }

  async function fetchRowsByGid(gid) {
    var response = await fetch(SHEET_PUB_URL + "?output=csv&gid=" + encodeURIComponent(gid), { cache: "no-store" });
    if (!response.ok) { return []; }
    return rowsToObjects(FidoNote.Csv.parse(await response.text()));
  }

  async function fetchTargetSheets() {
    var response = await fetch(SHEET_HTML_URL, { cache: "no-store" });
    if (!response.ok) { throw new Error("activity_index_failed"); }
    var index = parseSheetIndexFromHtml(await response.text());
    if (!index.length) { throw new Error("activity_index_empty"); }

    var ghana = null;
    var uganda = null;
    var i;
    for (i = 0; i < index.length; i++) {
      if (toCountryLabel(index[i].name, i) === "Ghana" && !ghana) { ghana = index[i]; }
      if (toCountryLabel(index[i].name, i) === "Uganda" && !uganda) { uganda = index[i]; }
    }

    var selected = [];
    if (ghana) { selected.push({ label: "Ghana", gid: ghana.gid, name: ghana.name }); }
    if (uganda) { selected.push({ label: "Uganda", gid: uganda.gid, name: uganda.name }); }

    for (i = 0; i < index.length && selected.length < 2; i++) {
      var row = index[i];
      var already = selected.some(function (x) { return String(x.gid) === String(row.gid); });
      if (!already) {
        selected.push({ label: toCountryLabel(row.name, selected.length), gid: row.gid, name: row.name });
      }
    }

    return selected.slice(0, 2);
  }

  async function fetchActivityForUser(username) {
    var user = normalizeUser(username);
    if (!user) { return []; }

    // Check session cache
    var cached = await FidoNote.Storage.sessionGet(ACTIVITY_CACHE_KEY);
    if (cached && cached.user === user && cached.ts && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      return cached.matches;
    }

    var sheets = await fetchTargetSheets();
    var sheetRows = await Promise.all(sheets.map(function (sheet) {
      return fetchRowsByGid(sheet.gid);
    }));
    var matches = [];

    for (var i = 0; i < sheets.length; i++) {
      var rows = sheetRows[i] || [];
      for (var r = 0; r < rows.length; r++) {
        if (normalizeUser(rows[r].AGENT) === user) {
          matches.push({ country: sheets[i].label, sheetName: sheets[i].name, row: rows[r] });
          break;
        }
      }
    }

    // Store in session cache
    await FidoNote.Storage.sessionSet(ACTIVITY_CACHE_KEY, { user: user, matches: matches, ts: Date.now() });
    return matches;
  }

  function create(config) {
    var getCurrentUser = config && typeof config.getCurrentUser === "function" ? config.getCurrentUser : function () { return ""; };
    var el = document.createElement("div");
    el.className = "fn-activity-section";

    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "fn-activity-toggle";
    toggleBtn.textContent = "Daily Agent Activity";
    toggleBtn.setAttribute("aria-expanded", "false");

    var body = document.createElement("div");
    body.className = "fn-activity-body fn-hidden";

    var title = document.createElement("div");
    title.className = "fn-activity-title";
    title.textContent = "Agent Metrics";
    var currentUserEl = document.createElement("div");
    currentUserEl.className = "fn-activity-user";
    currentUserEl.textContent = "Current user: --";
    var loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "fn-btn fn-primary";
    loadBtn.textContent = "Refresh Activity";
    var statusEl = document.createElement("div");
    statusEl.className = "fn-status";
    var cardsEl = document.createElement("div");
    cardsEl.className = "fn-activity-cards";
    body.append(title, currentUserEl, loadBtn, statusEl, cardsEl);
    el.append(toggleBtn, body);

    toggleBtn.addEventListener("click", function () {
      var willOpen = body.classList.contains("fn-hidden");
      body.classList.toggle("fn-hidden", !willOpen);
      toggleBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      if (willOpen) { refreshActivity(); }
    });

    function setCurrentUser(name) {
      var user = String(name || "").trim();
      currentUserEl.textContent = "Current user: " + (user || "--");
    }

    function renderMatchCard(match) {
      var card = document.createElement("div");
      card.className = "fn-activity-card";
      var head = document.createElement("div");
      head.className = "fn-activity-card-head";
      head.textContent = match.country;

      // Find the extraction/date column dynamically — works even if it was renamed
      var extractionKey = null;
      var rowKeys = Object.keys(match.row || {});
      for (var ki = 0; ki < rowKeys.length; ki++) {
        if (rowKeys[ki].indexOf("EXTRACT") !== -1 || rowKeys[ki].indexOf("DATE") !== -1) {
          extractionKey = rowKeys[ki];
          break;
        }
      }
      var extraction = document.createElement("div");
      extraction.className = "fn-activity-extraction";
      extraction.textContent = (extractionKey ? extractionKey.replace(/_/g, " ") : "Extraction Date") +
        ": " + (extractionKey && match.row[extractionKey] ? match.row[extractionKey] : "--");

      // Build display order: preferred METRICS_ORDER columns first (if present in the row),
      // then any additional columns from the sheet that aren't in the list.
      var seen = {};
      var displayKeys = [];
      METRICS_ORDER.forEach(function (k) {
        if (k in match.row) { displayKeys.push(k); seen[k] = true; }
      });
      rowKeys.forEach(function (k) {
        if (!seen[k]) { displayKeys.push(k); }
      });

      var grid = document.createElement("div");
      grid.className = "fn-activity-grid";
      displayKeys.forEach(function (key) {
        var item = document.createElement("div");
        item.className = "fn-activity-item";
        var k = document.createElement("div");
        k.className = "fn-activity-key";
        k.textContent = key.replace(/_/g, " ");
        var v = document.createElement("div");
        v.className = "fn-activity-value";
        v.textContent = match.row[key] || "--";
        item.append(k, v);
        grid.appendChild(item);
      });
      card.append(head, extraction, grid);
      cardsEl.appendChild(card);
    }

    async function resolveUser() {
      var current = String(getCurrentUser() || "").trim();
      if (current) { return current; }
      var stored = await FidoNote.Storage.getString(XCALLY_USER_KEY);
      return stored;
    }

    async function refreshActivity() {
      statusEl.textContent = "Loading activity...";
      cardsEl.innerHTML = "";
      try {
        var user = await resolveUser();
        setCurrentUser(user);
        if (!user) { statusEl.textContent = "No detected Xcally user yet."; return; }
        var matches = await fetchActivityForUser(user);
        if (!matches.length) {
          statusEl.textContent = "No data found for user " + user + " in Ghana or Uganda";
          return;
        }
        for (var i = 0; i < matches.length; i++) {
          renderMatchCard(matches[i]);
        }
        statusEl.textContent = "Activity loaded.";
      } catch (err) {
        console.warn("[FidoNote] Activity fetch failed:", err);
        statusEl.textContent = "Failed to fetch activity. Try again.";
      }
    }

    loadBtn.addEventListener("click", function () {
      // Force-refresh bypasses cache
      FidoNote.Storage.sessionSet(ACTIVITY_CACHE_KEY, null).then(refreshActivity);
    });

    setCurrentUser(getCurrentUser());
    return { el: el, setCurrentUser: setCurrentUser, refresh: refreshActivity };
  }

  FidoNote.Activity = { create: create };
})();