/**
 * AI Service Module
 * Handles all AI integration with LM Studio and Ollama
 */

import { StorageService } from './storage.js';

export const AIService = {
    settings: StorageService.loadAISettings(),
    connected: false,
    availableModels: [],

    /**
     * Parse host input and build normalized connection config.
     * Accepts full URLs (http://127.0.0.1:1234), hostnames, or host:port.
     */
    normalizeConnectionSettings(hostInput, portInput, platform = this.settings.platform) {
        let rawHost = String(hostInput || '').trim();
        const fallbackPort = platform === 'lmstudio' ? 1234 : 11434;
        let parsedPort = Number.parseInt(portInput, 10);

        if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
            parsedPort = fallbackPort;
        }

        if (!rawHost) {
            rawHost = '127.0.0.1';
        }

        // Allow users to paste full URLs into the host field.
        if (rawHost.startsWith('http://') || rawHost.startsWith('https://')) {
            try {
                const parsedUrl = new URL(rawHost);
                const parsedHost = parsedUrl.hostname;
                const parsedUrlPort = Number.parseInt(parsedUrl.port, 10);

                if (parsedHost) {
                    rawHost = parsedHost;
                }
                if (Number.isInteger(parsedUrlPort) && parsedUrlPort >= 1 && parsedUrlPort <= 65535) {
                    parsedPort = parsedUrlPort;
                }
            } catch (error) {
                throw new Error('Host URL is invalid. Example: http://127.0.0.1:1234');
            }
        } else {
            // Support compact "host:port" values.
            const hostPortMatch = rawHost.match(/^([^/:\s]+):(\d{1,5})$/);
            if (hostPortMatch) {
                rawHost = hostPortMatch[1];
                const embeddedPort = Number.parseInt(hostPortMatch[2], 10);
                if (Number.isInteger(embeddedPort) && embeddedPort >= 1 && embeddedPort <= 65535) {
                    parsedPort = embeddedPort;
                }
            }
        }

        if (!/^[a-zA-Z0-9.-]+$/.test(rawHost)) {
            throw new Error('Host contains invalid characters.');
        }

        const protocol = rawHost === 'localhost' || rawHost === '127.0.0.1' || rawHost === '0.0.0.0' ? 'http' : 'https';
        return {
            host: rawHost,
            port: parsedPort,
            protocol,
            baseURL: `${protocol}://${rawHost}:${parsedPort}`
        };
    },

    /**
     * Get the base URL for the AI service
     */
    getBaseURL() {
        const normalized = this.normalizeConnectionSettings(
            this.settings.host,
            this.settings.port,
            this.settings.platform
        );
        return normalized.baseURL;
    },

    /**
     * Check connection status
     */
    async checkConnection() {
        try {
            const endpoint = this.settings.platform === 'lmstudio' ? '/v1/models' : '/api/tags';
            const response = await fetch(`${this.getBaseURL()}${endpoint}`, { method: 'GET' });
            this.connected = response.ok;
            
            if (this.connected) {
                await this.loadAvailableModels();
            }
        } catch (error) {
            this.connected = false;
        }
        return this.connected;
    },

    /**
     * Load available models
     */
    async loadAvailableModels() {
        try {
            const endpoint = this.settings.platform === 'lmstudio' ? '/v1/models' : '/api/tags';
            const response = await fetch(`${this.getBaseURL()}${endpoint}`);
            
            if (response.ok) {
                const data = await response.json();
                if (this.settings.platform === 'lmstudio') {
                    this.availableModels = data.data || [];
                } else {
                    this.availableModels = data.models || [];
                }
            }
        } catch (error) {
            console.error('Error loading models:', error);
            this.availableModels = [];
        }
    },

    /**
     * Get first available model or custom selected
     */
    getActiveModel() {
        if (this.settings.model !== 'auto' && this.settings.model) {
            return this.settings.model;
        }
        
        if (this.availableModels.length > 0) {
            const firstModel = this.availableModels[0];
            if (typeof firstModel === 'string') return firstModel;
            return firstModel.id || firstModel.name || null;
        }
        
        return null;
    },

    /**
     * Update settings
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        StorageService.saveAISettings(this.settings);
    },

    /**
     * Test connection with current settings
     */
    async testConnection(host, port, platform) {
        try {
            const normalized = this.normalizeConnectionSettings(host, port, platform);
            const endpoint = platform === 'lmstudio' ? '/v1/models' : '/api/tags';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${normalized.baseURL}${endpoint}`, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            return {
                success: response.ok,
                status: response.status,
                baseURL: normalized.baseURL,
                host: normalized.host,
                port: normalized.port,
                message: response.ok
                    ? 'Connection successful.'
                    : `Service responded with HTTP ${response.status}.`
            };
        } catch (error) {
            const isTimeout = error.name === 'AbortError';
            const isNetworkFetchError = error.message === 'Failed to fetch';
            const likelyLocalCorsIssue = isNetworkFetchError &&
                (String(host || '').includes('localhost') || String(host || '').includes('127.0.0.1'));
            return {
                success: false,
                status: null,
                baseURL: null,
                host: null,
                port: null,
                message: isTimeout
                    ? 'Connection timed out after 5 seconds.'
                    : likelyLocalCorsIssue
                        ? 'Browser blocked the request (likely CORS). In LM Studio, enable CORS/Local API browser access, then retry.'
                        : (error.message || 'Connection failed.')
            };
        }
    },

    /**
     * Call AI with prompt
     */
    async callAI(prompt, maxTokens = 500) {
        if (!this.connected) {
            throw new Error('AI service is not connected. Configure settings first.');
        }

        try {
            const endpoint = this.settings.platform === 'lmstudio' ? '/v1/chat/completions' : '/api/chat';
            const baseURL = this.getBaseURL();
            
            let body, headers;
            
            if (this.settings.platform === 'lmstudio') {
                const activeModel = this.getActiveModel();
                if (!activeModel) {
                    throw new Error('No LM Studio model is available. Load a model in LM Studio, then test connection again.');
                }

                body = JSON.stringify({
                    model: activeModel,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: maxTokens,
                    temperature: 0.7
                });
            } else {
                body = JSON.stringify({
                    model: this.getActiveModel(),
                    messages: [{ role: 'user', content: prompt }],
                    stream: false
                });
            }

            headers = { 'Content-Type': 'application/json' };

            const response = await fetch(`${baseURL}${endpoint}`, {
                method: 'POST',
                headers,
                body
            });

            if (!response.ok) {
                let errorDetails = '';
                try {
                    const errorBody = await response.json();
                    errorDetails = errorBody?.error?.message || errorBody?.message || JSON.stringify(errorBody);
                } catch (readError) {
                    // Ignore parse failures and fallback to status-only error.
                }
                throw new Error(
                    errorDetails
                        ? `API error: ${response.status} - ${errorDetails}`
                        : `API error: ${response.status}`
                );
            }

            const data = await response.json();
            
            if (this.settings.platform === 'lmstudio') {
                const lmChoice = data?.choices?.[0];
                let content = lmChoice?.message?.content
                    ?? lmChoice?.message?.reasoning_content
                    ?? lmChoice?.delta?.content
                    ?? lmChoice?.text
                    ?? data?.response
                    ?? null;

                // Some providers return content as an array of content blocks.
                if (Array.isArray(content)) {
                    content = content
                        .map(block => block?.text || block?.content || '')
                        .filter(Boolean)
                        .join('\n');
                }

                if (typeof content === 'string' && content.trim()) {
                    return content.trim();
                }

                const fallbackReasoning = lmChoice?.message?.reasoning_content;
                if (typeof fallbackReasoning === 'string' && fallbackReasoning.trim()) {
                    return fallbackReasoning.trim();
                }

                throw new Error('LM Studio returned an empty response. Try a chat/instruct model instead of an embedding model.');
            }

            const ollamaContent = data?.message?.content || data?.response || '';
            if (typeof ollamaContent === 'string' && ollamaContent.trim()) {
                return ollamaContent.trim();
            }
            throw new Error('Ollama returned an empty response.');
        } catch (error) {
            console.error('AI Service error:', error);
            if (error && error.message === 'Failed to fetch') {
                throw new Error('Browser could not reach the local AI API (likely CORS). Enable CORS/browser access in LM Studio Local Server settings.');
            }
            throw error;
        }
    },

    /**
     * Canon guardrail instruction for all analyses.
     */
    getCanonGuardrail(storyData) {
        const canon = {
            characters: (storyData?.characters || []).filter(c => c && c.isCanon).map(c => ({
                id: c.id, name: c.name, type: c.type, role: c.role, background: c.background
            })),
            timelineEvents: (storyData?.events || []).filter(e => e && e.isCanon).map(e => ({
                id: e.id, title: e.title, beat: e.beat, period: e.period, location: e.location || '', description: e.description
            })),
            workItems: (storyData?.workItems || []).filter(w => w && w.isCanon).map(w => ({
                id: w.id, title: w.title, category: w.category
            }))
        };

        return `IMPORTANT: Items marked with isCanon: true are OFFICIAL canon and must never be contradicted, deleted, or overwritten.
Treat them as absolute truth for this C-drama story.
Any new suggestions must be marked as draft (isCanon: false) and clearly labeled as such.

CANON (absolute truth):
${JSON.stringify(canon, null, 2)}`;
    },

    /**
     * Heuristic: portal ↔ metropolis / palace era-shift (matches interactive map dashed jumps).
     */
    ghostBorderStoryJumpForPrompt(prevEv, nextEv) {
        const A = String(prevEv?.location || '').toLowerCase();
        const B = String(nextEv?.location || '').toLowerCase();
        return (A.includes('portal') && (B.includes('modern') || B.includes('metropolis') || B.includes('secret')))
            || ((A.includes('modern') || A.includes('metropolis') || A.includes('secret'))
                && (B.includes('palace') || B.includes('daming') || B.includes('tang')));
    },

    /**
     * Rich top-down realm-map image prompt for Grok Imagine (timeline beats **with locations only**, story order).
     * @param {object} storyData
     * @returns {string}
     */
    buildStoryWorldMapGrokPrompt(storyData) {
        const beatLabels = {
            '1': 'You — establish protagonist',
            '2': 'Need — something is not right',
            '3': 'Go! — crossing the threshold',
            '4': 'Search — road of trials',
            '5': 'Find — meeting the goddess',
            '6': 'Take — paying the price',
            '7': 'Return — bringing it home',
            '8': 'Change — master of both worlds'
        };

        const characters = Array.isArray(storyData?.characters) ? storyData.characters : [];
        const charById = new Map(characters.map(c => [c.id, c]));

        const events = [...(Array.isArray(storyData?.events) ? storyData.events : [])]
            .filter((e) => e && String(e.location || '').trim())
            .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0) || (Number(a?.id) || 0) - (Number(b?.id) || 0));

        if (events.length === 0) {
            return [
                'Top-down bird\'s eye view ancient Chinese Tang Dynasty ink-wash style map.',
                'Title banner (painted seal calligraphy, integrated into art): Ghost Border Region • Tang Dynasty',
                'Orthographic overhead (flat), no isometric tilt. Parchment field, soft mist at edges.',
                'Add timeline events with a **location** set in the app to list beats, glowing purple story progression lines, dashed purple time-travel jump hints, gold pins for canon events, and character avatar nodes.',
                '',
                'Constraints: avoid crisp modern UI fonts; if text appears, brushstroke / seal style only. No watermarks. Cinematic, highly detailed, 1024×1024.'
            ].join('\n');
        }

        const jumpPairs = [];
        for (let i = 1; i < events.length; i += 1) {
            if (this.ghostBorderStoryJumpForPrompt(events[i - 1], events[i])) {
                jumpPairs.push(`Between stop ${i} and ${i + 1}: use a **dashed purple** arc or river-fork (time-travel / era-shift jump), distinct from the solid glowing purple story spine.`);
            }
        }

        const orderedStops = events.map((e, i) => {
            const b = e.beat != null && e.beat !== '' ? String(e.beat) : null;
            const beatPhrase = b ? `Story Circle beat ${b} (${beatLabels[b] || 'story beat'})` : 'Story Circle beat unassigned';
            const loc = String(e.location || '').trim();
            const title = String(e.title || 'Untitled event').trim();
            const period = String(e.period || '').trim();
            const desc = String(e.description || '').trim();
            const canon = Boolean(e.isCanon);
            const pinNote = canon
                ? '**CANON event — use a prominent gold map pin / seal marker here**'
                : 'Non-canon beat — smaller violet-silver pin or ring';
            const involved = Array.isArray(e.involvedCharacterIds) ? e.involvedCharacterIds : [];
            const names = involved
                .map((id) => charById.get(id))
                .filter(Boolean)
                .map((c) => String(c.name || '').trim())
                .filter(Boolean);
            const avatarLine = names.length
                ? `     — Character avatars: place **small circular portrait medallions** near this pin for: ${names.join(', ')} (Tang-era costume, readable as faces-from-above, not modern passport photos).`
                : null;
            const bits = [
                `  ${i + 1}. "${title}"`,
                `     — Map anchor: ${loc}`,
                `     — ${beatPhrase}`,
                `     — ${pinNote}`,
                period ? `     — Act / period: ${period}` : null,
                desc ? `     — Story beat summary: ${desc.slice(0, 200)}${desc.length > 200 ? '…' : ''}` : null,
                avatarLine
            ].filter(Boolean);
            return bits.join('\n');
        }).join('\n\n');

        const uniqueLocs = [...new Set(events.map((e) => String(e.location || '').trim()).filter(Boolean))];
        const locEcho = uniqueLocs.length
            ? `Terrain must echo these **exact story locations** (abstract geography, no typed labels): ${uniqueLocs.join('; ')}.`
            : '';

        const jumpBlock = jumpPairs.length
            ? ['Time-travel / era-shift jumps (dashed purple, separate from main spine):', ...jumpPairs, ''].join('\n')
            : '';

        return [
            'Top-down bird\'s eye view ancient Chinese Tang Dynasty ink-wash style map.',
            'Sumi-e ink wash blended with a polished fantasy RPG **realm atlas** look; orthographic bird\'s eye, not isometric.',
            '',
            '**Map title** (banner or gold seal strip along upper margin, brush-calligraphy style): Ghost Border Region • Tang Dynasty',
            '',
            '**Story progression (solid line):** a **glowing purple–violet narrative spine** connects the following stops **in chronological order** (same order as below). Line should feel slightly raised with soft outer bloom.',
            '**Canon emphasis:** **gold pins / gold seal markers** on canon events; subtler cool-violet markers on non-canon beats.',
            '**Time-travel jumps:** where indicated below, add **dashed purple** connectors or forked rivers (distinct from the solid progression line).',
            '**Character avatars:** small circular portrait medallions at stops that list cast names.',
            '',
            'Visual language:',
            '- Rivers: indigo–violet ribbons with soft bloom; mountains: brushed gray ink; forests: teal shadow masses.',
            '- Palace / capital: nested courtyards, gold-umber roof geometry (abstract).',
            '- Market: warm umber blocks, plaza voids, canal hints.',
            '- Portal / cave pocket: cold violet ring or spiral mist (western sector feel).',
            '- Secret metropolis / anomaly: cooler gray-violet mist blocks (optional).',
            '',
            jumpBlock,
            'Ordered narrative stops (with locations — layout + mood; beat numbers may appear as **micro-gold embossing** on pins only):',
            orderedStops,
            '',
            locEcho,
            '',
            'Constraints: no modern UI chrome, no QR codes, no watermarks. Prefer painterly treatment over sharp vector text. Target **1024×1024**.'
        ].join('\n');
    },

    /**
     * Uses the configured **text** AI (LM Studio / Ollama) to expand the draft into a single copy-paste Grok Imagine prompt.
     * Falls back to {@link buildStoryWorldMapGrokPrompt} if the service is offline or the call fails.
     * @param {object} storyData
     * @returns {Promise<string>}
     */
    async generateStoryWorldMapGrokPromptDetailed(storyData) {
        const draft = this.buildStoryWorldMapGrokPrompt(storyData);
        await this.checkConnection();
        if (!this.connected) {
            return draft;
        }

        const instructions = `You write ONE final image-generation prompt for **Grok Imagine** (or similar). Output **plain text only** — no markdown fences, no title line like "Here is the prompt", no bullet markdown — just the prompt itself.

The prompt MUST naturally weave in ALL of the following requirements:
1) The exact phrase: Top-down bird's eye view ancient Chinese Tang Dynasty ink-wash style map
2) All locations and their **exact story beats** from the ordered list in the draft (preserve order)
3) Glowing **purple** story progression lines connecting events in **chronological order**
4) **Gold pins** (or gold seal markers) for **canon** events; subtler markers for non-canon where the draft says so
5) **Character avatars** (small circular portrait medallions) where the draft names cast members at a stop
6) Map title as ornate integrated art: Ghost Border Region • Tang Dynasty
7) **Dashed purple** lines for time-travel / era-shift jumps where the draft mentions them

