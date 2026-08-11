const queryParams = new URLSearchParams(window.location.search);
let latestSystemData = null;
let metricsSyncTimer = null;
let metricsSyncInFlight = false;
let metricsSyncStopped = false;
let activeTheme = queryParams.get('theme') || 'ember';
let activeLightMode = (
    queryParams.get('light_mode') ||
    queryParams.get('light') ||
    ''
).toLowerCase() === 'true';
const traceEvents = [];
const TRACE_LIMIT = 180;
const traceState = {
    activeAgent: '--',
    lastKind: '--',
    activeNode: '',
    plans: 0,
    tools: 0,
    memory: 0,
    policy: 0,
    interrupts: 0,
    orchestrationMode: '--',
    orchestrationPhase: '--',
    orchestrationTurn: 0,
    live: false,
    seenNodes: new Set(['User', 'Agent', 'Reasoning', 'Final']),
    seenEdges: new Set(['User>Agent']),
    nodePulse: {},
};
const derivedLlmPulse = {
    requests: 0,
    completion_tokens: 0,
    total_tokens: 0,
    last_completion_tokens: 0,
    last_engine: '',
    last_model: '',
    last_latency_ms: 0,
    active: false,
    active_completion_tokens: 0,
    active_tokens_per_second: 0,
    last_tokens_per_second: 0,
};
let activeTraceConsoleTab = 'turn';
let activeTraceConsoleDrill = '';
let traceGraphHitNodes = [];
let traceInteractionHeld = false;
let traceDeferredTimelineRender = false;
let traceDeferredConsoleRender = false;
let traceInteractionReleaseTimer = null;
let traceEventSeq = 0;
const traceRawOpenKeys = new Set();
const recentTerminalTraceKeys = new Map();

function getTauriInvoke() {
    return window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || null;
}

function isDesktopBridgeReady() {
    return !!getTauriInvoke();
}

async function waitForDesktopBridge(timeoutMs = 5000) {
    if (isDesktopBridgeReady()) return true;
    return new Promise(resolve => {
        const started = Date.now();
        const tick = () => {
            if (isDesktopBridgeReady()) return resolve(true);
            if (Date.now() - started >= timeoutMs) return resolve(false);
            setTimeout(tick, 50);
        };
        tick();
    });
}

