(() => {
  function create(config) {
    var onCampaignChange = config && typeof config.onCampaignChange === "function"
      ? config.onCampaignChange
      : null;

    var el = document.createElement("div");
    el.className = "fn-suggestions-tab";

    var title = document.createElement("div");
    title.className = "fn-hint";
    title.textContent = "Select a campaign to see the suggested script.";

    var combo = FidoNote.Combobox.create({
      label: "Campaign",
      options: [],
      value: "",
      onChange: function (val) {
        updateScript(val);
        if (onCampaignChange) { onCampaignChange(val); }
      }
    });

    var scriptBox = document.createElement("div");
    scriptBox.className = "fn-script-box";

    var scriptLabel = document.createElement("div");
    scriptLabel.className = "fn-label";
    scriptLabel.textContent = "Suggested Script";

    var scriptContent = document.createElement("div");
    scriptContent.className = "fn-script-content";
    scriptContent.textContent = "Select a campaign above.";

    scriptBox.append(scriptLabel, scriptContent);

    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "fn-btn fn-primary fn-hidden";
    copyBtn.textContent = "Copy Script";

    var status = document.createElement("div");
    status.className = "fn-status";

    el.append(title, combo, scriptBox, copyBtn, status);

    var suggestionsData = null;

    FidoNote.Sheets.fetchSuggestions()
      .then(function (data) {
        suggestionsData = data;
        var names = Object.values(data)
          .map(function (s) { return s.campaign; })
          .sort();
        combo._setOptions(names);
      })
      .catch(function () {
        scriptContent.textContent = "Failed to load suggestions. Please reload.";
        scriptContent.classList.add("fn-error-text");
      });

    function updateScript(name) {
      if (!name || !suggestionsData) {
        scriptContent.textContent = "Select a campaign above.";
        copyBtn.classList.add("fn-hidden");
        return;
      }
      var match = suggestionsData[name.toLowerCase()];
      if (match && match.script) {
        scriptContent.textContent = match.script;
        copyBtn.classList.remove("fn-hidden");
      } else {
        scriptContent.textContent = "No script available for this campaign.";
        copyBtn.classList.add("fn-hidden");
      }
    }

    copyBtn.addEventListener("click", async function () {
      var text = scriptContent.textContent;
      if (!text) { return; }
      var r = await FidoNote.Clipboard.copy(text);
      status.textContent = r.ok ? "Copied!" : "Copy failed";
      setTimeout(function () { status.textContent = ""; }, 1500);
    });

    function setCampaign(name) {
      if (!name) { return; }
      combo._setValue(name);
      updateScript(name);
    }

    return { el: el, setCampaign: setCampaign };
  }

  FidoNote.Suggestions = { create: create };
})();