Keep it vivid, cinematic, and ready to paste. Preserve Tang-era material culture (no anachronistic skyscrapers unless the draft explicitly asks for contrast). Length: roughly 900–2200 words acceptable if detail-rich.

--- DRAFT TO EXPAND ---

${draft}`;

        try {
            const out = String(await this.callAI(instructions, 2200) || '').trim();
            return out || draft;
        } catch (error) {
            console.warn('generateStoryWorldMapGrokPromptDetailed:', error);
            return draft;
        }
    },

    /**
     * Analyze full story
     */
    async analyzeStory(storyData) {
        const storyContext = `
Story Title: C Drama Time Travel Romance
Characters: ${storyData.characters.map(c => `${c.name} (${c.type}): ${c.background}`).join('\n')}
Timeline: ${storyData.events.map(e => {
            const loc = e.location ? ` @ ${e.location}` : '';
            return `${e.title} (${e.period}, Beat ${e.beat})${loc}: ${e.description}`;
        }).join('\n')}
Plot: ${storyData.plot.map(p => `${p.act}: ${p.content}`).join('\n')}
`;

        const prompt = `You are a professional story analyst.

Analyze this C-drama story and return ONLY valid JSON (no markdown, no code fences).

${this.getCanonGuardrail(storyData)}

Return this exact schema:
{
  "analysis": {
    "strengths": ["..."],
    "risks": ["..."],
    "plotIssues": ["..."],
    "characterIssues": ["..."],
    "pacingConcerns": ["..."]
  },
  "suggestedActions": [
    {
      "actionType": "timeline_event|work_item|character_arc_update",
      "title": "...",
      "description": "...",
      "relatedTo": ["Character:Name", "Event:Title", "Arc:Theme", "Politics:Section"]
    }
  ]
}

