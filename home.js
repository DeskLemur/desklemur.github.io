(() => {
  const key = "desklemur-theme";
  const root = document.documentElement;
  const header = document.querySelector(".site-header");
  const menu = document.querySelector(".menu-toggle");
  const toggle = document.querySelector(".theme-toggle");
  const label = document.querySelector(".theme-label");
  const newsList = document.querySelector("[data-news-list]");
  const productDropdown = document.querySelector("[data-product-dropdown]");
  const site = window.DESKLEMUR_SITE && typeof window.DESKLEMUR_SITE === "object"
    ? window.DESKLEMUR_SITE
    : null;

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function configValue(path) {
    return path.split(".").reduce((value, key) => value?.[key], site);
  }

  function featureEnabled(path) {
    return configValue(`features.${path}`) !== false;
  }

  function applyFeatureVisibility() {
    document.querySelectorAll("[data-feature]").forEach((element) => {
      if (!featureEnabled(element.dataset.feature)) element.remove();
    });
  }

  function hydrateSiteContent() {
    if (!site) return;

    document.querySelectorAll("[data-site-text]").forEach((element) => {
      const value = configValue(element.dataset.siteText);
      if (typeof value === "string" && value.trim()) element.textContent = value;
    });

    const githubUrl = configValue("site.github_url");
    if (typeof githubUrl === "string" && githubUrl.trim()) {
      document.querySelectorAll("[data-site-github]").forEach((link) => {
        link.href = githubUrl;
      });
    }

    const contactEmail = configValue("site.contact_email");
    if (typeof contactEmail === "string" && contactEmail.trim()) {
      document.querySelectorAll("[data-site-contact]").forEach((link) => {
        link.href = `mailto:${contactEmail}`;
        if (link.textContent.includes("@")) link.textContent = `${contactEmail} ↗`;
      });
    }

    const products = Array.isArray(site.products) ? site.products : [];
    if (!productDropdown || !products.length) return;
    const year = configValue("site.copyright_year") || new Date().getFullYear();
    productDropdown.innerHTML = `${products.map((product) => `
      <a class="product-entry" href="${escapeHtml(product.url)}">
        <img src="${escapeHtml(product.icon)}" alt="" />
        <span><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.subtitle)}</small></span>
        <i aria-hidden="true">↗</i>
      </a>
    `).join("")}<div class="product-soon"><span>MORE PRODUCTS IN DEVELOPMENT</span><b>${String(products.length).padStart(2, "0")} / ${escapeHtml(year)}</b></div>`;
  }

  function renderNews() {
    if (!newsList || !Array.isArray(window.DESKLEMUR_NEWS)) return;
    const formatter = new Intl.DateTimeFormat(undefined, {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    newsList.innerHTML = window.DESKLEMUR_NEWS.slice(0, 3).map((item) => {
      const date = formatter.format(new Date(item.published_at)).toUpperCase();
      return `<a class="news-item" href="${item.url}"><span class="news-meta">${date}<b>${item.category}</b></span><span class="news-title">${item.title}</span><span class="news-arrow">↗</span></a>`;
    }).join("");
  }
  const setTheme = (theme) => {
    const light = theme === "light";
    root.classList.toggle("light-theme", light);
    toggle?.setAttribute("aria-pressed", String(light));
    if (label) label.textContent = light ? "Dark" : "Light";
    window.localStorage.setItem(key, theme);
  };
  setTheme(window.localStorage.getItem(key) === "light" ? "light" : "dark");
  hydrateSiteContent();
  applyFeatureVisibility();
  renderNews();
  toggle?.addEventListener("click", () => setTheme(root.classList.contains("light-theme") ? "dark" : "light"));
  menu?.addEventListener("click", () => {
    const open = header?.classList.toggle("menu-open");
    menu.setAttribute("aria-expanded", String(Boolean(open)));
  });
  document.querySelectorAll(".main-nav a").forEach((link) => link.addEventListener("click", () => {
    header?.classList.remove("menu-open");
    menu?.setAttribute("aria-expanded", "false");
  }));
})();
