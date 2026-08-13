(() => {
  "use strict";

  const app = document.querySelector("#app");
  const docs = Array.isArray(window.LOCALLM_DOCS)
    ? [...window.LOCALLM_DOCS].sort((a, b) =>
        String(a.path).localeCompare(String(b.path)),
      )
    : [];

  const CAPABILITY_ASSET_DIR = "./assets/capabilities";
  const LIGHT_ART_DIR = "./assets/light";
  const cache = window.DESKLEMUR_SITE?.cache || {};
  let productTheme =
    window.localStorage.getItem("deskle-mur-os-product-theme") === "light"
      ? "light"
      : "dark";

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
    const normalized = decodeURIComponent(path).replace(/^\.\//, "");
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
    return cacheUrl(isLightTheme() ? "./assets/icon_light.png" : "./assets/icon.png");
  }

  function directionArtPath(fileName) {
    const base = isLightTheme() ? `${LIGHT_ART_DIR}/DIRECTION` : "./assets/DIRECTION";
    return cacheUrl(`${base}/${encodeURIComponent(fileName)}`);
  }

  function rootArtPath(fileName) {
    const base = isLightTheme() ? LIGHT_ART_DIR : "./assets";
    return cacheUrl(`${base}/${encodeURIComponent(fileName)}`);
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
      cacheUrl(lightHome ? "./assets/icon_light.png" : "./assets/favicon.png"),
    );
    document.querySelector("#site-touch-icon")?.setAttribute(
      "href",
      cacheUrl(lightHome ? "./assets/icon_light.png" : "./assets/icon.png"),
    );
  }

  const capabilities = [
    {
      index: "01",
      title: "Models",
      body: "Nearly any local engine or model can drive the runtime — in-process (MLX), local servers (llama.cpp, LM Studio, Ollama, vLLM), and various compatible local API endpoints, adapted per model via channel and protocol overrides. Web API integrations are experimental and used at your sole responsibility.",
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
      body: "Control warm memory, STM, LTM, recall profiles, graph links, and per-step evidence retention.",
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

  const engineBadges = [
    "MLX", "llama.cpp", "LM Studio", "Ollama", "vLLM",
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

  function renderInline(text) {
    let output = escapeHtml(text);

    output = output.replace(
      /`([^`]+)`/g,
      '<code class="inline-code">$1</code>',
    );
    output = output.replace(
      /!\[([^\]]*)\]\(([^)\s]+)\)/g,
      (match, alt, source) => `<img class="docs-image" src="${cacheUrl(source)}" alt="${alt}" loading="lazy" />`,
    );
    output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) =>
      href.startsWith("#")
        ? `<a href="${href}">${label}</a>`
        : `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`,
    );
    output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    output = output.replace(/_([^_]+)_/g, "<em>$1</em>");

    return output;
  }

  function splitTableRow(line) {
    return line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function isTableSeparator(line) {
    const cells = splitTableRow(line);
    return (
      cells.length > 0 &&
      cells.every((cell) => /^:?-{3,}:?$/.test(cell))
    );
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let index = 0;
    let paragraph = [];
    let listType = null;
    let listItems = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }

    function flushList() {
      if (!listType || !listItems.length) return;
      html.push(
        `<${listType}>${listItems
          .map((item) => `<li>${renderInline(item)}</li>`)
          .join("")}</${listType}>`,
      );
      listType = null;
      listItems = [];
    }

    while (index < lines.length) {
      const line = lines[index];

      if (/^```/.test(line.trim())) {
        flushParagraph();
        flushList();

        const language = line.trim().slice(3).trim();
        const codeLines = [];
        index += 1;

        while (index < lines.length && !/^```/.test(lines[index].trim())) {
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
        flushList();

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
          <div class="table-wrap">
            <table>
              <thead>
                <tr>${headers
                  .map((header) => `<th>${renderInline(header)}</th>`)
                  .join("")}</tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `
                      <tr>${row
                        .map((cell) => `<td>${renderInline(cell)}</td>`)
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
        flushList();
        const level = heading[1].length;
        const text = heading[2].trim();
        const id = text
          .toLowerCase()
          .replace(/<[^>]+>/g, "")
          .replace(/[^\w가-힣]+/g, "-")
          .replace(/^-+|-+$/g, "");
        html.push(
          `<h${level} id="${escapeHtml(id)}">${renderInline(text)}</h${level}>`,
        );
        index += 1;
        continue;
      }

      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        flushParagraph();
        flushList();
        html.push("<hr />");
        index += 1;
        continue;
      }

      const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+\.\s+(.+)$/);

      if (unordered || ordered) {
        flushParagraph();
        const nextListType = unordered ? "ul" : "ol";

        if (listType && listType !== nextListType) {
          flushList();
        }

        listType = nextListType;
        listItems.push((unordered || ordered)[1]);
        index += 1;
        continue;
      }

      if (line.startsWith(">")) {
        flushParagraph();
        flushList();
        const quoteLines = [];

        while (index < lines.length && lines[index].startsWith(">")) {
          quoteLines.push(lines[index].replace(/^>\s?/, ""));
          index += 1;
        }

        html.push(
          `<blockquote>${renderMarkdown(quoteLines.join("\n"))}</blockquote>`,
        );
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
        index += 1;
        continue;
      }

      paragraph.push(line.trim());
      index += 1;
    }

    flushParagraph();
    flushList();

    return html.join("\n");
  }

  function headerTemplate() {
    return `
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
            aria-label="Toggle navigation"
            aria-expanded="false"
          >
            MENU
          </button>

          <nav class="main-nav" aria-label="Primary navigation">
            <a class="mobile-parent-site-link" href="../index.html">← DeskLemur</a>
            ${featureEnabled("runtime") ? '<a href="#runtime">Runtime</a>' : ""}
            ${featureEnabled("tools") ? '<a href="#tools">Tools</a>' : ""}
            ${featureEnabled("system_graph") ? '<a href="#observability">System Graph</a>' : ""}
            ${featureEnabled("security") ? '<a href="#security">Security</a>' : ""}
            ${featureEnabled("vision") ? '<a href="#/vision">Vision</a>' : ""}
            ${featureEnabled("releases") ? '<a href="#release-notes">Releases</a>' : ""}
            ${featureEnabled("documentation") ? '<a href="#/docs">Documentation</a>' : ""}
            <a
              class="nav-cta"
              href="${escapeHtml(githubUrl())}"
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
            <button class="theme-toggle" type="button" aria-pressed="${String(isLightTheme())}">
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
          <span>RUNTIME ACTIVE</span>
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
  const runtimeDemoTimers = [];

  function clearRuntimeDemo() {
    while (runtimeDemoTimers.length) clearTimeout(runtimeDemoTimers.pop());
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
          runtimeDemoTimers.push(setTimeout(tick, 24));
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
      runtimeDemoTimers.push(setTimeout(loop, hold));
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

    const schedule = (fn, ms) => runtimeDemoTimers.push(setTimeout(fn, ms));

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
        ({ index, title, body, image, liveDemo }) => `
          <article class="capability-card">
            <span class="card-index">${index}</span>
            <h3>${title}</h3>
            <p>${body}</p>
            ${image
              ? `<span class="capability-shot"><img src="${cacheUrl(`${CAPABILITY_ASSET_DIR}/${encodeURIComponent(image)}`)}" alt="${escapeHtml(title)} screenshot" loading="lazy" /></span>`
              : ""}
            ${liveDemo
              ? `<div class="capability-shot capability-live-demo">
                  <div class="capability-live-bar">
                    <span>RUNTIME TRACE</span>
                    <span><i></i> LIVE</span>
                  </div>
                  <div class="capability-live-viewport">
                    <iframe
                      src="${runtimeTraceUrl()}"
                      title="DeskLemurOS Runtime Trace live demo"
                      loading="lazy"
                    ></iframe>
                  </div>
                  <a class="capability-live-link" href="#observability">OPEN FULL LIVE DEMO <span>↘</span></a>
                </div>`
              : ""}
          </article>
        `,
      )
      .join("");

    const engineStrip = engineBadges
      .map((name) => `<span class="engine-badge">${name}</span>`)
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

      <main>
        <section class="hero">
          <div class="container hero-grid">
            <div class="hero-copy">
              <div class="eyebrow">LOCAL-FIRST · MODEL-AGNOSTIC · OBSERVABLE</div>

              <h1>
                Toward a
                <span>Local Agent OS.</span>
              </h1>

              <p class="hero-lead">
                DeskLemurOS is a local-first, on-premise AI runtime and
                autonomous orchestration platform for models, agents, tools,
                memory, and workflows — it runs entirely on your own hardware.
              </p>

              <p class="hero-support">
                Run local models, coordinate autonomous agents, control tools and
                permissions, and inspect every step from one workspace.
              </p>

              <div class="hero-actions">
                <a class="button button-primary" href="#runtime">
                  Explore the Runtime
                </a>
                ${featureEnabled("documentation") ? '<a class="button button-secondary" href="#/docs">Read the Documentation</a>' : ""}
              </div>

              <div class="hero-terminal">
                <span>$</span>
                <code>desklemur-os run --mode local --trace live</code>
              </div>
            </div>

            ${dashboardPanelTemplate()}
          </div>
        </section>

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
            </div>
          </div>
        </section>

        <section class="section capabilities-section">
          <div class="container">
            <div class="section-heading">
              <div>
                <div class="section-kicker">ONE CONTROL SURFACE</div>
                <h2>Everything required to operate a local AI runtime.</h2>
              </div>

              <p>
                Configure the execution environment without hiding the machinery
                that makes an autonomous workflow run.
              </p>
            </div>

            <div class="capability-grid">
              ${capabilityCards}
            </div>

            <div class="engine-strip" aria-label="Supported local engines and API compatibility">
              <span class="engine-strip-label">LOCAL API READY</span>
              ${engineStrip}
              <span class="engine-strip-note">Various compatible local API servers are supported. Web API integrations are <b>experimental</b>, may not work as expected, and are used at your sole responsibility.</span>
            </div>
          </div>
        </section>

        <section class="section tools-section" id="tools">
          <div class="container speed-layout">
            <div>
              <div class="section-kicker">EXTENSIBLE BY DESIGN</div>
              <h2>Give your agent tools that don’t exist yet.</h2>

              <p class="section-description">
                The runtime ships with a full toolset — but its real strength is
                that you build your own. Author custom tools, chain them into
                reusable recipes, and connect anything through MCP, so an agent’s
                reach is never a fixed list. It grows to whatever your work needs.
                <strong>Built-in, custom, and real MCP tools all run under one
                planner, one permission model, one pipeline.</strong>
              </p>
            </div>

            <ul class="speed-list">
              <li><strong>Tool Builder</strong> — author custom tools with your own parameters, logic, and permission level.</li>
              <li><strong>Tool Recipes</strong> — save multi-step tool workflows and invoke a whole pipeline as one action.</li>
              <li><strong>MCP connectors</strong> — plug in any Model Context Protocol server to borrow its tools instantly.</li>
              <li><strong>Installable bot services</strong> — extend delivery and integrations as drop-in packages.</li>
            </ul>
          </div>

          <div class="container">
            <figure class="section-art">
              <img src="${directionArtPath("Built to be extended.png")}" alt="Built to be extended — custom tools, tool recipes, and MCP connectors" loading="lazy" />
            </figure>
          </div>
        </section>

        <section class="section speed-section">
          <div class="container speed-layout">
            <div>
              <div class="section-kicker">ENGINEERED FOR SPEED</div>
              <h2>An agent loop optimized end to end.</h2>

              <p class="section-description">
                The step loop is built around prompt-cache reuse, so long agent
                runs stay fast even on local hardware.
              </p>
            </div>

            <ul class="speed-list">
              <li><strong>Step-context KV cache</strong> — a stable system prefix keeps the prompt cache hot across every step of a run.</li>
              <li><strong>Fast runtime cache</strong> — agent context is prepared once and guarded, not rebuilt per turn.</li>
              <li><strong>Parallel tool batches</strong> — independent tool calls execute concurrently inside a single step.</li>
              <li><strong>Streaming everything</strong> — plans, reasoning, tool output, and files render as they are produced.</li>
            </ul>
          </div>

          <div class="container">
            <figure class="section-art">
              <img src="${rootArtPath("ENGINEERED FOR SPEED.png")}" alt="Engineered for speed — agent loop optimizations" loading="lazy" />
            </figure>
          </div>
        </section>

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
              <div class="graph-card-header">
                <span>SYSTEM GRAPH — LIVE DEMO</span>
                <span class="live-demo-pill">REPLAYING A REAL RUN</span>
              </div>

              <div class="live-embed">
                <iframe
                  src="${runtimeTraceUrl()}"
                  title="DeskLemurOS System Graph live demo"
                  loading="lazy"
                ></iframe>
              </div>
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
          </div>
        </section>

        <section class="section feature-chapter" id="agents">
          <div class="container trace-layout">
            <div class="trace-copy">
              <div class="section-kicker">MULTI-AGENT RUNTIME · ALREADY SHIPPING</div>
              <h2>Many agents, one runtime.</h2>

              <p>
                One LLM already drives multiple agents — individual,
                collaboration, and debate — and per-agent engine and model
                assignment lets strong machines run a different model behind
                every agent.
              </p>

              <ul class="feature-list">
                <li>Individual, collaboration, and debate orchestration modes</li>
                <li>Per-agent engine and model assignment</li>
                <li>Master profiles — each with its own agents, settings, and sandbox</li>
                <li>Per-agent policy profiles for behavior and approvals</li>
              </ul>
            </div>

            <figure class="section-art">
              <img src="${directionArtPath("Many agents, one runtime.png")}" alt="Many agents, one runtime illustration" loading="lazy" />
            </figure>
          </div>
        </section>

        <section class="section feature-chapter" id="memory">
          <div class="container trace-layout">
            <figure class="section-art">
              <img src="${directionArtPath("Memory that actually remembers.png")}" alt="Memory that actually remembers illustration" loading="lazy" />
            </figure>

            <div class="trace-copy">
              <div class="section-kicker">LAYERED MEMORY · ALREADY SHIPPING</div>
              <h2>Memory that actually remembers.</h2>

              <p>
                RAG recall, STM, LTM, active LEARNing, and the memory SHELF form
                a layered memory system, so agents carry knowledge across turns,
                sessions, and projects.
              </p>

              <ul class="feature-list">
                <li>Warm memory → STM → LTM → knowledge graph</li>
                <li>Recall profiles for boot, passive, and active retrieval</li>
                <li>Active memory the agent saves on purpose (add_memory / memory_shelf)</li>
                <li>Passive recall that summarizes conversations automatically</li>
              </ul>
            </div>
          </div>
        </section>

        <section class="section feature-chapter" id="local-moment">
          <div class="container trace-layout">
            <div class="trace-copy">
              <div class="section-kicker">THE LOCAL MOMENT · HAPPENING NOW</div>
              <h2>The local moment.</h2>

              <p>
                NVIDIA and AMD are pushing serious AI compute to local machines.
                That hardware needs a serious local agent orchestrator — and it
                already runs here.
              </p>

              <ul class="feature-list">
                <li>Consumer GPUs now run capable quantized models</li>
                <li>On-premise by default — models, data, and tools stay on your own hardware; nothing leaves for the cloud unless you choose a web provider</li>
                <li>Built for on-device orchestration, not a cloud afterthought</li>
              </ul>
            </div>

            <figure class="section-art">
              <img src="${directionArtPath("The local moment.png")}" alt="The local moment illustration" loading="lazy" />
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
                Markdown documentation is embedded in a static JavaScript file,
                so the reader works without npm, a server, or a build process.
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
          ${featureEnabled("documentation") ? '<a href="#/docs/user-guide/licenses-and-open-source-notices">License &amp; Open Source Notices</a>' : '<a href="../index.html">DeskLemur Home</a>'}
        </div>
      </footer>
    `;

    applyFeatureVisibility();
    initializeHeader();
    initRuntimeDemo();
    initDashboardDemo();
  }

  function groupDocs(entries) {
    return entries.reduce((groups, doc) => {
      const group = doc.group || "Overview";
      if (!groups[group]) groups[group] = [];
      groups[group].push(doc);
      return groups;
    }, {});
  }

  function docHref(doc) {
    return `#/docs/${encodeURI(doc.slug)}`;
  }

  function findDoc(slug) {
    const normalized = decodeURIComponent(slug || "")
      .replace(/^\/+|\/+$/g, "")
      .toLowerCase();

    if (!normalized) return docs[0];
    return (
      docs.find((doc) => String(doc.slug).toLowerCase() === normalized) ||
      docs[0]
    );
  }

  function sidebarTemplate(activeDoc, query = "") {
    const normalizedQuery = query.trim().toLowerCase();
    const filteredDocs = docs.filter((doc) => {
      if (!normalizedQuery) return true;

      return `${doc.title} ${doc.group} ${doc.content}`
        .toLowerCase()
        .includes(normalizedQuery);
    });

    const groups = groupDocs(filteredDocs);

    const markup = Object.entries(groups)
      .map(([groupName, entries]) => {
        const links = entries
          .map(
            (entry) => `
              <a
                class="docs-link ${
                  entry.slug === activeDoc.slug ? "active" : ""
                }"
                href="${docHref(entry)}"
              >
                ${escapeHtml(entry.title)}
              </a>
            `,
          )
          .join("");

        return `
          <section class="docs-group">
            <h2>${escapeHtml(groupName)}</h2>
            ${links}
          </section>
        `;
      })
      .join("");

    return markup || '<p class="docs-no-results">No matching documents.</p>';
  }

  function paginationTemplate(activeDoc) {
    const activeIndex = docs.findIndex((doc) => doc.slug === activeDoc.slug);
    const previousDoc = activeIndex > 0 ? docs[activeIndex - 1] : null;
    const nextDoc =
      activeIndex >= 0 && activeIndex < docs.length - 1
        ? docs[activeIndex + 1]
        : null;

    return `
      <footer class="docs-pagination">
        ${
          previousDoc
            ? `
              <a href="${docHref(previousDoc)}">
                <span>Previous</span>
                <strong>${escapeHtml(previousDoc.title)}</strong>
              </a>
            `
            : "<span></span>"
        }

        ${
          nextDoc
            ? `
              <a class="next" href="${docHref(nextDoc)}">
                <span>Next</span>
                <strong>${escapeHtml(nextDoc.title)}</strong>
              </a>
            `
            : "<span></span>"
        }
      </footer>
    `;
  }

  function renderDocs(hash) {
    applyPageTheme("docs");
    if (!docs.length) {
      app.innerHTML = `
        <main class="empty-docs">
          <h1>No documentation is embedded.</h1>
          <p>Add entries to <code>docs-data.js</code>.</p>
          <a href="#/">Return home</a>
        </main>
      `;
      return;
    }

    const slug = hash.replace(/^#\/docs\/?/, "");
    const activeDoc = findDoc(slug);

    document.title = `${activeDoc.title} — DeskLemurOS`;

    app.innerHTML = `
      <div class="docs-app">
        <aside class="docs-sidebar">
          <a class="docs-brand" href="#/">
            <img class="brand-mark brand-img small" src="./assets/icon.png" alt="DeskLemurOS icon" />
            <span>
              <strong>DeskLemurOS</strong>
              <small>DOCUMENTATION</small>
            </span>
          </a>
          <a class="docs-parent-link" href="../index.html">← DeskLemur</a>

          <label class="docs-search">
            <span>SEARCH</span>
            <input
              type="search"
              placeholder="Search documentation..."
              autocomplete="off"
            />
          </label>

          <nav class="docs-navigation" aria-label="Documentation">
            ${sidebarTemplate(activeDoc)}
          </nav>
        </aside>

        <main class="docs-main">
          <header class="docs-topbar">
            <button class="docs-menu-button" type="button">
              DOCUMENTS
            </button>

            <span class="docs-path">
              docs / ${escapeHtml(activeDoc.path || activeDoc.slug)}
            </span>

            <div class="docs-top-actions">
              <a href="../index.html">DeskLemur</a>
              <a href="#/">Product</a>
              <a href="${escapeHtml(githubUrl())}" target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
            </div>
          </header>

          <article class="markdown-body">
            ${renderMarkdown(activeDoc.content)}
            ${paginationTemplate(activeDoc)}
          </article>
        </main>
      </div>
    `;

    const searchInput = document.querySelector(".docs-search input");
    const navigation = document.querySelector(".docs-navigation");
    const sidebar = document.querySelector(".docs-sidebar");
    const menuButton = document.querySelector(".docs-menu-button");

    searchInput?.addEventListener("input", (event) => {
      navigation.innerHTML = sidebarTemplate(activeDoc, event.target.value);
    });

    menuButton?.addEventListener("click", () => {
      sidebar?.classList.toggle("mobile-open");
    });
  }

  function initializeHeader() {
    const button = document.querySelector(".menu-button");
    const navigation = document.querySelector(".main-nav");
    const themeToggle = document.querySelector(".theme-toggle");

    button?.addEventListener("click", () => {
      const isOpen = navigation.classList.toggle("open");
      button.setAttribute("aria-expanded", String(isOpen));
    });

    navigation?.addEventListener("click", () => {
      navigation.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    });

    themeToggle?.addEventListener("click", () => {
      productTheme = isLightTheme() ? "dark" : "light";
      window.localStorage.setItem("deskle-mur-os-product-theme", productTheme);
      const scrollY = window.scrollY;
      const onVision = (window.location.hash || "").startsWith("#/vision");
      (onVision ? renderVision : renderHome)();
      window.scrollTo(0, scrollY);
    });

    document.querySelectorAll("[data-scroll]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        const target = document.getElementById(btn.dataset.scroll);
        if (target) {
          event.preventDefault();
          target.scrollIntoView({ behavior: "smooth" });
        }
      });
    });
  }

  function renderVision() {
    applyPageTheme("vision");
    document.title = "DeskLemurOS — Vision: From Using AI to Operating AI";

    app.innerHTML = `
      ${headerTemplate()}

      <main>
        <section class="section vision-hero">
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
              <a class="button button-secondary" href="#/">Back to overview</a>
            </div>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">FROM DISCOVERY TO ENGINEERING</div>
            <figure class="section-art vision-chapter-art art-right">
              <img src="${cacheUrl("./assets/vision/discovery-to-engineering.png")}" alt="From scientific discovery to engineered local AI infrastructure" loading="lazy" />
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
              <img src="${cacheUrl("./assets/vision/capable-model-system.png")}" alt="A model core with disconnected system capabilities" loading="lazy" />
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
              <img src="${cacheUrl("./assets/vision/local-first-control.png")}" alt="A local AI workstation with a controlled external connection" loading="lazy" />
            </figure>
            <h2>Local won’t out-reason a frontier model. That was never the point.</h2>
            <p class="section-description">
              A model you run on your own hardware will not match a frontier model’s raw
              reasoning — and it doesn’t need to. What local gives you instead is total control:
              your data never leaves, your permissions are absolute, your infrastructure is
              yours. Want frontier capability? Reach for it through the same runtime. Sensitive,
              repeatable, or in-house work? Keep it local. <strong>Local-first, not local-only.</strong>
            </p>
            <p class="section-description">
              Expectations matter too. A general open model in the small-to-mid range is
              excellent for bounded, specialized work — coding, document and research workflows,
              structured extraction, automation — especially when it is tuned for the job.
              Expecting frontier-level <em>general</em> reasoning from it is the wrong
              expectation, and we won’t pretend otherwise. Running the very largest open models
              is an institutional capability, not a personal one — which is exactly why
              on-premise orchestration and control matter at that scale.
            </p>
            <p class="section-description">
              The value of DeskLemurOS is not a bigger model. It is <strong>ownership,
              transparency, and the right model for each job</strong> — with the freedom to reach
              for a frontier model when, and only when, you choose to.
            </p>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">MULTI-AGENT COLLABORATION</div>
            <figure class="section-art vision-chapter-art art-left">
              <img src="${cacheUrl("./assets/vision/multi-agent-collaboration.png")}" alt="Specialist agents collaborating through one orchestration hub" loading="lazy" />
            </figure>
            <h2>Not one assistant, but many collaborating agents.</h2>
            <p class="section-description">
              A request first reaches a <strong>Coordinator</strong> that interprets the
              objective and delegates to specialists — each with its own models, tools,
              permissions, and memory, all under one policy and audit framework:
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

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">MEMORY WITH GOVERNANCE</div>
            <figure class="section-art vision-chapter-art art-right">
              <img src="${cacheUrl("./assets/vision/memory-governance.png")}" alt="A governed multi-layer memory archive" loading="lazy" />
            </figure>
            <h2>Memory that remembers — and forgets when it should.</h2>
            <p class="section-description">
              Memory is not just conversation history. DeskLemurOS separates it by purpose,
              and every layer answers what to keep, who may read it, and when to delete it:
            </p>
            <ul class="feature-list">
              <li><strong>Working memory</strong> — the current task</li>
              <li><strong>Long-term memory</strong> — recurring preferences and working methods</li>
              <li><strong>Project memory</strong> — decisions, requirements, and context for a specific project</li>
              <li><strong>Shared organizational memory</strong> — knowledge for authorized teams and agents</li>
            </ul>
            <p class="section-description">
              Sensitive information can be excluded, or held only inside an encrypted,
              access-controlled area. You can inspect, correct, export, and delete anything
              the system remembers.
            </p>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">CAPABILITY WITH CONTROL</div>
            <figure class="section-art vision-chapter-art art-left">
              <img src="${cacheUrl("./assets/vision/capability-control.png")}" alt="Visible boundaries and approval gates around an AI workspace" loading="lazy" />
            </figure>
            <h2>Powerful when needed. Restricted when not.</h2>
            <p class="section-description">
              Every agent is scoped: which models it may use, which tools it may activate,
              which files and databases it may touch, whether it may reach external networks,
              which memories it may read or update, how long it may run, and which actions
              need human approval.
            </p>
            <ul class="feature-list">
              <li>A document agent limited to one folder</li>
              <li>A research agent allowed only selected databases</li>
              <li>A development agent running code only in an isolated sandbox</li>
              <li>A sensitive-data agent fully disconnected from external networks</li>
            </ul>
            <p class="section-description">
              Approval checkpoints guard the risky steps: searching and summarizing may run
              automatically, while deleting files, sending data outside, modifying contracts,
              installing software, making payments, or changing system settings require
              explicit authorization. Trust comes from being able to inspect, interrupt, and
              correct — not from the impression of intelligence.
            </p>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">AN EXTENSIBLE FOUNDATION</div>
            <figure class="section-art vision-chapter-art art-right">
              <img src="${cacheUrl("./assets/vision/extensible-foundation.png")}" alt="A modular local AI foundation with plug-in components" loading="lazy" />
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

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">FROM ONE MODEL TO MANY</div>
            <figure class="section-art vision-chapter-art art-left">
              <img src="${cacheUrl("./assets/vision/one-model-to-many.png")}" alt="One runtime coordinating multiple specialist models" loading="lazy" />
            </figure>
            <h2>Today, one model plays every agent. Next, each agent can bring its own.</h2>
            <p class="section-description">
              The current runtime is tuned for personal machines: a single LLM reasons for
              every agent role — light enough to run collaboration and debate on one computer.
              The blueprint keeps that as the default — agents inherit one global model config —
              while letting <em>any</em> agent optionally embed and pin its own model, chosen for
              its job: a strong reasoner to plan, a code model for the coding agent, a small fast
              model to route. Global by default, per-agent when it matters — all under the same
              policy, memory, and audit framework.
            </p>
            <div class="vision-formula">
              <div><span class="ff-tag">now</span><code>f(x) = 1 · LLM( agent(x) )</code><span class="ff-note">one shared model drives every agent</span></div>
              <div><span class="ff-tag">next</span><code>f(x) = Σ agentᵢ( LLMᵢ ?? LLM_global )</code><span class="ff-note">per-agent model, else the global default</span></div>
            </div>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">MEMORY THAT LEARNS</div>
            <figure class="section-art vision-chapter-art art-right">
              <img src="${cacheUrl("./assets/vision/memory-that-learns.png")}" alt="Validated experience becoming learning-ready model knowledge" loading="lazy" />
            </figure>
            <h2>Not retrieval. Real learning.</h2>
            <p class="section-description">
              Most systems “remember” by pulling text back into the prompt — RAG. DeskLemurOS
              already goes further: important memories are stored in a learning-ready form —
              tagged as active knowledge, carrying training-candidate and LoRA metadata, and
              flagged when they are promotion-ready.
            </p>
            <p class="section-description">
              The blueprint closes the loop. A passive layer captures experience continuously;
              an active layer decides what is worth keeping; and validated knowledge is promoted
              into the model’s own weights through QLoRA — gated and reviewed, never silently.
              The result is a system that learns like a living thing: it doesn’t just re-read its
              notes, it changes.
            </p>
          </div>
        </section>

        <section class="section vision-chapter">
          <div class="container narrow">
            <div class="section-kicker">THE LONG-TERM QUESTION</div>
            <figure class="section-art vision-chapter-art art-left">
              <img src="${cacheUrl("./assets/vision/observable-agi-loop.png")}" alt="A measurable and observable multi-agent improvement loop" loading="lazy" />
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
              <img src="${cacheUrl("./assets/vision/responsible-release.png")}" alt="A staged release process with visible validation gates" loading="lazy" />
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
            <div class="ea-contact">
              <span>[ Company / Project ]</span>
              <span>[ Website ]</span>
              <span>[ Email ]</span>
              <span>[ QR · Early access registration ]</span>
            </div>
            <p class="vision-tagline">Operate Intelligence. Own the System.</p>
          </div>
        </section>` : ""}
      </main>

      <footer class="site-footer">
        <div class="container footer-inner">
          <span>DeskLemurOS</span>
          <span>Operate Intelligence. Own the System.</span>
          ${featureEnabled("documentation") ? '<a href="#/docs/user-guide/licenses-and-open-source-notices">License &amp; Open Source Notices</a>' : '<a href="../index.html">DeskLemur Home</a>'}
        </div>
      </footer>
    `;

    initializeHeader();
  }

  function route() {
    refreshForNewVersion();
    const hash = window.location.hash || "#/";

    if (hash.startsWith("#/docs") && featureEnabled("documentation")) {
      clearRuntimeDemo();
      renderDocs(hash);
    } else if (hash.startsWith("#/vision") && featureEnabled("vision")) {
      clearRuntimeDemo();
      renderVision();
    } else {
      if (
        (hash.startsWith("#/docs") && !featureEnabled("documentation")) ||
        (hash.startsWith("#/vision") && !featureEnabled("vision"))
      ) {
        window.history.replaceState(null, "", "#/");
      }
      renderHome();
    }

    if (!hash.includes("#runtime") && !hash.includes("#observability")) {
      window.scrollTo(0, 0);
    }
  }

  function initLightbox() {
    const overlay = document.createElement("div");
    overlay.className = "lightbox-overlay";
    overlay.innerHTML = '<img alt="" />';
    document.body.appendChild(overlay);
    const zoomed = overlay.querySelector("img");

    document.addEventListener("click", (event) => {
      const source = event.target.closest?.(
        ".capability-shot img, .vision-shot img, .section-art img, .docs-image",
      );
      if (source) {
        zoomed.src = source.currentSrc || source.src;
        zoomed.alt = source.alt || "";
        overlay.classList.add("open");
        document.body.classList.add("lightbox-open");
        return;
      }
      if (overlay.classList.contains("open")) {
        overlay.classList.remove("open");
        document.body.classList.remove("lightbox-open");
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        overlay.classList.remove("open");
        document.body.classList.remove("lightbox-open");
      }
    });
  }

  initLightbox();

  window.addEventListener("hashchange", route);
  route();
})();