Guidance:
- Provide 6-15 suggestedActions total.
- Use concise, actionable titles.
- If actionType is timeline_event, describe what happens in the scene and where it fits.
- If actionType is work_item, give a clear task and suggested category.
- If actionType is character_arc_update, include which character(s) and what to change.

STORY:\n${storyContext}`;

        return this.callAI(prompt, 1200);
    },

    /**
     * Analyze continuity
     */
    async analyzeContinuity(storyData) {
        const storyContext = JSON.stringify(storyData, null, 2);
        const prompt = `Analyze this story data for continuity issues:
${storyContext}

${this.getCanonGuardrail(storyData)}

Look for:
1. Timeline inconsistencies
2. Character behavior that contradicts their established personality
3. Plot points that conflict with earlier statements
4. Unresolved plot threads
5. Timeline gaps that don't make sense

Format as a clear list of issues found.`;

        return this.callAI(prompt, 600);
    },

    /**
     * Analyze characters
     */
    async analyzeCharacters(storyData) {
        const charContext = storyData.characters.map(c => 
            `${c.name} (${c.type}) - Age ${c.age}, Role: ${c.role}\nBackground: ${c.background}\nPersonality: ${c.personality}\nRelated to: ${c.relatedCharacters.map(id => storyData.characters.find(ch => ch.id === id)?.name).filter(Boolean).join(', ')}`
        ).join('\n\n');

        const prompt = `Evaluate the character development in this story:\n${charContext}

