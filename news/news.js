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
  const restoreTheme = () => {
    try { applyTheme(localStorage.getItem(themeKey) === "light"); } catch (error) { /* Keep the visible theme. */ }
  };
  window.addEventListener("pageshow", restoreTheme);
  window.addEventListener("storage", (event) => {
    if (event.key === themeKey || event.key === null) restoreTheme();
  });

  document.querySelectorAll("time[data-published-at]").forEach((node) => {
    const date = new Date(node.dataset.publishedAt);
    if (Number.isNaN(date.valueOf())) return;
    node.textContent = new Intl.DateTimeFormat(undefined, {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    }).format(date);
  });

  const search = document.querySelector("#news-search");
  const filters = document.querySelector(".news-filters");
  if (search || filters) {
    const cards = Array.from(document.querySelectorAll(".news-card"));
    const buttons = Array.from(filters?.querySelectorAll("button[data-filter]") || []);
    const count = document.querySelector(".news-count");
    const empty = document.querySelector(".news-no-results");
    const clear = document.querySelector("#news-search-clear");
    const normalize = value => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
    const searchable = cards.map(card => normalize(card.textContent));
    const categories = new Set(cards.map(card => card.dataset.newsCategory));
    let category = "";
    let query = "";
    if (filters) filters.hidden = false;
    const searchBox = document.querySelector(".news-search");
    if (searchBox && cards.length) searchBox.hidden = false;

    const render = () => {
      const words = normalize(query).split(" ").filter(Boolean);
      buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.filter === category)));
      let visible = 0;
      cards.forEach((card, index) => {
        const matches = (!category || card.dataset.newsCategory === category)
          && words.every(word => searchable[index].includes(word));
        card.hidden = !matches;
        if (matches) visible += 1;
      });
      if (count) count.textContent = query.trim() || category
        ? `${visible} of ${cards.length} ${cards.length === 1 ? "note" : "notes"}`
        : `${visible} ${visible === 1 ? "note" : "notes"}`;
      if (empty) empty.hidden = visible > 0 || cards.length === 0;
      if (clear) clear.disabled = !query && !category;
    };
    const remember = (mode = "replaceState") => {
      try {
        const url = new URL(location.href);
        if (query.trim()) url.searchParams.set("q", query.trim()); else url.searchParams.delete("q");
        if (category) url.searchParams.set("category", category); else url.searchParams.delete("category");
        if (url.href !== location.href) history[mode](null, "", url);
      } catch (error) { /* Filtering also works in restrictive local-file previews. */ }
    };
    const restoreFilters = () => {
      const params = new URLSearchParams(location.search);
      query = (params.get("q") || "").slice(0, 500);
      category = categories.has(params.get("category")) ? params.get("category") : "";
      if (search) search.value = query;
      render();
    };
    search?.addEventListener("input", () => {
      query = search.value.slice(0, 500);
      render();
      remember();
    });
    buttons.forEach(button => button.addEventListener("click", () => {
      category = button.dataset.filter;
      render();
      remember("pushState");
    }));
    clear?.addEventListener("click", () => {
      query = "";
      category = "";
      if (search) search.value = "";
      render();
      remember("pushState");
      search?.focus();
    });
    window.addEventListener("popstate", restoreFilters);
    window.addEventListener("pageshow", restoreFilters);
    restoreFilters();
  }
})();
