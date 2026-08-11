// Demo event feeder for the static product site.
// Replays a real-looking run directly inside the embedded System Graph page.
//
// IMPORTANT:
// This file intentionally does NOT use BroadcastChannel. The product demo is
// frequently opened through file://, where BroadcastChannel may be blocked or
// isolated by the browser. Because demo_feed.js and system_graph.js execute in
// the same document, trace events are delivered straight to handleTraceEvent().
(function () {
    'use strict';

    const AGENT = {
        agent_name: 'SPECTRA',
        agent_label: 'SPECTRA@local-01',
        agent_id: 'local-01',
        cid: 'local-01',
    };

    const pendingTraceEvents = [];
    let currentRunId = '';

    function traceHandler() {
        // `handleTraceEvent` is declared by system_graph.js in the same document.
        // The typeof guard is safe even while that script is still booting.
        if (typeof handleTraceEvent === 'function') return handleTraceEvent;
        if (typeof window.handleTraceEvent === 'function') return window.handleTraceEvent;
        return null;
    }

    function dispatchTraceEvent(payload = {}) {
        const event = {
            ...AGENT,
            run_id: payload.run_id || currentRunId,
            demo_replay: true,
            ...payload,
        };
        const handler = traceHandler();
        if (!handler) {
            pendingTraceEvents.push(event);
            return false;
        }
        try {
            handler(event);
            return true;
        } catch (error) {
            console.error('[SYSTEM GRAPH DEMO] handleTraceEvent failed:', error, event);
            return false;
        }
    }

    function flushPendingTraceEvents() {
        const handler = traceHandler();
        if (!handler) return false;
        while (pendingTraceEvents.length) {
            const event = pendingTraceEvents.shift();
            try {
                handler(event);
            } catch (error) {
                console.error('[SYSTEM GRAPH DEMO] queued event failed:', error, event);
            }
        }
        return true;
    }

    async function waitForTraceHandler(timeoutMs = 12000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            if (flushPendingTraceEvents()) return true;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.error('[SYSTEM GRAPH DEMO] handleTraceEvent() was not found. Load system_graph.js before demo_feed.js.');
        return false;
    }

    const send = payload => dispatchTraceEvent(payload);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const jitter = (base, spread) => base + Math.round((Math.random() - 0.5) * spread);

    // ── Fake runtime metrics (Runtime Load + LLM Pulse panels) ──────────
    const llmState = {
        requests: 18,
        prompt_tokens: 96_420,
        cached_prompt_tokens: 88_130,
        completion_tokens: 14_380,
        streaming: false,
        activeTokens: 0,
    };

    function fakeSystemData() {
        const cpu = llmState.streaming ? jitter(46, 14) : jitter(14, 8);
        const ram = jitter(58, 4);
        return {
            metrics: {
                'CPU LOAD': { value: `${cpu}%`, color: '#9ae6b4' },
                'LATENCY (PING)': { value: `${jitter(9, 6)} ms`, color: '#9ae6b4' },
                'PROCESS MEMORY': { value: `${jitter(1240, 90)} MB`, color: '#9ae6b4' },
            },
            system: {
                memory_percent: ram,
                memory_used_gb: (ram * 0.32).toFixed(1),
                memory_total_gb: '32.0',
                process_memory_mb: jitter(1240, 90),
                memory_entries: 128,
                stm_entries: 3,
            },
            llm: {
                requests: llmState.requests,
                prompt_tokens: llmState.prompt_tokens,
                cached_prompt_tokens: llmState.cached_prompt_tokens,
                completion_tokens: llmState.completion_tokens,
                total_tokens: llmState.prompt_tokens + llmState.completion_tokens,
                last_engine: 'LOCAL_SERVER',
                last_model: 'gemma4-26b-local',
                last_latency_ms: jitter(420, 120),
                last_tokens_per_second: 41.6,
                last_pp_tokens_per_second: 512.4,
                last_prompt_cache_enabled: true,
                last_prompt_cache_supported: true,
                last_prompt_cache_hit: true,
                last_cached_prompt_tokens: llmState.cached_prompt_tokens,
                active: llmState.streaming,
                active_completion_tokens: llmState.activeTokens,
                active_tokens_per_second: llmState.streaming ? jitter(42, 6) : 0,
                active_prompt_tokens_per_second: llmState.streaming ? 0 : 0,
            },
        };
    }

    function pushMetrics() {
        try {
            if (typeof renderMetrics !== 'function') return;
            const data = fakeSystemData();
            if (typeof latestSystemData !== 'undefined') latestSystemData = data;
            renderMetrics(data);
        } catch (_) { /* demo only */ }
    }

    // ── Scripted turns ──────────────────────────────────────────────────
    const SCENARIOS = [
        {
            prompt: 'Analyze the uploaded files and build a technical report.',
            reasoning: 'The user wants a technical report from the workspace files. I should inspect the sources first, compare the findings, then write report.md and verify the rendered output.',
            planText: 'Inspect the uploaded sources, compose report.md, then verify the render.',
            toolLabel: 'pipeline(file_read => file_write => web_view_tool)',
            action: 'pipeline',
            fileName: 'report.md',
            stream: 'Here is the technical report. The workspace contains three source documents covering the runtime architecture. Key findings: the agent loop coordinates planner, tools, and memory through a step ledger...',
            final: 'Technical report generated at /workspace/output/report.md — 3 sources analyzed, 5 sections, render verified.',
        },
        {
            prompt: 'Search the web for today\'s AI news and summarize it.',
            reasoning: 'A news brief needs fresh evidence. I will run two parallel web searches, read the top results, and compose a sourced summary.',
            planText: 'Run parallel web searches, read top pages, then summarize with sources.',
            toolLabel: 'batch(websurfing, websurfing)',
            action: 'batch',
            fileName: null,
            stream: 'Today\'s AI briefing: local inference keeps accelerating — new quantization work brings 30B-class models to consumer laptops, while agent frameworks converge on observable tool protocols...',
            final: 'AI news brief delivered — 6 stories from 4 sources, all page-read verified.',
        },
        {
            prompt: 'Write a monte-carlo portfolio simulation and chart the result.',
            reasoning: 'This needs the analysis tool with chart output. One tool call produces the distribution and the PNG; then I report the percentiles.',
            planText: 'Run monte_karlo_analysis with chart=true and summarize percentiles.',
            toolLabel: 'monte_karlo_analysis',
            action: 'monte_karlo_analysis',
            fileName: 'portfolio_simulation.png',
            stream: 'Simulation complete. 10,000 paths over 252 trading days: median terminal value +8.4%, 5th percentile -11.2%, 95th percentile +31.7%. Chart saved...',
            final: 'Monte-carlo simulation finished — chart written to portfolio_simulation.png, percentiles reported.',
        },
    ];

    async function playTurn(scenario, turnIndex) {
        currentRunId = `demo-run-${Date.now()}-${turnIndex + 1}`;
        llmState.requests += 1;

        // Keep one replay visible at a time. clearTraceEvents() is part of the
        // real System Graph page; it clears the old timeline and extra graph
        // branches before this run rebuilds the connection network.
        try {
            if (typeof clearTraceEvents === 'function') clearTraceEvents();
        } catch (error) {
            console.warn('[SYSTEM GRAPH DEMO] trace reset skipped:', error);
        }
        await sleep(350);

        // Canonical connection starts here: User -> Agent.
        send({ type: 'user_submit', content: scenario.prompt, step: 0 });
        await sleep(700);

        send({ type: 'start', content: 'Agent run started.', step: 0 });
        await sleep(500);

        send({
            type: 'memory_trace',
            memory_trace: {
                passive_recall: 'hit',
                recall_profile: turnIndex === 0 ? 'boot' : 'passive',
                ltm_count: 5, stm_count: 3, graph_count: 4, refs_count: 2,
                graph_link_count: 4,
                recall_expansion_enabled: true,
                warm_context: true,
            },
        });
        await sleep(800);

        send({
            type: 'agent_policy',
            agent_policy: {
                memory_policy: { recall: 'auto' },
                tool_execution_policy: { permission_mode: 'ask_when_needed' },
                evidence_policy: { require_observation: true },
                response_policy: { think_mode: true },
                active_learning_policy: { propose: true },
            },
        });
        await sleep(900);

        // Agent -> Planner. The planner node and edge appear before reasoning.
        send({ type: 'plan', action: 'respond', content: scenario.planText, step: 1 });
        await sleep(700);

        // Planner -> Reasoning. Chunks repeatedly pulse the reasoning node so the
        // visitor can see the run moving through the graph rather than receiving
        // a completed graph all at once.
        const reasonParts = scenario.reasoning.match(/.{1,60}(\s|$)/g) || [scenario.reasoning];
        let reasonSoFar = '';
        for (const part of reasonParts) {
            reasonSoFar += part;
            send({
                type: 'reasoning_preview',
                delta: part,
                content: part,
                full_content: reasonSoFar,
                reasoning_stream: true,
                step: 'Step 1/20',
            });
            await sleep(jitter(340, 160));
        }
        await sleep(500);

        send({ type: 'system', content: `🎯 [Step 2/20] Action: ${scenario.action}` });
        await sleep(400);
        send({
            type: 'plan',
            action: scenario.action,
            content: scenario.planText,
            tool_label: scenario.toolLabel,
            step: 2,
        });
        await sleep(1500);

        if (scenario.fileName) {
            const body = '# Generated artifact\n\nStreaming file content from the tool pipeline...';
            for (let i = 0; i < 4; i += 1) {
                send({ type: 'file_write_stream', file_name: scenario.fileName, content: body, chunk_index: i });
                await sleep(jitter(420, 180));
            }
            send({ type: 'system', content: `FILE WRITE SUMMARY | ${scenario.fileName} | success=1 errors=0` });
            await sleep(700);
        }

        // Reasoning -> Streaming -> Final. This completes the main visible
        // connection path: User -> Agent -> Planner -> Reasoning -> Streaming -> Final.
        // LLM Pulse remains ACTIVE while chunk events are replayed.
        llmState.streaming = true;
        llmState.activeTokens = 0;
        const streamParts = scenario.stream.match(/.{1,48}(\s|$)/g) || [scenario.stream];
        for (const part of streamParts) {
            llmState.activeTokens += Math.round(part.length / 4);
            send({ type: 'chunk', content: part });
            pushMetrics();
            await sleep(jitter(300, 140));
        }
        llmState.streaming = false;
        llmState.completion_tokens += llmState.activeTokens;
        llmState.prompt_tokens += jitter(3400, 600);
        llmState.cached_prompt_tokens += jitter(3100, 400);
        llmState.activeTokens = 0;

        send({ type: 'final', content: scenario.final });
        await sleep(500);
        send({ type: 'system', content: `Warm memory buffered (${(turnIndex % 8) + 1}/8 turns). LTM commit is deferred until idle or threshold.` });
        await sleep(300);
        send({ type: 'end' });
        pushMetrics();
    }

    async function demoLoop() {
        let turn = 0;
        // Small initial pause so the page finishes its own boot renders.
        await sleep(1200);
        for (;;) {
            await playTurn(SCENARIOS[turn % SCENARIOS.length], turn);
            turn += 1;
            await sleep(6000);
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(async () => {
            const ready = await waitForTraceHandler();
            if (!ready) return;

            try { if (typeof stopMetricsSync === 'function') stopMetricsSync(); } catch (_) {}
            // The full-screen particle background is decorative and expensive
            // inside a scaled iframe embed — disable it for the demo.
            try {
                if (Array.isArray(particles)) particles.length = 0;
                const bg = document.getElementById('bg-canvas');
                if (bg) { bg.style.display = 'none'; bg.width = 2; bg.height = 2; }
            } catch (_) {}
            pushMetrics();
            setInterval(pushMetrics, 1400);
            demoLoop();
        }, 300);
    });
})();