${this.getCanonGuardrail(storyData)}

Analyze:
1. Character arcs - do they show growth?
2. Character consistency - do their actions match their established traits?
3. Relationships - are character dynamics compelling?
4. Diversity - do the characters feel distinct?
5. Development suggestions

Be specific and constructive.`;

        return this.callAI(prompt, 700);
    },

    /**
     * Analyze plot
     */
    async analyzePlot(storyData) {
        const plotContext = `
Events: ${storyData.events.map(e => `${e.title} (${e.period}) - ${e.description}`).join('\n')}
Plot Outline: ${storyData.plot.map(p => `${p.act}: ${p.content}`).join('\n')}
`;

        const prompt = `Analyze the plot structure of this C drama story:
${plotContext}

${this.getCanonGuardrail(storyData)}

Evaluate:
1. Does it follow Dan Harmon's Story Circle effectively?
2. Are the three acts well-balanced?
3. Does the climax feel earned?
4. Are there plot holes or unresolved threads?
5. Pacing - does the story move well?
6. Specific suggestions for plot improvement

Use the context of a time-travel romance in the Tang Dynasty.`;

        return this.callAI(prompt, 800);
    },

    /**
     * Historical / material / institutional plausibility — **not** character psychology or story-circle structure.
     * @param {object} storyData
     * @returns {Promise<string>}
     */
    async analyzeHistoricalAccuracy(storyData) {
        const plotLines = (storyData.plot || []).map((p) => `${p.act}: ${p.content}`).join('\n');
        const polLines = (storyData.politics || []).map((p) => `${p.section}: ${p.content}`).join('\n');
        const events = (storyData.events || []).map((e) => {
            const bits = [
                e.title,
                e.period,
                e.location,
                e.description,
                e.fullDescription
            ].filter(Boolean).join(' | ');
            return bits || e.title;
        }).join('\n');
        const workLines = (storyData.workItems || []).map((w) =>
            `${w.title} (${w.category || 'task'})${w.completed ? ' [done]' : ''}`
        ).join('\n');

        const castSnap = (storyData.characters || []).map((c) => {
            const bio = String(c.background || '').slice(0, 320);
            return `${c.name} | age ${c.age ?? '?'} | role: ${c.role || '—'} | type: ${c.type || '—'}\n   Bio (for titles/ranks/era cues only): ${bio}${bio.length >= 320 ? '…' : ''}`;
        }).join('\n\n');

        const prompt = `You are a **historical consultant for Chinese period drama** (default frame: **Tang dynasty** or adjacent unless the text clearly implies another period).

