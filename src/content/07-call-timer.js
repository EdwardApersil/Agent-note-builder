(() => {
  function create() {
    var active = false;
    var start = 0;
    var lastDuration = 0;
    var timerId = null;
    var detectedPhone = "";

    var card = document.createElement("div");
    card.className = "fn-timer-card";

    var label = document.createElement("div");
    label.className = "fn-timer-label";
    label.textContent = "Call Timer";

    var value = document.createElement("div");
    value.className = "fn-timer-value";
    value.textContent = "No active call";

    var hint = document.createElement("div");
    hint.className = "fn-hint";
    hint.textContent = "Auto-detects WebRTC calls and tracks duration.";

    card.append(label, value, hint);

    function fmt(ms) {
      var s = Math.max(0, Math.floor(ms / 1000));
      var m = Math.floor(s / 60);
      var sec = s % 60;
      return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
    }

    function update() {
      if (active) {
        value.textContent = "Call \u00b7 " + fmt(Date.now() - start);
      } else if (lastDuration > 0) {
        value.textContent = "Last call \u00b7 " + fmt(lastDuration);
      } else {
        value.textContent = "No active call";
      }
    }

    function startCall() {
      if (active) { return; }
      active = true;
      start = Date.now();
      lastDuration = 0;
      detectedPhone = FidoNote.PhoneDetect.scan();
      update();
      if (timerId) { clearInterval(timerId); }
      timerId = setInterval(update, 1000);
    }

    function stopCall() {
      if (!active) { return; }
      active = false;
      lastDuration = Date.now() - start;
      if (timerId) { clearInterval(timerId); timerId = null; }
      update();
    }

    function getDetectedPhone() { return detectedPhone; }
    function isActive() { return active; }

    function getBadgeText() {
      if (active) { return "Call \u00b7 " + fmt(Date.now() - start); }
      if (lastDuration > 0) { return "Last \u00b7 " + fmt(lastDuration); }
      return "Call \u00b7 Idle";
    }

    return {
      el: card,
      startCall: startCall,
      stopCall: stopCall,
      getDetectedPhone: getDetectedPhone,
      isActive: isActive,
      getBadgeText: getBadgeText,
      update: update
    };
  }

  FidoNote.CallTimer = { create: create };
})();
