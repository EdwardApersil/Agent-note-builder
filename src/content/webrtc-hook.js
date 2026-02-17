(() => {
  if (window.__fidoWebrtcHookInstalled) { return; }
  window.__fidoWebrtcHookInstalled = true;

  var NativePeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (!NativePeerConnection) { return; }

  var connections = new Set();
  var active = false;
  var pollId = null;

  function emit(isActive, state) {
    try {
      window.dispatchEvent(new CustomEvent("fido-call-state", {
        detail: { active: isActive, state: state }
      }));
    } catch (_) {}
  }

  function normalizeState(conn) {
    return conn.connectionState || conn.iceConnectionState || "unknown";
  }

  function hasLiveTracks(conn) {
    try {
      if (!conn.getReceivers) { return true; }
      var receivers = conn.getReceivers();
      if (!receivers || !receivers.length) { return true; }
      return receivers.some(function (r) { return r.track && r.track.readyState === "live"; });
    } catch (_) {
      return true;
    }
  }

  function updateActive() {
    var hasActive = false;
    connections.forEach(function (conn) {
      var state = normalizeState(conn);
      if (state === "closed") {
        connections.delete(conn);
        return;
      }
      if ((state === "connected" || state === "completed") && hasLiveTracks(conn)) {
        hasActive = true;
      }
    });
    if (hasActive !== active) {
      active = hasActive;
      emit(active, active ? "connected" : "disconnected");
    }
  }

  function WrappedPeerConnection() {
    var conn = new (Function.prototype.bind.apply(NativePeerConnection, [null].concat(Array.from(arguments))))();
    var handler = function () { updateActive(); };
    conn.addEventListener("connectionstatechange", handler);
    conn.addEventListener("iceconnectionstatechange", handler);

    var originalClose = conn.close.bind(conn);
    conn.close = function () {
      try { connections.delete(conn); updateActive(); } catch (_) {}
      return originalClose();
    };

    connections.add(conn);
    updateActive();
    return conn;
  }

  WrappedPeerConnection.prototype = NativePeerConnection.prototype;
  window.RTCPeerConnection = WrappedPeerConnection;
  if (window.webkitRTCPeerConnection) {
    window.webkitRTCPeerConnection = WrappedPeerConnection;
  }

  pollId = setInterval(updateActive, 1000);
  window.addEventListener("beforeunload", function () {
    if (pollId) { clearInterval(pollId); pollId = null; }
  });
})();
