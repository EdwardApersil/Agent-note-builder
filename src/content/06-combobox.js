(() => {
  function create(config) {
    var label = config.label;
    var options = config.options || [];
    var value = config.value || "";
    var onChange = config.onChange;

    var el = document.createElement("div");
    el.className = "fn-combobox";

    var lbl = document.createElement("label");
    lbl.className = "fn-label";
    lbl.textContent = label;

    var wrap = document.createElement("div");
    wrap.className = "fn-combo-wrap";

    var input = document.createElement("input");
    input.type = "text";
    input.className = "fn-combo-input";
    input.placeholder = "Search " + label + "...";
    input.autocomplete = "off";

    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "fn-combo-clear";
    clearBtn.textContent = "\u00d7";
    clearBtn.style.display = value ? "" : "none";

    var list = document.createElement("ul");
    list.className = "fn-combo-list";
    list.setAttribute("role", "listbox");
    list.style.display = "none";

    var currentOptions = options.slice();
    var activeIdx = -1;
    var selectedValue = value;

    function render(filter) {
      list.innerHTML = "";
      activeIdx = -1;
      var f = (filter || "").toLowerCase();
      var matches = [];
      for (var i = 0; i < currentOptions.length; i++) {
        if (!f || currentOptions[i].toLowerCase().indexOf(f) >= 0) {
          matches.push(currentOptions[i]);
        }
      }
      if (!matches.length) {
        list.style.display = "none";
        return;
      }
      for (var j = 0; j < matches.length; j++) {
        var li = document.createElement("li");
        li.setAttribute("role", "option");
        li.textContent = matches[j];
        li.dataset.val = matches[j];
        li.addEventListener("mousedown", onItemMousedown);
        list.appendChild(li);
      }
      list.style.display = "";
    }

    function onItemMousedown(e) {
      e.preventDefault();
      selectOption(e.currentTarget.dataset.val);
    }

    function selectOption(val) {
      input.value = val;
      selectedValue = val;
      clearBtn.style.display = val ? "" : "none";
      list.style.display = "none";
      if (onChange) { onChange(val); }
    }

    input.addEventListener("focus", function () {
      render(input.value);
    });

    input.addEventListener("input", function () {
      clearBtn.style.display = input.value ? "" : "none";
      render(input.value);
    });

    input.addEventListener("blur", function () {
      setTimeout(function () { list.style.display = "none"; }, 150);
    });

    input.addEventListener("keydown", function (e) {
      var items = list.querySelectorAll("li");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        highlight(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        highlight(items);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIdx >= 0 && items[activeIdx]) {
          selectOption(items[activeIdx].dataset.val);
        } else if (items.length > 0) {
          selectOption(items[0].dataset.val);
        }
      } else if (e.key === "Escape") {
        list.style.display = "none";
        input.blur();
      }
    });

    function highlight(items) {
      for (var i = 0; i < items.length; i++) {
        if (i === activeIdx) {
          items[i].classList.add("fn-combo-active");
          items[i].scrollIntoView({ block: "nearest" });
        } else {
          items[i].classList.remove("fn-combo-active");
        }
      }
    }

    clearBtn.addEventListener("click", function () {
      input.value = "";
      selectedValue = "";
      clearBtn.style.display = "none";
      if (onChange) { onChange(""); }
      input.focus();
    });

    if (value) { input.value = value; }

    wrap.append(input, clearBtn);
    el.append(lbl, wrap, list);

    el._getValue = function () { return input.value; };
    el._setValue = function (v) {
      input.value = v || "";
      selectedValue = v || "";
      clearBtn.style.display = v ? "" : "none";
    };
    el._getInput = function () { return input; };
    el._setOptions = function (opts) { currentOptions = opts.slice(); };

    return el;
  }

  FidoNote.Combobox = { create: create };
})();
