(() => {
  var FORM_KEY = "fido_form_state";

  function create(config) {
    var data = config.data;
    var onCopy = config.onCopy;
    var onClear = config.onClear;

    var el = document.createElement("div");
    el.className = "fn-notes-tab";

    var combos = {};
    var keepCampaignCb = null;
    var questionHint = null;

    var p2pKey = "promise_to_pay_date";
    if (!data.fields.some(function (f) { return f.key === p2pKey; })) {
      data.fields.push({ key: p2pKey, label: "Promise To Pay Date", options: [] });
    }

    for (var i = 0; i < data.fields.length; i++) {
      (function (field) {
        var combo = FidoNote.Combobox.create({
          label: field.label,
          options: field.options,
          value: "",
          onChange: function (val) {
            scheduleSave();
            if (field.key === "main_reason_category") {
              updateHint(val);
              if (val && data.reasonNotes) {
                var note = data.reasonNotes[val.toLowerCase()];
                if (note !== undefined) { textarea.value = note; updateCopyBtn(); }
              }
            }
            if (field.key === "outcome" && val && data.outcomeNotes) {
              var outNote = data.outcomeNotes[val.toLowerCase()];
              if (outNote !== undefined) { textarea.value = outNote; updateCopyBtn(); }
            }
            if (field.key === "payment_commitment") {
              updateP2PVisibility(val);
            }
          }
        });
        combos[field.key] = combo;
        el.appendChild(combo);

        // Campaign keep checkbox
        if (field.key === "campaign") {
          var keepRow = document.createElement("label");
          keepRow.className = "fn-keep-row";
          keepCampaignCb = document.createElement("input");
          keepCampaignCb.type = "checkbox";
          keepCampaignCb.className = "fn-checkbox";
          var keepText = document.createElement("span");
          keepText.className = "fn-keep-text";
          keepText.textContent = "Keep Campaign on Clear";
          keepRow.append(keepCampaignCb, keepText);
          var keepHint = document.createElement("div");
          keepHint.className = "fn-hint";
          keepHint.textContent = "Useful if you're working one campaign for a while.";
          el.append(keepRow, keepHint);
          keepCampaignCb.addEventListener("change", scheduleSave);
        }

        if (field.key === "main_reason_category") {
          questionHint = document.createElement("div");
          questionHint.className = "fn-question-hint fn-hidden";
          el.appendChild(questionHint);
        }
      })(data.fields[i]);
    }

    function updateHint(val) {
      if (!questionHint || !data.questionMap) { return; }
      if (!val) {
        questionHint.textContent = "";
        questionHint.classList.add("fn-hidden");
        return;
      }
      var q = data.questionMap[val.toLowerCase()];
      if (q) {
        questionHint.textContent = q;
        questionHint.classList.remove("fn-hidden");
      } else {
        questionHint.textContent = "";
        questionHint.classList.add("fn-hidden");
      }
    }

    function updateP2PVisibility(val) {
      var p2pCombo = combos["promise_to_pay_date"];
      if (!p2pCombo) { return; }
      var show = false;
      if (val && data.paymentFlags) {
        var flag = data.paymentFlags[val.toLowerCase()];
        if (flag && String(flag).toLowerCase() === "show") { show = true; }
      }
      if (show) {
        p2pCombo.classList.remove("fn-hidden");
      } else {
        p2pCombo.classList.add("fn-hidden");
        p2pCombo._setValue("");
      }
    }

    var p2pField = data.fields.find(function (f) { return f.key === "promise_to_pay_date"; });
    if (p2pField) {
      var p2pInput = combos[p2pField.key]._getInput();
      p2pInput.type = "date";
      updateP2PVisibility("");
    }

    var notesLabel = document.createElement("label");
    notesLabel.className = "fn-label";
    notesLabel.textContent = "Notes";
    var textarea = document.createElement("textarea");
    textarea.className = "fn-textarea";
    textarea.rows = 3;
    textarea.placeholder = "Enter notes...";
    el.append(notesLabel, textarea);

    // Action buttons
    var actions = document.createElement("div");
    actions.className = "fn-actions";
    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "fn-btn fn-primary";
    copyBtn.textContent = "Copy";
    copyBtn.disabled = true;
    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "fn-btn";
    clearBtn.textContent = "Clear";
    actions.append(copyBtn, clearBtn);
    el.appendChild(actions);

    var manual = document.createElement("textarea");
    manual.className = "fn-manual fn-hidden";
    manual.readOnly = true;
    manual.rows = 4;
    el.appendChild(manual);

    var status = document.createElement("div");
    status.className = "fn-status";
    el.appendChild(status);

    function updateCopyBtn() {
      copyBtn.disabled = !textarea.value.trim();
    }

    textarea.addEventListener("input", function () {
      updateCopyBtn();
      scheduleSave();
    });

    var saveTimer = null;
    function scheduleSave() {
      if (saveTimer) { clearTimeout(saveTimer); }
      saveTimer = setTimeout(function () {
        FidoNote.Storage.set(FORM_KEY, getState());
      }, 250);
    }

    function getState() {
      var selections = {};
      for (var key in combos) {
        selections[key] = combos[key]._getValue();
      }
      return {
        selections: selections,
        notes: textarea.value,
        keepCampaign: keepCampaignCb ? keepCampaignCb.checked : false
      };
    }

    function applyState(state) {
      if (!state) { return; }
      var sel = state.selections || {};
      for (var key in combos) {
        combos[key]._setValue(sel[key] || "");
      }
      textarea.value = state.notes || "";
      if (keepCampaignCb) { keepCampaignCb.checked = Boolean(state.keepCampaign); }
      updateCopyBtn();
      if (sel.main_reason_category) { updateHint(sel.main_reason_category); }
      updateP2PVisibility(sel.payment_commitment || "");
    }

    copyBtn.addEventListener("click", async function () {
      if (copyBtn.disabled) { return; }
      manual.classList.add("fn-hidden");
      status.textContent = "";
      var state = getState();
      var text = FidoNote.Format.buildNote(data.fields, state.selections, state.notes);
      var result = await FidoNote.Clipboard.copy(text);
      if (result.ok) {
        status.textContent = "Copied!";
        setTimeout(function () {
          if (status.textContent === "Copied!") { status.textContent = ""; }
        }, 1500);
      } else {
        manual.value = text;
        manual.classList.remove("fn-hidden");
        status.textContent = "Copy failed \u2014 please copy manually.";
      }
      FidoNote.Storage.set(FORM_KEY, state);
      if (onCopy) { onCopy(); }
    });

    clearBtn.addEventListener("click", function () {
      var keepCampaign = keepCampaignCb && keepCampaignCb.checked;
      for (var key in combos) {
        if (keepCampaign && key === "campaign") { continue; }
        combos[key]._setValue("");
      }
      textarea.value = "";
      manual.classList.add("fn-hidden");
      status.textContent = "";
      updateCopyBtn();
      FidoNote.Storage.set(FORM_KEY, getState());
      if (onClear) { onClear(); }
    });

    return {
      el: el,
      getState: getState,
      applyState: applyState,
      getCampaign: function () { return combos.campaign ? combos.campaign._getValue() : ""; },
      setCampaign: function (campaignName) {
        if (!combos.campaign) { return; }
        combos.campaign._setValue(campaignName || "");
        scheduleSave();
      },
      FORM_KEY: FORM_KEY
    };
  }

  FidoNote.NoteForm = { create: create };
})();