${this.getCanonGuardrail(storyData)}

Your job is **historical, material, geographic, and institutional plausibility** — **outside** of:
- deep character psychology or motivation therapy,
- whether the story “works” as fiction emotionally,
- Dan Harmon beat coverage (ignore beat shape).

Focus on:
1. **Chronology & era logic** — reign names, era labels, impossible calendars, absurd travel times for horses/barges/relay, seasonal mismatches.
2. **Court & bureaucracy** — titles (尚书, 刺史, etc.), ministries, censors, examinations, edict procedure, punishment vocabulary that sounds wrong for the implied century.
3. **Military & logistics** — ranks, formations, granaries, corvée, salt/monopoly language, fortification scale vs village drama.
4. **Material culture** — textiles, metal money, paper/ink, lighting, food staples, architecture (palace vs manor vs market), hygiene defaults.
5. **Technology & chemistry** — distillation, sulfur, paper tech: flag **accidental** modern slips (plastic, wrong firearms jargon, grid electricity). Accept deliberate “stranger brings method” if labeled as fiction license.
6. **Geography** — real place names vs invented “Ghost Border” style regions: say when invention is fine vs when a **real** name is misused.

Output format (plain text, no JSON):
- **Summary** (2–4 sentences): overall historical risk level for this draft.
- **Findings** — grouped with headings. Each bullet: severity (**Likely issue** | **Uncertain—verify** | **OK / fiction license**), one tight sentence, optional “→ check: …” research hint.
- **Research angles** — 6–12 bullet keywords or museum/book topics (not a full bibliography).