async function apiRequest(method, path, body = null) {
    const invoke = getTauriInvoke();
    if (invoke) return invoke('api_request', { method, path, body });
    const response = await fetch(path, {
        method,
        cache: 'no-store',
        headers: body === null ? undefined : { 'Content-Type': 'application/json' },
        body: body === null ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path} failed: HTTP ${response.status}`);
    return response.json();
}

function applyTheme(theme = activeTheme, lightMode = activeLightMode) {
    activeTheme = theme || 'ember';
    activeLightMode = !!lightMode;
    document.body.classList.toggle('ember-theme', activeTheme === 'ember');
    document.body.classList.toggle('light-theme', activeLightMode);
    document.body.dataset.theme = activeTheme;
}

function bindThemeSync() {
    applyTheme();
    if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('locallm_theme');
        channel.onmessage = event => {
            const state = event.data || {};
            applyTheme(state.theme || activeTheme, !!state.lightMode);
        };
    }
}

async function resetLlmUsage() {
    try {
        const result = await apiRequest('POST', '/api/reset_llm_usage', {});
        if (result?.status === 'success') {
            latestSystemData = {...(latestSystemData || {}), llm: result.llm || {}};
            renderMetrics(latestSystemData);
        }
    } catch (error) {
        console.error("LLM usage reset failed:", error);
    }
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function compactText(value = '', max = 180) {
    const text = sanitizeTraceControlResidue(value).replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}

function sanitizeTraceControlResidue(value = '') {
    return String(value || '')
        .replace(/\}?\s*##AGENT(?:_[A-Z]*(?:##?)?)?[\s\S]*$/g, '')
        .replace(/<\s*\/\s*control\s*>[\s\S]*$/gi, '')
        .trim();
}

function decodeTraceJsonString(value = '') {
    return String(value || '')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .trim();
}

function parseTraceRawObject(text = '') {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {}
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try {
            const parsed = JSON.parse(raw.slice(start, end + 1));
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (_) {}
    }
    return null;
}

function firstTraceRawSnapshotText(event = {}) {
    const tails = event.tails && typeof event.tails === 'object' ? event.tails : {};
    return String(
        event.raw_reasoning
        || event.reasoning_sample
        || event.full_text_tail
        || tails.reasoning
        || tails.combined
        || event.raw_combined
        || ''
    ).trim();
}

function traceTextFromKeys(obj = {}, keys = []) {
    for (const key of keys) {
        const value = obj?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const nested = traceTextFromKeys(value, keys);
            if (nested) return nested;
        }
    }
    return '';
}

function cleanTraceReasoningText(text = '') {
    let raw = decodeTraceJsonString(text);
    if (!raw) return '';
    raw = raw
        .replace(/^\s*["']?(?:reasoning|thinking|thought|analysis|scratchpad|text)["']?\s*:\s*/i, '')
        .replace(/["']?\s*,\s*["']?(?:action|arg|args|content|status|next_action|step_state|verdict)\b[\s\S]*$/i, '')
        .replace(/<\s*\/?\s*(?:plan|action|arg|content|status|next_action|step_state|output)\b[\s\S]*$/i, '')
        .replace(/^\s*["']+|["']+\s*$/g, '')
        .trim();
    if (!raw || /^[{}\[\],:"']+$/.test(raw)) return '';
    if (/\b(?:action|arg|args|content|status|next_action|step_state|verdict)\b\s*[:=]/i.test(raw)) return '';
    if (/^<h[1-6]\b|^<p\b|<\/p>/i.test(raw)) return '';
    return raw;
}

function reasoningTextFromLlmRawSnapshot(event = {}) {
    if (event.type !== 'llm_raw_snapshot') return '';
    const counts = event.chunk_counts || {};
    if (Number(counts.reasoning || 0) <= 0 && !event.reasoning_sample && !event.raw_reasoning) return '';
    const raw = firstTraceRawSnapshotText(event);
    if (!raw) return '';
    const obj = parseTraceRawObject(raw);
    if (obj) {
        const direct = traceTextFromKeys(obj, ['reasoning', 'thinking', 'thought', 'analysis', 'scratchpad']);
        return direct ? cleanTraceReasoningText(direct) : '';
    }
    const match = raw.match(/["'](?:reasoning|thinking|thought|analysis|scratchpad|text)["']\s*:\s*"((?:\\.|[^"\\])*)"/i);
    if (match) return cleanTraceReasoningText(match[1] || '');
    const tagged = raw.match(/<\s*(?:think|reasoning|analysis)\s*>([\s\S]*?)<\s*\/\s*(?:think|reasoning|analysis)\s*>/i);
    if (tagged) return cleanTraceReasoningText(tagged[1] || '');
    return cleanTraceReasoningText(raw);
}

function stringifyTraceRaw(value, max = 32000) {
    let text = '';
    try {
        text = JSON.stringify(value, null, 2);
    } catch (error) {
        text = String(value || '');
    }
    text = sanitizeTraceControlResidue(text);
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n… raw data clipped (${text.length.toLocaleString()} chars)`;
}

function compactRawStringForDisplay(value = '', max = 1400) {
    const text = sanitizeTraceControlResidue(value);
    if (text.length <= max) return text;
    const edge = Math.max(160, Math.floor((max - 120) / 2));
    return `${text.slice(0, edge)}\n… clipped ${text.length.toLocaleString()} chars …\n${text.slice(-edge)}`;
}

function compactRawEventForDisplay(event = {}, fullContentLimit = 0) {
    if (!event || typeof event !== 'object') return event;
    const copy = {...event};
    Object.entries(copy).forEach(([key, value]) => {
        if (typeof value !== 'string') return;
        copy[key] = sanitizeTraceControlResidue(value);
        value = copy[key];
        const isFullReasoning = ['full_content', 'full_reasoning', 'raw_reasoning', 'reasoning_sample'].includes(key);
        if (isFullReasoning && fullContentLimit <= 0) return;
        const limit = isFullReasoning ? fullContentLimit : 4000;
        if (value.length <= limit) return;
        copy[`${key}_length`] = value.length;
        copy[key] = compactRawStringForDisplay(value, limit);
    });
    return copy;
}

function traceRawPayload(item = {}) {
    const rawChunks = Array.isArray(item.rawChunks) ? item.rawChunks : [];
    const payload = {
        normalized: {
            time: item.time,
            delta: item.delta,
            kind: item.kind,
            agent: item.agent,
            summary: item.summary,
            chunks: item.chunks || 1,
        },
        raw: compactRawEventForDisplay(item.raw || {}, 0),
    };
    if (rawChunks.length) {
        payload.raw_chunks_count = rawChunks.length;
        payload.raw_chunks = rawChunks.map(chunk => compactRawEventForDisplay(chunk, 0));
    }
    return stringifyTraceRaw(payload);
}

function traceItemKey(item = {}) {
    return String(item.id || `${item.kind || 'event'}:${item.agent || 'agent'}:${item.startedAt || item.timestamp || ''}`);
}

function pruneTraceRawOpenKeys() {
    const liveKeys = new Set(traceEvents.map(traceItemKey));
    Array.from(traceRawOpenKeys).forEach(key => {
        if (!liveKeys.has(key)) traceRawOpenKeys.delete(key);
    });
}

function estimateTokens(text = '') {
    const value = String(text || '');
    return value ? Math.max(1, Math.ceil(value.length / 4)) : 0;
}

function eventText(event = {}) {
    return String(event.content || event.delta || event.message || event.result || '');
}

function updateDerivedLlmPulse(event = {}, info = classifyTraceEvent(event)) {
    const text = eventText(event);
    const tokenEstimate = estimateTokens(text);

    // LLM Raw snapshot: track active state for JSON-protocol engines (LM Studio, Ollama, etc.)
    // In JSON mode chunk_counts.content=0 during generation — detect active via stream_complete=false
    if (info.kind === 'LLM Raw') {
        if (!event.stream_complete) {
            // stream still open → LLM is actively generating
            if (!derivedLlmPulse.active) {
                derivedLlmPulse.requests += 1;
                derivedLlmPulse._activeStartedAt = Date.now();
                derivedLlmPulse._activeChars = 0;
            }
            derivedLlmPulse.active = true;
            const dictChunks = Number((event.chunk_counts || {}).dict || 0);
            derivedLlmPulse._activeChars = Math.max(derivedLlmPulse._activeChars || 0, dictChunks * 4);
            derivedLlmPulse.active_completion_tokens = estimateTokens('x'.repeat(derivedLlmPulse._activeChars || 0));
            const elapsed = Math.max(0.001, (Date.now() - (derivedLlmPulse._activeStartedAt || Date.now())) / 1000);
            derivedLlmPulse.active_tokens_per_second = Number((derivedLlmPulse.active_completion_tokens / elapsed).toFixed(1));
            // store engine/model info from snapshot
            if (event.agent_name) derivedLlmPulse.last_engine = event.agent_name;
        }
        return;
    }

    if (info.kind === 'Streaming' || info.kind === 'Reasoning') {
        if (!derivedLlmPulse.active) {
            derivedLlmPulse.requests += 1;
            derivedLlmPulse._activeStartedAt = Date.now();
            derivedLlmPulse._activeChars = 0;
        }
        derivedLlmPulse.active = true;
        derivedLlmPulse._activeChars = (derivedLlmPulse._activeChars || 0) + text.length;
        derivedLlmPulse.active_completion_tokens = estimateTokens('x'.repeat(derivedLlmPulse._activeChars || 0));
        const elapsed = Math.max(0.001, (Date.now() - (derivedLlmPulse._activeStartedAt || Date.now())) / 1000);
        derivedLlmPulse.active_tokens_per_second = Number((derivedLlmPulse.active_completion_tokens / elapsed).toFixed(1));
    }
    if (info.kind === 'Final') {
        const completionTokens = tokenEstimate || Number(derivedLlmPulse.active_completion_tokens || 0);
        if (!derivedLlmPulse.active && completionTokens) derivedLlmPulse.requests += 1;
        derivedLlmPulse.active = false;
        derivedLlmPulse.last_completion_tokens = completionTokens;
        derivedLlmPulse.completion_tokens += completionTokens;
        derivedLlmPulse.total_tokens = Math.max(derivedLlmPulse.total_tokens, derivedLlmPulse.completion_tokens);
        derivedLlmPulse.last_latency_ms = Math.max(0, Date.now() - (derivedLlmPulse._activeStartedAt || Date.now()));
        derivedLlmPulse.last_tokens_per_second = derivedLlmPulse.last_latency_ms
            ? Number((completionTokens / Math.max(0.001, derivedLlmPulse.last_latency_ms / 1000)).toFixed(1))
            : derivedLlmPulse.last_tokens_per_second;
        derivedLlmPulse.active_completion_tokens = 0;
        derivedLlmPulse.active_tokens_per_second = 0;
        derivedLlmPulse._activeStartedAt = 0;
        derivedLlmPulse._activeChars = 0;
    }
}

function eventAgent(event = {}) {
    const id = String(event.agent_id || event.cid || event.chat_id || '').trim();
    const name = String(event.agent_name || event.agentName || '').trim();
    if (name && id) return `${name}@${id}`;
    return name || id || 'agent';
}

function toolLabelFromEvent(event = {}) {
    if (event.tool_label) return String(event.tool_label);
    if (event.action && event.action !== 'respond') return String(event.action);
    if (event.tool) return String(event.tool);
    if (Array.isArray(event.batch_tools) && event.batch_tools.length) return event.batch_tools.join(', ');
    const chain = event.parent_tool_chain || event.tool_chain;
    if (chain && typeof chain === 'object') {
        return String(chain.label || chain.action || chain.tool || chain.name || 'tool');
    }
    return '';
}

function classifyTraceEvent(event = {}) {
    const type = String(event.type || 'event');
    const content = String(event.content || event.message || event.result || '');
    const lower = `${type} ${content}`.toLowerCase();
    const action = String(event.action || '').toLowerCase();
    if (type === 'user_submit') return { kind: 'User Prompt', node: 'User', edgeFrom: null, className: 'is-user' };
    if (type === 'memory_trace') return { kind: 'Memory Recall', node: 'Memory', edgeFrom: 'User', className: 'is-memory' };
    if (type === 'active_memory') return { kind: 'Active Memory', node: 'Memory', edgeFrom: 'Agent', className: 'is-memory' };
    if (type === 'agent_policy') return { kind: 'Agent Policy', node: 'Policy', edgeFrom: 'Agent', className: 'is-policy' };
    if (type === 'orchestration_status') return { kind: 'Orchestration', node: 'Planner', edgeFrom: 'Agent', className: 'is-plan' };
    if (type === 'llm_raw_snapshot') return { kind: 'LLM Raw', node: 'Streaming', edgeFrom: 'Reasoning', className: 'is-llm-raw' };
    if (type === 'plan') {
        // plan events with tool actions classify as Tool Chain; pure respond plans stay as Plan
        if (action && !['respond', 'final_answer', 'complete'].includes(action)) {
            return { kind: 'Tool Chain', node: 'Tool', edgeFrom: 'Planner', className: 'is-tool' };
        }
        return { kind: 'Plan', node: 'Planner', edgeFrom: 'Agent', className: 'is-plan' };
    }
    if (type === 'reasoning_preview') return { kind: 'Reasoning', node: 'Reasoning', edgeFrom: 'Planner', className: 'is-reasoning' };
    if (type === 'permission_request') return { kind: 'Permission', node: 'Permission', edgeFrom: 'Tool', className: 'is-interrupt' };
    if (type === 'chunk') return { kind: 'Streaming', node: 'Streaming', edgeFrom: 'Reasoning', className: 'is-stream' };
    if (type === 'final' || type === 'seal_stream_bubble') return { kind: 'Final', node: 'Final', edgeFrom: 'Streaming', className: 'is-final' };
    if (type === 'end') return { kind: 'End', node: 'Final', edgeFrom: 'Streaming', className: 'is-final' };
    if (type === 'start') return { kind: 'Start', node: 'Agent', edgeFrom: 'User', className: 'is-system' };
    if (type.includes('file_')) return { kind: 'File Output', node: 'File', edgeFrom: 'Tool', className: 'is-tool' };
    // system events: classify by content semantics, not action field
    // (agent.py emits type:system with action:batch for execution status — these should stay System)
    if (type === 'system') {
        if (lower.includes('memory recall') || lower.includes('passive_recall') || /\brecall\b/.test(lower)) {
            return { kind: 'Memory Recall', node: 'Memory', edgeFrom: 'User', className: 'is-memory' };
        }
        if (lower.includes('answer now') || lower.includes('force_') || lower.includes('interrupt')) {
            return { kind: 'Interrupt', node: 'Interrupt', edgeFrom: 'Reasoning', className: 'is-interrupt' };
        }
        // Zero-count success reports ("errors=0", "failed=0") must not classify
        // as Error — a successful FILE WRITE SUMMARY contains the substring
        // "errors=0" and was rendering red despite success=1.
        if (/(?:\berrors?\b(?!\s*[=:]\s*0\b)|\bfailed\b(?!\s*[=:]\s*0\b)|❌|exception|traceback)/.test(lower)) {
            return { kind: 'Error', node: 'Error', edgeFrom: 'Agent', className: 'is-error' };
        }
        return { kind: 'System', node: 'System', edgeFrom: 'Agent', className: 'is-system' };
    }
    if (lower.includes('memory recall') || lower.includes('passive_recall') || lower.includes('recall')) {
        return { kind: 'Memory Recall', node: 'Memory', edgeFrom: 'User', className: 'is-memory' };
    }
    if (lower.includes('answer now') || lower.includes('force_') || lower.includes('interrupt')) {
        return { kind: 'Interrupt', node: 'Interrupt', edgeFrom: 'Reasoning', className: 'is-interrupt' };
    }
    if (/(?:\berrors?\b(?!\s*[=:]\s*0\b)|\bfailed\b(?!\s*[=:]\s*0\b)|❌|exception|traceback)/.test(lower)) {
        return { kind: 'Error', node: 'Error', edgeFrom: 'Agent', className: 'is-error' };
    }
    if (lower.includes('tool') || action === 'batch' || action === 'pipeline' || toolLabelFromEvent(event)) {
        return { kind: 'Tool Chain', node: 'Tool', edgeFrom: 'Planner', className: 'is-tool' };
    }
    return { kind: type.replace(/_/g, ' '), node: 'System', edgeFrom: 'Agent', className: 'is-system' };
}

function summarizeTraceEvent(event = {}, info = classifyTraceEvent(event)) {
    if (event.type === 'user_submit') return compactText(event.content || event.text || 'User message sent.', 220);
    if (event.type === 'memory_trace') {
        const trace = event.memory_trace || {};
        return compactText(
            `Passive recall: ${trace.passive_recall || 'unknown'} | profile ${trace.recall_profile || trace.recall_mode || 'unknown'} | LTM ${trace.ltm_count || 0} | STM ${trace.stm_count || 0} | GRAPH ${trace.graph_count || 0} | refs ${trace.refs_count || 0} | expand ${trace.recall_expansion_enabled ? 'on' : 'off'} | warm ${trace.warm_context ? 'yes' : 'no'}`,
            260
        );
    }
    if (event.type === 'active_memory') {
        const memory = event.active_memory || {};
        const status = memory.status || event.status || 'updated';
        const detail = memory.reason || memory.claim || memory.message || event.message || event.content || '';
        return compactText(`Active memory: ${status}${detail ? ` | ${detail}` : ''}`, 260);
    }
    if (event.type === 'agent_policy') {
        const policy = event.agent_policy || {};
        const sections = ['memory_policy', 'tool_execution_policy', 'evidence_policy', 'response_policy', 'active_learning_policy']
            .filter(key => policy[key]);
        const mode = policy.tool_execution_policy?.permission_mode || policy.response_policy?.think_mode || 'prepared';
        return compactText(`Agent policy profile: ${sections.length} sections | ${mode}`, 260);
    }
    if (event.type === 'orchestration_status') {
        const mode = String(event.mode || 'orchestration').toUpperCase();
        const phase = String(event.phase || 'unknown');
        const turn = Number(event.turn || 0);
        const maxTurns = Number(event.max_turns || 0);
        const speaker = event.current_agent_name || event.current_agent_id || 'waiting';
        return compactText(`${mode} | ${phase} | turn ${turn}${maxTurns ? `/${maxTurns}` : ''} | ${event.participant_count || 0} participants | ${speaker}${event.detail ? ` | ${event.detail}` : ''}`, 300);
    }
    if (event.type === 'llm_raw_snapshot') {
        const counts = event.chunk_counts || {};
        const protocol = event.parser_protocol || 'auto';
        const action = event.action || '';
        const fmt = event.format_mode || '';
        const flags = [
            event.raw_first ? 'raw-first' : 'parser',
            event.parsed ? 'parsed' : 'unparsed',
            event.stream_complete ? 'complete' : 'open',
            event.eos_detected ? 'eos' : '',
        ].filter(Boolean).join(' · ');
        return compactText(
            `LLM raw snapshot | protocol=${protocol} | action=${action || '--'} | fmt=${fmt || '--'} | chunks raw=${counts.raw || 0}, content=${counts.content || 0}, reasoning=${counts.reasoning || 0}, dict=${counts.dict || 0}, str=${counts.str || 0} | ${flags}`,
            300
        );
    }
    if (event.type === 'plan') {
        const tool = toolLabelFromEvent(event);
        // tool-action plan: show tool label + plan text
        if (tool && !['respond', 'final_answer', 'complete'].includes(String(event.action || '').toLowerCase())) {
            const planText = event.plan || event.content || '';
            return compactText(planText ? `${tool} — ${planText}` : tool, 260);
        }
        return compactText(event.plan || event.content || tool || 'Planner emitted a step.', 220);
    }
    if (event.type === 'reasoning_preview') return String(event.full_content || event.content || event.delta || 'Reasoning preview streamed.');
    if (info.kind === 'Tool Chain') return compactText(toolLabelFromEvent(event) || event.content || 'Tool activity.', 220);
    if (info.kind === 'Memory Recall') return compactText(event.content || event.message || 'Memory recall observed.', 220);
    if (info.kind === 'Interrupt') return compactText(event.content || event.message || 'Interrupt/Answer Now observed.', 220);
    if (info.kind === 'Final') return compactText(event.content || 'Final response emitted.', 220);
    if (info.kind === 'End') return compactText(event.content || 'Turn finalized.', 220);
    return compactText(event.content || event.message || event.result || info.kind, 220);
}

function updateTraceState(event = {}, info = classifyTraceEvent(event)) {
    traceState.activeAgent = eventAgent(event);
    traceState.lastKind = info.kind;
    traceState.live = !['Final', 'Error'].includes(info.kind);
    traceState.activeNode = traceState.live ? info.node : '';
    if (info.kind === 'Plan') traceState.plans += 1;
    if (info.kind === 'Tool Chain' || info.kind === 'File Output') traceState.tools += 1;
    if (info.kind === 'Memory Recall' || info.kind === 'Active Memory') traceState.memory += 1;
    if (info.kind === 'Agent Policy') traceState.policy += 1;
    if (info.kind === 'Orchestration') {
        traceState.orchestrationMode = String(event.mode || '--').toUpperCase();
        traceState.orchestrationPhase = String(event.phase || '--');
        traceState.orchestrationTurn = Number(event.turn || 0);
    }
    if (info.kind === 'Interrupt' || info.kind === 'Permission') traceState.interrupts += 1;
    traceState.seenNodes.add(info.node);
    traceState.nodePulse[info.node] = Date.now();
    if (info.edgeFrom) {
        traceState.seenNodes.add(info.edgeFrom);
        traceState.seenEdges.add(`${info.edgeFrom}>${info.node}`);
    }
    if (info.node !== 'Agent') traceState.seenEdges.add(`Agent>${info.node}`);
    if (event.type === 'memory_trace' && Number(event.memory_trace?.graph_link_count || 0) > 0) {
        traceState.seenNodes.add('Graph');
        traceState.seenEdges.add('Memory>Graph');
        traceState.nodePulse.Graph = Date.now();
    }
}

function renderTraceInspector() {
    setText('trace-agent', traceState.activeAgent || '--');
    setText('trace-last-event', traceState.lastKind || '--');
    setText('trace-plan-count', traceState.plans.toLocaleString());
    setText('trace-tool-count', traceState.tools.toLocaleString());
    setText('trace-memory-count', traceState.memory.toLocaleString());
    setText('trace-policy-count', traceState.policy.toLocaleString());
    setText('trace-interrupt-count', traceState.interrupts.toLocaleString());
    setText('trace-orchestration-mode', traceState.orchestrationMode || '--');
    setText('trace-orchestration-phase', traceState.orchestrationPhase || '--');
    setText('trace-orchestration-turn', String(traceState.orchestrationTurn || 0));
    setText('trace-event-count', `${traceEvents.length.toLocaleString()} events`);
    const pill = document.getElementById('trace-live-pill');
    if (pill) {
        pill.textContent = traceState.live ? 'LIVE' : (traceEvents.length ? 'IDLE' : 'WAITING');
        pill.classList.toggle('is-live', traceState.live);
    }
}

function isTraceInteractionTarget(target) {
    return !!target?.closest?.(
        '.trace-timeline, .trace-console-body, .trace-console-tabs, #traceGraphCanvas, .trace-console-modal'
    );
}

function hasActiveTraceSelection() {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || !String(selection.toString() || '').trim()) return false;
    const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode
        : selection.anchorNode?.parentElement;
    const focus = selection.focusNode?.nodeType === Node.ELEMENT_NODE
        ? selection.focusNode
        : selection.focusNode?.parentElement;
    return isTraceInteractionTarget(anchor) || isTraceInteractionTarget(focus);
}

