(() => {
  async function copy(text) {
    var str = text == null ? "" : String(text);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(str);
        return { ok: true };
      }
    } catch (_) {
      // Fall through to execCommand fallback.
    }

    try {
      if (!document.body) {
        return { ok: false, error: "no_body" };
      }
      var ta = document.createElement("textarea");
      ta.value = str;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      ta.style.left = "-9999px";
      ta.style.opacity = "0";
      ta.style.pointerEvents = "none";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, str.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return { ok: ok };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  FidoNote.Clipboard = { copy: copy };
})();
