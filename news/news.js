(() => {
  const root = document.documentElement;
  const themeKey = "desklemur-theme";
  const toggle = document.querySelector(".news-theme-toggle");
  const label = document.querySelector("[data-theme-label]");
  const applyTheme = (light) => {
    root.classList.toggle("light-theme", light);
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(light));
      toggle.setAttribute("aria-label", `Switch to ${light ? "dark" : "light"} theme`);
    }
    if (label) label.textContent = light ? "Dark" : "Light";
  };
  if (toggle) {
    applyTheme(root.classList.contains("light-theme"));
    toggle.hidden = false;
    toggle.addEventListener("click", () => {
      const light = !root.classList.contains("light-theme");
      applyTheme(light);
      try { localStorage.setItem(themeKey, light ? "light" : "dark"); } catch (error) { /* The theme still works when storage is unavailable. */ }
    });
  }
  window.addEventListener("storage", (event) => {
    if (event.key === themeKey) applyTheme(event.newValue === "light");
  });

  document.querySelectorAll("time[data-published-at]").forEach((node) => {
    const date = new Date(node.dataset.publishedAt);
    if (Number.isNaN(date.valueOf())) return;
    node.textContent = new Intl.DateTimeFormat(undefined, {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    }).format(date);
  });

  const filters = document.querySelector(".news-filters");
  if (filters) {
    const cards = Array.from(document.querySelectorAll(".news-card"));
    const buttons = Array.from(filters.querySelectorAll("button[data-filter]"));
    const count = document.querySelector(".news-count");
    filters.hidden = false;
    buttons.forEach((button) => button.addEventListener("click", () => {
      const category = button.dataset.filter;
      buttons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
      let visible = 0;
      cards.forEach((card) => {
        const matches = !category || card.dataset.newsCategory === category;
        card.hidden = !matches;
        if (matches) visible += 1;
      });
      if (count) count.textContent = `${visible} ${visible === 1 ? "note" : "notes"}`;
    }));
  }
})();