function flushDeferredTraceRenders() {
    if (traceInteractionHeld) return;
    const needsTimeline = traceDeferredTimelineRender;
    const needsConsole = traceDeferredConsoleRender;
    traceDeferredTimelineRender = false;
    traceDeferredConsoleRender = false;
    if (needsTimeline) renderTraceTimeline(true);
    if (needsConsole && modal?.style.display === 'flex') renderTraceConsole(activeTraceConsoleTab, true);
}

function bindTraceInteractionGuard() {
    if (document.body?.dataset.traceInteractionGuard === 'true') return;
    if (document.body) document.body.dataset.traceInteractionGuard = 'true';
    document.addEventListener('toggle', event => {
        const details = event.target?.closest?.('details.trace-event-raw[data-raw-key]');
        if (!details) return;
        const key = details.dataset.rawKey || '';
        if (!key) return;
        if (details.open) traceRawOpenKeys.add(key);
        else traceRawOpenKeys.delete(key);
    }, true);
    document.addEventListener('pointerdown', event => {
        if (!isTraceInteractionTarget(event.target)) return;
        traceInteractionHeld = true;
        if (traceInteractionReleaseTimer) {
            clearTimeout(traceInteractionReleaseTimer);
            traceInteractionReleaseTimer = null;
        }
    }, true);
    const release = () => {
        if (!traceInteractionHeld) return;
        if (traceInteractionReleaseTimer) clearTimeout(traceInteractionReleaseTimer);
        traceInteractionReleaseTimer = setTimeout(() => {
            if (hasActiveTraceSelection()) {
                traceInteractionReleaseTimer = setTimeout(release, 900);
                return;
            }
            traceInteractionHeld = false;
            traceInteractionReleaseTimer = null;
            flushDeferredTraceRenders();
        }, 160);
    };
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
}

function renderTraceTimeline(force = false) {
    const root = document.getElementById('traceTimeline');
    if (!root) return;
    if (traceInteractionHeld && !force) {
        traceDeferredTimelineRender = true;
        return;
    }
    if (!traceEvents.length) {
        root.innerHTML = '<div class="trace-empty">Waiting for dashboard events...</div>';
        return;
    }
    root.innerHTML = traceEvents.slice(-80).reverse().map(item => {
        const rawText = traceRawPayload(item);
        const rawKey = traceItemKey(item);
        const rawOpen = traceRawOpenKeys.has(rawKey) ? ' open' : '';
        return `
        <article class="trace-event ${item.className}">
            <div class="trace-event-time">${item.time}<br>${item.delta}</div>
            <div class="trace-event-main">
                <div class="trace-event-head">
                    <span class="trace-event-kind">${item.kind}</span>
                    <span class="trace-event-agent">${item.agent}</span>
                    ${item.chunks > 1 ? `<span class="trace-event-chunks">${item.chunks} chunks</span>` : ''}
                </div>
                <div class="trace-event-body">${escapeHtml(item.summary)}</div>
                <details class="trace-event-raw" data-raw-key="${escapeHtml(rawKey)}"${rawOpen}>
                    <summary>RAW</summary>
                    <pre>${escapeHtml(rawText)}</pre>
                </details>
            </div>
        </article>
    `;
    }).join('');
}

function mergeStreamingTraceEvent(event = {}, info = classifyTraceEvent(event), now = Date.now()) {
    if (!['Reasoning', 'Streaming'].includes(info.kind)) return false;
    const agent = eventAgent(event);
    const previous = traceEvents[traceEvents.length - 1];
    if (!previous || previous.kind !== info.kind || previous.agent !== agent) return false;
    const fullSnapshot = String(event.full_content || '').trim();
    const piece = String(event.content || event.delta || '');
    previous.raw = event;
    previous.rawChunks = previous.rawChunks || [];
    previous.rawChunks.push(event);
    if (previous.rawChunks.length > 24) previous.rawChunks.shift();
    if (info.kind === 'Reasoning' && fullSnapshot) {
        previous.summary = fullSnapshot;
    } else if (piece) {
        const nextSummary = `${previous.summary || ''}${piece}`;
        previous.summary = info.kind === 'Reasoning'
            ? nextSummary
            : (nextSummary.length > 3200 ? `${nextSummary.slice(0, 3199)}…` : nextSummary);
    } else {
        return true;
    }
    previous.timestamp = now;
    previous.lastSeen = now;
    previous.chunks = (previous.chunks || 1) + 1;
    const duration = Math.max(0, (now - (previous.startedAt || now)) / 1000);
    previous.delta = `${duration.toFixed(1)}s · ${previous.chunks} chunks`;
    return true;
}

function fileOutputStringValue(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value) return value;
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return '';
}

function fileOutputPath(event = {}) {
    return fileOutputStringValue(
        event.filePath,
        event.file_path,
        event.openPath,
        event.open_path,
        event.target_path,
        event.path,
        event.file
    ).trim();
}

function fileOutputName(event = {}) {
    const explicitName = fileOutputStringValue(
        event.fileName,
        event.file_name,
        event.filename,
        event.name
    ).trim();
    if (explicitName) return explicitName;
    const path = fileOutputPath(event);
    return path ? path.split(/[\\/]/).filter(Boolean).pop() || '' : '';
}

function fileOutputSession(event = {}) {
    return fileOutputStringValue(
        event.workbenchId,
        event.workbench_id,
        event.sessionId,
        event.session_id,
        event.run_id,
        event.runId
    ).trim();
}

function fileOutputAction(event = {}) {
    return fileOutputStringValue(event.sourceAction, event.action, event.type).trim();
}

function fileOutputText(event = {}) {
    return fileOutputStringValue(
        event.full_content,
        event.content,
        event.delta,
        event.chunk,
        event.text,
        event.result,
        event.message
    );
}

function sameFileOutputEvent(previousEvent = {}, nextEvent = {}) {
    const prevPath = fileOutputPath(previousEvent);
    const nextPath = fileOutputPath(nextEvent);
    if (prevPath && nextPath && prevPath === nextPath) return true;

    const prevName = fileOutputName(previousEvent);
    const nextName = fileOutputName(nextEvent);
    if (prevName && nextName && prevName === nextName) return true;

    const prevSession = fileOutputSession(previousEvent);
    const nextSession = fileOutputSession(nextEvent);
    const prevAction = fileOutputAction(previousEvent);
    const nextAction = fileOutputAction(nextEvent);
    return !!(prevSession && nextSession && prevSession === nextSession && prevAction && nextAction && prevAction === nextAction);
}

function mergeFileOutputTraceEvent(event = {}, info = classifyTraceEvent(event), now = Date.now()) {
    if (info.kind !== 'File Output') return false;
    const agent = eventAgent(event);
    const fullSnapshot = String(event.full_content || '').trim();
    const piece = fileOutputText(event);
    const fallbackSummary = summarizeTraceEvent(event, info);

    for (let i = traceEvents.length - 1; i >= Math.max(0, traceEvents.length - 12); i--) {
        const previous = traceEvents[i];
        if (previous.kind !== 'File Output' || previous.agent !== agent) continue;
        if (!sameFileOutputEvent(previous.raw || {}, event)) continue;
        if (now - (previous.timestamp || now) > 15000) break;

        previous.raw = event;
        previous.rawChunks = previous.rawChunks || [];
        previous.rawChunks.push(event);
        if (previous.rawChunks.length > 64) previous.rawChunks.shift();

        const limit = 3600;
        if (fullSnapshot) {
            previous.summary = compactText(fullSnapshot, limit);
        } else if (piece) {
            const incoming = String(piece);
            const current = String(previous.summary || '');
            if (!current) {
                previous.summary = compactText(incoming, limit);
            } else if (incoming.startsWith(current)) {
                previous.summary = compactText(incoming, limit);
            } else if (incoming.length < 12 || !current.endsWith(incoming)) {
                // Short streamed deltas may legitimately repeat the current suffix
                // (`s` + `s`, `>` + `>`). Only suppress substantial replay chunks.
                previous.summary = compactText(`${current}${incoming}`, limit);
            }
        } else if (!previous.summary) {
            previous.summary = fallbackSummary;
        }

        previous.timestamp = now;
        previous.lastSeen = now;
        previous.chunks = (previous.chunks || 1) + 1;
        const duration = Math.max(0, (now - (previous.startedAt || now)) / 1000);
        previous.delta = `${duration.toFixed(1)}s · ${previous.chunks} chunks`;
        return true;
    }
    return false;
}

