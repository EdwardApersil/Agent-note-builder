(() => {
  var ROOT_ID = "fido-note-root";
  var WEBRTC_HOOK_ID = "fido-webrtc-hook";
  var PREFS_KEY = "fido_prefs";
  var XCALLY_USER_KEY = "xcally_username";
  var USER_BOOT_RETRY_MS = 1000;
  var USER_BOOT_RETRY_MAX = 20;
  var mounted = false;

  function injectWebrtcHook() {
    if (document.getElementById(WEBRTC_HOOK_ID)) { return; }
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) { return; }
    var script = document.createElement("script");
    script.id = WEBRTC_HOOK_ID;
    script.src = chrome.runtime.getURL("src/content/webrtc-hook.js");
    script.type = "text/javascript";
    var target = document.head || document.documentElement || document.body;
    if (target) { target.appendChild(script); }
    script.onload = function () { script.remove(); };
  }

  function parseUsername(rawText) {
    var text = String(rawText || "").replace(/\s+/g, " ").trim();
    if (!text) { return ""; }
    var match = text.match(/(?:^|[\s])([A-Za-z][A-Za-z0-9._-]*)\s*<\s*\d+\s*>/);
    if (!match || !match[1]) { return ""; }
    return match[1].trim();
  }

  function detectCurrentUserFromPage() {
    var topLimit = Math.max(220, Math.floor(window.innerHeight * 0.35));
    var leftLimit = Math.floor(window.innerWidth * 0.55);

    // Phase 1: targeted selectors (class/id containing user/agent/profile/account)
    var targeted = [
      "[class*='user' i]",
      "[class*='agent' i]",
      "[class*='profile' i]",
      "[class*='account' i]",
      "[id*='user' i]",
      "[id*='profile' i]"
    ].join(",");

    var best = scanNodes(document.querySelectorAll(targeted), topLimit, leftLimit);
    if (best) { return best; }

    // Phase 2: fallback — only small text elements in the header region
    var headerRegion = document.querySelectorAll("header span, header div, header p, nav span, nav div, [role='banner'] span, [role='banner'] div");
    return scanNodes(headerRegion, topLimit, leftLimit);
  }

  function scanNodes(nodes, topLimit, leftLimit) {
    var best = "";
    var bestScore = -Infinity;

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node || !node.textContent) { continue; }
      var rect = node.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) { continue; }
      if (rect.top < 0 || rect.top > topLimit) { continue; }
      if (rect.left < leftLimit) { continue; }

      var user = parseUsername(node.textContent);
      if (!user) { continue; }

      var score = rect.left * 2 - rect.top;
      if (score > bestScore) {
        bestScore = score;
        best = user;
      }
    }
    return best;
  }

  async function mount() {
    if (mounted) { return; }
    mounted = true;

    var root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }

    if (root.shadowRoot && root.shadowRoot.querySelector(".fido-widget")) { return; }

    var shadow = root.shadowRoot || root.attachShadow({ mode: "open" });

    // Load CSS
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("src/styles/widget.css");
    shadow.appendChild(link);

    // Wait for CSS
    await new Promise(function (resolve) {
      link.onload = resolve;
      link.onerror = resolve;
    });

    // Create widget shell
    var w = FidoNote.Widget.create(shadow);
    shadow.appendChild(w.el);

    var prefs = await FidoNote.Storage.get(PREFS_KEY);
    if (!prefs || typeof prefs !== "object") { prefs = {}; }
    var storedXcallyUser = await FidoNote.Storage.getString(XCALLY_USER_KEY);
    var currentUser = "";
    if (storedXcallyUser) {
      currentUser = storedXcallyUser;
    } else if (typeof prefs.currentUser === "string" && prefs.currentUser.trim()) {
      currentUser = prefs.currentUser.trim();
    }
    var activitySection = null;

    function renderCurrentUser(userName) {
      if (!w.currentUserEl) { return; }
      w.currentUserEl.textContent = "User: " + (userName || "--");
      if (activitySection && activitySection.setCurrentUser) {
        activitySection.setCurrentUser(userName || "");
      }
    }

    function setCurrentUser(userName, persist) {
      var normalized = String(userName || "").trim().replace(/\s+/g, "");
      if (!normalized || normalized === currentUser) {
        renderCurrentUser(currentUser);
        return false;
      }
      currentUser = normalized;
      renderCurrentUser(currentUser);
      if (persist) {
        prefs.currentUser = currentUser;
        FidoNote.Storage.set(PREFS_KEY, prefs);
        FidoNote.Storage.set(XCALLY_USER_KEY, currentUser);
      }
      return true;
    }

    function syncCurrentUserFromPage() {
      var detected = detectCurrentUserFromPage();
      if (detected) {
        return setCurrentUser(detected, true);
      }
      renderCurrentUser(currentUser);
      return false;
    }

    renderCurrentUser(currentUser);
    if (!syncCurrentUserFromPage()) {
      var userSyncAttempts = 0;
      var userSyncTimer = setInterval(function () {
        userSyncAttempts += 1;
        var found = syncCurrentUserFromPage();
        if (found || userSyncAttempts >= USER_BOOT_RETRY_MAX) {
          clearInterval(userSyncTimer);
        }
      }, USER_BOOT_RETRY_MS);
    }

    try {
      // Fetch dropdown data
      var data = await FidoNote.Sheets.fetchOptions();

      // Create call timer
      var timer = FidoNote.CallTimer.create();

      // Create note form
      var noteForm = FidoNote.NoteForm.create({
        data: data,
        onCopy: function () {},
        onClear: function () {}
      });

      // Create suggestions tab
      var suggestions = FidoNote.Suggestions.create({
        onCampaignChange: function (campaignName) {
          noteForm.setCampaign(campaignName);
        }
      });

      // Build task section
      var taskSection = buildTaskSection(timer, noteForm, w);
      activitySection = FidoNote.Activity.create({
        getCurrentUser: function () { return currentUser; }
      });
      activitySection.setCurrentUser(currentUser);

      // Assemble panes
      w.notesPane.append(noteForm.el, taskSection.el, activitySection.el);
      w.suggPane.appendChild(suggestions.el);

      // Load saved form state
      var formState = await FidoNote.Storage.get(noteForm.FORM_KEY);
      noteForm.applyState(formState);

      // Sync campaign between tabs
      w.tabSugg.addEventListener("click", function () {
        var campaign = noteForm.getCampaign();
        if (campaign) { suggestions.setCampaign(campaign); }
      });

      // WebRTC call events
      window.addEventListener("fido-call-state", function (e) {
        var detail = e.detail || {};
        if (detail.active === true || detail.state === "connected" || detail.state === "completed") {
          timer.startCall();
          taskSection.onCallStarted();
        } else if (detail.active === false || detail.state === "closed" || detail.state === "failed" || detail.state === "disconnected") {
          timer.stopCall();
        }
        w.callBadge.textContent = timer.getBadgeText();
      });

      w.toggle.addEventListener("click", function () {
        if (!w.panel.classList.contains("fn-hidden") && activitySection && activitySection.refresh) {
          activitySection.refresh();
        }
      });

      // Update badge periodically
      setInterval(function () {
        if (timer.isActive()) {
          w.callBadge.textContent = timer.getBadgeText();
        }
      }, 1000);

      // Add task button
      w.addBtn.addEventListener("click", function () {
        taskSection.openModal(true);
      });

      // --- Due Popup (amber notification inside widget) ---
      var duePopup = buildDuePopup(w, function () {
        taskSection.refresh();
        checkDueTasks();
      });
      w.el.appendChild(duePopup.el);

      // Check for due tasks every 5 seconds
      function checkDueTasks() {
        FidoNote.TaskManager.readTasks().then(function (tasks) {
          var now = Date.now();
          var dueTasks = tasks.filter(function (t) {
            return t.status !== "done" && t.dueAt <= now;
          }).sort(function (a, b) { return a.dueAt - b.dueAt; });

          if (dueTasks.length > 0) {
            duePopup.show(dueTasks[0], dueTasks.length);
            w.alertBadge.classList.remove("fn-hidden");
            w.toggle.classList.add("fn-toggle-alert");
          } else {
            duePopup.hide();
            w.alertBadge.classList.add("fn-hidden");
            w.toggle.classList.remove("fn-toggle-alert");
          }
        });
      }

      checkDueTasks();
      setInterval(checkDueTasks, 5000);

      // Listen for external task changes
      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function (changes, area) {
          if (area === "local" && changes[FidoNote.TaskManager.TASKS_KEY]) {
            taskSection.refresh();
            checkDueTasks();
          }
        });
      }

    } catch (err) {
      var errDiv = document.createElement("div");
      errDiv.className = "fn-error";
      errDiv.textContent = "Failed to load options. Please reload the page.";
      w.notesPane.appendChild(errDiv);
    }
  }

  // --- Task Section Builder ---
  function buildTaskSection(timer, noteForm, widgetParts) {
    var section = document.createElement("div");
    section.className = "fn-task-section";

    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "fn-task-toggle";
    toggleBtn.textContent = "Follow-up Reminders (0)";
    toggleBtn.setAttribute("aria-expanded", "false");

    var taskBody = document.createElement("div");
    taskBody.className = "fn-task-body fn-hidden";

    var taskHint = document.createElement("div");
    taskHint.className = "fn-hint";
    taskHint.textContent = "Create and manage reminder tasks.";

    var newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "fn-btn fn-primary fn-btn-small";
    newBtn.textContent = "New Reminder";

    var taskHeader = document.createElement("div");
    taskHeader.className = "fn-task-header";
    taskHeader.append(taskHint, newBtn);

    var taskList = document.createElement("div");
    taskList.className = "fn-task-list";

    var taskStatus = document.createElement("div");
    taskStatus.className = "fn-status";
    var taskStatusTimer = null;

    function showTaskStatus(msg) {
      taskStatus.textContent = msg;
      if (taskStatusTimer) { clearTimeout(taskStatusTimer); }
      taskStatusTimer = setTimeout(function () { taskStatus.textContent = ""; }, 2500);
    }

    taskBody.append(taskHeader, taskStatus, taskList);
    section.append(toggleBtn, taskBody);

    // Toggle expand
    toggleBtn.addEventListener("click", function () {
      var willOpen = taskBody.classList.contains("fn-hidden");
      taskBody.classList.toggle("fn-hidden", !willOpen);
      toggleBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    // Task Modal
    var modal = buildTaskModal(timer, noteForm, function () { refresh(); });
    widgetParts.el.appendChild(modal.backdrop);

    newBtn.addEventListener("click", function () { modal.open(true); });

    function refresh() {
      FidoNote.TaskManager.readTasks().then(function (tasks) {
        var open = tasks.filter(function (t) { return t.status !== "done"; });
        toggleBtn.textContent = "Follow-up Reminders (" + open.length + ")";
        renderList(open);
      });
    }

    function renderList(tasks) {
      taskList.innerHTML = "";
      tasks.sort(function (a, b) { return a.dueAt - b.dueAt; });
      if (!tasks.length) {
        var empty = document.createElement("div");
        empty.className = "fn-task-empty";
        empty.textContent = "No reminders yet.";
        taskList.appendChild(empty);
        return;
      }
      for (var i = 0; i < tasks.length; i++) {
        taskList.appendChild(createTaskItem(tasks[i]));
      }
    }

    function createTaskItem(task) {
      var item = document.createElement("div");
      var isOverdue = task.dueAt <= Date.now();
      item.className = "fn-task-item" + (isOverdue ? " fn-task-overdue" : "");

      var info = document.createElement("div");
      info.className = "fn-task-item-info";

      var titleEl = document.createElement("div");
      titleEl.className = "fn-task-item-title";
      titleEl.textContent = task.clientId || "Client";

      var timeEl = document.createElement("div");
      timeEl.className = "fn-task-item-time";
      timeEl.textContent = new Date(task.dueAt).toLocaleString();

      info.append(titleEl, timeEl);

      if (task.phone) {
        var phoneEl = document.createElement("div");
        phoneEl.className = "fn-task-item-detail";
        phoneEl.textContent = task.phone;
        info.appendChild(phoneEl);
      }
      if (task.note) {
        var noteEl = document.createElement("div");
        noteEl.className = "fn-task-item-detail";
        noteEl.textContent = task.note;
        info.appendChild(noteEl);
      }

      var itemActions = document.createElement("div");
      itemActions.className = "fn-task-item-actions";

      var snoozeBtn = document.createElement("button");
      snoozeBtn.type = "button";
      snoozeBtn.className = "fn-btn fn-btn-small";
      snoozeBtn.textContent = "Snooze 10m";

      var closeTaskBtn = document.createElement("button");
      closeTaskBtn.type = "button";
      closeTaskBtn.className = "fn-btn fn-primary fn-btn-small";
      closeTaskBtn.textContent = "Close Task";

      snoozeBtn.addEventListener("click", function () {
        FidoNote.TaskManager.snoozeTask(task.id).then(function () {
          showTaskStatus("Snoozed for 10 minutes.");
          refresh();
        });
      });

      closeTaskBtn.addEventListener("click", function () {
        FidoNote.TaskManager.closeTask(task.id).then(function () {
          showTaskStatus("Reminder closed.");
          refresh();
        });
      });

      itemActions.append(snoozeBtn, closeTaskBtn);
      item.append(info, itemActions);
      return item;
    }

    refresh();

    return {
      el: section,
      refresh: refresh,
      openModal: function (fromUser) { modal.open(fromUser === true); },
      onCallStarted: function () { modal.prefillPhone(); }
    };
  }

  // --- Task Modal ---
  function buildTaskModal(timer, noteForm, onSave) {
    var backdrop = document.createElement("div");
    backdrop.className = "fn-modal-backdrop fn-hidden";

    var modal = document.createElement("div");
    modal.className = "fn-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "Create reminder");

    var modalHeader = document.createElement("div");
    modalHeader.className = "fn-modal-header";

    var modalTitle = document.createElement("div");
    modalTitle.className = "fn-modal-title";
    modalTitle.textContent = "Create Reminder";

    var modalClose = document.createElement("button");
    modalClose.type = "button";
    modalClose.className = "fn-btn fn-btn-small";
    modalClose.textContent = "\u00d7";

    modalHeader.append(modalTitle, modalClose);

    // Fields
    var clientLabel = document.createElement("label");
    clientLabel.className = "fn-label";
    clientLabel.textContent = "Client / Loan ID *";
    var clientInput = document.createElement("input");
    clientInput.type = "text";
    clientInput.className = "fn-input";
    clientInput.placeholder = "e.g. LN-102938";

    var phoneLabel = document.createElement("label");
    phoneLabel.className = "fn-label";
    phoneLabel.textContent = "Phone Number *";
    var phoneInput = document.createElement("input");
    phoneInput.type = "tel";
    phoneInput.className = "fn-input";
    phoneInput.placeholder = "e.g. +233...";

    var dueLabel = document.createElement("label");
    dueLabel.className = "fn-label";
    dueLabel.textContent = "Due Date & Time *";
    var dueInput = document.createElement("input");
    dueInput.type = "datetime-local";
    dueInput.className = "fn-input";

    // Preset chips
    var chipRow = document.createElement("div");
    chipRow.className = "fn-chip-row";
    var presets = [
      { key: "15m", label: "Next 15 min", ms: 15 * 60 * 1000 },
      { key: "1h", label: "Next 1 hour", ms: 60 * 60 * 1000 },
      { key: "1d", label: "Next day", ms: 24 * 60 * 60 * 1000 }
    ];
    presets.forEach(function (p) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "fn-chip";
      chip.textContent = p.label;
      chip.addEventListener("click", function () {
        dueInput.value = FidoNote.TaskManager.toDatetimeLocal(Date.now() + p.ms);
      });
      chipRow.appendChild(chip);
    });

    var noteLabel = document.createElement("label");
    noteLabel.className = "fn-label";
    noteLabel.textContent = "Note (Optional)";
    var noteInput = document.createElement("textarea");
    noteInput.className = "fn-textarea";
    noteInput.rows = 3;
    noteInput.placeholder = "Add context for follow-up...";

    var modalStatus = document.createElement("div");
    modalStatus.className = "fn-status fn-error-text";

    var modalActions = document.createElement("div");
    modalActions.className = "fn-modal-actions";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "fn-btn";
    cancelBtn.textContent = "Cancel";

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "fn-btn fn-primary";
    saveBtn.textContent = "Save Reminder";

    modalActions.append(cancelBtn, saveBtn);

    modal.append(
      modalHeader, clientLabel, clientInput,
      phoneLabel, phoneInput,
      dueLabel, dueInput, chipRow,
      noteLabel, noteInput,
      modalStatus, modalActions
    );
    backdrop.appendChild(modal);

    var isOpen = false;

    function setOpen(nextOpen) {
      isOpen = Boolean(nextOpen);
      backdrop.classList.toggle("fn-hidden", !isOpen);
      backdrop.style.display = isOpen ? "flex" : "none";
      backdrop.setAttribute("aria-hidden", isOpen ? "false" : "true");
    }

    function close() {
      setOpen(false);
      modalStatus.textContent = "";
    }

    function prefillPhone() {
      // Auto-fill phone from detected call
      var detectedPhone = timer.getDetectedPhone() || FidoNote.PhoneDetect.scan();
      if (detectedPhone && !phoneInput.value.trim()) {
        phoneInput.value = detectedPhone;
      }
    }

    function open(fromUser) {
      if (fromUser !== true) { return; }
      prefillPhone();
      // Auto-fill due time
      if (!dueInput.value) {
        dueInput.value = FidoNote.TaskManager.toDatetimeLocal(Date.now() + 15 * 60 * 1000);
      }
      // Auto-fill note from current form notes
      if (!noteInput.value.trim()) {
        var state = noteForm.getState();
        if (state.notes) { noteInput.value = state.notes; }
      }
      setOpen(true);
    }

    modalClose.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    cancelBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) { close(); }
    });

    saveBtn.addEventListener("click", async function () {
      var clientId = clientInput.value.trim();
      var phone = FidoNote.PhoneDetect.normalize(phoneInput.value);
      var dueAt = new Date(dueInput.value).getTime();
      var note = noteInput.value.trim();

      if (!clientId) { modalStatus.textContent = "Client / Loan ID is required."; return; }
      if (!phone) { modalStatus.textContent = "Phone number is required."; return; }
      if (!dueInput.value || !Number.isFinite(dueAt)) { modalStatus.textContent = "Due date and time is required."; return; }
      if (dueAt <= Date.now()) { modalStatus.textContent = "Due time must be in the future."; return; }

      await FidoNote.TaskManager.addTask({
        clientId: clientId,
        phone: phone,
        note: note,
        dueAt: dueAt
      });

      // Reset form
      clientInput.value = "";
      phoneInput.value = "";
      dueInput.value = "";
      noteInput.value = "";
      close();
      if (onSave) { onSave(); }
    });

    // Escape to close
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) {
        close();
      }
    });

    // Ensure hidden on initial mount, even before CSS settles.
    setOpen(false);

    return { backdrop: backdrop, open: open, close: close, prefillPhone: prefillPhone };
  }

  // --- Due Popup Builder ---
  function buildDuePopup(widgetParts, onAction) {
    var popup = document.createElement("div");
    popup.className = "fn-due-popup fn-hidden";

    var popupHeader = document.createElement("div");
    popupHeader.className = "fn-due-popup-header";

    var bellIcon = document.createElement("span");
    bellIcon.className = "fn-due-popup-bell";
    bellIcon.textContent = "\uD83D\uDD14"; // bell

    var popupTitle = document.createElement("div");
    popupTitle.className = "fn-due-popup-title";
    popupTitle.textContent = "Reminder Due";

    var popupCount = document.createElement("span");
    popupCount.className = "fn-due-popup-count fn-hidden";

    popupHeader.append(bellIcon, popupTitle, popupCount);

    var popupClient = document.createElement("div");
    popupClient.className = "fn-due-popup-client";

    var popupMeta = document.createElement("div");
    popupMeta.className = "fn-due-popup-meta";

    var popupNote = document.createElement("div");
    popupNote.className = "fn-due-popup-note";

    var popupActions = document.createElement("div");
    popupActions.className = "fn-due-popup-actions";

    var snoozeBtn = document.createElement("button");
    snoozeBtn.type = "button";
    snoozeBtn.className = "fn-btn fn-btn-small fn-due-snooze";
    snoozeBtn.textContent = "Snooze 10m";

    var executeBtn = document.createElement("button");
    executeBtn.type = "button";
    executeBtn.className = "fn-btn fn-btn-small fn-due-execute";
    executeBtn.textContent = "Close Task";

    popupActions.append(snoozeBtn, executeBtn);
    popup.append(popupHeader, popupClient, popupMeta, popupNote, popupActions);

    var activeTaskId = "";

    function show(task, totalDue) {
      activeTaskId = task.id;
      popupClient.textContent = task.clientId || "Client";
      var dueText = new Date(task.dueAt).toLocaleString();
      popupMeta.textContent = (task.phone ? task.phone + " \u00b7 " : "") + "Due " + dueText;
      popupNote.textContent = task.note || "";
      popupNote.style.display = task.note ? "" : "none";
      if (totalDue > 1) {
        popupCount.textContent = totalDue + " due";
        popupCount.classList.remove("fn-hidden");
      } else {
        popupCount.classList.add("fn-hidden");
      }
      popup.classList.remove("fn-hidden");
    }

    function hide() {
      popup.classList.add("fn-hidden");
      activeTaskId = "";
    }

    snoozeBtn.addEventListener("click", function () {
      if (!activeTaskId) { return; }
      FidoNote.TaskManager.snoozeTask(activeTaskId).then(function () {
        hide();
        if (onAction) { onAction(); }
      });
    });

    executeBtn.addEventListener("click", function () {
      if (!activeTaskId) { return; }
      FidoNote.TaskManager.closeTask(activeTaskId).then(function () {
        hide();
        if (onAction) { onAction(); }
      });
    });

    return { el: popup, show: show, hide: hide };
  }

  // --- Bootstrap ---
  function tick() {
    injectWebrtcHook();
    if (!mounted && document.body) { mount(); }
  }

  tick();
  setInterval(tick, 2000);
})();
