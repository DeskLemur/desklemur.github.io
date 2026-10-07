(() => {
  "use strict";
  const key = "desklemur-theme";
  const root = document.documentElement;
  const header = document.querySelector(".site-header");
  const navigation = document.querySelector(".main-nav");
  const menu = document.querySelector(".menu-toggle");
  const toggle = document.querySelector(".theme-toggle");
  const label = document.querySelector(".theme-label");
  const newsList = document.querySelector("[data-news-list]");
  const productDropdown = document.querySelector("[data-product-dropdown]");
  const productMenu = document.querySelector(".product-menu");
  const productTrigger = document.querySelector(".product-trigger");
  const site = window.DESKLEMUR_SITE && typeof window.DESKLEMUR_SITE === "object"
    ? window.DESKLEMUR_SITE
    : null;
  const cache = site?.cache || {};

  const cacheUrl = (value) => {
    const url = String(value || "");
    if (!url || /^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(url)) return url;
    const [beforeHash, hash = ""] = url.split("#", 2);
    const [path, query = ""] = beforeHash.split("?", 2);
    let key = path.replace(/^\.\//, "");
    try { key = decodeURIComponent(key); } catch (_) { /* Preserve malformed paths safely. */ }
    const version = cache.assets?.[key] || cache.version;
    if (!version) return url;
    const params = new URLSearchParams(query);
    params.set("v", version);
    return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
  };

  const refreshForNewVersion = () => {
    const current = cache.version;
    if (!current || !window.fetch) return;
    fetch("./site-version.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((manifest) => {
        const next = manifest?.version;
        if (!next || next === current) return;
        const key = `desklemur-refreshed:${next}`;
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, "1");
        window.location.reload();
      })
      .catch(() => {});
  };

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
    productDropdown.innerHTML = `${products.map((product) => `
      <a class="product-entry" href="${escapeHtml(cacheUrl(product.url))}">
        <img src="${escapeHtml(cacheUrl(product.icon))}" alt="" />
        <span><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.subtitle)}</small></span>
        <i aria-hidden="true">↗</i>
      </a>
    `).join("")}<div class="product-soon"><span>EXPLORE THE PRODUCT</span><b>${String(products.length).padStart(2, "0")}</b></div>`;
  }

  function renderNews() {
    if (!newsList || !Array.isArray(window.DESKLEMUR_NEWS)) return;
    const items = window.DESKLEMUR_NEWS.filter((item) => item && item.title && item.url)
      .slice().sort((a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0))
      .slice(0, 3);
    if (!items.length) {
      newsList.innerHTML = '<p class="news-empty">Project notes will appear here when published. <a href="./news/index.html">Visit the news archive <span aria-hidden="true">→</span></a></p>';
      return;
    }
    const formatter = new Intl.DateTimeFormat("en", {
      day: "2-digit", month: "short", year: "numeric",
    });
    newsList.innerHTML = items.map((item) => {
      const published = new Date(item.published_at);
      const date = Number.isNaN(published.getTime()) ? "" : `<time datetime="${escapeHtml(published.toISOString())}">${escapeHtml(formatter.format(published).toUpperCase())}</time>`;
      return `<a class="news-item" href="${escapeHtml(cacheUrl(item.url))}"><span class="news-meta">${date}<b>${escapeHtml(item.category || "PROJECT NOTE")}</b></span><span class="news-title">${escapeHtml(item.title)}</span><span class="news-arrow" aria-hidden="true">↗</span></a>`;
    }).join("");
  }

  const readTheme = () => {
    try { return window.localStorage.getItem(key) === "light" ? "light" : "dark"; }
    catch (_) { return root.classList.contains("light-theme") ? "light" : "dark"; }
  };
  const setTheme = (theme, persist = false) => {
    const light = theme === "light";
    root.classList.toggle("light-theme", light);
    root.style.colorScheme = light ? "light" : "dark";
    toggle?.setAttribute("aria-pressed", String(light));
    toggle?.setAttribute("aria-label", `Switch to ${light ? "dark" : "light"} theme`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#f4efe6" : "#11110f");
    if (label) label.textContent = light ? "Dark" : "Light";
    if (persist) {
      try { window.localStorage.setItem(key, light ? "light" : "dark"); }
      catch (_) { /* Theme changes still work when storage is blocked. */ }
    }
  };
  setTheme(readTheme());
  refreshForNewVersion();
  hydrateSiteContent();
  applyFeatureVisibility();
  renderNews();
  toggle?.addEventListener("click", () => setTheme(root.classList.contains("light-theme") ? "dark" : "light", true));
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) setTheme(readTheme());
  });
  window.addEventListener("pageshow", () => setTheme(readTheme()));

  const smallScreen = window.matchMedia("(max-width: 1180px)");
  const setProductOpen = (open, restoreFocus = false) => {
    if (!productMenu?.isConnected) return;
    productMenu.classList.toggle("product-open", open);
    productTrigger?.setAttribute("aria-expanded", String(open));
    if (productDropdown) productDropdown.hidden = !open;
    if (!open && restoreFocus) productTrigger?.focus();
  };
  const setMenuOpen = (open, restoreFocus = false) => {
    header?.classList.toggle("menu-open", open);
    menu?.setAttribute("aria-expanded", String(open));
    menu?.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    if (!open) setProductOpen(false);
    if (!open && restoreFocus) menu?.focus();
  };
  setProductOpen(false);
  productTrigger?.addEventListener("click", () => {
    setProductOpen(productTrigger.getAttribute("aria-expanded") !== "true");
  });
  productTrigger?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    setProductOpen(true);
    productDropdown?.querySelector("a")?.focus();
  });
  productMenu?.addEventListener("focusout", (event) => {
    if (!productMenu.contains(event.relatedTarget)) setProductOpen(false);
  });
  menu?.addEventListener("click", () => {
    setMenuOpen(menu.getAttribute("aria-expanded") !== "true");
  });
  navigation?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenuOpen(false);
  });
  header?.addEventListener("focusout", (event) => {
    if (!header.contains(event.relatedTarget)) setMenuOpen(false);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!productMenu?.contains(event.target)) setProductOpen(false);
    if (!header?.contains(event.target)) setMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (productTrigger?.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      setProductOpen(false, true);
    } else if (menu?.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      setMenuOpen(false, true);
    }
  });
  smallScreen.addEventListener("change", () => {
    const focusWillHide = smallScreen.matches && navigation?.contains(document.activeElement);
    setMenuOpen(false, focusWillHide);
  });
})();
