(() => {
  var PHONE_REGEX = /(?:\+?\d[\d\s()\-]{7,}\d)/;

  function normalize(raw) {
    var s = String(raw || "").trim();
    if (!s) { return ""; }
    var hasPlus = s.charAt(0) === "+";
    var digits = s.replace(/\D/g, "");
    if (!digits) { return ""; }
    return hasPlus ? "+" + digits : digits;
  }

  function scan() {
    var headers = document.querySelectorAll("h1, h2, h3, h4");
    for (var i = 0; i < headers.length; i++) {
      var match = (headers[i].textContent || "").match(PHONE_REGEX);
      if (match) { return normalize(match[0]); }
    }
    var telLink = document.querySelector("[href^='tel:']");
    if (telLink) {
      var href = (telLink.getAttribute("href") || "").replace(/^tel:/, "");
      var v = normalize(href);
      if (v) { return v; }
    }

    var selectors = [
      "input[type='tel']",
      "input[name*='phone' i]",
      "input[placeholder*='phone' i]"
    ];
    for (var j = 0; j < selectors.length; j++) {
      var el = document.querySelector(selectors[j]);
      if (el && el.value && el.value.trim()) {
        return normalize(el.value);
      }
    }

    var dataEl = document.querySelector("[data-phone], [data-client-phone]");
    if (dataEl) {
      var dv = normalize(
        dataEl.getAttribute("data-phone") ||
        dataEl.getAttribute("data-client-phone") ||
        dataEl.textContent
      );
      if (dv) { return dv; }
    }

    if (document.body) {
      var bodyMatch = (document.body.innerText || "").match(PHONE_REGEX);
      if (bodyMatch) { return normalize(bodyMatch[0]); }
    }

    return "";
  }

  FidoNote.PhoneDetect = { scan: scan, normalize: normalize };
})();
