(() => {
  "use strict";

  const root = document.documentElement;
  const themeButton = document.querySelector(".theme-toggle");
  const themeLabel = themeButton.querySelector("[data-theme-label]");
  const themeColor = document.querySelector('meta[name="theme-color"]');

  function applyTheme(light) {
    root.classList.toggle("light-theme", light);
    const next = light ? "Dark" : "Light";
    themeLabel.textContent = next;
    themeButton.setAttribute("aria-label", `Switch to ${next.toLowerCase()} theme`);
    themeColor.content = light ? "#f7f2e9" : "#121210";
  }

  applyTheme(root.classList.contains("light-theme"));
  themeButton.hidden = false;
  themeButton.addEventListener("click", () => {
    const light = !root.classList.contains("light-theme");
    applyTheme(light);
    try {
      localStorage.setItem("desklemur-theme", light ? "light" : "dark");
    } catch (_) { /* The button still switches theme without storage. */ }
  });

  const navigation = document.querySelector("[data-report-nav]");
  const tabs = Array.from(navigation.querySelectorAll("a"));
  const panels = tabs.map(tab => document.querySelector(tab.hash));

  function select(index) {
    tabs.forEach((tab, position) => {
      const active = position === index;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[position].hidden = !active;
    });
  }

  function selectFromUrl() {
    const index = tabs.findIndex(tab => tab.hash === location.hash);
    select(index < 0 ? 0 : index);
  }

  function show(index, replace = false) {
    const hash = tabs[index].hash;
    if (location.hash !== hash) {
      if (replace) history.replaceState(null, "", hash);
      else history.pushState(null, "", hash);
    }
    select(index);
  }

  navigation.setAttribute("role", "tablist");
  tabs.forEach((tab, index) => {
    const panel = panels[index];
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = 0;

    tab.addEventListener("click", event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      show(index);
    });

    tab.addEventListener("keydown", event => {
      const next = {
        ArrowLeft: (index - 1 + tabs.length) % tabs.length,
        ArrowRight: (index + 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
        " ": index
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      show(next, next !== index);
      tabs[next].focus();
    });
  });

  selectFromUrl();
  window.addEventListener("hashchange", selectFromUrl);
})();
