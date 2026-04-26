/**
 * Main Application Module
 * Core application logic and UI management
 */

const App = {
    storyData: StorageService.loadStoryData(),
    currentEditingEventId: null,
    currentEditingCharacterId: null,
    MASTER_DOC_VERSION: 1,

    /**
     * Initialize the application
     */
    init() {
        this.initTheme();
        this.render();
        this.setupEventListeners();
        AIService.checkConnection().then(() => this.updateAIStatus());
        setInterval(() => {
            AIService.checkConnection().then(() => this.updateAIStatus());
        }, 5000);
    },

    // ============ THEME (DARK MODE) ============

    getThemePreference() {
        try {
            const saved = localStorage.getItem('uiTheme');
            if (saved === 'dark' || saved === 'light') return saved;
        } catch (error) {
            // Ignore storage errors.
        }
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
        return prefersDark ? 'dark' : 'light';
    },

    setThemePreference(theme) {
        const next = theme === 'dark' ? 'dark' : 'light';
        try {
            localStorage.setItem('uiTheme', next);
        } catch (error) {
            // Ignore storage errors.
        }
        this.applyTheme(next);
    },

    applyTheme(theme) {
        const next = theme === 'dark' ? 'dark' : 'light';
        document.body.dataset.theme = next;
        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            btn.textContent = next === 'dark' ? 'Light' : 'Dark';
        }
    },

    initTheme() {
        this.applyTheme(this.getThemePreference());
    },

    toggleTheme() {
        const current = document.body.dataset.theme || this.getThemePreference();
        const next = current === 'dark' ? 'light' : 'dark';
        this.setThemePreference(next);
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        document.getElementById('characterSearch')?.addEventListener('input', () => this.renderCharacters());
    },

    /**
     * Save and persist data
     */
    save() {
        this.refreshMasterDocument({ reason: 'save' });
        StorageService.saveStoryData(this.storyData);
        this.render();
    },

    /**
     * Switch between tabs
     */
    switchTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(tabName).classList.add('active');

        const matchingButton = document.querySelector(`.tab-button[onclick*="App.switchTab('${tabName}')"]`);
        if (matchingButton) {
            matchingButton.classList.add('active');
        }

        if (tabName === 'timeline') {
            this.renderTimelineWithCircle();
        }
        if (tabName === 'master-document') {
            this.renderMasterDocument();
        }
        if (tabName === 'visualizer') {
            this.renderStoryboard();
            this.renderVisualGallery();
        }

        // Keep navigation feeling snappy by scrolling main content to top.
        try {
            document.querySelector('.main')?.scrollTo?.({ top: 0, behavior: 'smooth' });
        } catch (error) {
            // Ignore scroll failures.
        }
    },

    /**
     * Render all content
     */
    render() {
        this.renderCharacters();
        this.renderPlot();
        this.renderPolitics();
        this.renderWorkItems();
        this.updateDashboard();
        this.renderAIActionItems();
        this.renderAIReports();
        this.renderStoryboard();
        this.renderVisualGallery();
        this.renderMasterDocument();
    },

    // ============ MASTER DOCUMENT ============

    /**
     * Compute and store the current master document script.
     */
    refreshMasterDocument({ reason = 'manual' } = {}) {
        if (!this.storyData.masterDocument || typeof this.storyData.masterDocument !== 'object') {
            this.storyData.masterDocument = { version: this.MASTER_DOC_VERSION, format: 'markdown', updatedAt: null, text: '' };
        }

        const now = new Date().toISOString();
        this.storyData.masterDocument.version = this.MASTER_DOC_VERSION;
        this.storyData.masterDocument.format = 'markdown';
        this.storyData.masterDocument.updatedAt = now;
        this.storyData.masterDocument.text = this.generateMasterDocumentText({ reason, nowISO: now });
    },

    /**
     * Render the master document tab content.
     */
    renderMasterDocument() {
        const textarea = document.getElementById('masterDocumentText');
        const meta = document.getElementById('masterDocumentMeta');
        if (!textarea || !meta) return;

        const doc = this.storyData.masterDocument || { updatedAt: null, text: '' };
        if (!doc.text) {
            // Generate once for new installs / old data migrations.
            this.refreshMasterDocument({ reason: 'initial' });
        }

        const updatedAt = this.storyData.masterDocument?.updatedAt
            ? new Date(this.storyData.masterDocument.updatedAt).toLocaleString()
            : '—';
        meta.textContent = `Last generated: ${updatedAt} • Format: Markdown • Version: ${this.storyData.masterDocument?.version || this.MASTER_DOC_VERSION}`;
        textarea.value = this.storyData.masterDocument?.text || '';
    },

    /**
     * Regenerate master document on demand.
     */
    regenerateMasterDocument() {
        this.refreshMasterDocument({ reason: 'regenerate' });
        StorageService.saveStoryData(this.storyData);
        this.renderMasterDocument();

        const status = document.getElementById('masterDocumentStatus');
        if (status) {
            status.innerHTML = '<div class="ai-status connected">✅ Master Document regenerated.</div>';
        }
    },

    /**
     * Copy master document text to clipboard.
     */
    async copyMasterDocument() {
        const status = document.getElementById('masterDocumentStatus');
        const text = this.storyData.masterDocument?.text || '';
        if (!text) {
            if (status) status.innerHTML = '<div class="ai-status disconnected">❌ Nothing to copy yet.</div>';
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            if (status) status.innerHTML = '<div class="ai-status connected">✅ Copied to clipboard.</div>';
        } catch (error) {
            // Fallback for browsers blocking clipboard API.
            const textarea = document.getElementById('masterDocumentText');
            if (textarea) {
                textarea.focus();
                textarea.select();
                const ok = document.execCommand('copy');
                if (status) {
                    status.innerHTML = ok
                        ? '<div class="ai-status connected">✅ Copied to clipboard.</div>'
                        : '<div class="ai-status disconnected">❌ Clipboard copy blocked by browser.</div>';
                }
                return;
            }
            if (status) status.innerHTML = '<div class="ai-status disconnected">❌ Clipboard copy blocked by browser.</div>';
        }
    },

    /**
     * Download master document as .md
     */
    downloadMasterDocument() {
        const text = this.storyData.masterDocument?.text || '';
        if (!text) return;

        const date = new Date().toISOString().split('T')[0];
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `master-document-${date}.md`;
        link.click();
        URL.revokeObjectURL(url);
    },

    /**
     * Create the master document as a progress-tracking "script".
     */
    generateMasterDocumentText({ reason = 'manual', nowISO = new Date().toISOString() } = {}) {
        const data = this.storyData || {};
        const characters = Array.isArray(data.characters) ? data.characters : [];
        const events = Array.isArray(data.events) ? data.events : [];
        const plot = Array.isArray(data.plot) ? data.plot : [];
        const politics = Array.isArray(data.politics) ? data.politics : [];
        const workItems = Array.isArray(data.workItems) ? data.workItems : [];
        const reports = Array.isArray(data.aiReports) ? data.aiReports : [];

        const completed = workItems.filter(w => w && w.completed).length;
        const total = workItems.length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        const beatLabels = {
            '1': 'You (establish protagonist)',
            '2': 'Need (something isn’t right)',
            '3': 'Go! (crossing threshold)',
            '4': 'Search (road of trials)',
            '5': 'Find (meeting goddess)',
            '6': 'Take (paying the price)',
            '7': 'Return (bringing it home)',
            '8': 'Change (master of both)'
        };

        const eventsByOrder = [...events].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
        const beatsCoverage = {};
        Object.keys(beatLabels).forEach(k => { beatsCoverage[k] = 0; });
        eventsByOrder.forEach(e => {
            const beat = e?.beat ? String(e.beat) : null;
            if (beat && beatsCoverage[beat] !== undefined) beatsCoverage[beat] += 1;
        });

        const missingBeats = Object.entries(beatsCoverage)
            .filter(([, count]) => count === 0)
            .map(([beat]) => beat);

        const characterById = new Map(characters.map(c => [c.id, c]));
        const safe = (v) => String(v ?? '').trim();

        const topUnfinished = workItems
            .filter(w => w && !w.completed)
            .slice(0, 12)
            .map(w => `- [ ] ${safe(w.title)} (${safe(w.category) || 'Uncategorized'})`);

        const completedRecent = workItems
            .filter(w => w && w.completed)
            .slice(0, 8)
            .map(w => `- [x] ${safe(w.title)} (${safe(w.category) || 'Uncategorized'})`);

        const continuitySignals = reports
            .filter(r => r && (r.type === 'continuity' || r.type === 'plot' || r.type === 'story'))
            .slice(0, 5)
            .map(r => `- ${safe(r.title)} (${new Date(r.createdAt || nowISO).toLocaleDateString()})`);

        const lines = [];
        lines.push(`# Master Story Document`);
        lines.push('');
        lines.push(`Generated: ${new Date(nowISO).toLocaleString()}`);
        lines.push(`Generation reason: ${reason}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        lines.push('## Project Snapshot');
        lines.push(`- Characters: ${characters.length}`);
        lines.push(`- Timeline events: ${events.length}`);
        lines.push(`- Plot outline sections: ${plot.length}`);
        lines.push(`- Politics/world sections: ${politics.length}`);
        lines.push(`- Work items: ${completed}/${total} completed (${pct}%)`);
        lines.push('');

        lines.push('## Architecture Checklist (Story Circle Coverage)');
        Object.keys(beatLabels).forEach(beat => {
            const count = beatsCoverage[beat] || 0;
            lines.push(`- ${count > 0 ? '[x]' : '[ ]'} Beat ${beat}: ${beatLabels[beat]} (${count} event${count === 1 ? '' : 's'})`);
        });
        if (missingBeats.length > 0) {
            lines.push('');
            lines.push(`Gaps: missing beats → ${missingBeats.map(b => `Beat ${b}`).join(', ')}`);
        }
        lines.push('');

        lines.push('## Characters (Cast Bible)');
        if (characters.length === 0) {
            lines.push('_No characters yet._');
        } else {
            const sortedChars = [...characters].sort((a, b) => safe(a.name).localeCompare(safe(b.name)));
            sortedChars.forEach(c => {
                const rel = Array.isArray(c.relatedCharacters) ? c.relatedCharacters : [];
                const relNames = rel
                    .map(id => characterById.get(id))
                    .filter(Boolean)
                    .map(rc => safe(rc.name))
                    .filter(Boolean);

                lines.push(`- **${safe(c.name) || 'Unnamed'}** (${safe(c.role) || 'Role TBD'} • ${c.type || 'type?'} • age ${Number.isFinite(c.age) ? c.age : 0})`);
                if (safe(c.background)) lines.push(`  - Background: ${safe(c.background)}`);
                if (safe(c.personality)) lines.push(`  - Personality: ${safe(c.personality)}`);
                if (relNames.length) lines.push(`  - Relationships: ${relNames.join(', ')}`);
                if (safe(c.notes)) lines.push(`  - Notes: ${safe(c.notes)}`);
            });
        }
        lines.push('');

        lines.push('## Timeline (Ordered)');
        if (eventsByOrder.length === 0) {
            lines.push('_No timeline events yet._');
        } else {
            eventsByOrder.forEach(e => {
                const beat = e?.beat ? String(e.beat) : '';
                const beatLabel = beat ? `Beat ${beat}: ${beatLabels[beat] || '—'}` : 'No beat assigned';
                const header = `- E${e.id}: **${safe(e.title) || 'Untitled'}** (${safe(e.period) || 'Period TBD'} • ${beatLabel})`;
                lines.push(header);
                if (safe(e.description)) lines.push(`  - Summary: ${safe(e.description)}`);
                if (safe(e.fullDescription)) lines.push(`  - Notes: ${safe(e.fullDescription)}`);
            });
        }
        lines.push('');

        lines.push('## Plot Outline');
        if (plot.length === 0) {
            lines.push('_No plot outline yet._');
        } else {
            plot.forEach(p => {
                lines.push(`- **${safe(p.act) || 'Section'}**: ${safe(p.content) || '—'}`);
            });
        }
        lines.push('');

        lines.push('## Politics / World / Intrigue');
        if (politics.length === 0) {
            lines.push('_No politics/world notes yet._');
        } else {
            politics.forEach(p => {
                lines.push(`- **${safe(p.section) || 'Section'}**: ${safe(p.content) || '—'}`);
            });
        }
        lines.push('');

        lines.push('## Progress Script');
        lines.push('');
        lines.push('### Next Work (To-Do)');
        lines.push(topUnfinished.length ? topUnfinished.join('\n') : '_No open work items._');
        lines.push('');
        lines.push('### Recently Completed');
        lines.push(completedRecent.length ? completedRecent.join('\n') : '_Nothing completed yet._');
        lines.push('');
        lines.push('### Risks / Flags');
        const riskLines = [];
        if (missingBeats.length > 0) riskLines.push(`- Missing story circle beats: ${missingBeats.join(', ')}`);
        const unassignedBeatCount = eventsByOrder.filter(e => !e?.beat).length;
        if (unassignedBeatCount > 0) riskLines.push(`- ${unassignedBeatCount} timeline event(s) have no story beat assigned`);
        if (characters.length === 0) riskLines.push('- No characters defined yet');
        if (plot.length === 0) riskLines.push('- No plot outline sections yet');
        lines.push(riskLines.length ? riskLines.join('\n') : '- None detected');
        lines.push('');

        lines.push('## AI Signals (Most Recent)');
        lines.push(continuitySignals.length ? continuitySignals.join('\n') : '_No AI reports saved yet._');
        lines.push('');

        return lines.join('\n');
    },

    // ============ CHARACTERS ============

    /**
     * Add new character
     */
    addCharacter() {
        const name = document.getElementById('newCharName').value.trim();
        const age = document.getElementById('newCharAge').value;
        const role = document.getElementById('newCharRole').value.trim();
        const type = document.getElementById('newCharType').value;
        const background = document.getElementById('newCharBackground').value.trim();
        const personality = document.getElementById('newCharPersonality').value.trim();
        const notes = document.getElementById('newCharNotes').value.trim();

        if (!name) {
            alert('Please enter a character name');
            return;
        }

        const newCharacter = {
            id: Math.max(...this.storyData.characters.map(c => c.id), 0) + 1,
            name,
            age: parseInt(age) || 0,
            role,
            type,
            background,
            personality,
            relatedCharacters: [],
            notes
        };

        this.storyData.characters.push(newCharacter);
        this.save();
        this.renderCharacters();

        document.getElementById('newCharName').value = '';
        document.getElementById('newCharAge').value = '';
        document.getElementById('newCharRole').value = '';
        document.getElementById('newCharType').value = 'friendly';
        document.getElementById('newCharBackground').value = '';
        document.getElementById('newCharPersonality').value = '';
        document.getElementById('newCharNotes').value = '';
    },

    /**
     * Delete character
     */
    deleteCharacter(id) {
        if (confirm('Delete this character?')) {
            this.storyData.characters = this.storyData.characters.filter(c => c.id !== id);
            this.save();
            this.renderCharacters();
        }
    },

    /**
     * Open character editor modal.
     */
    openCharacterEditor(characterId) {
        const character = this.storyData.characters.find(c => c.id === characterId);
        if (!character) return;

        this.currentEditingCharacterId = characterId;
        const form = document.getElementById('characterEditorForm');
        form.innerHTML = `
            <div>
                <label class="block text-sm font-medium mb-2">Character Name</label>
                <input type="text" id="editCharName" class="form-input" value="${character.name || ''}">
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Age</label>
                <input type="number" id="editCharAge" class="form-input" value="${character.age || ''}">
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Role</label>
                <input type="text" id="editCharRole" class="form-input" value="${character.role || ''}">
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Character Type</label>
                <select id="editCharType" class="form-input">
                    <option value="friendly" ${character.type === 'friendly' ? 'selected' : ''}>🟢 Friendly</option>
                    <option value="antagonist" ${character.type === 'antagonist' ? 'selected' : ''}>🔴 Antagonist</option>
                    <option value="gray" ${character.type === 'gray' ? 'selected' : ''}>⚪ Gray Area</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Background</label>
                <textarea id="editCharBackground" class="form-input" rows="2">${character.background || ''}</textarea>
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Personality</label>
                <textarea id="editCharPersonality" class="form-input" rows="2">${character.personality || ''}</textarea>
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Notes</label>
                <textarea id="editCharNotes" class="form-input" rows="2">${character.notes || ''}</textarea>
            </div>
        `;

        document.getElementById('characterEditorModal').classList.add('active');
    },

    /**
     * Close character editor modal.
     */
    closeCharacterEditor() {
        document.getElementById('characterEditorModal').classList.remove('active');
        this.currentEditingCharacterId = null;
    },

    /**
     * Save character edits.
     */
    saveCharacterEdit() {
        if (this.currentEditingCharacterId === null) return;

        const character = this.storyData.characters.find(c => c.id === this.currentEditingCharacterId);
        if (!character) return;

        const name = document.getElementById('editCharName').value.trim();
        if (!name) {
            alert('Character name cannot be empty.');
            return;
        }

        character.name = name;
        character.age = Number.parseInt(document.getElementById('editCharAge').value, 10) || 0;
        character.role = document.getElementById('editCharRole').value.trim();
        character.type = document.getElementById('editCharType').value;
        character.background = document.getElementById('editCharBackground').value.trim();
        character.personality = document.getElementById('editCharPersonality').value.trim();
        character.notes = document.getElementById('editCharNotes').value.trim();

        this.save();
        this.closeCharacterEditor();
        this.renderCharacters();
    },

    /**
     * Open character selector modal
     */
    openCharacterSelector(characterId) {
        const character = this.storyData.characters.find(c => c.id === characterId);
        const modal = document.getElementById('characterSelectorModal');
        const list = document.getElementById('characterSelectorList');

        list.innerHTML = '';
        this.storyData.characters.forEach(char => {
            if (char.id === characterId) return;

            const isSelected = character.relatedCharacters.includes(char.id);
            const badge = document.createElement('div');
            badge.className = `character-badge ${char.type} ${isSelected ? 'selected' : ''}`;
            badge.textContent = this.getCharacterEmoji(char.type) + ' ' + char.name;
            badge.onclick = () => {
                if (character.relatedCharacters.includes(char.id)) {
                    character.relatedCharacters = character.relatedCharacters.filter(id => id !== char.id);
                } else {
                    character.relatedCharacters.push(char.id);
                }
                this.save();
                this.openCharacterSelector(characterId);
            };
            list.appendChild(badge);
        });

        modal.classList.add('active');
    },

    /**
     * Close character selector modal
     */
    closeCharacterSelector() {
        document.getElementById('characterSelectorModal').classList.remove('active');
        this.renderCharacters();
    },

    /**
     * Get character emoji
     */
    getCharacterEmoji(type) {
        const emojis = { antagonist: '🔴', friendly: '🟢', gray: '⚪' };
        return emojis[type] || '⚪';
    },

    /**
     * Render characters
     */
    renderCharacters() {
        const container = document.getElementById('charactersContainer');
        const searchTerm = document.getElementById('characterSearch').value.toLowerCase();
        
        const filtered = this.storyData.characters.filter(char =>
            char.name.toLowerCase().includes(searchTerm) ||
            char.role.toLowerCase().includes(searchTerm)
        );

        container.innerHTML = filtered.map(char => {
            const relatedNames = char.relatedCharacters
                .map(id => this.storyData.characters.find(c => c.id === id))
                .filter(c => c);

            return `
                <div class="card character-card ${char.type}">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                        <div>
                            <h3>${this.getCharacterEmoji(char.type)} ${char.name}</h3>
                            <p class="text-sm text-gray-600">${char.age ? char.age + ' years old' : ''} • ${char.role}</p>
                        </div>
                        <div style="display:flex; gap:0.5rem;">
                            <button style="background:#2563eb;" onclick="App.openCharacterEditor(${char.id})">Edit</button>
                            <button class="delete-btn" onclick="App.deleteCharacter(${char.id})">Delete</button>
                        </div>
                    </div>
                    ${char.background ? `<p class="text-sm mb-2"><strong>Background:</strong> ${char.background}</p>` : ''}
                    ${char.personality ? `<p class="text-sm mb-2"><strong>Personality:</strong> ${char.personality}</p>` : ''}
                    <div class="mb-2">
                        <strong class="text-sm">Related Characters:</strong>
                        <div class="related-characters-container">
                            ${relatedNames.map(relChar => `
                                <span class="character-badge ${relChar.type}">
                                    ${this.getCharacterEmoji(relChar.type)} ${relChar.name}
                                </span>
                            `).join('')}
                            <button class="add-character-btn" onclick="App.openCharacterSelector(${char.id})">+ Add</button>
                        </div>
                    </div>
                    ${char.notes ? `<p class="text-sm text-gray-600 mt-2"><strong>Notes:</strong> ${char.notes}</p>` : ''}
                </div>
            `;
        }).join('');
    },

    // ============ TIMELINE ============

    /**
     * Add event
     */
    addEvent() {
        const title = document.getElementById('newEventTitle').value.trim();
        const period = document.getElementById('newEventPeriod').value.trim();
        const beat = document.getElementById('newEventBeat').value;
        const description = document.getElementById('newEventDescription').value.trim();

        if (!title) {
            alert('Please enter an event title');
            return;
        }

        const newEvent = {
            id: Math.max(...this.storyData.events.map(e => e.id), 0) + 1,
            title,
            period,
            order: this.storyData.events.length,
            beat: beat || null,
            description,
            fullDescription: ''
        };

        this.storyData.events.push(newEvent);
        this.save();
        this.renderTimelineWithCircle();

        document.getElementById('newEventTitle').value = '';
        document.getElementById('newEventPeriod').value = '';
        document.getElementById('newEventBeat').value = '';
        document.getElementById('newEventDescription').value = '';
    },

    /**
     * Delete event
     */
    deleteEvent(id) {
        if (confirm('Delete this event?')) {
            this.storyData.events = this.storyData.events.filter(e => e.id !== id);
            this.storyData.events.forEach((e, i) => e.order = i);
            this.save();
            this.renderTimelineWithCircle();
        }
    },

    /**
     * Open event editor modal
     */
    openEventEditor(eventId) {
        const event = this.storyData.events.find(e => e.id === eventId);
        if (!event) return;

        this.currentEditingEventId = eventId;
        const form = document.getElementById('eventEditorForm');
        
        form.innerHTML = `
            <div>
                <label class="block text-sm font-medium mb-2">Event Title</label>
                <input type="text" id="editEventTitle" class="form-input" value="${event.title}">
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Period / Act</label>
                <input type="text" id="editEventPeriod" class="form-input" value="${event.period}">
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Story Beat</label>
                <select id="editEventBeat" class="form-input">
                    <option value="">-- No beat assigned --</option>
                    <option value="1" ${event.beat === '1' ? 'selected' : ''}>1. You (establish protagonist)</option>
                    <option value="2" ${event.beat === '2' ? 'selected' : ''}>2. Need (something isn't right)</option>
                    <option value="3" ${event.beat === '3' ? 'selected' : ''}>3. Go! (crossing the threshold)</option>
                    <option value="4" ${event.beat === '4' ? 'selected' : ''}>4. Search (road of trials)</option>
                    <option value="5" ${event.beat === '5' ? 'selected' : ''}>5. Find (meeting the goddess)</option>
                    <option value="6" ${event.beat === '6' ? 'selected' : ''}>6. Take (paying the price)</option>
                    <option value="7" ${event.beat === '7' ? 'selected' : ''}>7. Return (bringing it home)</option>
                    <option value="8" ${event.beat === '8' ? 'selected' : ''}>8. Change (master of both worlds)</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Short Description</label>
                <input type="text" id="editEventDescription" class="form-input" value="${event.description}">
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Detailed Event Notes</label>
                <textarea id="editEventFullDescription" class="form-input" rows="6" placeholder="Write detailed notes about this event...">${event.fullDescription || ''}</textarea>
            </div>
        `;

        document.getElementById('eventEditorModal').classList.add('active');
    },

    /**
     * Close event editor modal
     */
    closeEventEditor() {
        document.getElementById('eventEditorModal').classList.remove('active');
        this.currentEditingEventId = null;
    },

    /**
     * Save event edits
     */
    saveEventEdit() {
        if (this.currentEditingEventId === null) return;

        const event = this.storyData.events.find(e => e.id === this.currentEditingEventId);
        event.title = document.getElementById('editEventTitle').value.trim();
        event.period = document.getElementById('editEventPeriod').value.trim();
        event.beat = document.getElementById('editEventBeat').value || null;
        event.description = document.getElementById('editEventDescription').value.trim();
        event.fullDescription = document.getElementById('editEventFullDescription').value.trim();

        this.save();
        this.closeEventEditor();
        this.renderTimelineWithCircle();
    },

    /**
     * Render timeline with story circle
     */
    renderTimelineWithCircle() {
        const circleContainer = document.getElementById('eventsOnCircle');
        const timelineContainer = document.getElementById('timelineContainer');

        const beatPositions = {
            '1': 45, '2': 315, '3': 270, '4': 225,
            '5': 180, '6': 135, '7': 90, '8': 0
        };

        const radius = 240;
        const centerX = 300;
        const centerY = 300;

        const eventsWithBeat = this.storyData.events.filter(e => e.beat);
        const beatOffsets = {};

        circleContainer.innerHTML = eventsWithBeat
            .map(event => {
                const angle = beatPositions[event.beat];
                const radians = (angle - 90) * Math.PI / 180;
                const idx = beatOffsets[event.beat] || 0;
                beatOffsets[event.beat] = idx + 1;

                // Nudge overlapping events on the same beat so each marker stays clickable.
                const offsetRadius = radius + (idx * 18);
                const x = centerX + offsetRadius * Math.cos(radians);
                const y = centerY + offsetRadius * Math.sin(radians);
                const xPct = (x / 600) * 100;
                const yPct = (y / 600) * 100;

                return `
                    <div
                        class="event-on-circle"
                        style="left: ${xPct}%; top: ${yPct}%; margin-left: -12px; margin-top: -12px;"
                        onclick="App.openEventEditor(${event.id})"
                        title="Click to edit: ${event.title}"
                    >
                        E${event.id}
                    </div>
                `;
            }).join('');

        timelineContainer.innerHTML = `
            <div style="margin-top: 2rem;">
                ${this.storyData.events.map(event => `
                    <div class="timeline-event">
                        <div class="timeline-dot"></div>
                        <div style="flex: 1;">
                            <button
                                onclick="App.openEventEditor(${event.id})"
                                style="background: transparent; color: #1d4ed8; padding: 0; font-weight: 700; text-align: left; border: none; text-decoration: underline; text-underline-offset: 2px;"
                                title="Edit event: ${event.title}"
                            >
                                ${event.title}
                            </button>
                            <div class="text-sm text-gray-600">${event.period}${event.beat ? ` • Story Beat ${event.beat}` : ''}</div>
                            ${event.description ? `<div class="text-sm text-gray-700 mt-1">${event.description}</div>` : ''}
                            ${event.fullDescription ? `<div class="text-sm text-gray-600 mt-2 italic">${event.fullDescription.substring(0, 100)}${event.fullDescription.length > 100 ? '...' : ''}</div>` : ''}
                        </div>
                        <button class="delete-btn" onclick="App.deleteEvent(${event.id}); event.stopPropagation();">Delete</button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    // ============ PLOT & POLITICS ============

    /**
     * Render plot
     */
    renderPlot() {
        const container = document.getElementById('plotContainer');
        container.innerHTML = this.storyData.plot.map((section, idx) => `
            <div class="card">
                <h3>${section.act}</h3>
                <p class="text-gray-700">${section.content}</p>
            </div>
        `).join('');
    },

    /**
     * Render politics
     */
    renderPolitics() {
        const container = document.getElementById('politicsContainer');
        container.innerHTML = this.storyData.politics.map((section, idx) => `
            <div class="card">
                <h3>${section.section}</h3>
                <p class="text-gray-700">${section.content}</p>
            </div>
        `).join('');
    },

    // ============ WORK ITEMS ============

    /**
     * Add work item
     */
    addWorkItem() {
        const title = document.getElementById('newWorkTitle').value.trim();
        const category = document.getElementById('newWorkCategory').value;

        if (!title) {
            alert('Please enter a work item title');
            return;
        }

        this.storyData.workItems.push({
            id: Math.max(...this.storyData.workItems.map(w => w.id), 0) + 1,
            title,
            category,
            completed: false
        });

        this.save();
        this.renderWorkItems();
        document.getElementById('newWorkTitle').value = '';
    },

    /**
     * Toggle work item completion
     */
    toggleWorkItem(id) {
        const item = this.storyData.workItems.find(w => w.id === id);
        if (item) {
            item.completed = !item.completed;
            this.save();
            this.renderWorkItems();
        }
    },

    /**
     * Delete work item
     */
    deleteWorkItem(id) {
        this.storyData.workItems = this.storyData.workItems.filter(w => w.id !== id);
        this.save();
        this.renderWorkItems();
    },

    /**
     * Edit work item title/category.
     */
    editWorkItem(id) {
        const item = this.storyData.workItems.find(w => w.id === id);
        if (!item) return;

        const newTitle = prompt('Edit work item title:', item.title);
        if (newTitle === null) return;
        const cleanTitle = newTitle.trim();
        if (!cleanTitle) {
            alert('Title cannot be empty.');
            return;
        }

        const currentCategory = item.category || 'Scene Planning';
        const newCategory = prompt(
            'Edit category (Historical Research, Character Development, Plot Holes, Worldbuilding, Dialogue, Scene Planning):',
            currentCategory
        );

        item.title = cleanTitle;
        if (newCategory !== null && newCategory.trim()) {
            item.category = newCategory.trim();
        }

        this.save();
        this.renderWorkItems();
    },

    /**
     * Open web search for this work item.
     */
    openWebResearch(id) {
        const item = this.storyData.workItems.find(w => w.id === id);
        if (!item) return;

        const query = `${item.title} ${item.category} c drama writing research guide`;
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    },

    /**
     * Run LangChain Open Deep Research for this work item.
     */
    async runDeepResearchWorkItem(id) {
        const item = this.storyData.workItems.find(w => w.id === id);
        if (!item) return;

        const mode = AIService.settings.researchMode || 'both';
        if (mode === 'web') {
            this.openWebResearch(id);
            return;
        }

        const query = `Research this writing task deeply and provide actionable findings.\nTask: ${item.title}\nCategory: ${item.category}\nContext: C-Drama plotting, historical context, character arcs, and script development.`;

        try {
            const result = await AIService.runDeepResearch(query, {
                taskTitle: item.title,
                category: item.category
            });

            this.addAIReport(
                'research',
                `🔎 Deep Research: ${item.title}`,
                result,
                'success'
            );

            alert('Deep research complete and saved to AI reports.');
            this.switchTab('dashboard');
        } catch (error) {
            alert(`Deep research failed: ${error.message}`);
            if (mode === 'both') {
                this.openWebResearch(id);
            }
        }
    },

    /**
     * Render work items
     */
    renderWorkItems() {
        const container = document.getElementById('workitemsContainer');
        const grouped = {};

        this.storyData.workItems.forEach(item => {
            if (!grouped[item.category]) grouped[item.category] = [];
            grouped[item.category].push(item);
        });

        container.innerHTML = Object.entries(grouped).map(([category, items]) => `
            <div class="card">
                <h3>${category}</h3>
                ${items.map(item => `
                    <div class="work-item">
                        <input type="checkbox" ${item.completed ? 'checked' : ''} onchange="App.toggleWorkItem(${item.id})">
                        <span style="flex: 1; ${item.completed ? 'text-decoration: line-through; color: #999;' : ''}">${item.title}</span>
                        <button style="background:#2563eb; margin-right:0.4rem;" onclick="App.editWorkItem(${item.id})">Edit</button>
                        <button style="background:#7c3aed; margin-right:0.4rem;" onclick="App.runDeepResearchWorkItem(${item.id})">Deep Research Agent</button>
                        <button style="background:#4b5563; margin-right:0.4rem;" onclick="App.openWebResearch(${item.id})">Web Search</button>
                        <button class="delete-btn" onclick="App.deleteWorkItem(${item.id})">Delete</button>
                    </div>
                `).join('')}
            </div>
        `).join('');
    },

    // ============ DASHBOARD ============

    /**
     * Update dashboard stats
     */
    updateDashboard() {
        const characters = this.storyData.characters;
        const friendly = characters.filter(c => c.type === 'friendly').length;
        const antagonist = characters.filter(c => c.type === 'antagonist').length;
        const gray = characters.filter(c => c.type === 'gray').length;

        document.getElementById('character-count').textContent = characters.length;
        document.getElementById('event-count').textContent = this.storyData.events.length;
        document.getElementById('friendly-count').textContent = friendly;
        document.getElementById('antagonist-count').textContent = antagonist;
        document.getElementById('gray-count').textContent = gray;

        const totalTasks = this.storyData.workItems.length;
        const completedTasks = this.storyData.workItems.filter(w => w.completed).length;
        const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        document.getElementById('task-count').textContent = totalTasks - completedTasks;
        document.getElementById('completion-percentage').textContent = percentage + '%';
        document.getElementById('completion-bar').style.width = percentage + '%';
    },

    // ============ AI ANALYSIS ============

    /**
     * Update AI status indicator
     */
    updateAIStatus() {
        const indicators = document.querySelectorAll('#aiStatusIndicator, #aiStatusIndicatorSettings');
        const platformLabel = AIService.settings.platform === 'lmstudio' ? 'LM Studio' : 'Ollama';
        const endpoint = `${AIService.settings.host}:${AIService.settings.port}`;
        
        indicators.forEach(indicator => {
            if (AIService.connected) {
                indicator.innerHTML = `<div class="ai-status connected">✅ ${platformLabel} Connected (${endpoint}) - AI features available</div>`;
            } else {
                indicator.innerHTML = `<div class="ai-status disconnected">❌ AI Not Connected - Open Settings to configure LM Studio or Ollama</div>`;
            }
        });
    },

    /**
     * Open AI settings modal
     */
    openAISettings() {
        document.getElementById('aiSettingsModal').classList.add('active');
        document.querySelector(`input[name="aiPlatform"][value="${AIService.settings.platform}"]`).checked = true;
        this.updateAIPlatformInfo(AIService.settings.platform);
        document.getElementById('aiHost').value = AIService.settings.host;
        document.getElementById('aiPort').value = AIService.settings.port;
        document.getElementById('selectedModel').value = AIService.settings.model;
        document.getElementById('imageProvider').value = AIService.settings.imageProvider || 'openai_compatible';
        document.getElementById('imageApiUrl').value = AIService.settings.imageApiUrl || '';
        document.getElementById('imageModel').value = AIService.settings.imageModel || '';
        document.getElementById('imageApiKey').value = AIService.settings.imageApiKey || '';
        document.getElementById('nanoBananaApiKey').value = AIService.settings.nanoBananaApiKey || '';
        document.getElementById('researchMode').value = AIService.settings.researchMode || 'both';
        document.getElementById('deepResearchApiUrl').value = AIService.settings.deepResearchApiUrl || '';
        document.getElementById('deepResearchApiKey').value = AIService.settings.deepResearchApiKey || '';
        this.updateImageProviderUI(document.getElementById('imageProvider').value);
        this.renderModelList();
    },

    /**
     * Close AI settings modal
     */
    closeAISettings() {
        document.getElementById('aiSettingsModal').classList.remove('active');
    },

    /**
     * Update AI platform info
     */
    updateAIPlatformInfo(platform) {
        const infoDiv = document.getElementById('platformInfo');
        if (platform === 'lmstudio') {
            infoDiv.innerHTML = 'LM Studio runs locally on your machine. Download from <strong>lmstudio.ai</strong><br>Default: 127.0.0.1:1234 (you can also paste full URL)';
        } else {
            infoDiv.innerHTML = 'Ollama is a lightweight local AI tool. Download from <strong>ollama.ai</strong><br>Default: 127.0.0.1:11434 (you can also paste full URL)';
        }
    },

    /**
     * Update AI platform selection
     */
    updateAIPlatform(platform) {
        AIService.settings.platform = platform;
        this.updateAIPlatformInfo(platform);
    },

    /**
     * Test AI connection
     */
    async testAIConnection() {
        const host = document.getElementById('aiHost').value.trim();
        const port = document.getElementById('aiPort').value.trim();
        const platform = document.querySelector('input[name="aiPlatform"]:checked').value;
        const statusDiv = document.getElementById('aiConnectionStatus');
        
        statusDiv.innerHTML = '<div class="ai-status analyzing"><span class="spinner"></span> Testing connection...</div>';
        
        const result = await AIService.testConnection(host, port, platform);
        
        if (result.success) {
            statusDiv.innerHTML = `<div class="ai-status connected">✅ Connected to ${result.baseURL}</div>`;
            AIService.settings.host = result.host;
            AIService.settings.port = result.port;
            AIService.settings.platform = platform;
            await AIService.loadAvailableModels();
            this.renderModelList();
            document.getElementById('aiHost').value = result.host;
            document.getElementById('aiPort').value = result.port;
        } else {
            statusDiv.innerHTML = `<div class="ai-status disconnected">❌ ${result.message}<br>Tip: for LM Studio use http://127.0.0.1:1234 or 127.0.0.1 + port 1234.</div>`;
        }
    },

    /**
     * Render available models list
     */
    renderModelList() {
        const modelDiv = document.getElementById('modelList');
        
        if (AIService.availableModels.length === 0) {
            modelDiv.innerHTML = '<div class="model-item text-gray-500">No models detected. Load a model in your AI platform first.</div>';
            return;
        }
        
        modelDiv.innerHTML = AIService.availableModels.map(model => {
            const modelName = model.name || model.id || model;
            return `<div class="model-item">📦 ${modelName}</div>`;
        }).join('');
    },

    /**
     * Save AI settings
     */
    saveAISettings() {
        const hostInput = document.getElementById('aiHost').value.trim();
        const portInput = document.getElementById('aiPort').value.trim();
        const model = document.getElementById('selectedModel').value.trim() || 'auto';
        const imageProvider = document.getElementById('imageProvider').value;
        const imageApiUrl = document.getElementById('imageApiUrl').value.trim();
        const imageModel = document.getElementById('imageModel').value.trim();
        const imageApiKey = document.getElementById('imageApiKey').value.trim();
        const nanoBananaApiKey = document.getElementById('nanoBananaApiKey').value.trim();
        const researchMode = document.getElementById('researchMode').value;
        const deepResearchApiUrl = document.getElementById('deepResearchApiUrl').value.trim();
        const deepResearchApiKey = document.getElementById('deepResearchApiKey').value.trim();
        const platform = document.querySelector('input[name="aiPlatform"]:checked').value;
        const statusDiv = document.getElementById('aiConnectionStatus');

        let normalized;
        try {
            normalized = AIService.normalizeConnectionSettings(hostInput, portInput, platform);
        } catch (error) {
            statusDiv.innerHTML = `<div class="ai-status disconnected">❌ ${error.message}</div>`;
            return;
        }

        AIService.updateSettings({
            host: normalized.host,
            port: normalized.port,
            model,
            platform,
            imageProvider,
            imageApiUrl,
            imageModel,
            imageApiKey,
            nanoBananaApiKey,
            researchMode,
            deepResearchApiUrl,
            deepResearchApiKey
        });
        this.closeAISettings();
        this.updateAIStatus();
        alert(`AI Settings saved (${normalized.baseURL})`);
    },

    updateImageProviderUI(provider) {
        const openaiFields = document.getElementById('openAIImageFields');
        const nanoFields = document.getElementById('nanoBananaFields');
        if (!openaiFields || !nanoFields) return;

        if (provider === 'nano_banana_acedata') {
            openaiFields.style.display = 'none';
            nanoFields.style.display = 'block';
        } else {
            openaiFields.style.display = 'block';
            nanoFields.style.display = 'none';
        }
    },

    onImageProviderChange() {
        const provider = document.getElementById('imageProvider')?.value || 'openai_compatible';
        this.updateImageProviderUI(provider);
    },

    /**
     * Build scene prompts from timeline / plot data.
     */
    buildVisualPrompts(source, count, style) {
        const timelineItems = this.storyData.events.map(e =>
            `${e.title} (${e.period || 'Unknown period'}) - ${e.description || 'No description'}`
        );
        const plotItems = this.storyData.plot.map(p => `${p.act} - ${p.content}`);
        let baseItems = [];

        if (source === 'timeline') {
            baseItems = timelineItems;
        } else if (source === 'plot') {
            baseItems = plotItems;
        } else {
            baseItems = [...timelineItems, ...plotItems];
        }

        if (baseItems.length === 0) {
            return [];
        }

        const prompts = [];
        for (let i = 0; i < Math.min(count, baseItems.length); i += 1) {
            prompts.push(
                `Create a cinematic storyboard frame for this C-Drama story moment: ${baseItems[i]}. `
                + `Visual style: ${style || 'cinematic Tang Dynasty historical drama'}. `
                + 'Detailed environment, expressive characters, no text overlays.'
            );
        }
        return prompts;
    },

    /**
     * Render stored visual generations.
     */
    renderVisualGallery() {
        const gallery = document.getElementById('visualGallery');
        if (!gallery) return;

        const visuals = Array.isArray(this.storyData.aiVisuals) ? this.storyData.aiVisuals : [];
        if (visuals.length === 0) {
            gallery.innerHTML = '<div class="ai-result">No visual scenes generated yet.</div>';
            return;
        }

        gallery.innerHTML = `
            <div class="visual-gallery-grid">
                ${visuals.map(item => `
                    <div class="visual-card">
                        <img src="${item.imageUrl}" alt="Generated scene" class="visual-image">
                        <div class="visual-meta">
                            <div class="text-sm text-gray-600">${new Date(item.createdAt).toLocaleString()}</div>
                            <p>${this.escapeHTML(item.prompt)}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    // ============ STORYBOARD BUILDER (Timeline prompts + user-pasted images) ============

    ensureStoryboardState() {
        if (!this.storyData.visualStoryboard || typeof this.storyData.visualStoryboard !== 'object') {
            this.storyData.visualStoryboard = { version: 1, items: [] };
        }
        if (!Array.isArray(this.storyData.visualStoryboard.items)) {
            this.storyData.visualStoryboard.items = [];
        }
    },

    buildStoryboardPromptFromEvent(event) {
        const beatLabels = {
            '1': 'You (establish protagonist)',
            '2': 'Need (something isn’t right)',
            '3': 'Go! (crossing threshold)',
            '4': 'Search (road of trials)',
            '5': 'Find (meeting goddess)',
            '6': 'Take (paying the price)',
            '7': 'Return (bringing it home)',
            '8': 'Change (master of both)'
        };
        const beat = event?.beat ? String(event.beat) : '';
        const beatText = beat ? `Story Circle Beat ${beat} — ${beatLabels[beat] || ''}` : 'No Story Circle beat assigned';
        const title = String(event?.title || 'Untitled scene').trim();
        const period = String(event?.period || 'Unknown period/act').trim();
        const summary = String(event?.description || '').trim();
        const notes = String(event?.fullDescription || '').trim();

        const parts = [];
        parts.push(`SCENE: ${title}`);
        parts.push(`WHEN/ACT: ${period}`);
        parts.push(beatText);
        if (summary) parts.push(`SUMMARY: ${summary}`);
        if (notes) parts.push(`NOTES: ${notes}`);
        parts.push('');
        parts.push('IMAGE PROMPT (copy into your external generator):');
        parts.push(
            `Create a cinematic C-drama storyboard frame for the scene above. `
            + `Tang Dynasty historical drama look (unless story dictates otherwise), realistic costumes, expressive faces, dramatic lighting, `
            + `clear foreground action, rich environment detail, no text overlays, no watermarks.`
        );
        return parts.join('\n');
    },

    syncStoryboardFromTimeline() {
        this.ensureStoryboardState();
        const events = Array.isArray(this.storyData.events) ? this.storyData.events : [];
        const ordered = [...events].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));

        const existingByEventId = new Map(
            this.storyData.visualStoryboard.items
                .filter(i => i && i.eventId != null)
                .map(i => [i.eventId, i])
        );

        this.storyData.visualStoryboard.items = ordered.map(ev => {
            const prev = existingByEventId.get(ev.id);
            return {
                id: prev?.id || (Date.now() + ev.id),
                eventId: ev.id,
                title: ev.title || `Event ${ev.id}`,
                prompt: prev?.prompt || this.buildStoryboardPromptFromEvent(ev),
                image: prev?.image || null,
                imageSource: prev?.imageSource || null,
                updatedAt: new Date().toISOString()
            };
        });

        StorageService.saveStoryData(this.storyData);
        this.renderStoryboard();
        const status = document.getElementById('storyboardStatus');
        if (status) status.innerHTML = '<div class="ai-status connected">✅ Storyboard synced from Timeline.</div>';
    },

    clearStoryboard() {
        if (!confirm('Clear the storyboard prompts/images?')) return;
        this.ensureStoryboardState();
        this.storyData.visualStoryboard.items = [];
        StorageService.saveStoryData(this.storyData);
        this.renderStoryboard();
        const status = document.getElementById('storyboardStatus');
        if (status) status.innerHTML = '<div class="ai-status">Storyboard cleared.</div>';
    },

    renderStoryboard() {
        const container = document.getElementById('storyboardContainer');
        if (!container) return;

        this.ensureStoryboardState();
        const items = this.storyData.visualStoryboard.items;
        if (!items.length) {
            container.innerHTML = '<div class="ai-result">No storyboard yet. Click “Sync from Timeline” to generate prompts.</div>';
            return;
        }

        container.innerHTML = `
            <div class="storyboard-grid">
                ${items.map(item => this.renderStoryboardCard(item)).join('')}
            </div>
        `;
    },

    renderStoryboardCard(item) {
        const imgSrc = item?.image?.value || '';
        const hasImage = Boolean(imgSrc);
        const safeTitle = this.escapeHTML(item?.title || 'Scene');
        const prompt = this.escapeHTML(item?.prompt || '');

        return `
            <div class="storyboard-card" data-storyboard-id="${item.id}">
                <div class="storyboard-card-header">
                    <div>
                        <div class="storyboard-card-title">${safeTitle}</div>
                        <div class="text-sm text-gray-600">Timeline Event: E${item.eventId}</div>
                    </div>
                    <div style="display:flex; gap:0.4rem; flex-wrap: wrap;">
                        <button style="background:#16a34a; padding:0.45rem 0.7rem; font-size:0.8rem;" onclick="App.copyStoryboardPrompt(${item.id})">Copy Prompt</button>
                        <button style="background:#2563eb; padding:0.45rem 0.7rem; font-size:0.8rem;" onclick="App.regenStoryboardPrompt(${item.id})">Rebuild</button>
                    </div>
                </div>
                <div class="storyboard-card-body">
                    <textarea class="storyboard-prompt" oninput="App.updateStoryboardPrompt(${item.id}, this.value)">${prompt}</textarea>
                    <div style="margin-top:0.75rem;">
                        ${hasImage
                            ? `<img class="storyboard-image" src="${this.escapeHTML(imgSrc)}" alt="Storyboard scene image">`
                            : `<div class="storyboard-image" style="display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:0.9rem;">No image yet</div>`
                        }
                    </div>
                    <div class="storyboard-dropzone" onpaste="App.handleStoryboardPaste(event, ${item.id})">
                        <strong>Paste / Attach Image</strong>
                        <div class="text-sm text-gray-600">- Paste an image (clipboard) into this box, or paste an image URL below, or upload a file.</div>
                        <input type="text" placeholder="Paste image URL (https://... or data:image/...)" value="${this.escapeHTML(imgSrc)}" oninput="App.setStoryboardImageUrl(${item.id}, this.value)">
                        <div class="storyboard-actions">
                            <input type="file" accept="image/*" onchange="App.uploadStoryboardImage(${item.id}, this.files?.[0] || null)" />
                            <button style="background:#ef4444; padding:0.45rem 0.7rem; font-size:0.8rem;" onclick="App.removeStoryboardImage(${item.id})">Remove Image</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    copyStoryboardPrompt(itemId) {
        this.ensureStoryboardState();
        const item = this.storyData.visualStoryboard.items.find(i => i.id === itemId);
        if (!item) return;
        navigator.clipboard.writeText(item.prompt || '').catch(() => {});
        const status = document.getElementById('storyboardStatus');
        if (status) status.innerHTML = '<div class="ai-status connected">✅ Prompt copied.</div>';
    },

    regenStoryboardPrompt(itemId) {
        this.ensureStoryboardState();
        const item = this.storyData.visualStoryboard.items.find(i => i.id === itemId);
        if (!item) return;
        const ev = (Array.isArray(this.storyData.events) ? this.storyData.events : []).find(e => e.id === item.eventId);
        if (!ev) return;
        item.prompt = this.buildStoryboardPromptFromEvent(ev);
        item.updatedAt = new Date().toISOString();
        StorageService.saveStoryData(this.storyData);
        this.renderStoryboard();
    },

    updateStoryboardPrompt(itemId, newValue) {
        this.ensureStoryboardState();
        const item = this.storyData.visualStoryboard.items.find(i => i.id === itemId);
        if (!item) return;
        item.prompt = String(newValue || '');
        item.updatedAt = new Date().toISOString();
        StorageService.saveStoryData(this.storyData);
    },

    setStoryboardImageUrl(itemId, url) {
        this.ensureStoryboardState();
        const item = this.storyData.visualStoryboard.items.find(i => i.id === itemId);
        if (!item) return;
        const clean = String(url || '').trim();
        if (!clean) {
            item.image = null;
            item.imageSource = null;
        } else {
            item.image = { type: clean.startsWith('data:image/') ? 'data' : 'url', value: clean };
            item.imageSource = 'url';
        }
        item.updatedAt = new Date().toISOString();
        StorageService.saveStoryData(this.storyData);
        this.renderStoryboard();
    },

    removeStoryboardImage(itemId) {
        this.ensureStoryboardState();
        const item = this.storyData.visualStoryboard.items.find(i => i.id === itemId);
        if (!item) return;
        item.image = null;
        item.imageSource = null;
        item.updatedAt = new Date().toISOString();
        StorageService.saveStoryData(this.storyData);
        this.renderStoryboard();
    },

    uploadStoryboardImage(itemId, file) {
        if (!file) return;
        this.ensureStoryboardState();
        const item = this.storyData.visualStoryboard.items.find(i => i.id === itemId);
        if (!item) return;

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            item.image = { type: 'data', value: dataUrl };
            item.imageSource = 'upload';
            item.updatedAt = new Date().toISOString();
            StorageService.saveStoryData(this.storyData);
            this.renderStoryboard();
        };
        reader.readAsDataURL(file);
    },

    handleStoryboardPaste(event, itemId) {
        try {
            const items = event.clipboardData?.items || [];
            for (let i = 0; i < items.length; i += 1) {
                const it = items[i];
                if (it.type && it.type.startsWith('image/')) {
                    const file = it.getAsFile();
                    if (file) {
                        event.preventDefault();
                        this.uploadStoryboardImage(itemId, file);
                        const status = document.getElementById('storyboardStatus');
                        if (status) status.innerHTML = '<div class="ai-status connected">✅ Image pasted into storyboard.</div>';
                        return;
                    }
                }
            }
        } catch (error) {
            // Ignore paste parsing failures.
        }
    },

    /**
     * Generate storyboard visuals from story context.
     */
    async generateStoryVisuals() {
        const status = document.getElementById('visualizerStatus');
        const source = document.getElementById('visualSource')?.value || 'both';
        const count = Number.parseInt(document.getElementById('visualCount')?.value || '4', 10);
        const style = document.getElementById('visualStyle')?.value?.trim() || '';

        const prompts = this.buildVisualPrompts(source, count, style);
        if (prompts.length === 0) {
            status.innerHTML = '<div class="ai-status disconnected">❌ Add timeline events or plot items first.</div>';
            return;
        }

        status.innerHTML = '<div class="ai-status analyzing"><span class="spinner"></span> Generating visual scenes...</div>';

        if (!Array.isArray(this.storyData.aiVisuals)) {
            this.storyData.aiVisuals = [];
        }

        try {
            for (let i = 0; i < prompts.length; i += 1) {
                status.innerHTML = `<div class="ai-status analyzing"><span class="spinner"></span> Generating scene ${i + 1}/${prompts.length}...</div>`;
                const imageUrl = await AIService.generateImage(prompts[i]);
                this.storyData.aiVisuals.unshift({
                    id: Date.now() + i,
                    prompt: prompts[i],
                    imageUrl,
                    createdAt: new Date().toISOString()
                });
            }

            this.storyData.aiVisuals = this.storyData.aiVisuals.slice(0, 40);
            this.save();
            status.innerHTML = '<div class="ai-status connected">✅ Visual storyboard generated and saved.</div>';
        } catch (error) {
            status.innerHTML = `<div class="ai-status disconnected">❌ ${error.message}</div>`;
        }
    },

    /**
     * Clear generated visuals.
     */
    clearVisuals() {
        if (!confirm('Clear all generated visual scenes?')) return;
        this.storyData.aiVisuals = [];
        this.save();
        const status = document.getElementById('visualizerStatus');
        if (status) {
            status.innerHTML = '<div class="ai-status">Visual gallery cleared.</div>';
        }
    },

    /**
     * Save a single AI report entry.
     */
    addAIReport(type, title, content, status = 'success') {
        if (!Array.isArray(this.storyData.aiReports)) {
            this.storyData.aiReports = [];
        }

        this.storyData.aiReports.unshift({
            id: Date.now(),
            type,
            title,
            content,
            status,
            createdAt: new Date().toISOString()
        });

        // Keep history bounded for performance.
        if (this.storyData.aiReports.length > 50) {
            this.storyData.aiReports = this.storyData.aiReports.slice(0, 50);
        }

        this.save();
    },

    /**
     * Render persistent AI report history.
     */
    renderAIReports() {
        const container = document.getElementById('aiResultsContainer');
        if (!container) return;

        const reports = Array.isArray(this.storyData.aiReports) ? this.storyData.aiReports : [];
        if (reports.length === 0) {
            container.innerHTML = '<div class="ai-result">No AI reports yet. Run an analysis to save your first report.</div>';
            return;
        }

        container.innerHTML = reports.map(report => {
            const cssClass = report.status === 'error'
                ? 'issue'
                : (report.type === 'continuity' ? 'warning' : 'suggestion');
            const timestamp = new Date(report.createdAt).toLocaleString();
            const suggestedTab = this.inferReportTargetTab(report);
            const suggestedLabel = this.getTabDisplayName(suggestedTab);
            return `<div class="ai-result ${cssClass}" style="margin-bottom: 1rem;">
                <strong>${report.title}</strong>
                <div class="text-sm text-gray-600" style="margin-top: 0.25rem;">${timestamp}</div>
                <div style="margin-top: 1rem; white-space: pre-wrap;">${this.formatReportContent(report.content)}</div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem;">
                    <button style="background: #2563eb; font-size: 0.85rem; padding: 0.5rem 0.75rem;" onclick="App.openReportTarget(${report.id})">Open Suggested Area (${suggestedLabel})</button>
                    <button style="background: #16a34a; font-size: 0.85rem; padding: 0.5rem 0.75rem;" onclick="App.addReportToWorkItems(${report.id})">Add as Work Item</button>
                </div>
            </div>`;
        }).join('');
    },

    /**
     * Escape user/model-provided text before rendering.
     */
    escapeHTML(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    /**
     * Highlight likely actionable issue lines in reports.
     */
    formatReportContent(rawContent) {
        const lines = String(rawContent || '').split('\n');
        return lines.map(line => {
            const escaped = this.escapeHTML(line);
            const normalized = line.trim().toLowerCase();
            const isActionLine = /^\d+[\).\s:-]/.test(normalized)
                || normalized.startsWith('- ')
                || normalized.includes('issue')
                || normalized.includes('inconsisten')
                || normalized.includes('plot hole')
                || normalized.includes('concern')
                || normalized.includes('risk');
            return isActionLine
                ? `<div class="report-action-line">${escaped}</div>`
                : `<div>${escaped || '&nbsp;'}</div>`;
        }).join('');
    },

    /**
     * Parse reports into condensed actionable items.
     */
    getAIActionItems() {
        const reports = Array.isArray(this.storyData.aiReports) ? this.storyData.aiReports : [];
        const items = [];

        reports.forEach(report => {
            const lines = String(report.content || '')
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean);

            let actionableLines = lines.filter(line => {
                const normalized = line.toLowerCase();
                return /^\d+[\).\s:-]/.test(normalized)
                    || normalized.startsWith('- ')
                    || normalized.includes('issue')
                    || normalized.includes('inconsisten')
                    || normalized.includes('plot hole')
                    || normalized.includes('concern')
                    || normalized.includes('risk');
            });

            if (actionableLines.length === 0 && lines.length > 0) {
                actionableLines = [lines[0]];
            }

            actionableLines.slice(0, 4).forEach(line => {
                const cleaned = line.replace(/^\s*[-*]?\s*\d*[\).\:-]?\s*/, '').trim();
                if (!cleaned) return;
                items.push({
                    id: `${report.id}-${items.length}`,
                    reportId: report.id,
                    text: cleaned,
                    suggestedTab: this.inferReportTargetTab(report)
                });
            });
        });

        return items.slice(0, 25);
    },

    /**
     * Render dashboard action queue + dedicated action-items tab.
     */
    renderAIActionItems() {
        const queueContainer = document.getElementById('aiActionQueue');
        const tabContainer = document.getElementById('aiActionItemsContainer');
        const items = this.getAIActionItems();

        const renderItemRow = (item) => `
            <div class="ai-action-item">
                <div class="ai-action-item-text">🔴 ${this.escapeHTML(item.text)}</div>
                <div class="ai-action-item-actions">
                    <button style="background: #2563eb; font-size: 0.8rem; padding: 0.45rem 0.7rem;" onclick="App.switchTab('${item.suggestedTab}')">Open ${this.getTabDisplayName(item.suggestedTab)}</button>
                    <button style="background: #16a34a; font-size: 0.8rem; padding: 0.45rem 0.7rem;" onclick="App.addActionItemToWorkItems('${item.id}')">Add Task</button>
                </div>
            </div>
        `;

        if (queueContainer) {
            if (items.length === 0) {
                queueContainer.innerHTML = '<div class="ai-status">No pending AI action items yet.</div>';
            } else {
                queueContainer.innerHTML = `
                    <div class="ai-action-queue">
                        <div class="ai-action-queue-header">
                            <strong>🚨 Priority Action Queue</strong>
                            <button style="background: #dc2626; font-size: 0.8rem; padding: 0.45rem 0.7rem;" onclick="App.switchTab('ai-actions')">View All (${items.length})</button>
                        </div>
                        ${items.slice(0, 5).map(renderItemRow).join('')}
                    </div>
                `;
            }
        }

        if (tabContainer) {
            if (items.length === 0) {
                tabContainer.innerHTML = '<div class="ai-result">No action items extracted yet. Run AI analysis to populate this list.</div>';
            } else {
                tabContainer.innerHTML = items.map(renderItemRow).join('');
            }
        }
    },

    /**
     * Turn one extracted action item into a work item.
     */
    addActionItemToWorkItems(actionItemId) {
        const actionItem = this.getAIActionItems().find(item => item.id === actionItemId);
        if (!actionItem) return;

        const categoryMap = {
            timeline: 'Scene Planning',
            characters: 'Character Development',
            plot: 'Plot Holes',
            politics: 'Worldbuilding',
            workitems: 'Scene Planning'
        };

        this.storyData.workItems.push({
            id: Math.max(...this.storyData.workItems.map(w => w.id), 0) + 1,
            title: `AI Follow-up: ${actionItem.text}`.slice(0, 120),
            category: categoryMap[actionItem.suggestedTab] || 'Scene Planning',
            completed: false
        });

        this.save();
        this.switchTab('workitems');
    },

    /**
     * Guess the best tab to resolve a report.
     */
    inferReportTargetTab(report) {
        const text = `${report.title}\n${report.content}`.toLowerCase();
        if (text.includes('timeline') || text.includes('continuity') || text.includes('chronology') || text.includes('beat')) return 'timeline';
        if (text.includes('character') || text.includes('relationship') || text.includes('motivation') || text.includes('arc')) return 'characters';
        if (text.includes('politic') || text.includes('court') || text.includes('faction')) return 'politics';
        if (text.includes('plot') || text.includes('inconsisten') || text.includes('hole') || text.includes('pacing') || text.includes('time travel')) return 'plot';
        return 'workitems';
    },

    /**
     * Human label for tab names.
     */
    getTabDisplayName(tabName) {
        const labels = {
            dashboard: 'Dashboard',
            characters: 'Characters',
            timeline: 'Timeline',
            plot: 'Plot',
            politics: 'Politics',
            workitems: 'Work Items',
            'master-document': 'Master Document',
            visualizer: 'AI Visualizer',
            'ai-actions': 'AI Action Items',
            'ai-settings': 'AI Settings'
        };
        return labels[tabName] || 'Work Items';
    },

    /**
     * Open the app area suggested by a specific report.
     */
    openReportTarget(reportId) {
        const report = this.storyData.aiReports.find(r => r.id === reportId);
        if (!report) return;
        const tab = this.inferReportTargetTab(report);
        this.switchTab(tab);
    },

    /**
     * Convert report into an actionable work item.
     */
    addReportToWorkItems(reportId) {
        const report = this.storyData.aiReports.find(r => r.id === reportId);
        if (!report) return;

        const firstIssueLine = report.content
            .split('\n')
            .map(line => line.replace(/^\s*[-*]?\s*\d*[\).\:-]?\s*/, '').trim())
            .find(line => line.length > 12);

        const title = firstIssueLine
            ? `AI Follow-up: ${firstIssueLine}`.slice(0, 120)
            : `AI Follow-up: Review "${report.title}"`;

        const targetTab = this.inferReportTargetTab(report);
        const categoryMap = {
            timeline: 'Scene Planning',
            characters: 'Character Development',
            plot: 'Plot Holes',
            politics: 'Worldbuilding',
            workitems: 'Scene Planning'
        };

        this.storyData.workItems.push({
            id: Math.max(...this.storyData.workItems.map(w => w.id), 0) + 1,
            title,
            category: categoryMap[targetTab] || 'Scene Planning',
            completed: false
        });

        this.save();
        const status = document.getElementById('aiRunStatus');
        if (status) {
            status.innerHTML = '<div class="ai-status connected">✅ Added report item to Work Items.</div>';
        }
        this.switchTab('workitems');
    },

    /**
     * Clear all saved AI reports.
     */
    clearAIReports() {
        if (!confirm('Clear all saved AI reports?')) return;
        this.storyData.aiReports = [];
        this.save();
        const status = document.getElementById('aiRunStatus');
        if (status) {
            status.innerHTML = '<div class="ai-status">Report history cleared.</div>';
        }
    },

    /**
     * Analyze story
     */
    async analyzeStory() {
        const runStatus = document.getElementById('aiRunStatus');
        runStatus.innerHTML = '<div class="ai-result"><span class="spinner"></span> Analyzing your entire story...</div>';

        try {
            const result = await AIService.analyzeStory(this.storyData);
            if (result) {
                this.addAIReport('story', '📊 Full Story Analysis', result, 'success');
                runStatus.innerHTML = '<div class="ai-status connected">✅ Full story analysis saved to report history.</div>';
            } else {
                const message = 'Failed to get analysis. Check AI connection in settings.';
                this.addAIReport('story', '📊 Full Story Analysis', message, 'error');
                runStatus.innerHTML = `<div class="ai-status disconnected">❌ ${message}</div>`;
            }
        } catch (error) {
            this.addAIReport('story', '📊 Full Story Analysis', `Error: ${error.message}`, 'error');
            runStatus.innerHTML = '<div class="ai-status disconnected">❌ Error: ' + error.message + '</div>';
        }
    },

    /**
     * Analyze continuity
     */
    async analyzeContinuity() {
        const runStatus = document.getElementById('aiRunStatus');
        runStatus.innerHTML = '<div class="ai-result"><span class="spinner"></span> Checking story continuity...</div>';

        try {
            const result = await AIService.analyzeContinuity(this.storyData);
            if (result) {
                this.addAIReport('continuity', '🔗 Continuity Analysis', result, 'success');
                runStatus.innerHTML = '<div class="ai-status connected">✅ Continuity report saved to history.</div>';
            } else {
                const message = 'Failed to check continuity. Check AI connection in settings.';
                this.addAIReport('continuity', '🔗 Continuity Analysis', message, 'error');
                runStatus.innerHTML = `<div class="ai-status disconnected">❌ ${message}</div>`;
            }
        } catch (error) {
            this.addAIReport('continuity', '🔗 Continuity Analysis', `Error: ${error.message}`, 'error');
            runStatus.innerHTML = '<div class="ai-status disconnected">❌ Error: ' + error.message + '</div>';
        }
    },

    /**
     * Analyze characters
     */
    async analyzeCharacters() {
        const runStatus = document.getElementById('aiRunStatus');
        runStatus.innerHTML = '<div class="ai-result"><span class="spinner"></span> Analyzing character development...</div>';

        try {
            const result = await AIService.analyzeCharacters(this.storyData);
            if (result) {
                this.addAIReport('characters', '👥 Character Development Analysis', result, 'success');
                runStatus.innerHTML = '<div class="ai-status connected">✅ Character report saved to history.</div>';
            } else {
                const message = 'Failed to analyze characters. Check AI connection in settings.';
                this.addAIReport('characters', '👥 Character Development Analysis', message, 'error');
                runStatus.innerHTML = `<div class="ai-status disconnected">❌ ${message}</div>`;
            }
        } catch (error) {
            this.addAIReport('characters', '👥 Character Development Analysis', `Error: ${error.message}`, 'error');
            runStatus.innerHTML = '<div class="ai-status disconnected">❌ Error: ' + error.message + '</div>';
        }
    },

    /**
     * Analyze plot
     */
    async analyzePlot() {
        const runStatus = document.getElementById('aiRunStatus');
        runStatus.innerHTML = '<div class="ai-result"><span class="spinner"></span> Analyzing plot structure...</div>';

        try {
            const result = await AIService.analyzePlot(this.storyData);
            if (result) {
                this.addAIReport('plot', '📖 Plot Structure Analysis', result, 'success');
                runStatus.innerHTML = '<div class="ai-status connected">✅ Plot report saved to history.</div>';
            } else {
                const message = 'Failed to analyze plot. Check AI connection in settings.';
                this.addAIReport('plot', '📖 Plot Structure Analysis', message, 'error');
                runStatus.innerHTML = `<div class="ai-status disconnected">❌ ${message}</div>`;
            }
        } catch (error) {
            this.addAIReport('plot', '📖 Plot Structure Analysis', `Error: ${error.message}`, 'error');
            runStatus.innerHTML = '<div class="ai-status disconnected">❌ Error: ' + error.message + '</div>';
        }
    }
};

// ============ MODALS CREATION ============

// Character Selector Modal
function createCharacterSelectorModal() {
    const html = `
        <div id="characterSelectorModal" class="character-selector-modal">
            <div class="character-selector-content">
                <span class="modal-close" onclick="App.closeCharacterSelector()">&times;</span>
                <h3>Select Related Characters</h3>
                <div id="characterSelectorList" style="margin-top: 1rem;"></div>
                <button onclick="App.closeCharacterSelector()" style="margin-top: 1rem; width: 100%;">Done</button>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

// Character Editor Modal
function createCharacterEditorModal() {
    const html = `
        <div id="characterEditorModal" class="event-editor-modal">
            <div class="event-editor-content character-editor-content">
                <span class="modal-close" onclick="App.closeCharacterEditor()">&times;</span>
                <h2>Edit Character</h2>
                <div id="characterEditorForm" style="margin-top: 1rem;"></div>
                <button onclick="App.saveCharacterEdit()" style="margin-top: 1rem; width: 100%;">Save Character</button>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

// Event Editor Modal
function createEventEditorModal() {
    const html = `
        <div id="eventEditorModal" class="event-editor-modal">
            <div class="event-editor-content">
                <span class="modal-close" onclick="App.closeEventEditor()">&times;</span>
                <h2>Edit Event</h2>
                <div id="eventEditorForm" style="margin-top: 1rem;"></div>
                <button onclick="App.saveEventEdit()" style="margin-top: 1rem; width: 100%;">Save Event</button>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

// AI Settings Modal
function createAISettingsModal() {
    const html = `
        <div id="aiSettingsModal" class="ai-settings-modal">
            <div class="ai-settings-content">
                <span class="modal-close" onclick="App.closeAISettings()">&times;</span>
                <h2>AI Configuration</h2>
                
                <h3 style="margin-top: 1.5rem; margin-bottom: 1rem;">Select AI Platform</h3>
                <div class="radio-group">
                    <label class="radio-option">
                        <input type="radio" name="aiPlatform" value="lmstudio" onchange="App.updateAIPlatform('lmstudio')">
                        <span>LM Studio</span>
                    </label>
                    <label class="radio-option">
                        <input type="radio" name="aiPlatform" value="ollama" onchange="App.updateAIPlatform('ollama')">
                        <span>Ollama</span>
                    </label>
                </div>

                <div style="background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; font-size: 0.875rem;">
                    <strong>Platform Info:</strong>
                    <p id="platformInfo" style="margin-top: 0.5rem;"></p>
                </div>

                <h3 style="margin-bottom: 1rem;">Connection Settings</h3>
                <div>
                    <label class="block text-sm font-medium mb-2">Host</label>
                    <input type="text" id="aiHost" class="form-input" placeholder="127.0.0.1 or http://127.0.0.1:1234">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Port</label>
                    <input type="number" id="aiPort" class="form-input" placeholder="1234">
                </div>

                <button class="test-connection-btn" style="width: 100%; margin-bottom: 1rem;" onclick="App.testAIConnection()">🔗 Test Connection</button>

                <div id="aiConnectionStatus"></div>

                <h3 style="margin-bottom: 1rem; margin-top: 1.5rem;">Available Models</h3>
                <div id="modelList" class="model-list">
                    <div class="model-item text-gray-500">No models loaded.</div>
                </div>

                <div>
                    <label class="block text-sm font-medium mb-2">Model to Use</label>
                    <input type="text" id="selectedModel" class="form-input" placeholder="auto-detected or enter manually">
                </div>

                <h3 style="margin-bottom: 1rem; margin-top: 1.5rem;">Image Generation (Visualizer)</h3>
                <div>
                    <label class="block text-sm font-medium mb-2">Image Provider</label>
                    <select id="imageProvider" class="form-input" onchange="App.onImageProviderChange()">
                        <option value="openai_compatible">OpenAI-compatible endpoint</option>
                        <option value="nano_banana_acedata">Nano Banana (AceData Cloud)</option>
                    </select>
                </div>

                <div id="openAIImageFields">
                    <div>
                        <label class="block text-sm font-medium mb-2">Image API URL</label>
                        <input type="text" id="imageApiUrl" class="form-input" placeholder="https://api.x.ai/v1/images/generations">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Image Model</label>
                        <input type="text" id="imageModel" class="form-input" placeholder="grok-2-image or gemini image model name">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-2">Image API Key</label>
                        <input type="password" id="imageApiKey" class="form-input" placeholder="Optional if endpoint requires Bearer token">
                    </div>
                    <p class="text-gray-600 text-sm" style="margin-top: 0.5rem;">
                        Uses an OpenAI-compatible image endpoint (POST with model + prompt). You can plug in Grok Imagine, Gemini-compatible gateways, or other providers.
                    </p>
                </div>

                <div id="nanoBananaFields" style="display:none;">
                    <div>
                        <label class="block text-sm font-medium mb-2">Nano Banana API Key</label>
                        <input type="password" id="nanoBananaApiKey" class="form-input" placeholder="Bearer token for AceData Cloud">
                    </div>
                    <p class="text-gray-600 text-sm" style="margin-top: 0.5rem;">
                        Uses https://api.acedata.cloud/nano-banana/images with JSON {"action":"generate","prompt": "...", "count": 1}.
                    </p>
                </div>

                <h3 style="margin-bottom: 1rem; margin-top: 1.5rem;">Deep Research (LangChain Open Deep Research)</h3>
                <div>
                    <label class="block text-sm font-medium mb-2">Research Mode</label>
                    <select id="researchMode" class="form-input">
                        <option value="agent">Agent only</option>
                        <option value="web">Web only</option>
                        <option value="both">Agent first, then web fallback</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Deep Research API URL</label>
                    <input type="text" id="deepResearchApiUrl" class="form-input" placeholder="http://127.0.0.1:2024/research">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Deep Research API Key</label>
                    <input type="password" id="deepResearchApiKey" class="form-input" placeholder="Optional Bearer token">
                </div>
                <p class="text-gray-600 text-sm" style="margin-top: 0.5rem;">
                    Set this endpoint to your LangChain Open Deep Research server. Work item buttons allow agent research and optional web fallback.
                </p>

                <button onclick="App.saveAISettings()" style="margin-top: 1.5rem; width: 100%;">Save Settings</button>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

// Initialize modals and app
createCharacterSelectorModal();
createCharacterEditorModal();
createEventEditorModal();
createAISettingsModal();

// Start the application
App.init();
