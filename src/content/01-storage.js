(() => {
  function get(key) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
          resolve({});
          return;
        }
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve({});
            return;
          }
          resolve(result[key] || {});
        });
      } catch (_) {
        resolve({});
      }
    });
  }

  function set(key, data) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
          resolve();
          return;
        }
        var payload = {};
        payload[key] = data;
        chrome.storage.local.set(payload, resolve);
      } catch (_) {
        resolve();
      }
    });
  }

  function sessionGet(key) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.session) {
          resolve(null);
          return;
        }
        chrome.storage.session.get([key], (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(result[key] || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function sessionSet(key, data) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.session) {
          resolve();
          return;
        }
        var payload = {};
        payload[key] = data;
        chrome.storage.session.set(payload, resolve);
      } catch (_) {
        resolve();
      }
    });
  }

  function getString(key) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
          resolve("");
          return;
        }
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve("");
            return;
          }
          var val = result[key];
          resolve(typeof val === "string" ? val : "");
        });
      } catch (_) {
        resolve("");
      }
    });
  }

  FidoNote.Storage = { get: get, set: set, getString: getString, sessionGet: sessionGet, sessionSet: sessionSet };
})();
