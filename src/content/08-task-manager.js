(() => {
  var TASKS_KEY = "fido_tasks";
  var SNOOZE_MS = 10 * 60 * 1000;

  function genId() {
    return Date.now() + "-" + Math.random().toString(16).slice(2, 8);
  }

  function normalizeTask(t) {
    if (!t || typeof t !== "object") { return null; }
    var dueAt = Number(t.dueAt != null ? t.dueAt : t.time);
    if (!Number.isFinite(dueAt)) { return null; }
    return {
      id: String(t.id || genId()),
      clientId: String(t.clientId || t.title || "").trim(),
      phone: FidoNote.PhoneDetect.normalize(t.phone || ""),
      note: String(t.note || "").trim(),
      dueAt: dueAt,
      status: t.status === "done" ? "done" : t.status === "snoozed" ? "snoozed" : "open",
      createdAt: Number(t.createdAt || Date.now()),
      updatedAt: Number(t.updatedAt || Date.now())
    };
  }

  function readTasks() {
    return new Promise(function (resolve) {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve([]);
        return;
      }
      chrome.storage.local.get([TASKS_KEY], function (result) {
        var raw = Array.isArray(result[TASKS_KEY]) ? result[TASKS_KEY] : [];
        resolve(raw.map(normalizeTask).filter(Boolean));
      });
    });
  }

  function writeTasks(tasks) {
    return new Promise(function (resolve) {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }
      var payload = {};
      payload[TASKS_KEY] = tasks;
      chrome.storage.local.set(payload, resolve);
    });
  }

  function sendMsg(payload) {
    return new Promise(function (resolve) {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve({ ok: false });
        return;
      }
      chrome.runtime.sendMessage(payload, function (r) {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({ ok: false });
          return;
        }
        resolve(r || { ok: true });
      });
    });
  }

  async function addTask(task) {
    var tasks = await readTasks();
    var t = {
      id: genId(),
      clientId: task.clientId,
      phone: task.phone,
      note: task.note,
      dueAt: task.dueAt,
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    tasks.push(t);
    await writeTasks(tasks);
    await sendMsg({ action: "set_alarm", id: t.id, time: t.dueAt });
    return t;
  }

  async function snoozeTask(id) {
    var taskId = String(id || "");
    if (!taskId) { return; }
    var tasks = await readTasks();
    var idx = -1;
    for (var i = 0; i < tasks.length; i++) {
      if (String(tasks[i].id) === taskId) { idx = i; break; }
    }
    if (idx < 0) { return; }
    var nextDue = Date.now() + SNOOZE_MS;
    tasks[idx] = Object.assign({}, tasks[idx], {
      dueAt: nextDue,
      status: "snoozed",
      updatedAt: Date.now()
    });
    await writeTasks(tasks);
    await sendMsg({ action: "snooze_task", id: taskId, delayMs: SNOOZE_MS });
  }

  async function closeTask(id) {
    var taskId = String(id || "");
    if (!taskId) { return; }
    var tasks = await readTasks();
    var next = tasks.filter(function (t) { return String(t.id) !== taskId; });
    await writeTasks(next);
    await sendMsg({ action: "close_task", id: taskId });
  }

  function toDatetimeLocal(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) { return ""; }
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
           "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  FidoNote.TaskManager = {
    readTasks: readTasks,
    addTask: addTask,
    snoozeTask: snoozeTask,
    closeTask: closeTask,
    toDatetimeLocal: toDatetimeLocal,
    TASKS_KEY: TASKS_KEY
  };
})();
