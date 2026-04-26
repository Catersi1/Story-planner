/**
 * AI Service Module
 * Handles all AI integration with LM Studio and Ollama
 */

const AIService = {
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
     * Analyze full story
     */
    async analyzeStory(storyData) {
        const storyContext = `
Story Title: C Drama Time Travel Romance
Characters: ${storyData.characters.map(c => `${c.name} (${c.type}): ${c.background}`).join('\n')}
Timeline: ${storyData.events.map(e => `${e.title} (${e.period}, Beat ${e.beat}): ${e.description}`).join('\n')}
Plot: ${storyData.plot.map(p => `${p.act}: ${p.content}`).join('\n')}
`;

        const prompt = `You are a professional story analyst. Analyze this C drama story and provide:
1. Overall story strengths
2. Potential plot holes or inconsistencies
3. Character development issues
4. Pacing concerns
5. Suggestions for improvement

Story:\n${storyContext}

Please be constructive and specific.`;

        return this.callAI(prompt, 800);
    },

    /**
     * Analyze continuity
     */
    async analyzeContinuity(storyData) {
        const storyContext = JSON.stringify(storyData, null, 2);
        const prompt = `Analyze this story data for continuity issues:
${storyContext}

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
