(function () {
    window.__LOCALLM_TAURI_BRIDGE__ = true;

    const tauriInvoke = async (command, args = {}) => {
        const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
        if (!invoke) throw new Error("Tauri invoke is not available.");
        return invoke(command, args);
    };

    const hasTauriInvoke = () => !!(window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke);
    const isLoopbackHost = () => /^(127(?:\.\d{1,3}){3}|localhost|\[::1\]|::1)$/i.test(window.location.hostname || "");
    const isHttpLike = () => window.location.protocol === "http:" || window.location.protocol === "https:";
    const transportMode = () => {
        if (window.__LOCALLM_DESKTOP_TRANSPORT__) return window.__LOCALLM_DESKTOP_TRANSPORT__;
        try {
            return new URLSearchParams(window.location.search || "").get("transport") || "";
        } catch (_) {
            return "";
        }
    };
    const isHttpTransport = () => {
        const mode = transportMode();
        if (mode === "http") return true;
        if (mode === "ipc") return false;
        // Tauri App windows can also be served from a localhost-like asset URL.
        // Without an explicit transport marker, prefer IPC whenever Tauri invoke
        // exists; otherwise guide/helper windows may call the asset origin
        // (/api/...) instead of the backend or IPC worker.
        if (hasTauriInvoke()) return false;
        return isHttpLike() && isLoopbackHost();
    };
    const isIpcTransport = () => transportMode() === "ipc" || (window.__LOCALLM_TAURI_BRIDGE__ && !isHttpTransport());

    const apiBase = () => {
        if (isHttpTransport()) return window.location.origin;
        return window.__LOCALLM_BACKEND_BASE__ || "";
    };
    let resolvedHttpBase = "";
    const resolveHttpBase = async () => {
        const configured = apiBase();
        if (configured) return configured;
        if (resolvedHttpBase) return resolvedHttpBase;
        try {
            const port = await tauriInvoke("backend_port");
            if (port) {
                resolvedHttpBase = `http://127.0.0.1:${port}`;
                window.__LOCALLM_BACKEND_BASE__ = resolvedHttpBase;
                return resolvedHttpBase;
            }
        } catch (_) {}
        return "";
    };

    const shouldFallbackToHttp = (error) => {
        const message = String(error?.message || error || "");
        return /local server mode|IPC API is unavailable|IPC request failed|IPC route not implemented|stdin is unavailable|IPC response channel closed|Tauri event listener API is not available|Tauri invoke is not available/i.test(message);
    };

    // Side-effectful requests (chat sends) must NEVER auto-retry after the
    // request may have reached the backend — a dropped response channel (e.g.
    // the run was cancelled) would silently dispatch the same turn twice.
    // Only pre-dispatch failures are safe to retry on another transport.
    const shouldFallbackToHttpForDispatch = (error) => {
        const message = String(error?.message || error || "");
        return /local server mode|IPC API is unavailable|IPC route not implemented|stdin is unavailable|Tauri invoke is not available/i.test(message);
    };

    const waitForTauriInvoke = async (timeoutMs = 10000) => {
        const started = Date.now();
        while (!hasTauriInvoke() && Date.now() - started < timeoutMs) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!hasTauriInvoke()) throw new Error("Tauri invoke is not available.");
    };

    const getTauriEventListen = () => {
        const tauri = window.__TAURI__ || {};
        return tauri.event?.listen || tauri.core?.listen || tauri.listen || null;
    };

    const waitForTauriEventListen = async (timeoutMs = 10000) => {
        const started = Date.now();
        while (!getTauriEventListen() && Date.now() - started < timeoutMs) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        const listen = getTauriEventListen();
        if (!listen) throw new Error("Tauri event listener API is not available.");
        return listen;
    };

    const ipcRequest = async (method, path, body = undefined) => {
        await waitForTauriInvoke();
        return tauriInvoke("api_request", {
            method,
            path,
            body: body === undefined ? null : body
        });
    };

    const requestJson = async (method, path, body = undefined, timeoutMs = 45000) => {
        if (isIpcTransport()) {
            try {
                return await ipcRequest(method, path, body);
            } catch (error) {
                if (!shouldFallbackToHttp(error)) throw error;
                console.warn("[TauriBridge] IPC API unavailable; falling back to HTTP:", error);
            }
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetch(`${await resolveHttpBase()}${path}`, {
            method,
            cache: "no-store",
            headers: body === undefined ? undefined : { "Content-Type": "application/json" },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timer);
        }
        if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status}`);
        return response.json();
    };

    let liveEventBridgeInstallPromise = null;
    const installLiveEventBridge = async () => {
        if (window.__LOCALLM_TAURI_EVENT_BRIDGE_INSTALLED__) return;
        if (liveEventBridgeInstallPromise) return liveEventBridgeInstallPromise;
        liveEventBridgeInstallPromise = (async () => {
        try {
            const listen = await waitForTauriEventListen();
            await listen("locallm-ai-event", (event) => {
                const payload = event?.payload || event;
                window.__LOCALLM_TAURI_LIVE_EVENT_COUNT__ = (window.__LOCALLM_TAURI_LIVE_EVENT_COUNT__ || 0) + 1;
                if (payload && typeof window.handleAiEvent === "function") {
                    window.handleAiEvent(payload);
                }
            });
            window.__LOCALLM_TAURI_EVENT_BRIDGE_INSTALLED__ = true;
            console.log("[TauriBridge] Live AI event bridge installed.");
        } catch (error) {
            window.__LOCALLM_TAURI_EVENT_BRIDGE_INSTALLED__ = false;
            console.warn("[TauriBridge] Failed to install live event bridge:", error);
            liveEventBridgeInstallPromise = null;
            throw error;
        }
        })();
        return liveEventBridgeInstallPromise;
    };
    window.__locallmInstallLiveEventBridge = installLiveEventBridge;

    const postJson = (path, body = {}) => requestJson("POST", path, body);
    const getJson = (path) => requestJson("GET", path);
    const deleteJson = (path) => requestJson("DELETE", path);
    const parsePayloadObject = (payload) => {
        if (typeof payload === "string") {
            try {
                return JSON.parse(payload || "{}");
            } catch (_) {
                return { text: payload };
            }
        }
        return payload || {};
    };
    const normalizeInterruptText = (text) => {
        const raw = String(text || "").trim();
        if (!raw) return { command: "", text: raw };
        const parts = raw.split(/\s+/);
        let head = String(parts.shift() || "").toLowerCase().replace(/-/g, "_");
        if (!head.startsWith("/")) return { command: "", text: raw };
        if (head === "/answer" && parts[0] && String(parts[0]).toLowerCase().replace(/-/g, "_") === "now") {
            head = "/answer_now";
            parts.shift();
        }
        const aliases = {
            "/answer": "/answer_now",
            "/force_response": "/force_respond",
        };
        const command = aliases[head] || head;
        const normalized = [command, ...parts].join(" ").trim();
        return { command, text: normalized };
    };
    const interruptCommands = new Set([
        "/respond",
        "/answer_now",
        "/force_respond",
        "/force_response",
        "/brief",
        "/force_brief",
        "/force_interrupt",
    ]);
    const normalizeInterruptPayload = (payload) => {
        const parsed = parsePayloadObject(payload);
        const normalized = normalizeInterruptText(parsed.text);
        return {
            parsed: normalized.command ? { ...parsed, text: normalized.text } : parsed,
            command: normalized.command,
            isInterrupt: interruptCommands.has(normalized.command),
        };
    };
    const isInterruptPayload = (payload) => {
        return normalizeInterruptPayload(payload).isInterrupt;
    };
    const postText = async (path, body = "") => {
        if (isIpcTransport()) {
            try {
                return await ipcRequest("POST", path, String(body ?? ""));
            } catch (error) {
                if (!shouldFallbackToHttp(error)) throw error;
                console.warn("[TauriBridge] IPC text API unavailable; falling back to HTTP:", error);
            }
        }
        const response = await fetch(`${await resolveHttpBase()}${path}`, {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: String(body ?? "")
        });
        if (!response.ok) throw new Error(`POST ${path} failed: ${response.status}`);
        return response.json();
    };

    const streamChat = async (payload) => {
        const interruptPayload = normalizeInterruptPayload(payload);
        if (interruptPayload.isInterrupt) {
            return postJson("/api/interrupt", interruptPayload.parsed);
        }
        if (isIpcTransport()) {
            try {
                try {
                    await installLiveEventBridge();
                } catch (bridgeError) {
                    console.warn("[TauriBridge] Live event bridge unavailable; continuing with request result fallback:", bridgeError);
                }
                const parsedPayload = parsePayloadObject(payload);
                const liveCountBefore = window.__LOCALLM_TAURI_LIVE_EVENT_COUNT__ || 0;
                const result = await ipcRequest("POST", "/api/chat_stream", parsedPayload);
                (result.events || []).forEach(event => window.handleAiEvent?.(event));
                const liveCountAfter = window.__LOCALLM_TAURI_LIVE_EVENT_COUNT__ || 0;
                if (liveCountAfter === liveCountBefore && result.content) {
                    window.handleAiEvent?.({
                        type: "final",
                        content: result.content,
                        chat_id: parsedPayload.chat_id || "default"
                    });
                }
                return result;
            } catch (error) {
                if (!shouldFallbackToHttpForDispatch(error)) throw error;
                console.warn("[TauriBridge] IPC chat stream unavailable; falling back to HTTP:", error);
            }
        }
        const response = await fetch(`${await resolveHttpBase()}/api/chat_stream`, {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: typeof payload === "string" ? payload : JSON.stringify(payload || {})
        });
        if (!response.ok) throw new Error(`chat stream failed: ${response.status}`);

        if (!response.body) {
            const result = await response.json();
            (result.events || []).forEach(event => window.handleAiEvent?.(event));
            return result;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                const text = line.trim();
                if (!text) continue;
                try {
                    window.handleAiEvent?.(JSON.parse(text));
                } catch (error) {
                    console.warn("[TauriBridge] Failed to parse chat event:", text, error);
                }
            }
        }
        const tail = buffer.trim();
        if (tail) {
            try {
                window.handleAiEvent?.(JSON.parse(tail));
            } catch (error) {
                console.warn("[TauriBridge] Failed to parse final chat event:", tail, error);
            }
        }
        return { status: "success" };
    };

    const reportOpenWindowError = (message, error = null) => {
        const detail = error?.message || String(error || "");
        const text = detail ? `${message}: ${detail}` : message;
        console.warn("[TauriBridge]", text, error || "");
        if (typeof window._spawnToast === "function") {
            window._spawnToast(text, "error", 4500);
        } else {
            window.alert(text);
        }
    };

    const openDashboardPage = async (page, params = {}, options = {}) => {
        const url = isHttpTransport()
            ? new URL(`${apiBase()}/${page}`)
            : new URL(page, window.location.href);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
        });
        if (window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke) {
            try {
                return await tauriInvoke("open_dashboard_window", {
                    page,
                    query: url.searchParams.toString(),
                    title: options.title || page.replace(/\.html$/i, "").replace(/_/g, " ").toUpperCase(),
                    width: options.width || (page === "system_graph.html" ? 1520 : 1100),
                    height: options.height || (page === "system_graph.html" ? 980 : 780)
                });
            } catch (error) {
                reportOpenWindowError(`Failed to open ${page}`, error);
                return false;
            }
        }
        const popupWidth = page === "system_graph.html" ? 1520 : 1180;
        const popupHeight = page === "system_graph.html" ? 980 : 820;
        const popup = window.open(url.toString(), "_blank", `popup,width=${popupWidth},height=${popupHeight}`);
        if (!popup) {
            reportOpenWindowError(`Popup was blocked or Tauri IPC is unavailable for ${page}`);
            return false;
        }
        return true;
    };

    window.__LOCALLM_OPEN_DASHBOARD_PAGE__ = (page, params = {}, options = {}) => openDashboardPage(page, params, options);

    window.__LOCALLM_CLOSE_DASHBOARD_WINDOW__ = async () => {
        if (hasTauriInvoke()) {
            return tauriInvoke("close_dashboard_window");
        }
        window.close();
        return null;
    };

    const requestNativeClose = async () => {
        if (hasTauriInvoke()) {
            return tauriInvoke("close_app");
        }
        window.close();
        return null;
    };

    let closeConfirmOpen = false;
    window.__locallmRequestClose = async () => {
        if (closeConfirmOpen) return;
        closeConfirmOpen = true;
        try {
            const shouldClose = window.confirm("Close DeskLemurOS?");
            if (shouldClose) {
                await requestNativeClose();
            }
        } catch (error) {
            console.warn("[TauriBridge] Close confirmation failed:", error);
        } finally {
            closeConfirmOpen = false;
        }
    };

    if (isIpcTransport()) {
        installLiveEventBridge().catch(error => {
            console.warn("[TauriBridge] Live event bridge preinstall failed:", error);
        });
    }

    // Dashboard-window lifecycle: cross-window localStorage "storage" events
    // are unreliable in WKWebView, so window-closed arrives as a native Tauri
    // event. Without this reset the File Workbench auto-open flags stay stuck
    // and file_write never reopens the workbench.
    (async () => {
        try {
            const listen = await waitForTauriEventListen();
            await listen("dashboard-window-closed", event => {
                const page = String(event?.payload?.page || event?.payload?.label || "");
                if (!page.includes("file_workbench")) return;
                window._externalFileWorkbenchAutoOpened = false;
                window._externalFileModalOpenForTurn = false;
                window._externalFileWorkbenchOpenedAt = 0;
                console.info("[TauriBridge] File Workbench window closed; auto-open re-armed.");
            });
        } catch (error) {
            console.warn("[TauriBridge] dashboard-window-closed listener unavailable:", error);
        }
    })();

    window.dispatchEvent(new Event("locallmready"));
})();