--- POLITICS / WORLD ---
${polLines || '(none)'}

--- PLOT OUTLINE (era / regime claims) ---
${plotLines || '(none)'}

--- TIMELINE (locations + descriptions) ---
${events || '(none)'}

--- WORK ITEMS ---
${workLines || '(none)'}

--- CAST (ranks & bios for anachronistic cues only; not for arc critique) ---
${castSnap || '(none)'}`;

        return this.callAI(prompt, 1200);
    },

    /**
     * Cross-check recent AI reports + current story data; return JSON with `issuesFound` and `suggestedActions`
     * (same suggestedActions shape as full story analysis) for App to save and apply.
     * @param {object} storyData
     * @returns {Promise<string>} raw model text (JSON)
     */
    async generateStoryBuildSuggestions(storyData) {
        const reports = Array.isArray(storyData?.aiReports) ? storyData.aiReports : [];
        const prior = reports
            .filter((r) => r && r.status === 'success' && r.type && r.type !== 'story-build')
            .slice(0, 6)
            .map((r) => {
                const body = String(r.content || '').trim();
                const clip = body.length > 4000 ? `${body.slice(0, 4000)}\n… [truncated]` : body;
                return `### ${r.title} (type: ${r.type})\n${clip}`;
            })
            .join('\n\n---\n\n');

        const chars = (storyData.characters || []).slice(0, 48).map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            role: c.role,
            isCanon: Boolean(c.isCanon),
            background: String(c.background || '').slice(0, 500),
            personality: String(c.personality || '').slice(0, 320)
        }));
        const evs = (storyData.events || []).slice(0, 72).map((e) => ({
            id: e.id,
            order: e.order,
            title: e.title,
            beat: e.beat,
            period: e.period,
            location: e.location,
            isCanon: Boolean(e.isCanon),
            description: String(e.description || '').slice(0, 360)
        }));
        const compact = {
            characters: chars,
            events: evs,
            plot: storyData.plot || [],
            politics: (storyData.politics || []).slice(0, 16),
            workItems: (storyData.workItems || []).slice(0, 24).map((w) => ({
                id: w.id,
                title: w.title,
                category: w.category,
                completed: Boolean(w.completed)
            }))
        };

        const prompt = `You are a senior C-drama story editor. Synthesize **issues** from the story snapshot and any prior AI reports, then propose **concrete story builds** (new beats, tasks, character notes).

${this.getCanonGuardrail(storyData)}

Output ONLY valid JSON (no markdown, no code fences). Use this exact shape:
{
  "issuesFound": [
    { "severity": "high", "area": "timeline", "summary": "One-line issue" }
  ],
  "suggestedActions": [
    {
      "actionType": "timeline_event",
      "title": "Short beat title",
      "description": "What happens; why it fixes an issue",
      "location": "Optional location string or empty",
      "relatedTo": ["Character:Feng", "Event:Some prior beat title"]
    },
    {
      "actionType": "work_item",
      "title": "Task title",
      "description": "What the writer should do",
      "category": "Scene Planning|Plot Holes|Character Development|Historical Research|Worldbuilding|Dialogue",
      "relatedTo": []
    },
    {
      "actionType": "character_arc_update",
      "title": "Arc tweak label",
      "description": "Specific behavioral or motivation change",
      "relatedTo": ["Character:Prince Yu"]
    }
  ]
}

Rules:
- **issuesFound**: 4–14 items; severity high|med|low; area one of timeline|character|plot|politics|pacing|worldbuilding.
- **suggestedActions**: 8–20 items; every item should tie to at least one issue (name it in description if helpful).
- Prefer **draft** fixes: new timeline beats, research tasks, or character note injections — do not contradict isCanon items; refine around them.
- timeline_event: give a **new** beat title (not duplicate of an existing title in snapshot).
- work_item: include **category** when actionType is work_item.
- character_arc_update: **relatedTo** must include at least one "Character:ExactName" from the snapshot.

PRIOR AI REPORTS (may overlap — dedupe and prioritize):
${prior || '(No saved reports yet — infer issues only from the snapshot.)'}

STORY SNAPSHOT:
${JSON.stringify(compact, null, 2)}`;

        return this.callAI(prompt, 2400);
    },

    /**
     * Generate one image from an OpenAI-compatible image endpoint.
     */
    async generateImage(prompt) {
        const provider = String(this.settings.imageProvider || 'openai_compatible');
        if (provider === 'nano_banana_acedata') {
            return this.generateNanoBananaAceData(prompt);
        }
        return this.generateOpenAICompatibleImage(prompt);
    },

    async generateOpenAICompatibleImage(prompt) {
        const apiUrl = String(this.settings.imageApiUrl || '').trim();
        const model = String(this.settings.imageModel || '').trim();
        const apiKey = String(this.settings.imageApiKey || '').trim();

        if (!apiUrl) {
            throw new Error('Image API URL is not configured. Set it in AI Settings.');
        }
        if (!model) {
            throw new Error('Image model is not configured. Set it in AI Settings.');
        }

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                prompt,
                size: '1024x1024'
            })
        });

        if (!response.ok) {
            let details = '';
            try {
                const body = await response.json();
                details = body?.error?.message || body?.message || JSON.stringify(body);
            } catch (error) {
                // Ignore parse failure, fallback to status.
            }
            throw new Error(details ? `Image API error: ${response.status} - ${details}` : `Image API error: ${response.status}`);
        }

        const data = await response.json();
        const first = data?.data?.[0] || null;
        if (first?.url) {
            return first.url;
        }
        if (first?.b64_json) {
            return `data:image/png;base64,${first.b64_json}`;
        }

        throw new Error('Image API returned no image URL/base64 payload.');
    },

    async generateNanoBananaAceData(prompt) {
        const apiKey = String(this.settings.nanoBananaApiKey || this.settings.imageApiKey || '').trim();
        const apiUrl = 'https://api.acedata.cloud/nano-banana/images';

        if (!apiKey) {
            throw new Error('Nano Banana API key is not configured. Set it in AI Settings.');
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                action: 'generate',
                prompt,
                count: 1
            })
        });

        if (!response.ok) {
            let details = '';
            try {
                const body = await response.json();
                details = body?.message || body?.error?.message || JSON.stringify(body);
            } catch (error) {
                // Ignore parse failure, fallback to status.
            }
            throw new Error(details ? `Nano Banana API error: ${response.status} - ${details}` : `Nano Banana API error: ${response.status}`);
        }

        const data = await response.json();

        // Be tolerant to different vendors/wrappers.
        const directUrl =
            data?.data?.[0]?.url
            || data?.image_url
            || (Array.isArray(data?.image_urls) ? data.image_urls[0] : null)
            || data?.result?.url
            || data?.output?.[0]
            || null;

        if (typeof directUrl === 'string' && directUrl.trim()) {
            return directUrl.trim();
        }

        const b64 =
            data?.data?.[0]?.b64_json
            || data?.b64_json
            || null;
        if (typeof b64 === 'string' && b64.trim()) {
            return `data:image/png;base64,${b64.trim()}`;
        }

        throw new Error('Nano Banana API returned no image URL/base64 payload.');
    },

    /**
     * Run LangChain Open Deep Research agent via configured endpoint.
     * Expects a JSON API that accepts { query, context } and returns
     * either { result }, { report }, or OpenAI-style content.
     */
    async runDeepResearch(query, context = {}) {
        const apiUrl = String(this.settings.deepResearchApiUrl || '').trim();
        const apiKey = String(this.settings.deepResearchApiKey || '').trim();

        if (!apiUrl) {
            throw new Error('Deep research API URL is not configured in AI Settings.');
        }

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query, context })
        });

        if (!response.ok) {
            let details = '';
            try {
                const body = await response.json();
                details = body?.error?.message || body?.message || JSON.stringify(body);
            } catch (error) {
                // Fallback to status-only error.
            }
            throw new Error(details ? `Deep research API error: ${response.status} - ${details}` : `Deep research API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data?.result
            || data?.report
            || data?.output
            || data?.text
            || data?.choices?.[0]?.message?.content
            || data?.message?.content
            || null;

        if (typeof content === 'string' && content.trim()) {
            return content.trim();
        }
        throw new Error('Deep research API returned an empty response.');
    }
};

// Keep legacy global access for inline onclick handlers and for StorageService.importFromNotes().
globalThis.AIService = AIService;
