(() => {
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function buildNote(fields, selections, notesText) {
    var lines = [];
    var now = new Date();
    lines.push(
      "Time = " + now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" +
      pad(now.getDate()) + " " + pad(now.getHours()) + ":" + pad(now.getMinutes()) + " /"
    );

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var val = (selections[f.key] || "").replace(/\s*\/\s*$/, "");
      if (val) {
        lines.push(f.label + " = " + val + " /");
      }
    }

    lines.push("Notes = " + (notesText || "") + " /");
    return lines.join("\n");
  }

  FidoNote.Format = { buildNote: buildNote };
})();
