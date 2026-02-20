(() => {
  var PUB_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTQ5nAvOND5MzZDFFYuheYOtCGQNQkd9J6p-Xgl0jEGyYYAXfCik505qTQ8nkwx8DUx97x300gUBily/pub";
  var HTML_URL = PUB_URL + "html";
  var SUGGESTIONS_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTljCCUPSqDBqEvuZsqBT4BqqTVXo7rJRD7NIyp856a8bm4zmLURKnKUA7fQOP4wiRUN0tOhzI7EPHm/pub?gid=1282883121&single=true&output=csv";
  // Bumped to v2 so any cached data from the old column layout is discarded
  var OPTIONS_CACHE = "fn_options_v2";
  var SUGGESTIONS_CACHE = "fn_suggestions_v1";
  var optionsCache = null;
  var suggestionsCache = null;

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else { inQ = false; }
        } else {
          cell += c;
        }
      } else if (c === '"') {
        inQ = true;
      } else if (c === ',') {
        row.push(cell); cell = '';
      } else if (c === '\n') {
        row.push(cell); rows.push(row); row = []; cell = '';
      } else if (c !== '\r') {
        cell += c;
      }
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function toKey(label) {
    return String(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  async function fetchSheetIndex() {
    var r = await fetch(HTML_URL, { cache: "no-store" });
    if (!r.ok) { throw new Error("index_failed"); }
    var html = await r.text();
    var matches = Array.from(
      html.matchAll(/items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:\s*"([^"]+)",\s*gid:\s*"([0-9-]+)"/g)
    );
    return matches
      .map(function (m) { return { name: m[1], gid: m[3] }; })
      .filter(function (item) { return item.name.toLowerCase() !== "list"; });
  }

  // Find the first column whose header contains any of the given keywords (case-insensitive).
  // Returns -1 if no match found.
  function findColByKeywords(headers, keywords) {
    for (var i = 0; i < headers.length; i++) {
      var h = (headers[i] || "").toLowerCase().trim();
      for (var j = 0; j < keywords.length; j++) {
        if (h.indexOf(keywords[j].toLowerCase()) !== -1) { return i; }
      }
    }
    return -1;
  }

  // Extract options from the first column, always skipping row 0 (header) regardless of its value.
  function parseColumn(text) {
    var rows = parseCsv(text);
    var seen = {};
    var opts = [];
    for (var i = 1; i < rows.length; i++) { // i=1: always skip header row
      var v = (rows[i][0] || "").replace(/^\ufeff/, "").trim();
      if (!v || seen[v]) { continue; }
      seen[v] = true;
      opts.push(v);
    }
    return opts;
  }

  // Build a key→value map using header names to locate the right columns dynamically.
  // keyHints/valueHints are arrays of keywords to search for in the header row.
  // Falls back to fallbackKIdx / fallbackVIdx if no header match is found.
  function parseMappingByHeaders(text, keyHints, valueHints, fallbackKIdx, fallbackVIdx) {
    var rows = parseCsv(text);
    if (!rows.length) { return {}; }

    // Row 0 is always the header
    var headers = rows[0].map(function (h) { return (h || "").replace(/^\ufeff/, "").trim(); });

    var kIdx = findColByKeywords(headers, keyHints);
    if (kIdx === -1) { kIdx = fallbackKIdx != null ? fallbackKIdx : 0; }

    var vIdx = findColByKeywords(headers, valueHints);
    if (vIdx === -1) { vIdx = fallbackVIdx != null ? fallbackVIdx : 1; }

    var map = {};
    for (var i = 1; i < rows.length; i++) { // skip header row
      var row = rows[i];
      if (!row || row.length <= Math.max(kIdx, vIdx)) { continue; }
      var k = (row[kIdx] || "").trim();
      var v = (row[vIdx] || "").trim();
      if (k) { map[k.toLowerCase()] = v; }
    }
    return map;
  }

  async function fetchOptions() {
    if (optionsCache) { return optionsCache; }
    var cached = await FidoNote.Storage.sessionGet(OPTIONS_CACHE);
    if (cached && cached.fields && cached.fields.length) {
      optionsCache = cached;
      return cached;
    }
    try {
      var index = await fetchSheetIndex();
      var fields = [];
      var questionMap = {};
      var outcomeNotes = {};
      var reasonNotes = {};
      var paymentFlags = {};
      var paymentNotes = {};
      for (var i = 0; i < index.length; i++) {
        var item = index[i];
        var r = await fetch(PUB_URL + "?output=csv&gid=" + item.gid, { cache: "no-store" });
        if (!r.ok) { continue; }
        var text = await r.text();
        var opts = parseColumn(text);
        var lower = item.name.toLowerCase();

        if (lower === "main reason category") {
          // Key column: the reason category option
          // Question-hint column: suggested question to ask the customer
          // Note column: auto-fill note text
          questionMap = parseMappingByHeaders(text,
            ["main reason", "reason", "category", "option"],
            ["question", "hint", "suggested question", "script", "ask"],
            0, 1
          );
          reasonNotes = parseMappingByHeaders(text,
            ["main reason", "reason", "category", "option"],
            ["note", "auto", "fill", "message", "text", "response"],
            0, 2
          );
        }

        if (lower === "outcome") {
          // Key column: the outcome option
          // Value column: auto-fill note text
          outcomeNotes = parseMappingByHeaders(text,
            ["outcome", "option"],
            ["note", "auto", "fill", "message", "text", "response"],
            0, 1
          );
        }

        if (lower === "payment commitment") {
          // Key column: the payment commitment option
          // Note column: auto-fill note text
          // Flag column: controls P2P date field visibility ("show"/"hide")
          paymentNotes = parseMappingByHeaders(text,
            ["payment commitment", "payment", "commitment", "option"],
            ["note", "auto", "fill", "message", "text", "response"],
            0, 1
          );
          paymentFlags = parseMappingByHeaders(text,
            ["payment commitment", "payment", "commitment", "option"],
            ["show", "flag", "p2p", "date", "hide", "visibility"],
            0, 2
          );
        }

        fields.push({ key: toKey(item.name), label: item.name, options: opts });
      }
      if (!fields.length) { throw new Error("empty"); }
      var data = { fields: fields, questionMap: questionMap, outcomeNotes: outcomeNotes, reasonNotes: reasonNotes, paymentFlags: paymentFlags, paymentNotes: paymentNotes };
      optionsCache = data;
      await FidoNote.Storage.sessionSet(OPTIONS_CACHE, data);
      return data;
    } catch (_) {
      return fetchLocalOptions();
    }
  }

  async function fetchLocalOptions() {
    var url = chrome.runtime.getURL("src/data/options.json");
    var r = await fetch(url);
    var json = await r.json();
    var data = { fields: json.fields || [], questionMap: {}, outcomeNotes: {}, reasonNotes: {}, paymentFlags: {}, paymentNotes: {} };
    optionsCache = data;
    return data;
  }

  async function fetchSuggestions() {
    if (suggestionsCache) { return suggestionsCache; }
    var cached = await FidoNote.Storage.sessionGet(SUGGESTIONS_CACHE);
    if (cached && Object.keys(cached).length) {
      suggestionsCache = cached;
      return cached;
    }
    var r = await fetch(SUGGESTIONS_URL, { cache: "no-store" });
    if (!r.ok) { throw new Error("suggestions_failed"); }
    var rows = parseCsv(await r.text());
    var map = {};
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      if (!row || row.length < 2) { continue; }
      var name = (row[0] || "").replace(/^\ufeff/, "").trim();
      var script = (row[1] || "").trim();
      if (name) { map[name.toLowerCase()] = { campaign: name, script: script }; }
    }
    suggestionsCache = map;
    await FidoNote.Storage.sessionSet(SUGGESTIONS_CACHE, map);
    return map;
  }

  FidoNote.Csv = { parse: parseCsv };
  FidoNote.Sheets = { fetchOptions: fetchOptions, fetchSuggestions: fetchSuggestions };
})();