// Update in-place when the same tool's status progresses (e.g. Executing → Running → Done)
// This prevents 3 identical-looking Tool Chain entries per batch step.
function mergeToolChainTraceEvent(event = {}, info = classifyTraceEvent(event), now = Date.now()) {
    if (info.kind !== 'Tool Chain') return false;
    const agent = eventAgent(event);
    const newLabel = toolLabelFromEvent(event) || '';
    if (!newLabel) return false;
    // Walk backwards for a recent Tool Chain event from the same agent with the same label
    for (let i = traceEvents.length - 1; i >= Math.max(0, traceEvents.length - 6); i--) {
        const prev = traceEvents[i];
        if (prev.kind !== 'Tool Chain' || prev.agent !== agent) continue;
        const prevLabel = toolLabelFromEvent(prev.raw || {}) || prev.summary || '';
        if (prevLabel !== newLabel) continue;
        if (now - prev.timestamp > 4000) break;
        // Replace summary with latest status, keep raw updated
        prev.summary = summarizeTraceEvent(event, info);
        prev.raw = event;
        prev.timestamp = now;
        prev.lastSeen = now;
        return true;
    }
    return false;
}

function isDuplicateTerminalTraceEvent(event = {}, info = classifyTraceEvent(event), now = Date.now()) {
    const type = String(event.type || '').toLowerCase();
    if (!['end', 'final', 'seal_stream_bubble'].includes(type)) return false;
    const agent = eventAgent(event);
    const runId = String(event.run_id || event.runId || event.request_id || '');
    const content = type === 'end' ? '' : String(event.content || '').trim();
    const contentKey = content ? content.slice(0, 220) : '';
    const key = [type, agent, runId, contentKey].join('|');
    const lastSeen = recentTerminalTraceKeys.get(key) || 0;
    recentTerminalTraceKeys.set(key, now);
    for (const [storedKey, seenAt] of recentTerminalTraceKeys.entries()) {
        if (now - seenAt > 15000) recentTerminalTraceKeys.delete(storedKey);
    }
    return now - lastSeen < 15000;
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function traceConsoleItems(filterFn = null) {
    const items = filterFn ? traceEvents.filter(filterFn) : traceEvents;
    return items.slice(-120);
}

function renderTraceConsoleCards(items = []) {
    if (!items.length) {
        return '<div class="trace-console-empty">No matching trace events yet.</div>';
    }
    return items.map((item, index) => `
        <article class="trace-console-card ${item.className || ''}">
            <div class="trace-console-card-head">
                <div>
                    <div class="trace-console-kind">${index + 1}. ${escapeHtml(item.kind)}</div>
                    <div class="trace-console-agent">${escapeHtml(item.agent || 'agent')}</div>
                </div>
                <div class="trace-console-meta">${escapeHtml(item.time || '')} · ${escapeHtml(item.delta || '')}</div>
            </div>
            <div class="trace-console-body-text">${escapeHtml(item.summary || '')}</div>
        </article>
    `).join('');
}

function countReasoningStats() {
    const reasonings = traceEvents.filter(item => item.kind === 'Reasoning');
    const text = reasonings.map(item => item.summary || '').join('\n');
    const lower = text.toLowerCase();
    const waitCount = (lower.match(/\bwait\b/g) || []).length;
    const tokenish = lower.match(/[a-z가-힣0-9_]{2,}/g) || [];
    const counts = new Map();
    tokenish.forEach(token => counts.set(token, (counts.get(token) || 0) + 1));
    const repeated = Array.from(counts.entries())
        .filter(([, count]) => count >= 4)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    const chars = text.length;
    const chunks = reasonings.reduce((sum, item) => sum + Number(item.chunks || 1), 0);
    const loopRisk = waitCount >= 5 || repeated.some(([, count]) => count >= 8) || chars > 1800;
    return { reasonings, text, waitCount, repeated, chars, chunks, loopRisk };
}

function renderTraceConsoleSummary(stats = []) {
    return `
        <div class="trace-console-summary-grid">
            ${stats.map(([label, value, drillKey]) => {
                const key = String(drillKey || '').replace(/[^a-z0-9_-]/gi, '');
                const clickable = !!key;
                const tag = 'div';
                const active = clickable && activeTraceConsoleDrill === key ? ' active' : '';
                const action = clickable ? ` role="button" tabindex="0" onclick="setTraceConsoleDrill('${key}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();setTraceConsoleDrill('${key}')}"` : '';
                return `
                <${tag} class="trace-console-stat${clickable ? ' clickable' : ''}${active}"${action}>
                    <label>${escapeHtml(label)}</label>
                    <strong>${escapeHtml(value)}</strong>
                </${tag}>
            `}).join('')}
        </div>
    `;
}

function syntheticTraceCard(kind, summary) {
    return {
        kind,
        agent: 'system_graph',
        time: new Date().toLocaleTimeString(),
        delta: 'snapshot',
        summary,
        className: 'is-system',
    };
}

function memoryTraceCardsFromPayload(item) {
    const trace = item?.raw?.memory_trace;
    if (!trace) return [];
    const cards = [];
    const add = (kind, values) => {
        (values || []).filter(Boolean).forEach((value, index) => {
            cards.push({
                kind: `${kind} ${index + 1}`,
                agent: item.agent,
                time: item.time,
                delta: item.delta,
                summary: String(value),
                className: 'is-memory',
                raw: item.raw,
            });
        });
    };
    add('LTM', trace.ltm_items);
    add('STM', trace.stm_items);
    add('Graph', trace.graph_items);
    add('Reference', trace.ref_items);
    add('Warm Context', trace.warm_preview);
    add('Recent History', trace.recent_history_preview);
    if (!cards.length) {
        cards.push({
            kind: 'Memory Trace',
            agent: item.agent,
            time: item.time,
            delta: item.delta,
            summary: `Passive recall: ${trace.passive_recall || 'unknown'} | profile ${trace.recall_profile || trace.recall_mode || 'unknown'} | LTM ${trace.ltm_count || 0} | STM ${trace.stm_count || 0} | GRAPH ${trace.graph_count || 0} | refs ${trace.refs_count || 0} | expand ${trace.recall_expansion_enabled ? 'on' : 'off'} | graph_links ${trace.recall_graph_links_enabled ? 'on' : 'off'}`,
            className: 'is-memory',
            raw: item.raw,
        });
    }
    return cards;
}

function renderTurnReplayTab() {
    const items = traceConsoleItems();
    const duration = items.length
        ? `${((items[items.length - 1].timestamp - items[0].timestamp) / 1000).toFixed(1)}s`
        : '0.0s';
    return renderTraceConsoleSummary([
        ['Events', String(items.length)],
        ['Duration', duration],
        ['Agents', String(new Set(items.map(item => item.agent)).size)],
        ['Last Event', items.at(-1)?.kind || '--'],
    ]) + renderTraceConsoleCards(items);
}

function renderMemoryTraceTab() {
    const items = traceConsoleItems(item => item.kind === 'Memory Recall' || /memory|recall|stm|warm/i.test(item.summary || ''));
    const joined = items.map(item => item.summary || '').join('\n');
    const payloadItems = items.filter(item => item.raw?.memory_trace);
    const payloads = payloadItems.map(item => item.raw.memory_trace);
    const runtime = latestSystemData?.system || {};
    const memoryNodes = Number(runtime.memory_entries || 0);
    const payloadLtmEntries = payloads.reduce((max, trace) => Math.max(max, Number(trace.ltm_count || 0)), 0);
    const payloadPrimaryLtmEntries = payloads.reduce((max, trace) => Math.max(max, Number(trace.primary_ltm_count || 0)), 0);
    const payloadExpandedLtmEntries = payloads.reduce((max, trace) => Math.max(max, Number(trace.expanded_ltm_count || 0)), 0);
    const payloadGraphEntries = payloads.reduce((max, trace) => Math.max(max, Number(trace.graph_count || 0)), 0);
    const payloadRefEntries = payloads.reduce((max, trace) => Math.max(max, Number(trace.refs_count || 0)), 0);
    const payloadStmEntries = payloads.reduce((max, trace) => Math.max(max, Number(trace.stm_count || 0)), 0);
    const recentHistoryEntries = payloads.reduce((max, trace) => Math.max(max, Number(trace.recent_history_count || 0)), 0);
    const latestProfile = [...payloads].reverse().find(trace => trace.recall_profile)?.recall_profile || 'unknown';
    const latestBudget = [...payloads].reverse().find(trace => trace.recall_limit || trace.recall_top_k) || {};
    const stmEntries = Math.max(Number(runtime.stm_entries || 0), payloadStmEntries);
    const activeRecallTool = /active tools[\s\S]*\brecall\b/i.test(joined) || /\brecall\b/i.test(joined);
    const passivePayload = payloads.find(trace => trace.passive_recall && !['disabled', 'skipped'].includes(String(trace.passive_recall)));
    const passiveRecall = !!passivePayload || /passive[_\s-]*recall|memory recall|promptcache[\s\S]*passive|recall[\s\S]*(top|pass|threshold)/i.test(joined);
    const warmMemory = payloads.some(trace => trace.warm_context) || /warm memory|warm buffer|ltm commit/i.test(joined);
    const stmSeen = payloads.some(trace => Number(trace.stm_count || 0) > 0 || (trace.stm_items || []).length > 0) || /(^|\b)stm\b|short[-\s]*term/i.test(joined) || payloadStmEntries > 0;
    const recentHistorySeen = payloads.some(trace => Number(trace.recent_history_count || 0) > 0 || trace.recent_history || (trace.recent_history_preview || []).length > 0);
    const memoryLoaded = memoryNodes > 0 || items.length > 0;
    const ltmSeen = payloadLtmEntries > 0 || payloads.some(trace => (trace.ltm_items || []).length > 0);
    const graphSeen = payloadGraphEntries > 0 || payloads.some(trace => trace.graph_available || (trace.graph_items || []).length > 0);
    const refsSeen = payloadRefEntries > 0 || payloads.some(trace => (trace.ref_items || []).length > 0);
    const loadedCards = payloadItems.flatMap(memoryTraceCardsFromPayload);
    const ltmCards = payloadItems.flatMap(item => {
        const trace = item.raw?.memory_trace || {};
        return (trace.ltm_items || []).map((value, index) => ({
            ...item,
            kind: `LTM ${index + 1}`,
            summary: String(value),
        }));
    });
    const graphCards = payloadItems.flatMap(item => {
        const trace = item.raw?.memory_trace || {};
        const cards = (trace.graph_items || []).map((value, index) => ({
            ...item,
            kind: `GRAPH ${index + 1}`,
            summary: String(value),
        }));
        if (!cards.length && (trace.graph_available || Number(trace.graph_count || 0) > 0)) {
            cards.push({
                ...item,
                kind: 'GRAPH Snapshot',
                summary: `Graph available: ${trace.graph_available ? 'yes' : 'no'}; graph nodes returned: ${trace.graph_count || 0}.`,
            });
        }
        return cards;
    });
    const refCards = payloadItems.flatMap(item => {
        const trace = item.raw?.memory_trace || {};
        const cards = (trace.ref_items || []).map((value, index) => ({
            ...item,
            kind: `REF ${index + 1}`,
            summary: String(value),
        }));
        if (!cards.length && Number(trace.refs_count || 0) > 0) {
            cards.push({
                ...item,
                kind: 'REF Snapshot',
                summary: `Reference ledger returned ${trace.refs_count || 0} item(s).`,
            });
        }
        return cards;
    });
    const passiveCards = payloadItems
        .filter(item => {
            const status = String(item.raw?.memory_trace?.passive_recall || '');
            return status && !['disabled', 'skipped'].includes(status);
        })
        .flatMap(memoryTraceCardsFromPayload);
    const stmCards = payloadItems.flatMap(item => {
        const trace = item.raw?.memory_trace || {};
        const cards = [];
        (trace.stm_items || []).forEach((value, index) => {
            cards.push({ ...item, kind: `STM ${index + 1}`, summary: String(value) });
        });
        if (!cards.length && Number(trace.stm_count || 0) > 0) {
            cards.push({
                ...item,
                kind: 'STM Snapshot',
                summary: `STM memory items ${trace.stm_count || 0}; included in prompt: ${trace.stm_included === false ? 'no' : 'yes'}.`
            });
        }
        return cards;
    });
    const recentHistoryCards = payloadItems.flatMap(item => {
        const trace = item.raw?.memory_trace || {};
        const cards = [];
        (trace.recent_history_preview || []).forEach((value, index) => {
            cards.push({ ...item, kind: `Recent History ${index + 1}`, summary: String(value) });
        });
        if (!cards.length && (Number(trace.recent_history_count || 0) > 0 || trace.recent_history)) {
            cards.push({
                ...item,
                kind: 'Recent History Snapshot',
                summary: `Recent history turns ${trace.recent_history_count || 0}; recent history ${trace.recent_history ? 'included' : 'not included'}.`
            });
        }
        return cards;
    });
    const buckets = {
        events: items,
        loaded: [
            syntheticTraceCard(
                'Memory Loaded',
                memoryLoaded
                    ? `System metrics report ${memoryNodes.toLocaleString()} memory nodes and ${stmEntries.toLocaleString()} stored STM entries. Detailed recalled memory payloads require backend trace events.`
                    : 'No memory nodes were reported by the current system metrics snapshot.'
            ),
            ...loadedCards,
            ...items,
        ],
        ltm: ltmCards.length ? ltmCards : items.filter(item => /\bltm\b|long[-\s]*term|memory recall/i.test(item.summary || '')),
        expanded_ltm: ltmCards.filter(item => /^LTM/i.test(item.kind || '') && /\[EXPANDED\]|source=hint_expansion/i.test(item.summary || '')),
        graph: graphCards.length ? graphCards : items.filter(item => /\bgraph\b|knowledge graph/i.test(item.summary || '')),
        refs: refCards.length ? refCards : items.filter(item => /\brefs?\b|reference ledger/i.test(item.summary || '')),
        recall_tool: items.filter(item => /active tools[\s\S]*\brecall\b|\brecall\b/i.test(item.summary || '')),
        passive: passiveCards.length
            ? passiveCards
            : items.filter(item => /passive[_\s-]*recall|memory recall|promptcache[\s\S]*passive|recall[\s\S]*(top|pass|threshold)/i.test(item.summary || '')),
        stm: [
            ...(payloadStmEntries > 0 ? [syntheticTraceCard('STM Snapshot', `Backend trace reports ${payloadStmEntries.toLocaleString()} STM item(s) included in memory recall.`)] : []),
            ...stmCards,
            ...items.filter(item => /(^|\b)stm\b|short[-\s]*term/i.test(item.summary || '')),
        ],
        recent_history: recentHistoryCards,
        warm: items.filter(item => /warm memory|warm buffer|ltm commit/i.test(item.summary || '')),
    };
    const drillKey = activeTraceConsoleDrill || '';
    const drillItems = drillKey ? (buckets[drillKey] || []) : [];
    const drill = drillKey
        ? `
            <section class="trace-console-drill">
                <div class="trace-console-drill-title">${escapeHtml(drillKey.replace(/_/g, ' '))} evidence</div>
                ${renderTraceConsoleCards(drillItems)}
            </section>
        `
        : '';
    return renderTraceConsoleSummary([
        ['Memory Events', String(items.length), 'events'],
        ['Profile', latestProfile, 'events'],
        ['Budget', `limit ${latestBudget.recall_limit || 0} / top ${latestBudget.recall_top_k || 0}`, 'events'],
        ['Memory Loaded', memoryLoaded ? `${memoryNodes.toLocaleString()} nodes` : 'none', 'loaded'],
        ['LTM', ltmSeen ? `${payloadLtmEntries.toLocaleString()} items` : 'not seen', 'ltm'],
        ['Expanded LTM', payloadExpandedLtmEntries ? `${payloadExpandedLtmEntries.toLocaleString()} items` : 'none', 'expanded_ltm'],
        ['GRAPH', graphSeen ? `${payloadGraphEntries.toLocaleString()} nodes` : 'not seen', 'graph'],
        ['REFS', refsSeen ? `${payloadRefEntries.toLocaleString()} refs` : 'not seen', 'refs'],
        ['Recall Tool', activeRecallTool ? 'available/seen' : 'not seen', 'recall_tool'],
        ['Passive Recall', passiveRecall ? 'used' : (activeRecallTool || memoryLoaded ? 'not observed' : 'unknown'), 'passive'],
        ['STM', stmSeen ? `${payloadStmEntries.toLocaleString()} recall items` : 'not included', 'stm'],
        ['Recent History', recentHistorySeen ? `${recentHistoryEntries.toLocaleString()} turns` : 'not seen', 'recent_history'],
        ['Warm Memory', warmMemory ? 'seen' : 'not seen', 'warm'],
    ]) + drill + renderTraceConsoleCards(items);
}

function graphLinkPayloads() {
    return traceEvents
        .filter(item => item.raw?.memory_trace?.graph_links)
        .flatMap(item => {
            const links = item.raw.memory_trace.graph_links || [];
            return links.map(link => ({ item, link }));
        });
}

function renderGraphLinkInspectorTab() {
    const rows = graphLinkPayloads();
    const nodes = new Set(rows.map(row => row.link?.node).filter(Boolean));
    const sourceTotal = rows.reduce((sum, row) => sum + Number(row.link?.source_count || 0), 0);
    const edgeTotal = rows.reduce((sum, row) => sum + Number((row.link?.edges || []).length), 0);
    const refTotal = rows.reduce((sum, row) => sum + Number((row.link?.ltm_refs || []).length), 0);
    const summary = renderTraceConsoleSummary([
        ['Linked Nodes', String(nodes.size)],
        ['Source Count', sourceTotal.toLocaleString()],
        ['LTM Refs', refTotal.toLocaleString()],
        ['Edges', edgeTotal.toLocaleString()],
    ]);
    if (!rows.length) {
        return summary + '<div class="trace-console-empty">No graph link payloads yet. Run a deep memory recall after backend restart/load.</div>';
    }
    const cards = rows.map(({ item, link }, index) => {
        const linkedIds = (link.linked_ltm_ids || []).map(id => `- ${id}`).join('\n') || 'None';
        const refs = (link.ltm_refs || []).map(ref => {
            if (ref.status) return `- ${ref.id || 'missing'} (${ref.status})`;
            const topic = ref.topic ? ` topic=${ref.topic}` : '';
            const path = ref.path ? ` path=${ref.path}` : '';
            const summaryText = ref.summary ? ` summary=${ref.summary}` : '';
            return `- ${ref.id || ref.ltm_id || 'ref'}${topic}${path}${summaryText}`;
        }).join('\n') || 'None';
        const edges = (link.edges || []).map(edge => {
            const ids = (edge.linked_ltm_ids || []).length ? ` ids=${edge.linked_ltm_ids.join(',')}` : '';
            return `- ${edge.target} relation=${edge.relation || 'related'} weight=${edge.weight || 0} sources=${edge.source_count || 0}${ids}`;
        }).join('\n') || 'None';
        const body = [
            `node: ${link.node || 'unknown'}`,
            `type: ${link.type || 'unknown'}`,
            `source_count: ${link.source_count || 0}`,
            '',
            'linked_ltm_ids:',
            linkedIds,
            '',
            'ltm_refs:',
            refs,
            '',
            'edges:',
            edges,
        ].join('\n');
        return {
            kind: `Graph Node ${index + 1}`,
            agent: item.agent,
            time: item.time,
            delta: item.delta,
            summary: body,
            className: 'is-memory',
        };
    });
    return summary + renderTraceConsoleCards(cards);
}

function latestPolicyItem() {
    return [...traceEvents].reverse().find(item => item.raw?.agent_policy);
}

function policyValueText(value) {
    if (value === null || value === undefined || value === '') return '--';
    if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
}

function renderPolicyKeyValues(values = {}) {
    const entries = Object.entries(values || {});
    if (!entries.length) {
        return '<div class="trace-console-empty">No fields in this policy section.</div>';
    }
    return `
        <div class="policy-kv-grid">
            ${entries.map(([key, value]) => `
                <div class="policy-kv-item">
                    <label>${escapeHtml(key.replace(/_/g, ' '))}</label>
                    <pre>${escapeHtml(policyValueText(value))}</pre>
                </div>
            `).join('')}
        </div>
    `;
}

function renderPolicySectionCard(title, values = {}, className = '') {
    return `
        <article class="trace-console-card policy-section-card ${className}">
            <div class="trace-console-card-head">
                <div>
                    <div class="trace-console-kind">${escapeHtml(title)}</div>
                    <div class="trace-console-agent">agent policy profile</div>
                </div>
            </div>
            ${renderPolicyKeyValues(values)}
        </article>
    `;
}

function renderAgentPolicyTab() {
    const items = traceConsoleItems(item => item.kind === 'Agent Policy' || item.raw?.agent_policy);
    const latest = latestPolicyItem();
    const policy = latest?.raw?.agent_policy || {};
    const memoryPolicy = policy.memory_policy || {};
    const toolPolicy = policy.tool_execution_policy || {};
    const evidencePolicy = policy.evidence_policy || {};
    const responsePolicy = policy.response_policy || {};
    const learningPolicy = policy.active_learning_policy || {};
    const loraMetadata = policy.lora_metadata || {};
    const forbiddenTools = toolPolicy.forbidden_tools || [];
    const activeTools = toolPolicy.active_tools || [];
    const sections = [
        ['Memory Policy', memoryPolicy, 'is-memory'],
        ['Tool Execution Policy', toolPolicy, 'is-tool'],
        ['Evidence Policy', evidencePolicy, 'is-policy'],
        ['Response Policy', responsePolicy, 'is-final'],
        ['Active Learning Policy', learningPolicy, 'is-memory'],
        ['LoRA Metadata', loraMetadata, 'is-system'],
    ];

    const summary = renderTraceConsoleSummary([
        ['Policy Events', String(items.length), 'policy_events'],
        ['Active Tools', String(activeTools.length || 0), 'active_tools'],
        ['Forbidden Tools', String(forbiddenTools.length || 0), 'forbidden_tools'],
        ['Think Mode', policy.response_policy?.think_mode || '--', 'response_policy'],
        ['Recall Profile', policy.memory_policy?.recall_profile || '--', 'memory_policy'],
        ['Active Learning', policy.active_learning_policy?.enabled ? 'enabled' : 'disabled', 'active_learning_policy'],
        ['LoRA Ready', policy.lora_metadata?.promotion_target || '--', 'lora_metadata'],
        ['Updated By', latest?.agent || '--', 'policy_events'],
    ]);

    if (!latest) {
        return summary + '<div class="trace-console-empty">No agent policy profile has been observed yet. Start a new agent turn after backend reload.</div>';
    }

    const drillBuckets = {
        policy_events: items,
        active_tools: activeTools.map((name, index) => syntheticTraceCard(`Active Tool ${index + 1}`, String(name))),
        forbidden_tools: forbiddenTools.map((name, index) => syntheticTraceCard(`Forbidden Tool ${index + 1}`, String(name))),
        memory_policy: [syntheticTraceCard('Memory Policy', policyValueText(memoryPolicy))],
        response_policy: [syntheticTraceCard('Response Policy', policyValueText(responsePolicy))],
        active_learning_policy: [syntheticTraceCard('Active Learning Policy', policyValueText(learningPolicy))],
        lora_metadata: [syntheticTraceCard('LoRA Metadata', policyValueText(loraMetadata))],
    };
    const drillKey = activeTraceConsoleDrill || '';
    const drillItems = drillKey ? (drillBuckets[drillKey] || []) : [];
    const drill = drillKey
        ? `
            <section class="trace-console-drill">
                <div class="trace-console-drill-title">${escapeHtml(drillKey.replace(/_/g, ' '))}</div>
                ${renderTraceConsoleCards(drillItems)}
            </section>
        `
        : '';

    return summary
        + drill
        + `<div class="policy-section-grid">${sections.map(([title, values, className]) => renderPolicySectionCard(title, values, className)).join('')}</div>`
        + renderTraceConsoleCards(items);
}

function renderLoopInspectorTab() {
    const stats = countReasoningStats();
    const repeatedText = stats.repeated.length
        ? stats.repeated.map(([token, count]) => `${token} x${count}`).join(', ')
        : 'none';
    return renderTraceConsoleSummary([
        ['Loop Risk', stats.loopRisk ? 'watch' : 'low'],
        ['Reasoning Chunks', String(stats.chunks)],
        ['Reasoning Chars', stats.chars.toLocaleString()],
        ['Wait Count', String(stats.waitCount)],
    ]) + `
        <article class="trace-console-card">
            <div class="trace-console-card-head">
                <div>
                    <div class="trace-console-kind">Repeated Phrases</div>
                    <div class="trace-console-agent">static detector</div>
                </div>
            </div>
            <div class="trace-console-body-text">${escapeHtml(repeatedText)}</div>
        </article>
    ` + renderTraceConsoleCards(stats.reasonings);
}

function renderToolChainTab() {
    // include System events that carry tool execution info (batch start/done, pipeline steps, etc.)
    const items = traceConsoleItems(item =>
        ['Tool Chain', 'File Output', 'Permission'].includes(item.kind) ||
        (item.kind === 'System' && /batch|pipeline|recipe|websurfing|executing|tool/i.test(item.summary || '')) ||
        /tool|batch|pipeline|websurfing|file_/i.test(item.summary || '')
    );
    return renderTraceConsoleSummary([
        ['Tool Events', String(items.length)],
        ['Permissions', String(items.filter(item => item.kind === 'Permission').length)],
        ['File Outputs', String(items.filter(item => item.kind === 'File Output').length)],
        ['Last Tool', items.at(-1)?.summary || '--'],
    ]) + renderTraceConsoleCards(items);
}

function renderErrorTraceTab() {
    const errorPattern = /error|failed|exception|traceback|stream error|not loaded|cannot be broadcast/i;
    const items = traceConsoleItems(item => item.kind === 'Error' || errorPattern.test(`${item.summary || ''} ${item.raw?.content || ''} ${item.raw?.message || ''}`));
    const agents = new Set(items.map(item => item.agent).filter(Boolean));
    const latest = items.at(-1);
    const mlxItems = items.filter(item => /mlx|vlm|mtp|broadcast|drafter/i.test(`${item.summary || ''} ${item.raw?.content || ''} ${item.raw?.message || ''}`));
    const toolItems = items.filter(item => /tool|websurfing|file_|shell|permission/i.test(`${item.summary || ''} ${item.raw?.content || ''} ${item.raw?.message || ''}`));
    const buckets = {
        all_errors: items,
        mlx_errors: mlxItems,
        tool_errors: toolItems,
        latest_error: latest ? [latest] : [],
    };
    const drillKey = activeTraceConsoleDrill || '';
    const drillItems = drillKey ? (buckets[drillKey] || []) : [];
    const drill = drillKey
        ? `
            <section class="trace-console-drill error-drill">
                <div class="trace-console-drill-title">${escapeHtml(drillKey.replace(/_/g, ' '))}</div>
                ${renderTraceConsoleCards(drillItems)}
            </section>
        `
        : '';
    return renderTraceConsoleSummary([
        ['Errors', String(items.length), 'all_errors'],
        ['MLX/MTP', String(mlxItems.length), 'mlx_errors'],
        ['Tool Errors', String(toolItems.length), 'tool_errors'],
        ['Agents', String(agents.size)],
        ['Latest', latest?.time || 'none', 'latest_error'],
        ['Status', items.length ? 'attention' : 'clear'],
    ]) + drill + renderTraceConsoleCards(items);
}

function renderTraceConsole(tab = activeTraceConsoleTab, force = false) {
    const body = document.getElementById('traceConsoleBody');
    if (!body) return;
    if (traceInteractionHeld && !force) {
        traceDeferredConsoleRender = true;
        return;
    }
    const renderers = {
        turn: renderTurnReplayTab,
        memory: renderMemoryTraceTab,
        graph_links: renderGraphLinkInspectorTab,
        policy: renderAgentPolicyTab,
        errors: renderErrorTraceTab,
        loop: renderLoopInspectorTab,
        tools: renderToolChainTab,
    };
    body.innerHTML = (renderers[tab] || renderTurnReplayTab)();
}

function setTraceConsoleTab(tab) {
    activeTraceConsoleTab = tab || 'turn';
    if (!['memory', 'errors', 'policy'].includes(activeTraceConsoleTab)) activeTraceConsoleDrill = '';
    document.querySelectorAll('.trace-console-tab').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === activeTraceConsoleTab);
    });
    renderTraceConsole(activeTraceConsoleTab);
}

