(() => {
  var PREFS_KEY = "fido_prefs";

  function create(shadow) {
    var widget = document.createElement("div");
    widget.className = "fido-widget";

    // --- Toggle button ---
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "fn-toggle";
    toggle.textContent = "Fido Note";
    toggle.setAttribute("aria-expanded", "false");

    // --- Alert badge (amber dot on toggle when reminder is due) ---
    var alertBadge = document.createElement("span");
    alertBadge.className = "fn-alert-badge fn-hidden";
    toggle.style.position = "relative";
    toggle.appendChild(alertBadge);

    // --- Panel ---
    var panel = document.createElement("div");
    panel.className = "fn-panel fn-hidden";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Fido Note Builder");

    // --- Header (draggable) ---
    var header = document.createElement("div");
    header.className = "fn-header";

    var titleWrap = document.createElement("div");
    titleWrap.className = "fn-title-wrap";

    var titleEl = document.createElement("div");
    titleEl.className = "fn-title";
    titleEl.textContent = "FIDO NOTE BUILDER";

    var currentUserEl = document.createElement("div");
    currentUserEl.className = "fn-current-user";
    currentUserEl.textContent = "User: --";

    titleWrap.append(titleEl, currentUserEl);

    var headerRight = document.createElement("div");
    headerRight.className = "fn-header-right";

    var statusEl = document.createElement("div");
    statusEl.className = "fn-status";

    var callBadge = document.createElement("div");
    callBadge.className = "fn-call-badge";
    callBadge.textContent = "Call \u00b7 Idle";

    var themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "fn-icon-btn";
    themeBtn.textContent = "\uD83C\uDF19"; // moon
    themeBtn.title = "Toggle dark mode";

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "fn-icon-btn fn-add-btn";
    addBtn.textContent = "+";
    addBtn.title = "Create reminder";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "fn-icon-btn";
    closeBtn.textContent = "\u00d7";
    closeBtn.title = "Close panel";

    headerRight.append(statusEl, callBadge, themeBtn, addBtn, closeBtn);
    header.append(titleWrap, headerRight);

    // --- Tabs ---
    var tabs = document.createElement("div");
    tabs.className = "fn-tabs";

    var tabNotes = document.createElement("button");
    tabNotes.type = "button";
    tabNotes.className = "fn-tab fn-tab-active";
    tabNotes.textContent = "Notes";
    tabNotes.dataset.tab = "notes";

    var tabSugg = document.createElement("button");
    tabSugg.type = "button";
    tabSugg.className = "fn-tab";
    tabSugg.textContent = "Suggestions";
    tabSugg.dataset.tab = "suggestions";

    tabs.append(tabNotes, tabSugg);

    // --- Tab panes ---
    var notesPane = document.createElement("div");
    notesPane.className = "fn-tab-pane fn-tab-visible";
    notesPane.dataset.pane = "notes";

    var suggPane = document.createElement("div");
    suggPane.className = "fn-tab-pane";
    suggPane.dataset.pane = "suggestions";

    // --- Body ---
    var body = document.createElement("div");
    body.className = "fn-body";
    body.append(tabs, notesPane, suggPane);

    panel.append(header, body);
    widget.append(toggle, panel);

    // --- Toggle panel open/close ---
    toggle.addEventListener("click", function () {
      var opening = panel.classList.contains("fn-hidden");
      panel.classList.toggle("fn-hidden", !opening);
      toggle.setAttribute("aria-expanded", opening ? "true" : "false");
    });

    closeBtn.addEventListener("click", function () {
      panel.classList.add("fn-hidden");
      toggle.setAttribute("aria-expanded", "false");
    });

    // --- Tab switching ---
    tabs.addEventListener("click", function (e) {
      var tabName = e.target.dataset && e.target.dataset.tab;
      if (!tabName) { return; }
      tabNotes.classList.toggle("fn-tab-active", tabName === "notes");
      tabSugg.classList.toggle("fn-tab-active", tabName === "suggestions");
      notesPane.classList.toggle("fn-tab-visible", tabName === "notes");
      suggPane.classList.toggle("fn-tab-visible", tabName === "suggestions");
    });

    // --- Theme toggle ---
    FidoNote.Storage.get(PREFS_KEY).then(function (prefs) {
      if (prefs && prefs.theme === "dark") {
        widget.dataset.theme = "dark";
        themeBtn.textContent = "\u2600\uFE0F"; // sun
      }
    });

    themeBtn.addEventListener("click", function () {
      var isDark = widget.dataset.theme === "dark";
      if (isDark) {
        widget.removeAttribute("data-theme");
        themeBtn.textContent = "\uD83C\uDF19"; // moon
      } else {
        widget.dataset.theme = "dark";
        themeBtn.textContent = "\u2600\uFE0F"; // sun
      }
      FidoNote.Storage.get(PREFS_KEY).then(function (prefs) {
        prefs.theme = isDark ? "light" : "dark";
        FidoNote.Storage.set(PREFS_KEY, prefs);
      });
    });

    // --- Draggable ---
    var posRight = 16;
    var posBottom = 16;
    var dragging = false;
    var dragStartX = 0;
    var dragStartY = 0;
    var dragStartRight = 0;
    var dragStartBottom = 0;

    FidoNote.Storage.get(PREFS_KEY).then(function (prefs) {
      if (prefs && prefs.widgetRight != null) {
        posRight = prefs.widgetRight;
        widget.style.right = posRight + "px";
      }
      if (prefs && prefs.widgetBottom != null) {
        posBottom = prefs.widgetBottom;
        widget.style.bottom = posBottom + "px";
      }
    });

    header.style.cursor = "grab";

    header.addEventListener("mousedown", function (e) {
      if (e.target.tagName === "BUTTON") { return; }
      dragging = true;
      header.style.cursor = "grabbing";
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartRight = posRight;
      dragStartBottom = posBottom;
      e.preventDefault();
    });

    document.addEventListener("mousemove", function (e) {
      if (!dragging) { return; }
      posRight = Math.max(0, dragStartRight - (e.clientX - dragStartX));
      posBottom = Math.max(0, dragStartBottom - (e.clientY - dragStartY));
      widget.style.right = posRight + "px";
      widget.style.bottom = posBottom + "px";
    });

    document.addEventListener("mouseup", function () {
      if (!dragging) { return; }
      dragging = false;
      header.style.cursor = "grab";
      FidoNote.Storage.get(PREFS_KEY).then(function (prefs) {
        prefs.widgetRight = posRight;
        prefs.widgetBottom = posBottom;
        FidoNote.Storage.set(PREFS_KEY, prefs);
      });
    });

    return {
      el: widget,
      notesPane: notesPane,
      suggPane: suggPane,
      statusEl: statusEl,
      currentUserEl: currentUserEl,
      callBadge: callBadge,
      addBtn: addBtn,
      panel: panel,
      toggle: toggle,
      tabNotes: tabNotes,
      tabSugg: tabSugg,
      alertBadge: alertBadge
    };
  }

  FidoNote.Widget = { create: create };
})();
