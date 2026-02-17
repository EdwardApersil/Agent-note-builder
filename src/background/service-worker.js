(() => {
  var TASKS_KEY = "fido_tasks";
  var TASK_ALARM_PREFIX = "fido-task-";
  var TASK_NOTIF_PREFIX = "fido-task-notif-";
  var LEGACY_ALARM_PREFIX = "reminder-";
  var SNOOZE_MS = 10 * 60 * 1000;
  var NOTIF_ICON =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWI6efL5DwAAAP//uQ6fCQAAAAZJREFUAwAAtwIggXPu6QAAAABJRU5ErkJggg==";

  function alarmName(taskId) { return TASK_ALARM_PREFIX + taskId; }
  function taskIdFromAlarm(name) {
    if (typeof name !== "string" || !name.startsWith(TASK_ALARM_PREFIX)) { return ""; }
    return name.slice(TASK_ALARM_PREFIX.length);
  }
  function notifId(taskId) { return TASK_NOTIF_PREFIX + taskId; }
  function taskIdFromNotif(id) {
    if (typeof id !== "string" || !id.startsWith(TASK_NOTIF_PREFIX)) { return ""; }
    return id.slice(TASK_NOTIF_PREFIX.length);
  }

  function withTasks(done) {
    if (!chrome.storage || !chrome.storage.local) { done([]); return; }
    chrome.storage.local.get([TASKS_KEY], function (r) {
      done(Array.isArray(r[TASKS_KEY]) ? r[TASKS_KEY] : []);
    });
  }

  function saveTasks(tasks, done) {
    if (!chrome.storage || !chrome.storage.local) { if (done) done(); return; }
    var p = {};
    p[TASKS_KEY] = tasks;
    chrome.storage.local.set(p, function () { if (done) done(); });
  }

  function scheduleAlarm(taskId, when) {
    if (!chrome.alarms || !taskId) { return; }
    var t = Number(when);
    if (!Number.isFinite(t) || t <= Date.now()) {
      chrome.alarms.clear(alarmName(taskId));
      return;
    }
    chrome.alarms.create(alarmName(taskId), { when: t });
  }

  function clearAlarm(taskId, done) {
    if (!chrome.alarms) { if (done) done(); return; }
    chrome.alarms.clear(alarmName(taskId), function () { if (done) done(); });
  }

  function clearNotif(taskId) {
    if (!chrome.notifications || !taskId) { return; }
    chrome.notifications.clear(notifId(taskId), function () {});
  }

  function syncAlarms(tasks) {
    if (!chrome.alarms || !chrome.alarms.getAll) { return; }
    var desired = new Map();
    (Array.isArray(tasks) ? tasks : []).forEach(function (t) {
      if (!t || !t.id || t.status === "done") { return; }
      var due = Number(t.dueAt);
      if (!Number.isFinite(due) || due <= Date.now()) { return; }
      desired.set(alarmName(String(t.id)), due);
    });

    chrome.alarms.getAll(function (alarms) {
      var existing = new Set();
      alarms.forEach(function (a) {
        if (a && typeof a.name === "string" && a.name.startsWith(TASK_ALARM_PREFIX)) {
          existing.add(a.name);
        }
      });
      desired.forEach(function (due, name) {
        chrome.alarms.create(name, { when: due });
        existing.delete(name);
      });
      existing.forEach(function (name) { chrome.alarms.clear(name); });
    });
  }

  function cleanLegacy() {
    if (!chrome.alarms || !chrome.alarms.getAll) { return; }
    chrome.alarms.getAll(function (alarms) {
      alarms.forEach(function (a) {
        if (a && typeof a.name === "string" && a.name.startsWith(LEGACY_ALARM_PREFIX)) {
          chrome.alarms.clear(a.name);
        }
      });
    });
  }

  function rebuildAlarms() {
    withTasks(function (tasks) { syncAlarms(tasks); });
  }

  function closeTaskById(taskId, done) {
    withTasks(function (tasks) {
      var next = tasks.filter(function (t) { return String(t && t.id) !== String(taskId); });
      saveTasks(next, function () {
        clearAlarm(taskId, function () {
          clearNotif(taskId);
          if (done) done(true);
        });
      });
    });
  }

  function snoozeTaskById(taskId, delayMs, done) {
    withTasks(function (tasks) {
      var idx = -1;
      for (var i = 0; i < tasks.length; i++) {
        if (String(tasks[i] && tasks[i].id) === String(taskId)) { idx = i; break; }
      }
      if (idx < 0) { if (done) done(false); return; }
      var nextDue = Date.now() + Math.max(1000, Number(delayMs) || SNOOZE_MS);
      var next = tasks.slice();
      next[idx] = Object.assign({}, next[idx], {
        dueAt: nextDue,
        status: "snoozed",
        updatedAt: Date.now()
      });
      saveTasks(next, function () {
        scheduleAlarm(taskId, nextDue);
        clearNotif(taskId);
        if (done) done(true);
      });
    });
  }

  function showNotification(task) {
    if (!chrome.notifications || !task || !task.id) { return; }
    var dueText = Number.isFinite(Number(task.dueAt))
      ? new Date(Number(task.dueAt)).toLocaleString()
      : "now";
    var title = task.clientId ? "Reminder Due: " + task.clientId : "Reminder Due";
    var parts = [];
    if (task.phone) { parts.push(String(task.phone)); }
    parts.push("Due " + dueText);
    if (task.note) { parts.push(String(task.note)); }
    chrome.notifications.create(notifId(task.id), {
      type: "basic",
      iconUrl: NOTIF_ICON,
      title: title,
      message: parts.join(" | "),
      priority: 2,
      requireInteraction: false,
      buttons: [{ title: "Snooze 10m" }, { title: "Close Task" }]
    });
  }

  // --- Message handler ---
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || typeof msg.action !== "string") { return; }
    var action = msg.action;
    var taskId = String(msg.id || "");
    if (!taskId) { sendResponse({ ok: false, error: "missing_id" }); return; }

    if (action === "set_alarm") {
      scheduleAlarm(taskId, Number(msg.time));
      sendResponse({ ok: true });
      return;
    }
    if (action === "snooze_task") {
      snoozeTaskById(taskId, Number(msg.delayMs) || SNOOZE_MS, function (ok) {
        sendResponse({ ok: ok });
      });
      return true;
    }
    if (action === "close_task") {
      closeTaskById(taskId, function (ok) {
        sendResponse({ ok: ok });
      });
      return true;
    }
  });

  // --- Alarm handler ---
  if (chrome.alarms && chrome.alarms.onAlarm) {
    chrome.alarms.onAlarm.addListener(function (alarm) {
      var tid = taskIdFromAlarm(alarm && alarm.name);
      if (!tid) { return; }
      withTasks(function (tasks) {
        var task = null;
        for (var i = 0; i < tasks.length; i++) {
          if (String(tasks[i] && tasks[i].id) === tid) { task = tasks[i]; break; }
        }
        if (!task || task.status === "done") { return; }
        showNotification(task);
      });
    });
  }

  // --- Notification button handler ---
  if (chrome.notifications && chrome.notifications.onButtonClicked) {
    chrome.notifications.onButtonClicked.addListener(function (nId, btnIdx) {
      var tid = taskIdFromNotif(nId);
      if (!tid) { return; }
      if (btnIdx === 0) { snoozeTaskById(tid, SNOOZE_MS, function () {}); }
      else if (btnIdx === 1) { closeTaskById(tid, function () {}); }
    });
  }

  // --- Notification click handler ---
  if (chrome.notifications && chrome.notifications.onClicked) {
    chrome.notifications.onClicked.addListener(function (nId) {
      var tid = taskIdFromNotif(nId);
      if (tid) { clearNotif(tid); }
    });
  }

  // --- Storage change listener ---
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes[TASKS_KEY]) {
        syncAlarms(changes[TASKS_KEY].newValue);
      }
    });
  }

  // --- Startup ---
  cleanLegacy();
  rebuildAlarms();

  chrome.runtime.onInstalled.addListener(function () {
    cleanLegacy();
    rebuildAlarms();
  });
  chrome.runtime.onStartup.addListener(rebuildAlarms);
})();