function setTraceConsoleDrill(key) {
    activeTraceConsoleDrill = activeTraceConsoleDrill === key ? '' : key;
    renderTraceConsole(activeTraceConsoleTab);
}

function openTraceConsole() {
    modal.style.display = 'flex';
    setTraceConsoleTab(activeTraceConsoleTab || 'turn');
}

function traceTabForNode(nodeName = '') {
    if (nodeName === 'Memory') return 'memory';
    if (nodeName === 'Graph') return 'graph_links';
    if (nodeName === 'Policy') return 'policy';
    if (nodeName === 'Error') return 'errors';
    if (['Reasoning', 'Interrupt'].includes(nodeName)) return 'loop';
    if (['Tool', 'File', 'Permission'].includes(nodeName)) return 'tools';
    return 'turn';
}

function openTraceConsoleForNode(nodeName = '') {
    const tab = traceTabForNode(nodeName);
    modal.style.display = 'flex';
    setTraceConsoleTab(tab);
}

function bindTraceGraphInteraction(canvas) {
    if (!canvas || canvas.dataset.traceBound === 'true') return;
    canvas.dataset.traceBound = 'true';
    const findNode = event => {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        return traceGraphHitNodes.find(node => {
            const dx = node.x - x;
            const dy = node.y - y;
            return dx * dx + dy * dy <= (node.radius + 10) ** 2;
        });
    };
    canvas.addEventListener('mousemove', event => {
        canvas.classList.toggle('is-clickable-node', !!findNode(event));
    });
    canvas.addEventListener('mouseleave', () => {
        canvas.classList.remove('is-clickable-node');
    });
    canvas.addEventListener('click', event => {
        const node = findNode(event);
        if (node) openTraceConsoleForNode(node.name);
    });
}

