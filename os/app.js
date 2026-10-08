(() => {
  "use strict";

  const app = document.querySelector("#app");
  const docs = Array.isArray(window.DESKLEMUR_OS_DOCS)
    ? [...window.DESKLEMUR_OS_DOCS].sort((a, b) =>
        ({ Overview: 0, "User Guide": 1, "Developer Guide": 2 }[a.group] ?? 3) -
        ({ Overview: 0, "User Guide": 1, "Developer Guide": 2 }[b.group] ?? 3) ||
        String(a.path).localeCompare(String(b.path)),
      )
    : [];

  const CAPABILITY_ASSET_DIR = "./assets/capabilities";
  const LIGHT_ART_DIR = "./assets/light";
  const cache = window.DESKLEMUR_SITE?.cache || {};
  let productTheme = "dark";
  try {
    productTheme = (window.localStorage.getItem("desklemur-theme") ||
      window.localStorage.getItem("deskle-mur-os-product-theme")) === "light" ? "light" : "dark";
  } catch { /* Private browsing can disable persistent preferences. */ }
  let marketingController = null;
  let renderedMarketingPage = null;
  let demoAnimationEnabled = false;
  let focusMarketingDestination = false;

  function isLightTheme() {
    return productTheme === "light";
  }

  function githubUrl() {
    const url = window.DESKLEMUR_SITE?.site?.github_url;
    return typeof url === "string" && url.trim() ? url : "https://github.com/";
  }

  function featureEnabled(name) {
    return window.DESKLEMUR_SITE?.features?.os?.[name] !== false;
  }

  function cacheUrl(value) {
    const url = String(value);
    if (!url || /^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(url)) return url;
    const [beforeHash, hash = ""] = url.split("#", 2);
    const [path, query = ""] = beforeHash.split("?", 2);
    const normalized = decodeFragment(path).replace(/^\.\//, "");
    const version = cache.assets?.[`os/${normalized}`] || cache.version;
    if (!version) return url;
    const params = new URLSearchParams(query);
    params.set("v", version);
    return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
  }

  function refreshForNewVersion() {
    const current = cache.version;
    if (!current || !window.fetch) return;
    fetch("../site-version.json", { cache: "no-store" })
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
  }

  function applyFeatureVisibility() {
    const selectors = {
      runtime: "#runtime",
      tools: "#tools",
      system_graph: "#observability",
      security: "#security",
      vision: "#vision",
      releases: "#release-notes",
      documentation: ".docs-promo",
    };
    Object.entries(selectors).forEach(([feature, selector]) => {
      if (!featureEnabled(feature)) {
        document.querySelectorAll(selector).forEach((element) => element.remove());
      }
    });
  }

  function productIconPath() {
    return cacheUrl(isLightTheme() ? "./assets/web/icon-light-64.png" : "./assets/web/icon-64.png");
  }

  function directionArtPath(fileName) {
    const base = isLightTheme() ? `${LIGHT_ART_DIR}/DIRECTION/web` : "./assets/DIRECTION/web";
    return cacheUrl(`${base}/${encodeURIComponent(fileName.replace(/\.png$/i, ".webp"))}`);
  }

  function rootArtPath(fileName) {
    const base = isLightTheme() ? `${LIGHT_ART_DIR}/web` : "./assets/web";
    return cacheUrl(`${base}/${encodeURIComponent(fileName.replace(/\.png$/i, ".webp"))}`);
  }

  function runtimeTraceUrl() {
    return cacheUrl(`./live/system_graph.html?theme=ember${isLightTheme() ? "&light_mode=true" : ""}`);
  }

  function applyPageTheme(page) {
    const marketing = page === "home" || page === "vision";
    const lightHome = marketing && isLightTheme();
    document.body.classList.toggle("home-view", marketing);
    document.body.classList.toggle("docs-view", page === "docs");
    document.body.classList.toggle("light-theme", lightHome);
    document.documentElement.style.colorScheme = lightHome ? "light" : "dark";

    document.querySelector("#theme-color")?.setAttribute(
      "content",
      lightHome ? "#f4f1e9" : "#11110f",
    );
    document.querySelector("#site-favicon")?.setAttribute(
      "href",
      cacheUrl(lightHome ? "./assets/web/icon-light-64.png" : "./assets/web/icon-64.png"),
    );
    document.querySelector("#site-touch-icon")?.setAttribute(
      "href",
      cacheUrl(lightHome ? "./assets/web/touch-icon-light-180.png" : "./assets/web/touch-icon-180.png"),
    );
  }

  const capabilities = [
    {
      index: "01",
      title: "Models",
      body: "Standard and Pro use bundled in-app llama.cpp only. Other model connections are limited to Ultimate and Developer, which are not publicly available.",
      image: "models.webp",
    },
    {
      index: "02",
      title: "Agents",
      body: "Create independent AI instances and coordinate them through collaboration or debate workflows.",
      image: "agents.webp",
    },
    {
      index: "03",
      title: "Tools",
      body: "Execute tools autonomously, in parallel batches, or as dependent pipelines with reusable recipes.",
      image: "tools.webp",
    },
    {
      index: "04",
      title: "Memory",
      body: "Manage editable profile memories, warm memory, STM, LTM, recall profiles, and bounded task context.",
      image: "memory.webp",
    },
    {
      index: "05",
      title: "Security",
      body: "Define permission policy per tool and move explicitly between sandboxed and system-level access.",
      image: "security.webp",
    },
    {
      index: "06",
      title: "Observability",
      body: "Inspect plans, raw model output, protocol routing, tool calls, tokens, guards, and runtime load.",
      liveDemo: true,
    },
  ];

  // Genuinely forward-looking direction.
  const visionPoints = [
    [
      "01",
      "The goal: an AGI loop",
      "The long-term direction is a multi-LLM AGI loop — heterogeneous models planning, executing, and correcting each other inside one observable runtime.",
      "The goal an AGI loop.png",
    ],
    [
      "02",
      "Open, gradually",
      "Built by a single developer, shipping powerful features first and open-sourcing the project step by step.",
      "Open, gradually.png",
    ],
  ];

  const securityLevels = [
    [
      "01",
      "JAIL",
      "Conversation and web research only",
      "Only websurfing, current_time, and respond are exposed — even when other tools are enabled in settings.",
    ],
    [
      "02",
      "PLAYGROUND",
      "Controlled project workspace",
      "Read and write PlayGround/&lt;master&gt;/&lt;agent&gt;/ plus upload and download paths; other absolute paths are blocked before execution.",
    ],
    [
      "03",
      "WILD",
      "Your complete home workspace",
      "Access is rooted at ~/: Documents, Desktop, and Library are available, while paths outside your home remain blocked.",
    ],
    [
      "04",
      "WILD+",
      "System-wide path scope",
      "The path root is /. macOS permissions, SIP, and Unix permissions still apply; this mode never grants sudo.",
    ],
  ];

  const runtimeEvents = [
    ["01", "USER PROMPT", "Analyze the workspace and generate a report."],
    ["02", "MEMORY RECALL", "3 linked memories loaded"],
    ["03", "PLAN", "Inspect → compare → write → verify"],
    ["04", "TOOL PIPELINE", "file_read → file_write → render_check"],
    ["05", "STREAMING", "Generating report.md"],
  ];

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function releaseNotesTemplate() {
    const notes = Array.isArray(window.DESKLEMUR_NEWS)
      ? window.DESKLEMUR_NEWS
          .filter((item) => /^RELEASE NOTES(?:\s*\/|$)/.test(item.category || ""))
          .slice(0, 3)
      : [];

    if (!notes.length) {
      return `<p class="release-notes-empty">New releases will appear here as they are published.</p>`;
    }

    const dateFormatter = new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    return notes
      .map((item) => {
        const href = item.url?.startsWith("./")
          ? `../${item.url.slice(2)}`
          : "../news/index.html";
        const published = new Date(item.published_at);
        const dateLabel = Number.isNaN(published.valueOf())
          ? "Release note"
          : dateFormatter.format(published);

        return `
          <a class="release-note-row" href="${escapeHtml(href)}">
            <span class="release-note-meta"><b>${escapeHtml(dateLabel)}</b><small>${escapeHtml(item.category)}</small></span>
            <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.summary || "")}</small></span>
            <i aria-hidden="true">↗</i>
          </a>
        `;
      })
      .join("");
  }

  function decodeFragment(value) {
    try { return decodeURIComponent(value); } catch { return value; }
  }

  function safeMarkdownUrl(value, image = false) {
    const url = String(value).trim();
    if (!url || /[\u0000-\u0020\u007f\\]/.test(url)) return null;
    if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
      return (image ? /^https?:/i : /^(?:https?:|mailto:)/i).test(url) ? url : null;
    }
    return url.startsWith("//") ? null : url;
  }

  // Render text tokens individually so formatting never rewrites generated tags,
  // code, URLs, or image attributes. Raw HTML stays visible as plain text.
  function renderInline(value, context = {}, allowLinks = true) {
    const text = String(value);
    let html = "";
    let index = 0;
    while (index < text.length) {
      const rest = text.slice(index);
      const escaped = rest.match(/^\\([\\`*{}\[\]()#+\-.!_>~|])/);
      if (escaped) {
        html += escapeHtml(escaped[1]);
        index += escaped[0].length;
        continue;
      }
      const code = rest.match(/^(`+)([\s\S]*?)\1(?!`)/);
      if (code) {
        html += `<code class="inline-code">${escapeHtml(code[2])}</code>`;
        index += code[0].length;
        continue;
      }
      const link = allowLinks && rest.match(/^(!?)\[([^\]]*)\]\(\s*(<[^>]+>|(?:[^()\s\\]|\\.|\([^()]*\))+)(?:\s+["']([^"']*)["'])?\s*\)/);
      if (link) {
        const isImage = link[1] === "!";
        const destination = link[3].replace(/^<|>$/g, "").replace(/\\([()])/g, "$1");
        let url = safeMarkdownUrl(destination, isImage);
        const label = link[2];
        if (url && !isImage && url.startsWith("#") && !url.startsWith("#/")) {
          url = context.doc ? docHref(context.doc, decodeFragment(url.slice(1))) : url;
        }
        if (url && isImage) {
          html += `<button class="docs-image-button" type="button" aria-label="${escapeHtml(`Enlarge image: ${label || "Documentation screenshot"}`)}"><img class="docs-image" src="${escapeHtml(cacheUrl(url))}" alt="${escapeHtml(label)}" loading="lazy" decoding="async" /><span class="docs-image-hint" aria-hidden="true">Enlarge image ↗</span></button>`;
        } else if (url) {
          const external = /^https?:/i.test(url);
          html += `<a href="${escapeHtml(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}${link[4] ? ` title="${escapeHtml(link[4])}"` : ""}>${renderInline(label, context, false)}</a>`;
        } else {
          html += escapeHtml(label);
        }
        index += link[0].length;
        continue;
      }
      const strong = rest.match(/^(\*\*|__)(?=\S)(.+?\S|\S)\1/);
      const emphasis = rest.match(/^(\*|_)(?=\S)([^\n]+?\S|\S)\1/);
      const format = strong || emphasis;
      const insideWord = format?.[1].includes("_") && /[\p{L}\p{N}]/u.test(text[index - 1] || "");
      if (format && !insideWord) {
        const tag = strong ? "strong" : "em";
        html += `<${tag}>${renderInline(format[2], context, allowLinks)}</${tag}>`;
        index += format[0].length;
        continue;
      }
      html += escapeHtml(text[index]);
      index += 1;
    }
    return html;
  }

  function plainMarkdown(value) {
    return String(value)
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*_#>|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function headingId(text, context) {
    const base = plainMarkdown(text).toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-") || "section";
    let id = base;
    let suffix = 0;
    while (context.headingIds.has(id)) id = `${base}-${++suffix}`;
    context.headingIds.add(id);
    return id;
  }

  function splitTableRow(line) {
    return line
      .trim()
      .replace(/^\||\|$/g, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim());
  }

  function isTableSeparator(line) {
    const cells = splitTableRow(line);
    return (
      cells.length > 0 &&
      cells.every((cell) => /^:?-{3,}:?$/.test(cell))
    );
  }

  function renderList(lines, start, context) {
    const marker = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/;
    const first = lines[start].match(marker);
    const indent = first[1].length;
    const ordered = /^\d/.test(first[2]);
    const tag = ordered ? "ol" : "ul";
    const items = [];
    let index = start;
    while (index < lines.length) {
      const item = lines[index].match(marker);
      if (!item || item[1].length !== indent || /^\d/.test(item[2]) !== ordered) break;
      const contentIndent = item[0].length - item[3].length;
      const content = [item[3]];
      index += 1;
      while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
          let next = index + 1;
          while (next < lines.length && !lines[next].trim()) next += 1;
          const nextLine = lines[next] || "";
          const nextItem = nextLine.match(marker);
          if (nextLine.match(/^\s*/)[0].length > indent ||
              (nextItem && nextItem[1].length === indent && /^\d/.test(nextItem[2]) === ordered)) {
            content.push(""); index += 1; continue;
          }
          break;
        }
        const lineIndent = line.match(/^\s*/)[0].length;
        if (lineIndent <= indent) break;
        content.push(line.slice(Math.min(contentIndent, lineIndent)));
        index += 1;
      }
      items.push(`<li>${renderMarkdown(content.join("\n"), context)}</li>`);
    }
    const number = ordered ? parseInt(first[2], 10) : 1;
    return { html: `<${tag}${ordered && number !== 1 ? ` start="${number}"` : ""}>${items.join("")}</${tag}>`, index };
  }

  function renderMarkdown(markdown, context = {}) {
    context.headingIds ||= new Set();
    context.headings ||= [];
    const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let index = 0;
    let paragraph = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push(`<p>${renderInline(paragraph.join(" "), context)}</p>`);
      paragraph = [];
    }

    while (index < lines.length) {
      const line = lines[index];

      const fence = line.trim().match(/^(`{3,}|~{3,})(.*)$/);
      if (fence) {
        flushParagraph();

        const language = fence[2].trim();
        const closingFence = new RegExp(`^${fence[1][0]}{${fence[1].length},}\\s*$`);
        const codeLines = [];
        index += 1;

        while (index < lines.length && !closingFence.test(lines[index].trim())) {
          codeLines.push(lines[index]);
          index += 1;
        }

        html.push(
          `<pre><code${language ? ` data-language="${escapeHtml(language)}"` : ""}>${escapeHtml(
            codeLines.join("\n"),
          )}</code></pre>`,
        );

        index += 1;
        continue;
      }

      if (
        line.includes("|") &&
        index + 1 < lines.length &&
        isTableSeparator(lines[index + 1])
      ) {
        flushParagraph();

        const headers = splitTableRow(line);
        index += 2;
        const rows = [];

        while (
          index < lines.length &&
          lines[index].trim() &&
          lines[index].includes("|")
        ) {
          rows.push(splitTableRow(lines[index]));
          index += 1;
        }

        html.push(`
          <div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table">
            <table>
              <thead>
                <tr>${headers
                  .map((header) => `<th>${renderInline(header, context)}</th>`)
                  .join("")}</tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `
                      <tr>${row
                        .map((cell) => `<td>${renderInline(cell, context)}</td>`)
                        .join("")}</tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        const level = heading[1].length;
        const text = heading[2].trim();
        const id = headingId(text, context);
        context.headings.push({ id, level, text: plainMarkdown(text) });
        const permalink = context.doc && level > 1
          ? `<a class="heading-permalink" href="${docHref(context.doc, id)}" aria-label="${escapeHtml(`Link to ${plainMarkdown(text)}`)}">#</a>`
          : "";
        html.push(
          `<h${level} id="${escapeHtml(id)}" tabindex="-1">${renderInline(text, context)}${permalink}</h${level}>`,
        );
        index += 1;
        continue;
      }

      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        flushParagraph();
        html.push("<hr />");
        index += 1;
        continue;
      }

      if (/^\s*(?:[-*+]|\d+[.)])\s+.+$/.test(line)) {
        flushParagraph();
        const list = renderList(lines, index, context);
        html.push(list.html);
        index = list.index;
        continue;
      }

      if (line.startsWith(">")) {
        flushParagraph();
        const quoteLines = [];

        while (index < lines.length && lines[index].startsWith(">")) {
          quoteLines.push(lines[index].replace(/^>\s?/, ""));
          index += 1;
        }

        html.push(
          `<blockquote>${renderMarkdown(quoteLines.join("\n"), context)}</blockquote>`,
        );
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        index += 1;
        continue;
      }

      paragraph.push(line.trim());
      index += 1;
    }

    flushParagraph();

    return html.join("\n");
  }

  function productJumpTemplate() {
    const entries = [
      ['workflows', 'Workflows'], ['capabilities', 'Overview'], ['editions', 'Editions'],
      ['workspace-features', 'Features'], ['runtime', 'Runtime', 'runtime'],
      ['security', 'Permissions', 'security'], ['faq', 'Questions'],
    ].filter(([, , feature]) => !feature || featureEnabled(feature));
    return `<nav class="product-jump" aria-label="Explore this product"><div class="container">${entries.map(([id, label]) => `<a href="#/#${id}">${label}</a>`).join('')}</div></nav>`;
  }

  const workflowExamples = [
    { id: 'files', label: 'Files & reports', title: 'Turn source files into a reviewable result.',
      prompt: 'Compare these project notes and write a brief in my workspace.',
      steps: ['Choose the files and a permitted workspace.', 'Follow the plan, file reads, and output as the agent works.', 'Inspect the saved file and the evidence behind the answer.'],
      result: 'A local artifact you can open, revise, and check.', target: 'runtime', feature: 'runtime', link: 'See the runtime' },
    { id: 'connected', label: 'Connected tools', title: 'Work with the services you already use.',
      prompt: 'Use my connected workspace to prepare a page from these notes.',
      steps: ['Connect an MCP server and select its tools.', 'Review the available arguments and tool permissions.', 'Check the tool result and, where supported, read the change back.'],
      result: 'Visible service activity, with results to verify.', target: 'tools', feature: 'tools', link: 'Explore tool connections' },
    { id: 'continuity', label: 'Continuing work', title: 'Give the next task useful context.',
      prompt: 'Continue our project using the decisions we kept from the last session.',
      steps: ['Keep work associated with the intended agent and master profile.', 'Use recalled context alongside fresh task evidence.', 'Inspect and correct the selected agent’s profile memories when needed.'],
      result: 'Continuity you can inspect and adjust.', target: 'memory', link: 'Explore memory' },
  ];

  function workflowTemplate() {
    return `<section class="section workflow-section" id="workflows"><div class="container">
      <div class="section-heading"><div><div class="section-kicker">START WITH YOUR WORK</div><h2>What would you like to get done?</h2></div><p>Three ways to use the same workspace. These are example workflows; available actions depend on your model, edition, and configured tools.</p></div>
      <div class="workflow-tabs" role="tablist" aria-label="Example workflows">${workflowExamples.map((item, i) => `<button type="button" role="tab" id="workflow-tab-${item.id}" aria-controls="workflow-${item.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${item.label}</button>`).join('')}</div>
      ${workflowExamples.map((item, i) => `<div class="workflow-panel" role="tabpanel" tabindex="0" id="workflow-${item.id}" aria-labelledby="workflow-tab-${item.id}"${i ? ' hidden' : ''}>
        <div class="workflow-request"><span>EXAMPLE REQUEST</span><p>“${item.prompt}”</p><small>${item.result}</small></div>
        <div class="workflow-steps"><h3>${item.title}</h3><ol>${item.steps.map(step => `<li>${step}</li>`).join('')}</ol>${!item.feature || featureEnabled(item.feature) ? `<a href="#/#${item.target}">${item.link} <span aria-hidden="true">→</span></a>` : ''}</div>
        ${productScreenTemplate(item.id)}
      </div>`).join('')}
    </div></section>`;
  }

  const productScreens = {
    files: { file: 'file-review-html.png', width: 1280, height: 796, alt: 'File Review showing a saved project brief with current focus and next steps.', caption: 'Review the saved file in the app before sharing it.' },
    connected: { file: 'mcp-saved-tools.png', width: 1236, height: 731, alt: 'Tool Builder showing selected tools from a sample MCP notes server.', caption: 'Choose which connected tools the agent can use.' },
    continuity: { file: 'agent-memories.png', width: 1020, height: 828, alt: 'Agent Memory showing editable example preferences for SPECTRA.', caption: 'Review and adjust the selected agent’s profile memories.' },
  };

  function productScreenTemplate(key) {
    const screen = productScreens[key];
    if (!screen) return '';
    return `<figure class="product-screen">
      <div class="product-screen-label">APP INTERFACE <span>Example data</span></div>
      <img src="${cacheUrl(`./assets/product/${screen.file}`)}" width="${screen.width}" height="${screen.height}" alt="${escapeHtml(screen.alt)}" loading="lazy" decoding="async" />
      <figcaption>${escapeHtml(screen.caption)} <span>Tap or click to enlarge.</span></figcaption>
    </figure>`;
  }

  function featureLibraryTemplate() {
    const features = [
      { id: 'tools', index: '01', title: 'Tools that fit the task.', summary: 'Built-in tools, custom recipes, and MCP connections.',
        body: 'Give agents the tools they need and keep their activity visible in the same workspace.',
        points: ['Author custom tools with their own inputs and permissions.', 'Save dependent steps as recipes and run independent calls in batches.', 'Connect supported stdio or HTTP MCP servers, then select their tools.'], screen: 'connected' },
      { id: 'agents', index: '02', title: 'One workspace. Different roles.', summary: 'Named agents for individual, collaborative, and debate workflows.',
        body: 'Keep agent roles and work organized under a master profile. Standard and Pro agents share the workspace model.',
        points: ['Choose an agent for the task and configure its role.', 'Use individual, collaboration, or debate modes as your edition allows.', 'Individual model connections are limited to Ultimate and Developer, which are not publicly available.'] },
      { id: 'memory', index: '03', title: 'Context you can review.', summary: 'Continue work with memory you can inspect and adjust.',
        body: 'Give the next task useful context while keeping control over what an agent remembers about you.',
        points: ['Select an agent to review its profile memories.', 'Edit, lock, or forget a selected memory; chat history stays unchanged.', 'Warm memory, recall, and saved knowledge support continuity across tasks.'], screen: 'continuity' },
    ].filter(item => item.id !== 'tools' || featureEnabled('tools'));
    return `<section class="section feature-library" id="workspace-features"><div class="container">
      <div class="section-heading"><div><div class="section-kicker">MAKE IT YOUR WORKSPACE</div><h2>Explore what matters to you.</h2></div><p>Open a feature to see its controls and interface. Actions and limits depend on your edition and configuration.</p></div>
      <div class="feature-library-list">${features.map(item => `<details class="feature-disclosure" id="${item.id}">
        <summary><span class="feature-index">${item.index}</span><span class="feature-title">${item.title}<small>${item.summary}</small></span><span class="feature-toggle" aria-hidden="true">+</span></summary>
        <div class="feature-content"><div class="feature-copy"><h3>${item.title}</h3><p>${item.body}</p><ul>${item.points.map(point => `<li>${point}</li>`).join('')}</ul></div>
          ${item.screen ? productScreenTemplate(item.screen) : `<div class="agent-modes" aria-label="Agent work modes"><article><span>01</span><h4>Individual</h4><p>One agent follows the task.</p></article><article><span>02</span><h4>Collaboration</h4><p>Agents contribute to shared work.</p></article><article><span>03</span><h4>Debate</h4><p>Agents explore different perspectives.</p></article></div>`}
        </div>
      </details>`).join('')}</div>
    </div></section>`;
  }

  function editionsTemplate() {
    const guide = window.DESKLEMUR_EDITION_GUIDE;
    if (!guide || !Array.isArray(guide.editions) || !Array.isArray(guide.rows)) return '';
    const editions = guide.editions;
    const primaryEditions = editions.filter(edition => ['standard', 'pro'].includes(edition.id));
    const referenceEditions = editions.filter(edition => !['standard', 'pro'].includes(edition.id));
    const cardRows = ['model_engine', 'agent_routes', 'context_efficiency', 'execution_state']
      .map(id => guide.rows.find(row => row.id === id)).filter(Boolean);
    return `<section class="section editions-section" id="editions" aria-labelledby="editions-title"><div class="container">
      <div class="section-heading"><div><div class="section-kicker">EDITION OVERVIEW</div><h2 id="editions-title">Compare Standard and Pro.</h2></div><p>A shared foundation for local work. Choose the features that fit the way you use your workspace.</p></div>
      <div class="edition-cards edition-primary-cards">${primaryEditions.map(edition => `<article class="edition-card edition-primary-card" data-edition="${escapeHtml(edition.id)}" aria-labelledby="edition-${escapeHtml(edition.id)}-title">
        <div class="edition-card-heading"><span class="edition-card-label">BUNDLED LOCAL INFERENCE</span>${edition.id === 'pro' ? '<span class="edition-card-badge">WITH DPMS</span>' : ''}</div>
        <h3 id="edition-${escapeHtml(edition.id)}-title">${escapeHtml(edition.name)}</h3><p class="edition-card-summary">${escapeHtml(edition.summary)}</p>
        <dl class="edition-card-features">${cardRows.map(row => `<div${row.id === 'execution_state' ? ' class="edition-dpms-row"' : ''}><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(String(row.values?.[edition.id] ?? '—'))}</dd></div>`).join('')}</dl>
      </article>`).join('')}</div>
      <p class="edition-engine-note"><strong>Standard and Pro use bundled in-app llama.cpp only.</strong> Connected tools and the optional app chat API are separate from model inference.</p>
      ${referenceEditions.length ? `<details class="edition-reference" id="edition-reference"><summary><span class="edition-reference-title">Ultimate &amp; Developer</span><span class="edition-reference-status">Not publicly available · Feature reference</span></summary>
        <div class="edition-reference-content"><p>Existing model servers, other engines, and web-provider routes are limited to these closed editions. Their features are shown for reference.</p>
          <div class="edition-reference-cards">${referenceEditions.map(edition => `<article class="edition-card edition-reference-card" data-edition="${escapeHtml(edition.id)}"><span class="edition-card-label">NOT PUBLICLY AVAILABLE</span><h3>${escapeHtml(edition.name)}</h3><p>${escapeHtml(edition.summary)}</p></article>`).join('')}</div>
        </div>
      </details>` : ''}
      <details class="edition-comparison" id="edition-comparison"><summary>See the full feature comparison <span>All editions · Model connections, task state, and research tools</span></summary>
        <p class="edition-table-hint" id="edition-table-hint">On smaller screens, scroll the comparison horizontally to see every edition.</p>
        <div class="edition-table-scroll" tabindex="0" role="region" aria-label="Edition feature comparison" aria-describedby="edition-table-hint"><table class="edition-table"><caption>Features by edition · Ultimate and Developer are not publicly available</caption><thead><tr><th scope="col">Feature</th>${editions.map(edition=>`<th scope="col">${escapeHtml(edition.name)}${edition.availability === 'closed' ? '<span class="edition-availability">Not publicly available</span>' : ''}</th>`).join('')}</tr></thead><tbody>${guide.rows.map(row=>`<tr><th scope="row">${escapeHtml(row.label)}${row.description ? `<span>${escapeHtml(row.description)}</span>` : ''}</th>${editions.map(edition=>`<td>${escapeHtml(String(row.values?.[edition.id] ?? '—'))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="edition-notes">${(guide.notes || []).map(note=>`<article><h3>${escapeHtml(note.title)}</h3><p>${escapeHtml(note.body || note.text || '')}</p></article>`).join('')}</div>
      </details>
    </div></section>`;
  }

  function faqTemplate() {
    const entries = [
      ['Does local-first mean every task stays offline?', 'Local model inference can run on your machine. Web research, remote MCP servers, model downloads, and configured web providers can contact external services. Review the connections and tools enabled for your task.'],
      ['Can I use a model server I already have?', 'Standard and Pro use bundled in-app llama.cpp only and cannot connect to an existing model server. Compatible local or LAN servers and other model connections are supported only in Ultimate and Developer, which are not publicly available.'],
      ['Can each agent use a different model?', 'Standard and Pro agents share the workspace model. Individual engine and model connections are limited to Ultimate and Developer, which are not publicly available.'],
      ['What do memory edits change?', 'The profile-memory manager lets you select an agent and review what it has learned about you. Editing can change future recall; Forget removes the selected profile memory. It does not erase your chat history or another agent’s profile memories.'],
      ['Does a benchmark prove a tool action will succeed?', 'Protocol and MCP benchmarks evaluate generated output, parsing, or argument validity. MCP argument measurements do not execute the tools. A valid argument or high score is useful evidence, but a real task also needs the right action and a verified result.'],
      ['Where can I follow availability and changes?', 'Use the project repository and published updates for release information. Features and limits vary by edition, platform, and installed build. The product examples on this page are illustrative, not live measurements of your system.'],
    ];
    return `<section class="section faq-section" id="faq"><div class="container faq-layout"><div><div class="section-kicker">BEFORE YOU BEGIN</div><h2>A few useful answers.</h2><p class="section-description">Understand the connections, controls, and scope before choosing a setup.</p></div><div class="faq-items">${entries.map(([question, answer]) => `<details><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div></div></section>`;
  }

  function showStaticExamples() {
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    ['dashUserRow', 'dashPlan1', 'dashPlan2', 'dashAiRow'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = false; });
    set('dashUserText', 'Compare these project notes and write a brief.');
    set('dashPlan1Action', 'Read the selected files');
    set('dashPlan2Action', 'Write and check the brief');
    set('dashAiText', 'The brief is ready for review.\n\n• Key decisions and their supporting sources\n• Differences that need your attention\n• A saved file to open and revise\n\nSample response — no files were read or written.');
    set('dashInputText', 'Your next task…');
    set('runtimeStepNo', 'STEP 03'); set('runtimeTitle', 'Inspect the tool result');
    set('runtimeDesc', 'Plans, tool activity, and evidence stay visible in the same run.');
    set('runtimeCode', 'read → compare → write → check'); set('runtimeChip', 'EXAMPLE');
    set('runtimeStreamText', 'Example timeline · no live model connection');
  }

  function initializeProductInteractions() {
    const { signal } = marketingController;
    app.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest('a[href^="#/#"]');
      if (link && link.hash === window.location.hash) {
        event.preventDefault(); route();
      }
    }, { signal });
    showStaticExamples();
    const tabs = [...app.querySelectorAll('.workflow-tabs [role="tab"]')];
    const selectTab = (tab, focus = false) => {
      tabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; document.getElementById(item.getAttribute('aria-controls')).hidden = !selected; });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tab), { signal });
      tab.addEventListener('keydown', event => {
        const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
        if (next !== undefined) { event.preventDefault(); selectTab(tabs[next], true); }
      }, { signal });
    });
    const animationButtons = [...app.querySelectorAll('[data-demo-animation]')];
    const toggleAnimation = enabled => {
      demoAnimationEnabled = enabled;
      clearRuntimeDemo();
      app.classList.toggle('examples-animated', enabled);
      animationButtons.forEach(button => { button.setAttribute('aria-pressed', String(enabled)); button.textContent = enabled ? 'Pause examples' : 'Play example'; });
      if (enabled) { initRuntimeDemo(); initDashboardDemo(); }
      else { document.getElementById('dashCaret')?.classList.remove('on'); document.getElementById('runtimePlanCard')?.classList.remove('phase-flash'); }
    };
    animationButtons.forEach(button => button.addEventListener('click', () => toggleAnimation(!demoAnimationEnabled), { signal }));
    document.addEventListener('visibilitychange', () => { if (document.hidden) toggleAnimation(false); }, { signal });
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { if (event.matches) toggleAnimation(false); }, { signal });
    const host = app.querySelector('[data-trace-host]');
    const closeButton = app.querySelector('[data-close-trace]');
    if (!host) return;
    const placeholder = host.innerHTML;
    let frame = null, visible = true;
    const syncPlayback = () => frame?.contentWindow?.postMessage({ type: 'desklemur-demo-control', paused: document.hidden || !visible }, location.protocol === 'file:' ? '*' : location.origin);
    host.addEventListener('click', event => {
      if (!event.target.closest('[data-load-trace]') || frame) return;
      frame = document.createElement('iframe');
      frame.title = 'System Graph example with simulated telemetry';
      frame.src = runtimeTraceUrl();
      frame.addEventListener('load', syncPlayback, { signal });
      host.replaceChildren(frame); closeButton.hidden = false;
      closeButton.focus({ preventScroll: true });
    }, { signal });
    closeButton.addEventListener('click', () => {
      frame?.remove(); frame = null; host.innerHTML = placeholder; closeButton.hidden = true; host.querySelector('button').focus({ preventScroll: true });
    }, { signal });
    window.addEventListener('message', event => { if (event.source === frame?.contentWindow && event.data?.type === 'desklemur-demo-ready') syncPlayback(); }, { signal });
    document.addEventListener('visibilitychange', syncPlayback, { signal });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; syncPlayback(); });
      observer.observe(host); signal.addEventListener('abort', () => observer.disconnect(), { once: true });
    }
  }

  function headerTemplate() {
    return `
      <a class="product-skip-link" href="#main-content">Skip to content</a>
      <header class="site-header">
        <div class="container header-inner">
          <div class="header-brand-group">
            <a class="brand" href="#/" aria-label="DeskLemurOS home">
              <img class="brand-mark brand-img" src="${productIconPath()}" alt="DeskLemurOS icon" />
              <span>
                <strong>DeskLemurOS</strong>
                <small>LOCAL AGENT RUNTIME</small>
              </span>
            </a>
            <a class="parent-site-link" href="../index.html">← DeskLemur</a>
          </div>

          <button
            class="menu-button"
            type="button"
            aria-label="Open navigation"
            aria-controls="product-navigation"
            aria-expanded="false"
          >
            MENU
          </button>

          <nav class="main-nav" id="product-navigation" aria-label="Primary navigation">
            <a class="mobile-parent-site-link" href="../index.html">← DeskLemur</a>
            <a href="#/">Product</a>
            <a href="#/#editions">Editions</a>
            ${featureEnabled("runtime") ? '<a href="#/#runtime">How it works</a>' : ""}
            ${featureEnabled("vision") ? '<a href="#/vision">Vision</a>' : ""}
            ${featureEnabled("releases") ? '<a href="#/#release-notes">Updates</a>' : ""}
            ${featureEnabled("documentation") ? '<a href="#/docs">Documentation</a>' : ""}
            <a
              class="nav-cta"
              href="${escapeHtml(githubUrl())}"
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
            <button class="theme-toggle" type="button" aria-label="Switch to ${isLightTheme() ? "dark" : "light"} theme" aria-pressed="${String(isLightTheme())}">
              <span aria-hidden="true">◐</span>
              <span>${isLightTheme() ? "Dark" : "Light"}</span>
            </button>
          </nav>
        </div>
      </header>
    `;
  }

  function runtimePanelTemplate() {
    const eventMarkup = runtimeEvents
      .map(
        ([index, label, detail]) => `
          <div class="trace-event" data-trace-idx="${index}">
            <span>${index}</span>
            <div>
              <strong>${label}</strong>
              <small>${detail}</small>
            </div>
          </div>
        `,
      )
      .join("");

    return `
      <div class="runtime-shell" aria-label="Illustrated runtime dashboard">
        <div class="runtime-topbar">
          <span class="status-dot"></span>
          <span>WORKFLOW EXAMPLE</span>
          <span class="runtime-id">MASTER / LOCAL-01</span>
        </div>

        <div class="runtime-grid">
          <section class="runtime-chat">
            <div class="panel-label">ACTIVE TURN</div>

            <div class="user-message" id="runtimeUserMsg">
              Analyze the uploaded files and build a technical report.
            </div>

            <div class="plan-card" id="runtimePlanCard">
              <div class="plan-card-head">
                <span id="runtimeStepNo">STEP 01</span>
                <span class="live-chip" id="runtimeChip">RUNNING</span>
              </div>

              <strong id="runtimeTitle">Recall related memory</strong>
              <p id="runtimeDesc">Loading linked memories for this workspace.</p>
              <code id="runtimeCode">recall(query="workspace report", top_k=4)</code>
            </div>

            <div class="stream-line">
              <span class="stream-cursor"></span>
              <span id="runtimeStreamText">Preparing run…</span>
            </div>
          </section>

          <aside class="runtime-trace">
            <div class="panel-label">TURN TIMELINE</div>
            <div class="trace-list">${eventMarkup}</div>
          </aside>
        </div>

        <div class="runtime-statusbar">
          <span>MODEL: LOCAL</span>
          <span>KV CACHE: ON</span>
          <span>SECURITY: PLAYGROUND</span>
          <span id="runtimeToolsStat">TOOLS: 16 ACTIVE</span>
        </div>
      </div>
    `;
  }

  function dashboardPanelTemplate() {
    return `
      <div class="dash-shell" aria-label="Illustrated chat dashboard">
        <div class="dash-topbar">
          <span class="dash-logo">DeskLemurOS</span>
          <span class="dash-chips">
            <i class="dash-chip dash-chip-green">TOK 16% · CTX 191K</i>
            <i class="dash-chip dash-chip-blue">RUN</i>
            <i class="dash-chip dash-chip-pink">POL 23</i>
            <i class="dash-chip dash-chip-theme">Ember</i>
          </span>
        </div>

        <div class="dash-chat" id="dashChat">
          <div class="dash-user-row" id="dashUserRow" hidden>
            <span class="dash-sender">DeskLemurOS</span>
            <div class="dash-user-bubble"><span id="dashUserText"></span></div>
          </div>

          <div class="dash-plan" id="dashPlan1" hidden>
            <span class="dash-plan-title">▸ REASONING / PLAN #1</span>
            <span class="dash-plan-action" id="dashPlan1Action"></span>
          </div>
          <div class="dash-plan" id="dashPlan2" hidden>
            <span class="dash-plan-title">▸ REASONING / PLAN #2</span>
            <span class="dash-plan-action" id="dashPlan2Action"></span>
          </div>

          <div class="dash-ai-row" id="dashAiRow" hidden>
            <div class="dash-ai-head">
              <span class="dash-sender">SPECTRA</span>
              <span class="dash-copy">Copy</span>
            </div>
            <div class="dash-ai-bubble"><span id="dashAiText"></span><span class="dash-caret" id="dashCaret"></span></div>
          </div>
        </div>

        <div class="dash-inputbar">
          <span class="dash-clip">📎</span>
          <span class="dash-input-ph" id="dashInputText">Enter Message...</span>
          <span class="dash-send">➤</span>
        </div>
      </div>
    `;
  }

  // ── Hero runtime demo loop ────────────────────────────────────────────
  const runtimeDemoTimers = new Set();
  function scheduleRuntimeDemo(fn, delay) {
    const timer = setTimeout(() => { runtimeDemoTimers.delete(timer); fn(); }, delay);
    runtimeDemoTimers.add(timer);
    return timer;
  }
  function clearRuntimeDemo() {
    runtimeDemoTimers.forEach(clearTimeout);
    runtimeDemoTimers.clear();
  }

  function initRuntimeDemo() {
    clearRuntimeDemo();
    const stepNo = document.getElementById("runtimeStepNo");
    if (!stepNo) return;
    const title = document.getElementById("runtimeTitle");
    const desc = document.getElementById("runtimeDesc");
    const code = document.getElementById("runtimeCode");
    const chip = document.getElementById("runtimeChip");
    const streamText = document.getElementById("runtimeStreamText");
    const planCard = document.getElementById("runtimePlanCard");
    const traceItems = Array.from(document.querySelectorAll(".trace-event"));

    const phases = [
      {
        step: "STEP 01", chip: "RUNNING",
        title: "Recall related memory",
        desc: "Boot recall loads linked memories for this workspace.",
        code: 'recall(query="workspace report", top_k=4)',
        stream: "3 linked memories loaded (LTM 5 · STM 3 · GRAPH 4)",
        timeline: 2,
      },
      {
        step: "STEP 02", chip: "RUNNING",
        title: "Plan the report",
        desc: "Planner emits a dependent tool pipeline for this turn.",
        code: "plan: inspect → compare → write → verify",
        stream: "Plan accepted — 4 stages, evidence guard armed",
        timeline: 3,
      },
      {
        step: "STEP 03", chip: "RUNNING",
        title: "Inspect workspace files",
        desc: "Reading the uploaded sources in parallel.",
        code: "batch(file_read, file_read)",
        stream: "2 sources read · 41 KB observed",
        timeline: 4,
      },
      {
        step: "STEP 04", chip: "RUNNING",
        title: "Compose report artifacts",
        desc: "Executing a dependent tool pipeline with live file output.",
        code: "pipeline(file_read → file_write → render_check)",
        stream: "Writing /workspace/output/report.md",
        timeline: 5,
      },
      {
        step: "STEP 05", chip: "COMPLETE",
        title: "Deliver the final answer",
        desc: "Streaming the verified summary back to the user.",
        code: "respond(status=complete)",
        stream: "report.md verified · answer delivered ✓",
        timeline: 5,
      },
    ];

    const PHASE_MS = 3200;
    let phase = 0;

    function typeStream(text) {
      streamText.textContent = "";
      let i = 0;
      const tick = () => {
        if (streamText.textContent.length < text.length && i <= text.length) {
          streamText.textContent = text.slice(0, i);
          i += 2;
          scheduleRuntimeDemo(tick, 24);
        } else {
          streamText.textContent = text;
        }
      };
      tick();
    }

    function applyPhase(index) {
      const spec = phases[index];
      stepNo.textContent = spec.step;
      chip.textContent = spec.chip;
      chip.classList.toggle("chip-complete", spec.chip === "COMPLETE");
      title.textContent = spec.title;
      desc.textContent = spec.desc;
      code.textContent = spec.code;
      planCard.classList.remove("phase-flash");
      void planCard.offsetWidth; // restart the flash animation
      planCard.classList.add("phase-flash");
      typeStream(spec.stream);
      traceItems.forEach((item, itemIndex) => {
        item.classList.toggle("done", itemIndex < spec.timeline - 1);
        item.classList.toggle("active", itemIndex === spec.timeline - 1);
      });
    }

    function loop() {
      applyPhase(phase);
      const hold = phase === phases.length - 1 ? PHASE_MS + 1400 : PHASE_MS;
      phase = (phase + 1) % phases.length;
      scheduleRuntimeDemo(loop, hold);
    }

    loop();
  }

  // ── Hero dashboard demo loop ──────────────────────────────────────────
  function initDashboardDemo() {
    const userText = document.getElementById("dashUserText");
    const userRow = document.getElementById("dashUserRow");
    const inputText = document.getElementById("dashInputText");
    if (!userText || !userRow || !inputText) return;
    const plan1 = document.getElementById("dashPlan1");
    const plan1Action = document.getElementById("dashPlan1Action");
    const plan2 = document.getElementById("dashPlan2");
    const plan2Action = document.getElementById("dashPlan2Action");
    const aiRow = document.getElementById("dashAiRow");
    const aiText = document.getElementById("dashAiText");
    const caret = document.getElementById("dashCaret");

    const scenarios = [
      {
        user: "What's up!!!",
        plans: ["respond(complete)"],
        ai: "Ready when you are. I can research the web, work inside your approved workspace, or turn a rough idea into a concrete plan.\n\nTry a task with a goal and a constraint — for example: ‘compare three local models for my laptop, then draft a setup plan.’",
      },
      {
        user: "Search today's AI news and summarize it.",
        plans: ["batch(websurfing, websurfing)", "respond(complete)"],
        ai: "DEMO RESEARCH BRIEF\n\n• Local inference: quantized mid-size models are making capable on-device workflows more practical.\n• Agent systems: tool calls, traces, and permission boundaries are becoming first-class product surfaces.\n• Hardware: memory bandwidth and efficient batching remain the main levers for faster local runs.\n\nTakeaway: prioritize observable tools and a clear runtime boundary before optimizing model scale.\nCoverage shown: 6 stories · 4 source pages · grouped by theme.",
      },
      {
        user: "Write a landing page and check the render.",
        plans: ["pipeline(file_write → web_view_tool)", "respond(complete)"],
        ai: "LANDING PAGE CHECK\n\n✓ Built the hero, feature grid, and call-to-action.\n✓ Verified the desktop render at 1280px and checked the main content hierarchy.\n✓ Kept the layout responsive so the feature cards stack cleanly on narrow screens.\n\nNext useful pass: tighten the mobile headline, add social proof, and review the contrast of secondary text.",
      },
    ];

    const schedule = scheduleRuntimeDemo;

    function typeInto(el, text, speed, done) {
      let i = 0;
      const tick = () => {
        el.textContent = text.slice(0, i);
        if (i < text.length) {
          i += 1;
          schedule(tick, speed);
        } else if (done) {
          done();
        }
      };
      tick();
    }

    let index = 0;

    function playScenario() {
      const spec = scenarios[index % scenarios.length];
      index += 1;
      userText.textContent = "";
      userRow.hidden = true;
      inputText.textContent = "";
      inputText.classList.add("is-typing");
      aiText.textContent = "";
      plan1.hidden = true;
      plan2.hidden = true;
      aiRow.hidden = true;
      caret.classList.add("on");

      typeInto(inputText, spec.user, 45, () => {
        schedule(() => {
          userText.textContent = spec.user;
          userRow.hidden = false;
          inputText.textContent = "Enter Message...";
          inputText.classList.remove("is-typing");
          plan1.hidden = false;
          plan1Action.textContent = spec.plans[0];
          if (spec.plans[1]) {
            schedule(() => {
              plan2.hidden = false;
              plan2Action.textContent = spec.plans[1];
            }, 1100);
          }
          schedule(() => {
            aiRow.hidden = false;
            typeInto(aiText, spec.ai, 16, () => {
              caret.classList.remove("on");
              schedule(playScenario, 3600);
            });
          }, spec.plans[1] ? 2100 : 800);
        }, 500);
      });
    }

    playScenario();
  }

  function renderHome() {
    applyPageTheme("home");
    document.title = "DeskLemurOS — Toward a Local Agent OS";

    const capabilityCards = capabilities
      .map(
        ({ index, title, body, liveDemo }) => `
          <article class="capability-card">
            <span class="card-index">${index}</span>
            <h3>${title}</h3>
            <p>${body}</p>
            ${liveDemo && featureEnabled("system_graph")
              ? '<a class="capability-preview-link" href="#/#observability"><span aria-hidden="true">↗</span> Explore the System Graph example</a>'
              : ""}
          </article>
        `,
      )
      .join("");

    const visionRow = ([index, title, body, image]) => `
          <div class="vision-row">
            <div class="vision-row-head">
              <span>${index}</span>
              <div>
                <strong>${title}</strong>
                <p>${body}</p>
              </div>
            </div>
            ${
              image
                ? `<span class="vision-shot"><img src="${directionArtPath(image)}" alt="${escapeHtml(title)} illustration" loading="lazy" /></span>`
                : ""
            }
          </div>
        `;
    const visionRows = visionPoints.map(visionRow).join("");

    const securityRows = securityLevels
      .map(
        ([index, name, description, detail]) => `
          <div class="security-level">
            <span>${index}</span>
            <div>
              <strong>${name}</strong>
              <small>${description}</small>
            </div>
            <p>${detail}</p>
          </div>
        `,
      )
      .join("");

    const releaseNotes = releaseNotesTemplate();


    app.innerHTML = `
      ${headerTemplate()}

      <main id="main-content" class="product-home" tabindex="-1">
        <section class="hero" id="overview">
          <div class="container hero-grid">
            <div class="hero-copy">
              <div class="eyebrow">LOCAL-FIRST · AGENTS &amp; TOOLS · OBSERVABLE</div>

              <h1>
                Your models.
                <span>A working system.</span>
              </h1>

              <p class="hero-lead">
                A desktop workspace for local AI agents. Give models tools
                and follow each task from plan to result.
              </p>

              <div class="hero-actions">
                <a class="button button-primary" href="#/#workflows">Explore a workflow <span aria-hidden="true">↓</span></a>
                <a class="hero-project-link" href="${escapeHtml(githubUrl())}" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
              </div>
            </div>

            <div class="product-preview">
              ${dashboardPanelTemplate()}
              <div class="demo-caption"><span>Illustrative workflow · sample data</span><button type="button" data-demo-animation aria-pressed="false">Play example</button></div>
            </div>

            <aside class="hero-setup" aria-labelledby="hero-setup-title">
              <h2 id="hero-setup-title">Before you begin</h2>
              <p><strong>Standard and Pro use bundled in-app llama.cpp only.</strong></p>
              <p>Ultimate and Developer are not publicly available.</p>
              <div class="hero-resource-links">
                <a href="#/#editions">Compare editions <span aria-hidden="true">→</span></a>
                ${featureEnabled("documentation") ? '<a href="#/docs">Read the documentation <span aria-hidden="true">→</span></a>' : ""}
              </div>
            </aside>
          </div>
        </section>
        ${productJumpTemplate()}
        ${workflowTemplate()}

        <section class="section capabilities-section" id="capabilities">
          <div class="container">
            <div class="section-heading">
              <div>
                <div class="section-kicker">ONE CONTROL SURFACE</div>
                <h2>Six parts. One workspace.</h2>
              </div>

              <p>
                Configure the execution environment without hiding the machinery
                that makes an autonomous workflow run.
              </p>
            </div>

            <div class="capability-grid compact-overview">
              ${capabilityCards}
            </div>


          </div>
        </section>

        ${editionsTemplate()}
        ${featureLibraryTemplate()}

        <section class="manifesto section" id="runtime">
          <div class="container manifesto-grid manifesto-grid-live">
            <div class="manifesto-lead">
              <div class="section-kicker">THE OPERATING LAYER</div>
              <h2>Operate AI as a system, not a chatbot.</h2>

              <div class="manifesto-copy">
                <p>
                  Most AI interfaces stop at the answer. DeskLemurOS exposes the
                  models, agents, plans, tools, memory, permissions, files, and
                  runtime events behind it.
                </p>

                <div class="comparison-row">
                  <span>Prompt → Answer</span>
                  <strong>
                    Prompt → Plan → Tools → Evidence → Trace → Answer
                  </strong>
                </div>
              </div>
            </div>

            <div class="manifesto-runtime">
              ${runtimePanelTemplate()}
              <div class="demo-caption"><span>Illustrative steps · no tools are executed</span><button type="button" data-demo-animation aria-pressed="false">Play example</button></div>
            </div>
          </div>
        </section>

        <section class="section speed-section"><div class="container">
          <div class="section-heading"><div><div class="section-kicker">ENGINEERED FOR SPEED</div><h2>Less repeated work.</h2></div><p>Stable context and reusable runtime state reduce repeated preparation. DPMS reduces token usage to speed up processing in editions that include it.</p></div>
          <details class="support-detail" id="runtime-optimizations"><summary>Explore runtime optimizations</summary><div class="support-detail-body">
            <ul class="speed-list">
              <li><strong>Step-context KV cache</strong> — stable prompt prefixes support cache reuse when the model server accepts them.</li>
              <li><strong>Fast runtime cache</strong> — reuse valid prompt, tool, and profile state; relevant configuration changes invalidate it.</li>
              <li><strong>Parallel tool batches</strong> — independent tool calls execute concurrently inside a single step.</li>
              <li><strong>Streaming everything</strong> — plans, reasoning, tool output, and files render as they are produced.</li>
            </ul>
            <figure class="section-art">
              <img src="${rootArtPath("ENGINEERED FOR SPEED.png")}" alt="Engineered for speed — agent loop optimizations" loading="lazy" />
            </figure>
          </div></details>
        </div></section>

        <section class="section trace-section" id="observability">
          <div class="container trace-layout">
            <div class="trace-copy">
              <div class="section-kicker">SYSTEM GRAPH</div>
              <h2>See what your AI is actually doing.</h2>

              <p>
                Follow every prompt, memory recall, planning decision, tool chain,
                streaming event, recovery guard, and final response on a live
                runtime timeline.
              </p>

              <ul class="feature-list">
                <li>Turn Timeline with inspectable raw payloads</li>
                <li>LLM Pulse with token, cache, latency, and speed telemetry</li>
                <li>Execution Graph connecting planner, tools, and responses</li>
                <li>Runtime Load and event-level debugging surfaces</li>
              </ul>
            </div>

            <div class="graph-card graph-card-live">
              <div class="graph-card-header"><span>SYSTEM GRAPH</span><span class="live-demo-pill">ILLUSTRATIVE REPLAY</span></div>
              <div class="live-embed" data-trace-host>
                <div class="trace-placeholder">
                  <div class="trace-path" aria-hidden="true"><span>Request</span><i>→</i><span>Plan</span><i>→</i><span>Tools</span><i>→</i><span>Result</span></div>
                  <h3>Follow a run, step by step.</h3>
                  <p>Explore the timeline, graph, and model metrics with simulated data. This example does not connect to your app.</p>
                  <button class="button button-primary" type="button" data-load-trace>Open interactive example</button>
                </div>
              </div>
              <div class="demo-caption"><span>Simulated telemetry · loaded on request</span><button type="button" data-close-trace hidden>Close example</button></div>
            </div>
          </div>
        </section>

        <section class="section security-section" id="security">
          <div class="container security-layout">
            <div>
              <div class="section-kicker">EXPLICIT CONTROL</div>
              <h2>Powerful when you need it. Restricted when you don’t.</h2>

              <p class="section-description">
                Permission policies are configurable per tool, while runtime
                levels make the current system boundary visible at all times.
              </p>
            </div>

            <div class="security-levels">
              ${securityRows}
            </div>
          </div>

          <div class="container">
            <details class="support-detail" id="permission-details"><summary>See permission boundaries in detail</summary><div class="support-detail-body">
            <figure class="security-map" aria-labelledby="security-map-title">
              <figcaption class="security-map-heading">
                <div>
                  <span class="security-map-eyebrow">DeskLemurOS · RUNTIME BOUNDARIES</span>
                  <h3 id="security-map-title">The boundary expands deliberately.</h3>
                </div>
                <span class="security-map-scale">JAIL <i></i> PLAYGROUND <i></i> WILD <i></i> WILD+</span>
              </figcaption>

              <div class="security-map-grid">
                <article class="security-map-card jail">
                  <div class="security-map-card-head">
                    <span>01</span>
                    <strong>JAIL</strong>
                    <em>ISOLATED</em>
                  </div>
                  <p>Strongest isolation. A simple conversation and web-research mode.</p>
                  <div class="security-tool-row allow"><b>EXPOSED</b><code>websurfing</code><code>current_time</code><code>respond</code></div>
                  <div class="security-tool-row deny"><b>UNAVAILABLE</b><span>File R/W</span><span>Shell</span><span>OS control</span><span>MCP</span></div>
                  <small>Enabled in settings does not mean exposed at runtime.</small>
                </article>

                <article class="security-map-card playground">
                  <div class="security-map-card-head">
                    <span>02</span>
                    <strong>PLAYGROUND</strong>
                    <em>PROJECT</em>
                  </div>
                  <p>Best fit for normal development work.</p>
                  <div class="security-path"><b>R/W</b><code>PlayGround/&lt;master&gt;/&lt;agent&gt;/</code><span>+ upload / download</span></div>
                  <div class="security-rule"><b>PATH</b><span>Other absolute paths are blocked before execution.</span></div>
                  <div class="security-rule"><b>SHELL</b><span>argv only — no <code>&amp;&amp;</code>, pipes, redirects, or <code>python -c</code>.</span></div>
                </article>

                <article class="security-map-card wild">
                  <div class="security-map-card-head">
                    <span>03</span>
                    <strong>WILD</strong>
                    <em>HOME</em>
                  </div>
                  <p>For work that spans your personal workspace.</p>
                  <div class="security-path"><b>ROOT</b><code>~/</code><span>Documents · Desktop · Library</span></div>
                  <div class="security-rule"><b>PATH</b><span>Anything outside your home directory remains blocked.</span></div>
                  <div class="security-rule"><b>SHELL</b><span>Shell interpretation is enabled: pipes, redirects, and compound commands work.</span></div>
                </article>

                <article class="security-map-card wild-plus">
                  <div class="security-map-card-head">
                    <span>04</span>
                    <strong>WILD+</strong>
                    <em>SYSTEM</em>
                  </div>
                  <p>System-wide operation when a tool explicitly requires it.</p>
                  <div class="security-path"><b>ROOT</b><code>/</code><span>Files, Shell, and WILD+-only tools</span></div>
                  <div class="security-rule"><b>STILL ENFORCED</b><span>macOS permissions, SIP, and Unix permissions.</span></div>
                  <div class="security-rule"><b>NO ESCALATION</b><span>No sudo grant; password prompts stay blocked from the model.</span></div>
                </article>
              </div>

              <div class="security-map-footer">
                <span>ACCESS SCOPE</span>
                <div><b>TOOLS</b><i></i><b>WORKSPACE</b><i></i><b>HOME</b><i></i><b>SYSTEM</b></div>
                <span>EXPLICIT LEVEL SELECTION REQUIRED</span>
              </div>
            </figure>
            </div></details>
          </div>
        </section>

        <section class="section feature-chapter" id="local-moment">
          <div class="container trace-layout">
            <div class="trace-copy">
              <div class="section-kicker">THE LOCAL MOMENT · HAPPENING NOW</div>
              <h2>The local moment.</h2>

              <p>
                Local AI starts with your hardware, memory, and model.
                Standard and Pro run through the bundled in-app llama.cpp engine.
                DeskLemurOS connects the model to agents, memory, and the tools you choose.
              </p>

              <ul class="feature-list">
                <li>Model size and speed depend on your hardware, memory, and chosen engine</li>
                <li>Local inference keeps model requests on your machine; web research, remote MCP tools, and other integrations may contact external services</li>
                <li>Built for on-device orchestration, not a cloud afterthought</li>
              </ul>
            </div>

            <figure class="section-art">
              <img src="${directionArtPath("The local moment.png")}" alt="A lemur at a local AI workstation with AMD hardware, Apple Mac Studio, and NVIDIA hardware" loading="lazy" />
            </figure>
          </div>
        </section>

        <section class="section vision-section" id="vision">
          <div class="container">
            <div class="section-heading">
              <div>
                <div class="section-kicker">DIRECTION</div>
                <h2>Where DeskLemurOS is going.</h2>
              </div>

              <p>
                What already works is the foundation. This is the part that is
                still ahead — the direction the runtime is being built toward.
              </p>
            </div>

            <div class="vision-grid">
              ${visionRows}
            </div>
          </div>
        </section>

        <section class="section docs-promo">
          <div class="container docs-promo-card">
            <div>
              <div class="section-kicker">DOCUMENTATION WORKSPACE</div>
              <h2>Product pages and technical documentation, together.</h2>

              <p>
                Follow the illustrated setup guides, explore the dashboard, and
                learn how models, tools, memory, and permissions work together.
              </p>
            </div>

            <a class="button button-primary" href="#/docs">
              Open Documentation
            </a>
          </div>
        </section>

        <section class="section release-notes-section" id="release-notes">
          <div class="container">
            <div class="section-heading release-notes-heading">
              <div>
                <div class="section-kicker">DESKLEMUROS / RELEASE NOTES</div>
                <h2>What changed, in the open.</h2>
              </div>
              <p>
                Product changes, runtime boundaries, and operational details from
                the same DeskLemur news source.
              </p>
            </div>

            <div class="release-notes-board">
              <div class="release-notes-board-head">
                <span>RUNTIME CHANGELOG</span>
                <a href="../news/index.html">ALL NEWS ↗</a>
              </div>
              ${releaseNotes}
            </div>
          </div>
        </section>

        ${faqTemplate()}
        <section class="final-cta">
          <div class="container">
            <p>LOCAL AGENT OS / RUNTIME CONTROL / AUTONOMOUS ORCHESTRATION</p>
            <h2>Build the runtime you can actually control.</h2>

            <div class="hero-actions centered">
              <a
                class="button button-primary"
                href="${escapeHtml(githubUrl())}"
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
              </a>

              ${featureEnabled("documentation") ? '<a class="button button-secondary" href="#/docs">Read the Docs</a>' : ""}
            </div>
          </div>
        </section>
      </main>

      <footer class="site-footer">
        <div class="container footer-inner">
          <span>DeskLemurOS</span>
          <span>Toward a Local Agent OS.</span>
          ${featureEnabled("documentation") ? '<a href="#/docs/notices/licensing">License &amp; Open Source Notices</a>' : '<a href="../index.html">DeskLemur Home</a>'}
        </div>
      </footer>
    `;

    applyFeatureVisibility();
    initializeHeader();
    initializeProductInteractions();
  }

  function groupDocs(entries) {
    return entries.reduce((groups, doc) => {
      const group = doc.group || "Overview";
      if (!groups[group]) groups[group] = [];
      groups[group].push(doc);
      return groups;
    }, {});
  }

  function docHref(doc, section = "") {
    const slug = String(doc.slug).split("/").map(encodeURIComponent).join("/");
    return `#/docs/${slug}${section ? `#${encodeURIComponent(section)}` : ""}`;
  }

  function docsRoute(hash) {
    const [slug, ...section] = hash.replace(/^#\/docs\/?/, "").split("#");
    return { slug: decodeFragment(slug), section: decodeFragment(section.join("#")) };
  }

  function findDoc(slug) {
    const normalized = decodeFragment(slug || "").replace(/^\/+|\/+$/g, "").toLowerCase();
    if (!normalized) return docs[0];
    return docs.find((doc) => String(doc.slug).toLowerCase() === normalized);
  }

  const searchableDocs = new Map(docs.map((doc) => [doc.slug, plainMarkdown(doc.content)]));
  let docsQuery = "";
  let renderedDocSlug = null;
  let docsController = null;

  function matchingDocs(query) {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return docs.filter((doc) => {
      const haystack = `${doc.title} ${doc.group} ${searchableDocs.get(doc.slug)}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }

  function sidebarTemplate(activeDoc, query = "") {
    const filteredDocs = matchingDocs(query);
    const groups = groupDocs(filteredDocs);
    const term = query.trim().toLowerCase().split(/\s+/)[0];
    const markup = Object.entries(groups).map(([groupName, entries]) => `
      <section class="docs-group">
        <h2>${escapeHtml(groupName)}</h2>
        ${entries.map((entry) => {
          const content = searchableDocs.get(entry.slug);
          const start = Math.max(0, content.toLowerCase().indexOf(term) - 45);
          const snippet = content.slice(start, start + 140);
          return `<a class="docs-link ${entry.slug === activeDoc?.slug ? "active" : ""}"
            href="${docHref(entry)}"${entry.slug === activeDoc?.slug ? ' aria-current="page"' : ""}>
            <span>${escapeHtml(entry.title)}</span>
            ${term ? `<small>${start ? "…" : ""}${escapeHtml(snippet)}${start + 140 < content.length ? "…" : ""}</small>` : ""}
          </a>`;
        }).join("")}
      </section>`).join("");
    return markup || '<p class="docs-no-results">No matching documents. Try a model, tool, or dashboard setting.</p>';
  }

  function paginationTemplate(activeDoc) {
    const activeIndex = docs.findIndex((doc) => doc.slug === activeDoc.slug);
    const previousDoc = activeIndex > 0 ? docs[activeIndex - 1] : null;
    const nextDoc = activeIndex < docs.length - 1 ? docs[activeIndex + 1] : null;
    return `<footer class="docs-pagination" aria-label="Document navigation">
      ${previousDoc ? `<a href="${docHref(previousDoc)}"><span>Previous</span><strong>${escapeHtml(previousDoc.title)}</strong></a>` : "<span></span>"}
      ${nextDoc ? `<a class="next" href="${docHref(nextDoc)}"><span>Next</span><strong>${escapeHtml(nextDoc.title)}</strong></a>` : "<span></span>"}
    </footer>`;
  }

  function sectionsTemplate(doc, headings) {
    const sections = headings.filter(({ level }) => level === 2 || level === 3);
    if (!sections.length) return "";
    return `<aside class="docs-outline"><details open>
      <summary>On this page</summary>
      <nav aria-label="On this page">${sections.map(({ id, level, text }) =>
        `<a class="docs-section-link level-${level}" href="${docHref(doc, id)}">${escapeHtml(text)}</a>`).join("")}
      </nav>
    </details></aside>`;
  }

  function focusTrap(event, container) {
    if (event.key !== "Tab") return;
    const elements = [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex="0"]')]
      .filter((element) => element.getClientRects().length);
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }

  function scrollDocsSection(section) {
    requestAnimationFrame(() => {
      const target = section && document.getElementById(section);
      if (target && target.closest(".markdown-body")) {
        target.scrollIntoView({ behavior: "instant", block: "start" });
        target.focus({ preventScroll: true });
      } else {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      document.querySelectorAll(".docs-section-link").forEach((link) => {
        const active = docsRoute(link.hash).section === section;
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    });
  }

  function renderDocs(hash) {
    applyPageTheme("docs");
    docsController?.abort();
    docsController = new AbortController();
    const { signal } = docsController;
    document.body.classList.remove("docs-menu-open");
    if (!docs.length) {
      app.innerHTML = '<main class="empty-docs"><h1>Documentation is unavailable.</h1><p>Please try again later.</p><a href="#/">Return home</a></main>';
      return;
    }
    const { slug, section } = docsRoute(hash);
    const activeDoc = findDoc(slug);
    renderedDocSlug = activeDoc?.slug || null;
    const context = { doc: activeDoc, headings: [] };
    const content = activeDoc ? renderMarkdown(activeDoc.content, context) : "";
    document.title = `${activeDoc?.title || "Document not found"} — DeskLemurOS`;
    app.innerHTML = `
      <a class="docs-skip-link" href="#docs-content">Skip to document</a>
      <div class="docs-app">
        <aside class="docs-sidebar" id="docs-sidebar" aria-label="Documentation library">
          <button class="docs-close-button" type="button" aria-label="Close documentation navigation">Close ×</button>
          <a class="docs-brand" href="#/">
            <img class="brand-mark brand-img small" src="${cacheUrl("./assets/web/icon-64.png")}" alt="" />
            <span><strong>DeskLemurOS</strong><small>DOCUMENTATION</small></span>
          </a>
          <a class="docs-parent-link" href="../index.html">← DeskLemur</a>
          <label class="docs-search"><span>SEARCH ALL DOCUMENTS</span>
            <input type="search" placeholder="Models, tools, setup…" autocomplete="off" value="${escapeHtml(docsQuery)}" aria-controls="docs-navigation" />
          </label>
          <p class="docs-search-status" role="status" aria-live="polite"></p>
          <nav class="docs-navigation" id="docs-navigation" aria-label="Documentation">${sidebarTemplate(activeDoc, docsQuery)}</nav>
        </aside>
        <button class="docs-menu-backdrop" type="button" tabindex="-1" aria-label="Close documentation navigation" hidden></button>
        <main class="docs-main">
          <header class="docs-topbar">
            <button class="docs-menu-button" type="button" aria-controls="docs-sidebar" aria-expanded="false">DOCUMENTS</button>
            <span class="docs-path">${escapeHtml(activeDoc?.group || "Documentation")}${activeDoc ? ` / ${escapeHtml(activeDoc.title)}` : ""}</span>
            <div class="docs-top-actions"><a href="../index.html">DeskLemur</a><a href="#/">Product</a><a href="${escapeHtml(githubUrl())}" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div>
          </header>
          <div class="docs-reading-layout${context.headings.some(({ level }) => level === 2 || level === 3) ? " has-outline" : ""}">
            ${activeDoc ? sectionsTemplate(activeDoc, context.headings) : ""}
            <article class="markdown-body" id="docs-content" tabindex="-1">
              ${activeDoc ? `${content}${paginationTemplate(activeDoc)}` : `<h1>Document not found</h1><p>This document may have moved. Search the library or <a href="${docHref(docs[0])}">open the documentation overview</a>.</p>`}
            </article>
          </div>
        </main>
      </div>`;

    const searchInput = app.querySelector(".docs-search input");
    const navigation = app.querySelector(".docs-navigation");
    const sidebar = app.querySelector(".docs-sidebar");
    const menuButton = app.querySelector(".docs-menu-button");
    const backdrop = app.querySelector(".docs-menu-backdrop");
    const main = app.querySelector(".docs-main");
    const mobile = window.matchMedia("(max-width: 800px)");
    const setMenuOpen = (open, restoreFocus = true) => {
      const isOpen = open && mobile.matches;
      sidebar.classList.toggle("mobile-open", isOpen);
      sidebar.inert = mobile.matches && !isOpen;
      sidebar.toggleAttribute("aria-modal", isOpen);
      if (isOpen) sidebar.setAttribute("role", "dialog");
      else sidebar.removeAttribute("role");
      menuButton.setAttribute("aria-expanded", String(isOpen));
      backdrop.hidden = !isOpen;
      main.inert = isOpen;
      document.body.classList.toggle("docs-menu-open", isOpen);
      if (isOpen) searchInput.focus();
      else if (restoreFocus && mobile.matches) menuButton.focus();
    };
    const updateSearchStatus = () => {
      const count = matchingDocs(docsQuery).length;
      app.querySelector(".docs-search-status").textContent = docsQuery.trim()
        ? `${count} matching document${count === 1 ? "" : "s"}` : `${docs.length} documents`;
    };
    searchInput.addEventListener("input", (event) => {
      docsQuery = event.target.value;
      navigation.innerHTML = sidebarTemplate(activeDoc, docsQuery);
      updateSearchStatus();
    }, { signal });
    menuButton.addEventListener("click", () => setMenuOpen(true), { signal });
    backdrop.addEventListener("click", () => setMenuOpen(false), { signal });
    app.querySelector(".docs-close-button").addEventListener("click", () => setMenuOpen(false), { signal });
    sidebar.addEventListener("keydown", (event) => {
      if (!sidebar.classList.contains("mobile-open")) return;
      if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); }
      else focusTrap(event, sidebar);
    }, { signal });
    navigation.addEventListener("click", (event) => {
      if (event.target.closest("a")) setMenuOpen(false, false);
    }, { signal });
    mobile.addEventListener("change", () => setMenuOpen(false, false), { signal });
    app.querySelector(".docs-skip-link").addEventListener("click", (event) => {
      event.preventDefault();
      app.querySelector(".markdown-body").focus();
    }, { signal });
    if (window.matchMedia("(max-width: 1200px)").matches) {
      app.querySelector(".docs-outline details")?.removeAttribute("open");
    }
    setMenuOpen(false, false);
    updateSearchStatus();
    scrollDocsSection(section);
  }

  function initializeHeader() {
    const { signal } = marketingController;
    const button = app.querySelector('.menu-button');
    const navigation = app.querySelector('.main-nav');
    const mobile = window.matchMedia('(max-width: 800px)');
    const setOpen = (open, restore = false) => {
      const active = open && mobile.matches;
      navigation.classList.toggle('open', active);
      navigation.inert = mobile.matches && !active;
      button.setAttribute('aria-expanded', String(active));
      button.setAttribute('aria-label', active ? 'Close navigation' : 'Open navigation');
      if (restore) button.focus();
    };
    button.addEventListener('click', () => setOpen(!navigation.classList.contains('open')), { signal });
    navigation.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (!link) return;
      if (link.getAttribute('href')?.startsWith('#/')) {
        focusMarketingDestination = true;
        if (link.hash === window.location.hash) route();
      }
      setOpen(false);
    }, { signal });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && navigation.classList.contains('open')) { event.preventDefault(); setOpen(false, true); }
    }, { signal });
    document.addEventListener('click', event => { if (!event.target.closest('.site-header')) setOpen(false); }, { signal });
    mobile.addEventListener('change', () => setOpen(false), { signal });
    setOpen(false);
    app.querySelector('.theme-toggle').addEventListener('click', () => {
      productTheme = isLightTheme() ? 'dark' : 'light';
      try { window.localStorage.setItem('desklemur-theme', productTheme); } catch {}
      const scrollY = window.scrollY;
      const openDetails = [...app.querySelectorAll('details[id][open]')].map(detail => detail.id);
      route(true);
      openDetails.forEach(id => {
        const detail = document.getElementById(id);
        if (detail?.tagName === 'DETAILS') detail.open = true;
      });
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: 'instant' });
        app.querySelector(mobile.matches ? '.menu-button' : '.theme-toggle')?.focus({ preventScroll: true });
      });
    }, { signal });
    app.querySelector('.product-skip-link')?.addEventListener('click', event => {
      event.preventDefault(); app.querySelector('main')?.focus();
    }, { signal });
    app.querySelectorAll('[data-scroll]').forEach(link => link.addEventListener('click', event => {
      const target = document.getElementById(link.dataset.scroll);
      if (target) { event.preventDefault(); target.scrollIntoView({ behavior: 'instant' }); }
    }, { signal }));
  }

  function renderVision() {
    applyPageTheme("vision");
    document.title = "DeskLemurOS — Vision: From Using AI to Operating AI";

    app.innerHTML = `
      ${headerTemplate()}

      <main id="main-content" tabindex="-1">
        <section class="section vision-hero" id="vision-overview">
          <div class="container">
            <div class="eyebrow">VISION · FROM USING AI TO OPERATING AI</div>
            <h1>AI doesn’t need a larger chat window.<br />It needs a new operating architecture.</h1>
            <p class="hero-lead">
              Until now we have mostly used AI through conversation — ask, receive an
              answer, ask again. Real work needs more: an AI that can observe, understand,
              plan, act, verify, and remember — inside boundaries you define and can
              inspect. DeskLemurOS is being built as that operating AI orchestration system.
            </p>
            <div class="hero-actions">
              ${featureEnabled("early_access") ? '<a class="button button-primary" data-scroll="early-access" href="#/vision">Become an early partner</a>' : ""}
              <a class="button button-secondary" href="#/">Explore the current product</a>
              <a class="button button-secondary" href="#/vision#research-direction">Research direction ↓</a>
            </div>
          </div>
        </section>

        <section class="section vision-chapter" id="discovery-to-engineering">
          <div class="container narrow">
            <div class="section-kicker">FROM DISCOVERY TO ENGINEERING</div>
            <figure class="section-art vision-chapter-art art-right">
              <img src="${cacheUrl("./assets/vision/web/discovery-to-engineering.webp")}" alt="From scientific discovery to engineered local AI infrastructure" loading="lazy" />
            </figure>
            <h2>Maxwell wrote the equations. Engineers built the electric age.</h2>
            <p class="section-description">
              Every field matures the same way. A few remarkable minds make the discovery;
              then generations of engineers turn it into something the world can use. Maxwell
              unified electricity, magnetism, and light in a handful of equations — and the
              engineers who followed built the motors, the power grid, radio, and eventually
              the computer. The equations changed physics; the engineering changed everyday life.
            </p>
            <p class="section-description">
              Large language models are that kind of discovery. A very small number of people
              pushed the science to where a machine can read, reason, and generate — but a
              breakthrough is not yet a usable system, any more than Maxwell’s equations were
              a light bulb.
            </p>
            <p class="section-description">
              DeskLemurOS is built for the engineering half of that story. Not to invent the
              model, but to give it an operating layer — memory, tools, permissions, observation,
              verification, and control — so the breakthrough becomes something a person, a team,
              or an organization can actually run, trust, and own.
            </p>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">THE PROBLEM</div>
            <figure class="section-art vision-chapter-art art-left">
              <img src="${cacheUrl("./assets/vision/web/capable-model-system.webp")}" alt="A model core with disconnected system capabilities" loading="lazy" />
            </figure>
            <h2>A capable model alone is not a capable AI system.</h2>
            <p class="section-description">
              Today’s models are impressive in a single conversation. In real working
              environments the gaps show:
            </p>
            <ul class="feature-list">
              <li>they lose the purpose and context of work completed days earlier;</li>
              <li>they give little visibility into which tools were used, why an action was chosen, or whether the result was verified;</li>
              <li>they are hard to deploy where sensitive data cannot leave the organization.</li>
            </ul>
            <p class="section-description">
              Observation, memory, planning, execution, verification, and control must
              operate as one integrated architecture — not a loose collection of features.
            </p>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">WHY LOCAL — AND WHAT IT’S FOR</div>
            <figure class="section-art vision-chapter-art art-right">
              <img src="${cacheUrl("./assets/vision/web/local-first-control.webp")}" alt="A local AI workstation with a controlled external connection" loading="lazy" />
            </figure>
            <h2>Choose where the model runs. Keep the work inspectable.</h2>
            <p class="section-description">
              Local inference gives you control over the model server and its hardware.
              The right model depends on the task, available memory, and acceptable latency.
              Connected tools, remote MCP services, and configured web providers can still
              send requests outside that machine; local inference is one part of the system boundary.
            </p>
            <p class="section-description">
              Start with a bounded task, inspect its tool results, and compare model and
              protocol settings on the same examples. A larger model can help, but measured
              behavior matters more than an assumed capability level.
            </p>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">MULTI-AGENT COLLABORATION</div>
            <figure class="section-art vision-chapter-art art-left">
              <img src="${cacheUrl("./assets/vision/web/multi-agent-collaboration.webp")}" alt="Specialist agents collaborating through one orchestration hub" loading="lazy" />
            </figure>
            <h2>Not one assistant, but many collaborating agents.</h2>
            <p class="section-description">
              The current product supports individual agents, collaboration, and debate.
              The longer-term direction is richer coordination among specialists, with
              explicit handoffs, shared objectives, and review of one another’s results.
              Example roles for that direction include:
            </p>
            <ul class="feature-list">
              <li>Research · Coding · Document · Engineering agents</li>
              <li>Review · Security · Compliance · Memory agents</li>
            </ul>
            <p class="section-description">
              Evaluating a new product, for example: the Research agent studies the market,
              the Patent agent checks prior art, the Engineering agent judges feasibility,
              the Risk agent flags legal and security concerns, and the Review agent checks
              the combined evidence for consistency and gaps. The result isn’t a pile of
              separate answers — it’s a coordinated system whose agents review one another’s work.
            </p>
          </div>
        </section>

        <section class="section vision-chapter" id="memory-governance">
          <div class="container narrow">
            <div class="section-kicker">MEMORY WITH GOVERNANCE</div>
            <figure class="section-art vision-chapter-art art-right">
              <img src="${cacheUrl("./assets/vision/web/memory-governance.webp")}" alt="A governed multi-layer memory archive" loading="lazy" />
            </figure>
            <h2>Memory that remembers — and forgets when it should.</h2>
            <p class="section-description">
              The current runtime separates task context, recall, and agent profile memories.
              You can select an agent to inspect or edit what it has learned about you.
              The broader research direction extends this separation to project and team use:
            </p>
            <ul class="feature-list">
              <li><strong>Working memory</strong> — the current task</li>
              <li><strong>Long-term memory</strong> — recurring preferences and working methods</li>
              <li><strong>Project memory</strong> — decisions, requirements, and context for a specific project</li>
              <li><strong>Shared organizational memory</strong> — knowledge for authorized teams and agents</li>
            </ul>
            <p class="section-description">
              Today’s profile-memory controls apply to the selected agent; forgetting a
              profile memory does not delete chat history. Organization-wide sharing,
              retention, and access controls are design goals, not promises made by those controls.
            </p>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">CAPABILITY WITH CONTROL</div>
            <figure class="section-art vision-chapter-art art-left">
              <img src="${cacheUrl("./assets/vision/web/capability-control.webp")}" alt="Visible boundaries and approval gates around an AI workspace" loading="lazy" />
            </figure>
            <h2>Powerful when needed. Restricted when not.</h2>
            <p class="section-description">
              The current runtime exposes tool permissions, path-scope levels, and runtime
              review controls. Their settings have specific scopes: not every policy is an
              independent setting for every agent, and a path restriction is not a complete
              network or operating-system sandbox.
            </p>
            <p class="section-description">
              Finer-grained delegation and approval flows remain part of the direction.
              Start from the controls available in your edition, inspect what a tool can
              actually do, and keep important actions reviewable.
            </p>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">AN EXTENSIBLE FOUNDATION</div>
            <figure class="section-art vision-chapter-art art-right">
              <img src="${cacheUrl("./assets/vision/web/extensible-foundation.webp")}" alt="A modular local AI foundation with plug-in components" loading="lazy" />
            </figure>
            <h2>Not one application — a foundation you extend.</h2>
            <p class="section-description">
              The best model today may not be the best tomorrow. DeskLemurOS keeps a stable,
              secure core while models, tools, agents, and policies stay replaceable:
            </p>
            <ul class="feature-list">
              <li>An enterprise builds agents around its own procedures</li>
              <li>A research institute specializes agents for experiments, analysis, and technical writing</li>
              <li>A manufacturer integrates inspection systems, production data, and quality records</li>
              <li>Developers add new Agent Skills, tool connectors, memory modules, and verification functions</li>
            </ul>
          </div>
        </section>

        <section class="section vision-chapter" id="individual-models">
          <div class="container narrow">
            <div class="section-kicker">FROM ONE MODEL TO MANY</div>
            <figure class="section-art vision-chapter-art art-left">
              <img src="${cacheUrl("./assets/vision/web/one-model-to-many.webp")}" alt="One runtime coordinating multiple specialist models" loading="lazy" />
            </figure>
            <h2>A shared model by default. Individual routes when needed.</h2>
            <p class="section-description">
              Standard and Pro agents share the workspace model. Individual model
              connections are supported in Ultimate and Developer, which are not
              publicly available. Running several models also requires enough hardware resources.
            </p>
            <div class="vision-formula">
              <div><span class="ff-tag">shared</span><code>agent → workspace model</code><span class="ff-note">inherit the configured connection</span></div>
              <div><span class="ff-tag">individual</span><code>agent → selected engine + model</code><span class="ff-note">Ultimate / Developer · not publicly available</span></div>
            </div>
          </div>
        </section>

        <section class="section vision-chapter" id="research-direction">
          <div class="container narrow">
            <div class="section-kicker">MEMORY THAT LEARNS</div>
            <figure class="section-art vision-chapter-art art-right">
              <img src="${cacheUrl("./assets/vision/web/memory-that-learns.webp")}" alt="Validated experience becoming learning-ready model knowledge" loading="lazy" />
            </figure>
            <h2>From remembered experience to measured improvement.</h2>
            <p class="section-description">
              Current memory features store and retrieve information for later tasks.
              Candidate metadata and research modes do not mean that an ordinary chat
              rewrites a model’s weights. Retrieval, normalization policies, and model
              training are different mechanisms.
            </p>
            <p class="section-description">
              The research direction is to evaluate whether verified experience can become
              useful training data, with explicit review, regression checks, and a way to
              reverse a change. This is work to investigate, not a guaranteed self-learning
              feature or a claim of AGI.
            </p>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">THE LONG-TERM QUESTION</div>
            <figure class="section-art vision-chapter-art art-left">
              <img src="${cacheUrl("./assets/vision/web/observable-agi-loop.webp")}" alt="A measurable and observable multi-agent improvement loop" loading="lazy" />
            </figure>
            <h2>The goal is an AGI loop — built step by step, verified at every stage.</h2>
            <p class="section-description">
              Per-agent models and memory that truly learns are meant to compound — better
              specialists feeding a system that improves at its own work. That convergence is
              what we explore toward an AGI loop: not a claim that the system is AGI, nor a
              promise of uncontrolled autonomy, but a practical, measurable exploration:
            </p>
            <ul class="feature-list">
              <li>Can it complete longer, more complex tasks reliably?</li>
              <li>Can it remember previous decisions and mistakes accurately?</li>
              <li>Can multiple agents collaborate under one consistent objective?</li>
              <li>Can it verify the results of its own actions?</li>
              <li>Can it follow user-defined permissions and security policies?</li>
              <li>Can it adapt to new tools, models, and environments?</li>
              <li>Can users inspect and control the entire process?</li>
            </ul>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">RESPONSIBLE RELEASE</div>
            <figure class="section-art vision-chapter-art art-right">
              <img src="${cacheUrl("./assets/vision/web/responsible-release.webp")}" alt="A staged release process with visible validation gates" loading="lazy" />
            </figure>
            <h2>Open gradually. Prove continuously. Release responsibly.</h2>
            <p class="section-description">
              Advanced capability is not shipped all at once. Early versions go to a limited
              group of users and partners, and each capability opens only after it is
              evaluated in real environments for:
            </p>
            <ul class="feature-list">
              <li>Agent reliability · Memory accuracy · Permission control</li>
              <li>Tool execution · Security · Error recovery</li>
              <li>Human approval workflows · Operational transparency</li>
            </ul>
            <p class="section-description">
              Openness here means an ecosystem open enough for researchers, developers, and
              organizations to contribute — and responsible enough for users to trust.
            </p>
          </div>
        </section>

        ${featureEnabled("early_access") ? `<section class="final-cta" id="early-access">
          <div class="container">
            <div class="eyebrow">EARLY USERS · TECHNICAL PARTNERS · CO-DEVELOPERS</div>
            <h2>We’re looking for our first users and co-developers.</h2>
            <p class="hero-lead vision-cta-lead">
              DeskLemurOS is not a finished future. We’re looking for teams who want to test
              whether a new Agent Operating System creates real value in real environments —
              as co-development partners, not just users.
            </p>
            <ul class="feature-list ea-list">
              <li>Teams working with local LLMs and model optimization</li>
              <li>Engineers in multi-agent runtime and orchestration</li>
              <li>Specialists in AI security, permission control, and execution isolation</li>
              <li>Builders of long-term memory, knowledge graphs, and retrieval</li>
              <li>Organizations evaluating enterprise / on-premise AI deployment</li>
              <li>Experts in engineering, research, manufacturing, testing, QA, and documentation</li>
              <li>Developers of Agent Skills, tool connectors, and new applications</li>
            </ul>
            <p class="section-description vision-cta-lead">
              Product demonstrations · technical validation · co-development · on-premise deployment discussions
            </p>
            <div class="hero-actions centered"><a class="button button-primary" href="${escapeHtml(githubUrl())}" target="_blank" rel="noopener noreferrer">Follow project updates ↗</a></div>
            <p class="vision-tagline">Operate Intelligence. Own the System.</p>
          </div>
        </section>` : ""}
      </main>

      <footer class="site-footer">
        <div class="container footer-inner">
          <span>DeskLemurOS</span>
          <span>Operate Intelligence. Own the System.</span>
          ${featureEnabled("documentation") ? '<a href="#/docs/notices/licensing">License &amp; Open Source Notices</a>' : '<a href="../index.html">DeskLemur Home</a>'}
        </div>
      </footer>
    `;

    initializeHeader();
  }

  let closeLightbox = () => {};

  function prepareZoomImages() {
    app.querySelectorAll(".capability-shot img, .vision-shot img, .section-art img, .product-screen img").forEach((image) => {
      if (image.closest("a, button")) return;
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute("aria-label", `Enlarge image: ${image.alt || "Product illustration"}`);
    });
  }

  function route(force = false) {
    closeLightbox(false);
    let hash = window.location.hash || '#/';
    const isDocsRoute = /^#\/docs(?:\/|$)/.test(hash);
    if (isDocsRoute && featureEnabled('documentation')) {
      focusMarketingDestination = false;
      clearRuntimeDemo(); marketingController?.abort(); renderedMarketingPage = null;
      demoAnimationEnabled = false; app.classList.remove('examples-animated');
      const requestedDoc = findDoc(docsRoute(hash).slug);
      if (document.body.classList.contains('docs-view') && renderedDocSlug && requestedDoc?.slug === renderedDocSlug) scrollDocsSection(docsRoute(hash).section);
      else renderDocs(hash);
      return;
    }
    docsController?.abort(); renderedDocSlug = null;
    document.body.classList.remove('docs-menu-open');
    const visionRequested = /^#\/vision(?:#|$)/.test(hash);
    if ((isDocsRoute && !featureEnabled('documentation')) || (visionRequested && !featureEnabled('vision'))) {
      window.history.replaceState(null, '', '#/'); hash = '#/';
    }
    const page = /^#\/vision(?:#|$)/.test(hash) && featureEnabled('vision') ? 'vision' : 'home';
    const section = decodeFragment(hash.startsWith('#/') ? (hash.split('#')[2] || '') : hash.slice(1));
    if (force === true || renderedMarketingPage !== page) {
      clearRuntimeDemo(); marketingController?.abort();
      marketingController = new AbortController();
      demoAnimationEnabled = false; app.classList.remove('examples-animated');
      renderedMarketingPage = page;
      if (page === 'vision') renderVision(); else renderHome();
      prepareZoomImages();
    }
    requestAnimationFrame(() => {
      const target = section && document.getElementById(section);
      if (target && target.closest('main')) {
        if (force !== true && target.matches('.feature-disclosure')) target.open = true;
        target.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
      else window.scrollTo({ top: 0, behavior: 'instant' });
      if (focusMarketingDestination) {
        const destination = (target && target.closest('main') && target) || app.querySelector('main h1, main');
        if (destination) {
          if (!destination.hasAttribute('tabindex')) destination.setAttribute('tabindex', '-1');
          destination.focus({ preventScroll: true });
        }
        focusMarketingDestination = false;
      }
      app.querySelectorAll('.product-jump a').forEach(link => {
        if (link.hash === '#/#' + section) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
      });
    });
  }

  function initLightbox() {
    const overlay = document.createElement("dialog");
    overlay.className = "lightbox-overlay";
    overlay.setAttribute("aria-label", "Image preview");
    overlay.setAttribute("aria-describedby", "lightbox-caption");
    overlay.innerHTML = `<button class="lightbox-close" type="button" autofocus>Close ×</button>
      <div class="lightbox-stage"><img alt="" /></div>
      <div class="lightbox-footer"><p id="lightbox-caption"></p><a target="_blank" rel="noopener noreferrer">Open full image ↗</a></div>`;
    document.body.appendChild(overlay);
    const zoomed = overlay.querySelector("img");
    let opener = null;
    let restoreFocus = true;
    closeLightbox = (restore = true) => {
      if (!overlay.open) return;
      restoreFocus = restore;
      overlay.close();
      document.body.classList.remove("lightbox-open");
    };
    const openLightbox = (source) => {
      opener = source.closest("button, a") || source;
      restoreFocus = true;
      zoomed.src = source.currentSrc || source.src;
      zoomed.alt = source.alt || "";
      overlay.querySelector("#lightbox-caption").textContent = source.alt || "Image preview";
      overlay.querySelector("a").href = zoomed.src;
      overlay.showModal();
      document.body.classList.add("lightbox-open");
    };
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.(".docs-image-button");
      const source = button?.querySelector("img") || event.target.closest?.(".capability-shot img, .vision-shot img, .section-art img, .product-screen img");
      if (source) { event.preventDefault(); openLightbox(source); }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const source = event.target.closest?.('img[role="button"]');
      if (source) { event.preventDefault(); openLightbox(source); }
    });
    overlay.addEventListener("keydown", (event) => focusTrap(event, overlay));
    overlay.querySelector(".lightbox-close").addEventListener("click", () => closeLightbox());
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeLightbox();
    });
    overlay.addEventListener("close", () => {
      document.body.classList.remove("lightbox-open");
      if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
    });
  }

  initLightbox();

  refreshForNewVersion();
  window.addEventListener("hashchange", () => route());
  route();
})();