function drawTraceGraph() {
    const canvas = document.getElementById('traceGraphCanvas');
    if (!canvas) return;
    bindTraceGraphInteraction(canvas);
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(240, Math.floor(rect.height));
    const isLightTheme = document.body.classList.contains('light-theme');
    const graphScale = Math.max(0.92, Math.min(1.48, Math.sqrt((width * height) / (980 * 430))));
    const curveLift = 18 * graphScale;
    const baseLineWidth = 1.6 * graphScale;
    const nodeRadius = name => {
        const base = name === 'Agent' ? 24 : name === 'Final' ? 22 : 18;
        return Math.round(base * graphScale);
    };
    const labelFontSize = Math.round(11 * graphScale);
    const drawLabelBackplate = (ctx, text, x, y) => {
        const paddingX = 6 * graphScale;
        const paddingY = 3 * graphScale;
        const metrics = ctx.measureText(text);
        const w = metrics.width + (paddingX * 2);
        const h = labelFontSize + (paddingY * 2);
        const left = x - (w / 2);
        const top = y - labelFontSize + 1;
        const r = 5 * graphScale;
        ctx.beginPath();
        ctx.moveTo(left + r, top);
        ctx.lineTo(left + w - r, top);
        ctx.quadraticCurveTo(left + w, top, left + w, top + r);
        ctx.lineTo(left + w, top + h - r);
        ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
        ctx.lineTo(left + r, top + h);
        ctx.quadraticCurveTo(left, top + h, left, top + h - r);
        ctx.lineTo(left, top + r);
        ctx.quadraticCurveTo(left, top, left + r, top);
        ctx.closePath();
        ctx.fill();
    };
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const positions = {
        User: [width * 0.12, height * 0.5],
        Agent: [width * 0.29, height * 0.5],
        Memory: [width * 0.28, height * 0.22],
        Graph: [width * 0.43, height * 0.18],
        Policy: [width * 0.44, height * 0.5],
        Planner: [width * 0.47, height * 0.34],
        Reasoning: [width * 0.62, height * 0.28],
        Tool: [width * 0.62, height * 0.62],
        Permission: [width * 0.78, height * 0.72],
        File: [width * 0.8, height * 0.56],
        Streaming: [width * 0.79, height * 0.34],
        Interrupt: [width * 0.78, height * 0.16],
        Final: [width * 0.92, height * 0.5],
        System: [width * 0.46, height * 0.72],
        Error: [width * 0.92, height * 0.78],
    };
    const colors = isLightTheme ? {
        User: '#0369a1',
        Agent: '#047857',
        Memory: '#15803d',
        Graph: '#0f766e',
        Policy: '#be185d',
        Planner: '#6d28d9',
        Reasoning: '#b45309',
        Tool: '#1d4ed8',
        Permission: '#b45309',
        File: '#0f766e',
        Streaming: '#7c3aed',
        Interrupt: '#c2410c',
        Final: '#6d28d9',
        System: '#475569',
        Error: '#dc2626',
    } : {
        User: '#e69a55',
        Agent: '#e7e3d8',
        Memory: '#86a965',
        Graph: '#aaa497',
        Policy: '#e69a55',
        Planner: '#90a86f',
        Reasoning: '#e4aa5d',
        Tool: '#aaa497',
        Permission: '#e4aa5d',
        File: '#86a965',
        Streaming: '#e7e3d8',
        Interrupt: '#d86f36',
        Final: '#90a86f',
        System: '#aaa497',
        Error: '#ef4444',
    };
    const now = Date.now();
    const nodes = Array.from(traceState.seenNodes).filter(name => positions[name]);
    const edges = Array.from(traceState.seenEdges)
        .map(edge => edge.split('>'))
        .filter(([a, b]) => positions[a] && positions[b]);

    ctx.lineWidth = baseLineWidth;
    edges.forEach(([source, target]) => {
        const [x1, y1] = positions[source];
        const [x2, y2] = positions[target];
        const fresh = now - Math.max(traceState.nodePulse[source] || 0, traceState.nodePulse[target] || 0) < 3200;
        ctx.strokeStyle = fresh
            ? (isLightTheme ? 'rgba(13, 148, 136, 0.70)' : 'rgba(230, 154, 85, 0.58)')
            : (isLightTheme ? 'rgba(71, 85, 105, 0.36)' : 'rgba(170, 164, 151, 0.24)');
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        const mx = (x1 + x2) / 2;
        ctx.quadraticCurveTo(mx, y1 - curveLift, x2, y2);
        ctx.stroke();
    });

    traceGraphHitNodes = [];
    nodes.forEach(name => {
        const [x, y] = positions[name];
        const age = now - (traceState.nodePulse[name] || 0);
        const active = traceState.activeNode === name;
        const fresh = age < 3200;
        const radius = nodeRadius(name);
        traceGraphHitNodes.push({ name, x, y, radius });
        if (active || fresh) {
            ctx.save();
            ctx.shadowColor = colors[name] || '#e69a55';
            ctx.shadowBlur = (active ? 26 : 14) * graphScale;
            ctx.globalAlpha = active ? 0.96 : 0.68;
            ctx.fillStyle = colors[name] || '#e69a55';
            ctx.beginPath();
            ctx.arc(x, y, radius + ((active ? 9 : 5) * graphScale), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.fillStyle = fresh
            ? `${colors[name]}26`
            : (isLightTheme ? 'rgba(248, 250, 252, 0.96)' : 'rgba(24, 24, 21, 0.92)');
        ctx.strokeStyle = colors[name] || '#94a3b8';
        ctx.lineWidth = (active ? 4.2 : (fresh ? 3 : 1.6)) * graphScale;
        ctx.shadowColor = active ? (colors[name] || '#e69a55') : 'transparent';
        ctx.shadowBlur = active ? 18 * graphScale : 0;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.font = `${isLightTheme ? 900 : 800} ${labelFontSize}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        const labelY = y + radius + (19 * graphScale);
        if (isLightTheme) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
            drawLabelBackplate(ctx, name, x, labelY);
        }
        ctx.fillStyle = colors[name] || (isLightTheme ? '#0f172a' : '#e2e8f0');
        ctx.fillText(name, x, labelY);
    });
}

function traceEventRunStepKey(event = {}) {
    const agent = eventAgent(event);
    const runId = String(event.run_id || event.runId || event.request_id || '').trim();
    const step = String(event.step || event.step_label || '').trim();
    if (runId || step) return `${agent}|${runId}|${step}`;
    return '';
}

function upsertReasoningTraceFromRawSnapshot(event = {}, now = Date.now()) {
    const reasoningText = reasoningTextFromLlmRawSnapshot(event);
    if (!reasoningText) return false;
    const agent = eventAgent(event);
    const key = traceEventRunStepKey(event);
    const chunks = Math.max(1, Number(event.chunk_counts?.reasoning || 1));
    const summary = reasoningText;
    for (let i = traceEvents.length - 1; i >= Math.max(0, traceEvents.length - 10); i--) {
        const prev = traceEvents[i];
        if (prev.kind !== 'Reasoning' || prev.agent !== agent) continue;
        const prevKey = traceEventRunStepKey(prev.raw || {});
        const sameStep = key && prevKey && key === prevKey;
        const recentFallback = !key && now - (prev.timestamp || now) < 10000;
        if (!sameStep && !recentFallback) continue;
        if (!prev.summary || summary.length >= String(prev.summary || '').length) {
            prev.summary = summary;
        }
        prev.raw = {
            ...event,
            type: 'reasoning_preview',
            content: reasoningText,
            synthesized_from: 'llm_raw_snapshot',
        };
        prev.rawChunks = prev.rawChunks || [];
        prev.rawChunks.push(event);
        if (prev.rawChunks.length > 24) prev.rawChunks.shift();
        prev.chunks = Math.max(Number(prev.chunks || 1), chunks);
        prev.timestamp = now;
        prev.lastSeen = now;
        const duration = Math.max(0, (now - (prev.startedAt || now)) / 1000);
        prev.delta = `${duration.toFixed(1)}s · ${prev.chunks} chunks`;
        return true;
    }

    const synthetic = {
        ...event,
        type: 'reasoning_preview',
        content: reasoningText,
        delta: reasoningText,
        full_content: reasoningText,
        synthesized_from: 'llm_raw_snapshot',
    };
    const info = classifyTraceEvent(synthetic);
    const previous = traceEvents[traceEvents.length - 1]?.timestamp || now;
    updateTraceState(synthetic, info);
    updateDerivedLlmPulse(synthetic, info);
    traceEvents.push({
        id: `trace-${++traceEventSeq}`,
        timestamp: now,
        startedAt: now,
        lastSeen: now,
        chunks,
        time: new Date(now).toLocaleTimeString(),
        delta: traceEvents.length ? `+${((now - previous) / 1000).toFixed(1)}s` : '+0.0s',
        kind: info.kind,
        agent,
        summary,
        className: info.className || '',
        raw: synthetic,
        rawChunks: [event],
    });
    return true;
}

function handleTraceEvent(rawEvent = {}) {
    const event = rawEvent || {};
    const info = classifyTraceEvent(event);
    const now = Date.now();
    if (isDuplicateTerminalTraceEvent(event, info, now)) return;
    let previous = traceEvents[traceEvents.length - 1]?.timestamp || now;
    if (event.type === 'llm_raw_snapshot') {
        upsertReasoningTraceFromRawSnapshot(event, now);
        previous = traceEvents[traceEvents.length - 1]?.timestamp || now;
    }
    updateTraceState(event, info);
    updateDerivedLlmPulse(event, info);
    renderMetrics(latestSystemData || {});
    if (mergeStreamingTraceEvent(event, info, now)) {
        renderTraceInspector();
        renderTraceTimeline();
        drawTraceGraph();
        if (modal?.style.display === 'flex') renderTraceConsole(activeTraceConsoleTab);
        return;
    }
    if (mergeFileOutputTraceEvent(event, info, now)) {
        renderTraceInspector();
        renderTraceTimeline();
        drawTraceGraph();
        if (modal?.style.display === 'flex') renderTraceConsole(activeTraceConsoleTab);
        return;
    }
    if (mergeToolChainTraceEvent(event, info, now)) {
        renderTraceInspector();
        renderTraceTimeline();
        drawTraceGraph();
        if (modal?.style.display === 'flex') renderTraceConsole(activeTraceConsoleTab);
        return;
    }
    traceEvents.push({
        id: `trace-${++traceEventSeq}`,
        timestamp: now,
        startedAt: now,
        lastSeen: now,
        chunks: 1,
        time: new Date(now).toLocaleTimeString(),
        delta: traceEvents.length ? `+${((now - previous) / 1000).toFixed(1)}s` : '+0.0s',
        kind: info.kind,
        agent: eventAgent(event),
        summary: summarizeTraceEvent(event, info),
        className: info.className || '',
        raw: event,
        rawChunks: ['Reasoning', 'Streaming', 'File Output'].includes(info.kind) ? [event] : [],
    });
    while (traceEvents.length > TRACE_LIMIT) traceEvents.shift();
    pruneTraceRawOpenKeys();
    renderTraceInspector();
    renderTraceTimeline();
    drawTraceGraph();
    if (modal?.style.display === 'flex') renderTraceConsole(activeTraceConsoleTab);
}

function clearTraceEvents() {
    traceEvents.length = 0;
    traceRawOpenKeys.clear();
    traceState.activeAgent = '--';
    traceState.lastKind = '--';
    traceState.activeNode = '';
    traceState.plans = 0;
    traceState.tools = 0;
    traceState.memory = 0;
    traceState.policy = 0;
    traceState.interrupts = 0;
    traceState.orchestrationMode = '--';
    traceState.orchestrationPhase = '--';
    traceState.orchestrationTurn = 0;
    traceState.live = false;
    traceState.seenNodes = new Set(['User', 'Agent', 'Reasoning', 'Final']);
    traceState.seenEdges = new Set(['User>Agent']);
    traceState.nodePulse = {};
    renderTraceInspector();
    renderTraceTimeline();
    drawTraceGraph();
    if (modal?.style.display === 'flex') renderTraceConsole(activeTraceConsoleTab);
}

function bindTraceEventStream() {
    bindTraceInteractionGuard();
    renderTraceInspector();
    renderTraceTimeline();
    drawTraceGraph();
    if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('locallm_agent_events');
        channel.onmessage = event => handleTraceEvent(event.data || {});
    }
}

// --- Background Animation (Simple Particles) ---
        const bgCanvas = document.getElementById('bg-canvas');
        const ctx = bgCanvas.getContext('2d');
        let width, height;
        let particles = [];

        function resizeBg() {
            width = window.innerWidth;
            height = window.innerHeight;
            bgCanvas.width = width;
            bgCanvas.height = height;
        }

        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.4;
                this.vy = (Math.random() - 0.5) * 0.4;
                this.size = Math.random() * 2 + 1;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > width) this.vx *= -1;
                if (this.y < 0 || this.y > height) this.vy *= -1;
            }
            draw() {
                ctx.fillStyle = 'rgba(230, 154, 85, 0.44)';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function drawLines() {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    let dx = particles[i].x - particles[j].x;
                    let dy = particles[i].y - particles[j].y;
                    let dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 120) { // 연결 거리 설정
                        ctx.strokeStyle = `rgba(230, 154, 85, ${0.14 * (1 - dist/120)})`;
                        ctx.lineWidth = 0.8;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
        }

        function initBg() {
            resizeBg();
            particles = [];
            for(let i=0; i<80; i++) particles.push(new Particle());
            animateBg();
        }

        function animateBg() {
            ctx.clearRect(0, 0, width, height);
            particles.forEach(p => { 
                p.update(); 
                p.draw(); 
            });
            drawLines();
            requestAnimationFrame(animateBg);
        }
        window.addEventListener('resize', resizeBg);
        initBg();

        // --- Neural Modal & Graph Logic (Vanilla JS Force-Directed Graph) ---
        const modal = document.getElementById('neuralModal');
        let graphAnimationId = null; // Track animation frame for cleanup

        function openNeuralModal() {
            modal.style.display = 'flex';
            renderGraph(); 
        }

        function closeNeuralModal() {
            modal.style.display = 'none';
            // Stop rendering loop to save CPU when modal is closed
            if (graphAnimationId) {
                cancelAnimationFrame(graphAnimationId);
                graphAnimationId = null;
            }
        }

        async function fetchGraphData() {
            try {
                const runtime = latestSystemData?.system || {};
                const llm = latestSystemData?.llm || {};
                const nodes = [];
                const links = [];
                
                nodes.push({ id: 'Root', label: 'LOCALLM Core', group: 1 });
                nodes.push({ id: 'LLM', label: `${llm.last_engine || 'LLM'}\n${Number(llm.total_tokens || 0).toLocaleString()} tok`, group: 2 });
                nodes.push({ id: 'Memory', label: `Memory\n${Number(runtime.memory_entries || 0).toLocaleString()} nodes`, group: 3 });
                nodes.push({ id: 'STM', label: `STM\n${Number(runtime.stm_entries || 0).toLocaleString()} turns`, group: 3 });
                nodes.push({ id: 'Process', label: `Process\n${runtime.process_memory_mb || 0} MB`, group: 4 });
                nodes.push({ id: 'SystemRAM', label: `RAM\n${runtime.memory_percent || 0}%`, group: 4 });
                nodes.push({ id: 'Latency', label: `Latency\n${latestSystemData?.metrics?.["LATENCY (PING)"]?.value || '--'}`, group: 5 });

                links.push({ source: 'Root', target: 'LLM' });
                links.push({ source: 'Root', target: 'Memory' });
                links.push({ source: 'Memory', target: 'STM' });
                links.push({ source: 'Root', target: 'Process' });
                links.push({ source: 'Process', target: 'SystemRAM' });
                links.push({ source: 'LLM', target: 'Latency' });
                links.push({ source: 'LLM', target: 'Memory' });
                
                return { nodes, links };
            } catch (e) {
                console.error("Graph fetch failed", e);
                return { nodes: [], links: [] };
            }
        }

        function renderGraph() {
            const container = document.getElementById('graph-canvas');
            container.innerHTML = ''; 
            
            const width = container.clientWidth;
            const height = container.clientHeight;

            // Create Canvas element instead of SVG
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            container.appendChild(canvas);
            const ctx = canvas.getContext('2d');

            fetchGraphData().then(data => {
                if (data.nodes.length === 0) return;

                // Initialize Node properties for physics simulation
                const nodes = data.nodes.map(n => ({
                    ...n,
                    x: width / 2 + (Math.random() - 0.5) * 100, // Spawn near center
                    y: height / 2 + (Math.random() - 0.5) * 100,
                    vx: 0, vy: 0,
                    radius: n.group === 1 ? 20 : (n.group === 2 ? 15 : 8),
                    color: n.group === 1 ? '#e69a55' : (n.group === 2 ? '#90a86f' : (n.group === 3 ? '#86a965' : (n.group === 4 ? '#aaa497' : '#e4aa5d'))),
                    fontSize: n.group === 1 ? 12 : 10,
                    textOffset: n.group === 1 ? 30 : (n.group === 2 ? 25 : 15)
                }));

                // Map link source/target strings to actual Node object references
                const links = data.links.map(l => ({
                    source: nodes.find(n => n.id === l.source),
                    target: nodes.find(n => n.id === l.target)
                })).filter(l => l.source && l.target); // Ensure valid connections

                let draggedNode = null;

                // Physics Engine Parameters
                const REPULSION = 10000;
                const SPRING_LENGTH = 100;
                const SPRING_STRENGTH = 0.05;
                const DAMPING = 0.85;
                const GRAVITY = 0.02;

                function applyPhysics() {
                    // 1. Repulsion force between all nodes (Coulomb's law)
                    for (let i = 0; i < nodes.length; i++) {
                        for (let j = i + 1; j < nodes.length; j++) {
                            let dx = nodes[j].x - nodes[i].x;
                            let dy = nodes[j].y - nodes[i].y;
                            let distSq = dx * dx + dy * dy;
                            if (distSq === 0) distSq = 0.01;
                            
                            let dist = Math.sqrt(distSq);
                            let force = REPULSION / distSq;
                            
                            let fx = (dx / dist) * force;
                            let fy = (dy / dist) * force;
                            
                            nodes[i].vx -= fx; nodes[i].vy -= fy;
                            nodes[j].vx += fx; nodes[j].vy += fy;
                        }
                    }

                    // 2. Attraction force from links (Hooke's law - Springs)
                    links.forEach(link => {
                        let dx = link.target.x - link.source.x;
                        let dy = link.target.y - link.source.y;
                        let dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist === 0) dist = 0.01;
                        
                        let force = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
                        let fx = (dx / dist) * force;
                        let fy = (dy / dist) * force;
                        
                        link.source.vx += fx; link.source.vy += fy;
                        link.target.vx -= fx; link.target.vy -= fy;
                    });

                    // 3. Gravity force (Pull to center)
                    const cx = width / 2;
                    const cy = height / 2;
                    nodes.forEach(node => {
                        node.vx += (cx - node.x) * GRAVITY;
                        node.vy += (cy - node.y) * GRAVITY;
                        
                        // Apply velocity and Damping
                        if (node !== draggedNode) {
                            node.x += node.vx;
                            node.y += node.vy;
                        }
                        node.vx *= DAMPING;
                        node.vy *= DAMPING;
                    });
                }

                function draw() {
                    ctx.clearRect(0, 0, width, height);

                    // Draw Links
                    ctx.strokeStyle = "rgba(85, 85, 85, 0.6)";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    links.forEach(link => {
                        ctx.moveTo(link.source.x, link.source.y);
                        ctx.lineTo(link.target.x, link.target.y);
                    });
                    ctx.stroke();

                    // Draw Nodes and Labels
                    nodes.forEach(node => {
                        ctx.fillStyle = node.color;
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
                        ctx.fill();

                        const light = document.body.classList.contains('light-theme');
                        ctx.fillStyle = light ? "#020617" : "#e0f7fa";
                        ctx.font = `${light ? 800 : 700} ${node.fontSize}px 'Courier New', Courier, monospace`;
                        ctx.textAlign = "center";
                        String(node.label).split('\n').forEach((line, idx) => {
                            ctx.fillText(line, node.x, node.y + node.textOffset + (idx * (node.fontSize + 2)));
                        });
                    });
                }

                function tick() {
                    applyPhysics();
                    draw();
                    graphAnimationId = requestAnimationFrame(tick);
                }

                // --- Mouse Event Handling for Dragging ---
                canvas.addEventListener('mousedown', (e) => {
                    const rect = canvas.getBoundingClientRect();
                    const mx = e.clientX - rect.left;
                    const my = e.clientY - rect.top;

                    // Find nearest node
                    for (let node of nodes) {
                        const dx = node.x - mx;
                        const dy = node.y - my;
                        if (dx * dx + dy * dy < (node.radius + 5) ** 2) {
                            draggedNode = node;
                            break;
                        }
                    }
                });

                canvas.addEventListener('mousemove', (e) => {
                    if (draggedNode) {
                        const rect = canvas.getBoundingClientRect();
                        draggedNode.x = e.clientX - rect.left;
                        draggedNode.y = e.clientY - rect.top;
                        draggedNode.vx = 0; // Reset velocity to prevent snapping
                        draggedNode.vy = 0;
                    }
                });

                const endDrag = () => { draggedNode = null; };
                canvas.addEventListener('mouseup', endDrag);
                canvas.addEventListener('mouseleave', endDrag);

                // Start rendering loop
                tick();
            });
        }

function renderMetrics(systemData = {}) {
    const metrics = systemData.metrics || {};
    const runtime = systemData.system || {};
    const rawLlm = systemData.llm || {};
    const llm = {
        ...derivedLlmPulse,
        ...rawLlm,
        requests: Math.max(Number(rawLlm.requests || 0), Number(derivedLlmPulse.requests || 0)),
        completion_tokens: Math.max(Number(rawLlm.completion_tokens || 0), Number(derivedLlmPulse.completion_tokens || 0)),
        total_tokens: Math.max(Number(rawLlm.total_tokens || 0), Number(derivedLlmPulse.total_tokens || 0), Number(rawLlm.prompt_tokens || 0) + Number(rawLlm.completion_tokens || 0)),
        last_completion_tokens: Number(rawLlm.last_completion_tokens || 0) || Number(derivedLlmPulse.last_completion_tokens || 0),
        last_latency_ms: Number(rawLlm.last_latency_ms || 0) || Number(derivedLlmPulse.last_latency_ms || 0),
        last_tokens_per_second: Number(rawLlm.last_tokens_per_second || 0) || Number(derivedLlmPulse.last_tokens_per_second || 0),
        active: Boolean(rawLlm.active || derivedLlmPulse.active),
        active_completion_tokens: Number(rawLlm.active_completion_tokens || 0) || Number(derivedLlmPulse.active_completion_tokens || 0),
        active_tokens_per_second: Number(rawLlm.active_tokens_per_second || 0) || Number(derivedLlmPulse.active_tokens_per_second || 0),
    };

    const updateMetric = (id, data) => {
        const el = document.getElementById(id);
        if (!el || !data) return;
        if (el.textContent !== data.value) {
            el.textContent = data.value;
            el.style.color = data.color;
        }
    };
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    const setBar = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.style.width = `${Math.max(0, Math.min(100, Number(value || 0)))}%`;
    };
    const fmt = value => Number(value || 0).toLocaleString();
    const promptCacheState = () => {
        const cached = Number(llm.active_cached_prompt_tokens || llm.last_cached_prompt_tokens || 0);
        const enabled = !!llm.last_prompt_cache_enabled;
        const supported = !!llm.last_prompt_cache_supported;
        const stepKvMode = !!llm.last_step_kv_cache_mode;
        if (llm.last_prompt_cache_hit || cached > 0) return `HIT (${fmt(cached)} tok)`;
        if (!enabled && stepKvMode) return 'MODE ON / PROVIDER N/A';
        if (!enabled) return 'OFF';
        if (!supported) return 'N/A';
        return `MISS (${fmt(llm.prompt_cache_hits || 0)}/${fmt(llm.prompt_cache_misses || 0)})`;
    };
    const cpuValue = parseFloat(String(metrics["CPU LOAD"]?.value || "0").replace("%", "")) || 0;
    const ramValue = Number(runtime.memory_percent || 0);

    updateMetric('cpu-val', metrics["CPU LOAD"]);
    updateMetric('lat-val', metrics["LATENCY (PING)"]);
    setText('proc-mem-card', metrics["PROCESS MEMORY"]?.value || '-- MB');
    setText('system-memory-percent', `${runtime.memory_percent ?? '--'}%`);
    setText('node-count-display', fmt(runtime.memory_entries));
    setText('stm-count', fmt(runtime.stm_entries));
    setText('llm-token-total', fmt(llm.total_tokens));
    setText('llm-requests', fmt(llm.requests));
    setText('llm-prompt-tokens', fmt(llm.prompt_tokens));
    setText('llm-cached-prompt-tokens', fmt(llm.cached_prompt_tokens));
    setText('llm-prompt-cache-state', promptCacheState());
    setText('llm-completion-tokens', fmt(llm.completion_tokens));
    setText('llm-last-engine', llm.last_engine || '--');
    setText('llm-last-model', llm.last_model || '--');
    setText('llm-last-latency', `${fmt(llm.last_latency_ms)} ms`);
    setText('llm-live-status', llm.active ? 'STREAMING' : 'IDLE');
    setText('llm-live-tokens', fmt(llm.active_completion_tokens));
    setText('llm-live-prompt-tps', `${Number(llm.active_prompt_tokens_per_second || 0).toLocaleString()} tok/s`);
    setText('llm-live-tps', `${Number(llm.active_tokens_per_second || 0).toLocaleString()} tok/s`);
    setText('llm-last-tps', `${Number(llm.last_tokens_per_second || 0).toLocaleString()} tok/s`);
    setText('llm-last-pp-tps', `${Number(llm.last_pp_tokens_per_second || 0).toLocaleString()} tok/s`);
    setText('cpu-percent-inline', `${cpuValue.toFixed(1)}%`);
    setText('ram-percent-inline', `${ramValue}%`);
    setBar('cpu-bar', cpuValue);
    setBar('ram-bar', ramValue);
    setText(
        'runtime-summary',
        `RAM ${runtime.memory_used_gb ?? '--'} / ${runtime.memory_total_gb ?? '--'} GB · Process ${runtime.process_memory_mb ?? '--'} MB`
    );
    setText('runtime-health', cpuValue < 80 && ramValue < 80 ? 'NORMAL' : 'HIGH LOAD');
}

async function syncMetrics() {
    if (metricsSyncStopped || metricsSyncInFlight) return;
    metricsSyncInFlight = true;
    try {
        const bridgeReady = await waitForDesktopBridge();
        if (!bridgeReady) {
            setText('runtime-summary', 'Runtime bridge not ready');
            return;
        }
        latestSystemData = await apiRequest('GET', '/api/system_metrics');
        if (metricsSyncStopped) return;
        renderMetrics(latestSystemData);
    } catch (error) {
        console.error("Metric sync failed:", error);
        setText('runtime-summary', `Runtime load failed: ${error?.message || error}`);
    } finally {
        metricsSyncInFlight = false;
    }
}

function stopMetricsSync() {
    metricsSyncStopped = true;
    if (metricsSyncTimer) {
        clearInterval(metricsSyncTimer);
        metricsSyncTimer = null;
    }
}

function startMetricsSync() {
    if (metricsSyncTimer || metricsSyncStopped) return;
    syncMetrics();
    metricsSyncTimer = setInterval(syncMetrics, 1200);
}

bindThemeSync();
bindTraceEventStream();
window.addEventListener('resize', drawTraceGraph);
window.addEventListener('DOMContentLoaded', () => setTimeout(startMetricsSync, 50));
setTimeout(startMetricsSync, 250);
window.addEventListener('pagehide', stopMetricsSync);
window.addEventListener('beforeunload', stopMetricsSync);
