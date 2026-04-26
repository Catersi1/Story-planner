/**
 * Main Application Module
 * Core application logic and UI management
 */

const App = {
    storyData: StorageService.loadStoryData(),
    currentEditingEventId: null,
    currentEditingCharacterId: null,
    MASTER_DOC_VERSION: 1,
    timelineSortable: null,
    draggingCharacterId: null,
    relationshipDraft: { fromId: null, toId: null, type: 'other', notes: '' },
    inlineEdit: {
        kind: null, // 'character' | 'event'
        id: null,
        field: null, // 'name' | 'title' | 'beat'
        value: ''
    },
    commandPalette: {
        open: false,
        query: '',
        activeIndex: 0
    },
    suggestedActionsUI: {
        selected: {} // idx -> boolean
    },
    globalSearch: {
        query: '',
        characterTypes: new Set(),
        beats: new Set()
    },
    canonUI: {
        targetType: null, // 'character' | 'timeline' | 'workItem'
        targetId: null,
        showCanonOnlyCharacters: false,
        showCanonOnlyTimeline: false,
        showCanonOnlyWorkItems: false
    },
    importNotesState: {
        activeTab: 'paste',
        rawText: '',
        loading: false,
        extracted: null,
        conflicts: {
            characters: [],
            timelineEvents: [],
            workItems: []
        },
        conflictResolutions: {
            // key -> 'keep' | 'draft' | 'replace'
        },
        selections: {
            characters: {},
            timelineEvents: {},
            relationships: {},
            politics: {},
            workItems: {}
        }
    },

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

    // ============ COMMAND PALETTE ============

    getCommands() {
        return [
            { id: 'add-character', label: 'Add Character', run: () => { this.switchTab('characters'); setTimeout(() => document.getElementById('newCharName')?.focus(), 0); } },
            { id: 'add-timeline', label: 'Add Timeline Event', run: () => { this.switchTab('timeline'); setTimeout(() => document.getElementById('newEventTitle')?.focus(), 0); } },
            { id: 'analyze-story', label: 'Analyze Story', run: () => { this.switchTab('dashboard'); this.analyzeStory(); } },
            { id: 'gen-master', label: 'Generate Master Document', run: () => { this.switchTab('master-document'); this.regenerateMasterDocument(); } },
            { id: 'import-notes', label: 'Import Notes', run: () => { this.switchTab('dashboard'); this.openImportNotesModal(); } }
        ];
    },

    openCommandPalette() {
        document.getElementById('commandPaletteModal')?.classList.add('active');
        this.commandPalette.open = true;
        this.commandPalette.query = '';
        this.commandPalette.activeIndex = 0;
        const input = document.getElementById('commandPaletteInput');
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 0);
        }
        this.renderCommandPaletteList();
    },

    closeCommandPalette() {
        document.getElementById('commandPaletteModal')?.classList.remove('active');
        this.commandPalette.open = false;
    },

    onCommandPaletteQuery(q) {
        this.commandPalette.query = String(q || '');
        this.commandPalette.activeIndex = 0;
        this.renderCommandPaletteList();
    },

    onCommandPaletteKeydown(e) {
        const list = this.getFilteredCommands();
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.commandPalette.activeIndex = Math.min(this.commandPalette.activeIndex + 1, Math.max(0, list.length - 1));
            this.renderCommandPaletteList();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.commandPalette.activeIndex = Math.max(this.commandPalette.activeIndex - 1, 0);
            this.renderCommandPaletteList();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const cmd = list[this.commandPalette.activeIndex] || list[0];
            if (cmd) {
                this.closeCommandPalette();
                cmd.run();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.closeCommandPalette();
        }
    },

    getFilteredCommands() {
        const q = this.commandPalette.query.trim().toLowerCase();
        const cmds = this.getCommands();
        if (!q) return cmds;
        return cmds.filter(c => c.label.toLowerCase().includes(q));
    },

    renderCommandPaletteList() {
        const container = document.getElementById('commandPaletteList');
        if (!container) return;

        const list = this.getFilteredCommands();
        if (list.length === 0) {
            container.innerHTML = '<div class="ai-result">No matches.</div>';
            return;
        }

        container.innerHTML = `
            <div class="preview-card" style="margin:0;">
                <ul class="preview-list" style="margin:0;">
                    ${list.map((cmd, idx) => `
                        <li class="preview-item" style="cursor:pointer; ${idx === this.commandPalette.activeIndex ? 'background: rgba(37, 99, 235, 0.10); border-radius: 0.75rem; padding-left: 0.45rem; padding-right: 0.45rem;' : ''}"
                            onclick="App.closeCommandPalette(); App.runCommandById('${cmd.id}')"
                        >
                            <div style="flex:1;">
                                <div class="preview-item-title">${this.escapeHTML(cmd.label)}</div>
                            </div>
                            <div class="preview-item-sub">${idx === this.commandPalette.activeIndex ? 'Enter' : ''}</div>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    },

    runCommandById(id) {
        const cmd = this.getCommands().find(c => c.id === id);
        if (cmd) cmd.run();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        document.getElementById('characterSearch')?.addEventListener('input', () => this.renderCharacters());
        document.addEventListener('keydown', (e) => this.handleGlobalKeydown(e));
    },

    // ============ GLOBAL SEARCH + CHIPS ============

    onGlobalSearchQuery(value) {
        this.globalSearch.query = String(value || '');
        this.render();
    },

    toggleGlobalChip(kind, value) {
        if (kind === 'characterType') {
            const set = this.globalSearch.characterTypes;
            if (set.has(value)) set.delete(value); else set.add(value);
            this.updateGlobalChipUI();
            this.renderCharacters();
            return;
        }
        if (kind === 'beat') {
            const set = this.globalSearch.beats;
            if (set.has(value)) set.delete(value); else set.add(value);
            this.updateGlobalChipUI();
            this.renderTimelineWithCircle();
        }
    },

    updateGlobalChipUI() {
        const active = (btnId, isActive) => {
            const el = document.getElementById(btnId);
            if (!el) return;
            el.classList.toggle('active', isActive);
        };
        active('chipTypeFriendly', this.globalSearch.characterTypes.has('friendly'));
        active('chipTypeAntagonist', this.globalSearch.characterTypes.has('antagonist'));
        active('chipTypeGray', this.globalSearch.characterTypes.has('gray'));
        for (let i = 1; i <= 8; i += 1) {
            active(`chipBeat${i}`, this.globalSearch.beats.has(String(i)));
        }
    },

    // ============ CANON UI ============

    openCanonConfirmModal(type, id) {
        this.canonUI.targetType = type;
        this.canonUI.targetId = id;
        const isCanon = StorageService.isCanonProtected(id, type);
        const title = document.getElementById('canonModalTitle');
        const body = document.getElementById('canonModalBody');
        const actionBtn = document.getElementById('canonModalActionBtn');
        if (title) title.textContent = isCanon ? 'Remove Canon status?' : 'Mark as Canon?';
        if (body) {
            body.textContent = isCanon
                ? 'This item is currently protected as Canon. Removing Canon will allow edits/deletion and AI imports could modify it.'
                : 'Marking as Canon protects this item from deletion and prevents AI imports from overwriting it.';
        }
        if (actionBtn) {
            actionBtn.textContent = isCanon ? 'Remove Canon' : 'Mark as Canon';
            actionBtn.style.background = isCanon ? '#ef4444' : '#d97706';
        }
        document.getElementById('canonConfirmModal')?.classList.add('active');
    },

    closeCanonConfirmModal() {
        document.getElementById('canonConfirmModal')?.classList.remove('active');
        this.canonUI.targetType = null;
        this.canonUI.targetId = null;
    },

    confirmToggleCanon() {
        const { targetType, targetId } = this.canonUI;
        if (!targetType || targetId == null) return;

        const numId = Number(targetId);
        const applyLocalToggle = (arrKey) => {
            const arr = this.storyData[arrKey];
            if (!Array.isArray(arr)) return;
            const item = arr.find(x => x && x.id === numId);
            if (item) item.isCanon = !Boolean(item.isCanon);
        };

        if (targetType === 'character') applyLocalToggle('characters');
        if (targetType === 'timeline') applyLocalToggle('events');
        if (targetType === 'workItem') applyLocalToggle('workItems');

        StorageService.saveStoryData(this.storyData);
        this.render();
        this.closeCanonConfirmModal();
    },

    toggleCanonOnly(tab) {
        if (tab === 'characters') this.canonUI.showCanonOnlyCharacters = !this.canonUI.showCanonOnlyCharacters;
        if (tab === 'timeline') this.canonUI.showCanonOnlyTimeline = !this.canonUI.showCanonOnlyTimeline;
        if (tab === 'workitems') this.canonUI.showCanonOnlyWorkItems = !this.canonUI.showCanonOnlyWorkItems;
        this.render();
    },

    renderCanonBadge(type, id) {
        return `<span class="canon-badge" title="Protected – AI imports will not overwrite" onclick="App.openCanonConfirmModal('${type}', ${id}); event.stopPropagation();">🛡️ CANON</span>`;
    },

    matchesGlobalQuery(text) {
        const q = this.globalSearch.query.trim().toLowerCase();
        if (!q) return true;
        return String(text || '').toLowerCase().includes(q);
    },

    handleGlobalKeydown(e) {
        const isMac = navigator.platform?.toLowerCase?.().includes('mac');
        const mod = isMac ? e.metaKey : e.ctrlKey;
        if (!mod) return;

        const key = String(e.key || '').toLowerCase();
        if (key === 'k') {
            e.preventDefault();
            this.openCommandPalette();
            return;
        }

        if (key === 's') {
            e.preventDefault();
            this.forceSave();
            return;
        }

        if (key === 'a' && e.shiftKey) {
            e.preventDefault();
            this.runAIAnalysisShortcut();
        }
    },

    forceSave() {
        StorageService.saveStoryData(this.storyData);
        const status = document.getElementById('aiRunStatus');
        if (status) {
            status.innerHTML = '<div class="ai-status connected">✅ Saved.</div>';
        }
    },

    runAIAnalysisShortcut() {
        this.switchTab('dashboard');
        this.analyzeStory();
    },

    // ============ EXPORT / IMPORT STORY ============

    exportStory() {
        StorageService.exportStoryData(this.storyData);
    },

    openImportStoryPicker() {
        const input = document.getElementById('importStoryFileInput');
        if (!input) return;
        input.value = '';
        input.click();
    },

    importStoryFromFile(file) {
        if (!file) return;
        const ok = confirm('Import this story JSON and replace your current story in this browser? This cannot be undone.');
        if (!ok) return;

        StorageService.importStoryData(file, (data) => {
            if (!data || typeof data !== 'object') {
                alert('Invalid story JSON.');
                return;
            }
            // Persist then reload through migrations/defaulting.
            StorageService.saveStoryData(data);
            this.storyData = StorageService.loadStoryData();
            this.render();
            alert('Story imported.');
        });
    },

    // ============ INLINE EDITING ============

    startInlineEdit(kind, id, field, initialValue) {
        this.inlineEdit = { kind, id, field, value: String(initialValue ?? '') };
        this.render();
        setTimeout(() => {
            const el = document.querySelector('.inline-edit-input');
            if (el && el.focus) {
                el.focus();
                if (el.select) el.select();
            }
        }, 0);
    },

    cancelInlineEdit() {
        this.inlineEdit = { kind: null, id: null, field: null, value: '' };
        this.render();
    },

    commitInlineEdit() {
        const { kind, id, field, value } = this.inlineEdit;
        const clean = String(value ?? '').trim();
        if (!kind || !field || id == null) {
            this.cancelInlineEdit();
            return;
        }

        if (kind === 'character' && field === 'name') {
            if (!clean) {
                alert('Name cannot be empty.');
                return;
            }
            const character = this.storyData.characters.find(c => c.id === id);
            if (character) {
                character.name = clean;
                this.save();
            }
        }

        if (kind === 'event' && field === 'title') {
            if (!clean) {
                alert('Event title cannot be empty.');
                return;
            }
            const ev = this.storyData.events.find(ev2 => ev2.id === id);
            if (ev) {
                ev.title = clean;
                StorageService.saveStoryData(this.storyData);
                this.renderTimelineWithCircle();
            }
        }

        if (kind === 'event' && field === 'beat') {
            const ev = this.storyData.events.find(ev2 => ev2.id === id);
            if (ev) {
                ev.beat = clean || null;
                StorageService.saveStoryData(this.storyData);
                this.renderTimelineWithCircle();
            }
        }

        this.inlineEdit = { kind: null, id: null, field: null, value: '' };
        this.render();
    },

    onInlineEditInput(value) {
        this.inlineEdit.value = String(value ?? '');
    },

    onInlineEditKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.commitInlineEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.cancelInlineEdit();
        }
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
        if (tabName === 'templates') {
            this.renderTemplates();
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
        this.renderTemplates();
        this.renderPlot();
        this.renderPolitics();
        this.renderWorkItems();
        this.updateDashboard();
        this.renderReviewDrafts();
        this.renderCanonStatusIndicator();
        this.renderAIActionItems();
        this.renderAIReports();
        this.renderAISuggestedActions();
        this.renderStoryboard();
        this.renderVisualGallery();
        this.renderMasterDocument();
        this.updateGlobalChipUI();
    },

    renderCanonStatusIndicator() {
        const el = document.getElementById('canonStatusIndicator');
        if (!el) return;
        const canon = StorageService.getAllCanonItems();
        const canonCount =
            (canon.characters?.length || 0)
            + (canon.timelineEvents?.length || 0)
            + (canon.workItems?.length || 0);
        const draftsCount = this.getAllDraftItems().length;
        el.textContent = `${canonCount} Canon items protected • ${draftsCount} Drafts pending review`;
    },

    goToDraftsReview() {
        this.switchTab('dashboard');
        setTimeout(() => {
            document.getElementById('draftsReviewContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
    },

    // ============ REVIEW DRAFTS ============

    getAllDraftItems() {
        const drafts = [];
        (Array.isArray(this.storyData.characters) ? this.storyData.characters : []).forEach(c => {
            if (c && !c.isCanon) drafts.push({ type: 'character', id: c.id, title: c.name, subtitle: `${c.type || 'type?'} • ${c.role || 'Role TBD'}` });
        });
        (Array.isArray(this.storyData.events) ? this.storyData.events : []).forEach(e => {
            if (e && !e.isCanon) drafts.push({ type: 'timeline', id: e.id, title: e.title, subtitle: `${e.period || 'Period TBD'}${e.beat ? ` • Beat ${e.beat}` : ''}` });
        });
        (Array.isArray(this.storyData.workItems) ? this.storyData.workItems : []).forEach(w => {
            if (w && !w.isCanon) drafts.push({ type: 'workItem', id: w.id, title: w.title, subtitle: `${w.category || 'Scene Planning'}${w.completed ? ' • completed' : ''}` });
        });
        return drafts;
    },

    renderReviewDrafts() {
        const container = document.getElementById('draftsReviewContainer');
        if (!container) return;

        const drafts = this.getAllDraftItems();
        if (drafts.length === 0) {
            container.innerHTML = '<div class="ai-result suggestion">No drafts right now. Everything is Canon or you haven’t added new items yet.</div>';
            return;
        }

        const badge = (type) => {
            if (type === 'character') return '👥 Character';
            if (type === 'timeline') return '🗓️ Timeline';
            return '✅ Work Item';
        };

        container.innerHTML = `
            <div class="preview-card" style="margin:0;">
                <div class="text-sm text-gray-600" style="margin-bottom:0.5rem;">Draft items (${drafts.length})</div>
                <ul class="preview-list" style="margin:0;">
                    ${drafts.slice(0, 80).map(d => `
                        <li class="preview-item">
                            <div style="min-width: 140px;" class="preview-item-sub">${badge(d.type)}</div>
                            <div style="flex:1;">
                                <div class="preview-item-title">${this.escapeHTML(d.title || '')}</div>
                                <div class="preview-item-sub">${this.escapeHTML(d.subtitle || '')}</div>
                            </div>
                            <div style="display:flex; gap:0.4rem; flex-wrap: wrap;">
                                <button style="background:#d97706; font-size:0.8rem; padding:0.45rem 0.7rem;" onclick="App.promoteDraft('${d.type}', ${d.id})">Promote to Canon</button>
                                <button style="background:#2563eb; font-size:0.8rem; padding:0.45rem 0.7rem;" onclick="App.openMergeDraftModal('${d.type}', ${d.id})">Merge into Canon</button>
                                <button class="delete-btn" style="font-size:0.8rem; padding:0.45rem 0.7rem;" onclick="App.deleteDraft('${d.type}', ${d.id})">Delete Draft</button>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    },

    promoteDraft(type, id) {
        const numId = Number(id);
        if (!Number.isFinite(numId)) return;
        if (type === 'character') {
            const c = this.storyData.characters.find(x => x.id === numId);
            if (c) c.isCanon = true;
        } else if (type === 'timeline') {
            const e = this.storyData.events.find(x => x.id === numId);
            if (e) e.isCanon = true;
        } else if (type === 'workItem') {
            const w = this.storyData.workItems.find(x => x.id === numId);
            if (w) w.isCanon = true;
        }
        StorageService.saveStoryData(this.storyData);
        this.render();
    },

    deleteDraft(type, id) {
        const numId = Number(id);
        if (!Number.isFinite(numId)) return;
        const ok = confirm('Delete this draft item?');
        if (!ok) return;

        if (type === 'character') {
            this.storyData.characters = this.storyData.characters.filter(x => x.id !== numId);
        } else if (type === 'timeline') {
            this.storyData.events = this.storyData.events.filter(x => x.id !== numId);
            this.storyData.events.forEach((e, idx) => { e.order = idx; });
        } else if (type === 'workItem') {
            this.storyData.workItems = this.storyData.workItems.filter(x => x.id !== numId);
        }
        StorageService.saveStoryData(this.storyData);
        this.render();
    },

    openMergeDraftModal(type, id) {
        const modal = document.getElementById('draftMergeModal');
        if (!modal) return;

        this.canonUI.targetType = type;
        this.canonUI.targetId = id;

        const canonSelect = document.getElementById('draftMergeTargetSelect');
        const title = document.getElementById('draftMergeTitle');
        const body = document.getElementById('draftMergeBody');
        if (!canonSelect || !title || !body) return;

        let draftItem = null;
        let canonItems = [];
        if (type === 'character') {
            draftItem = this.storyData.characters.find(c => c.id === id);
            canonItems = this.storyData.characters.filter(c => c.isCanon);
        } else if (type === 'timeline') {
            draftItem = this.storyData.events.find(e => e.id === id);
            canonItems = this.storyData.events.filter(e => e.isCanon);
        } else {
            draftItem = this.storyData.workItems.find(w => w.id === id);
            canonItems = this.storyData.workItems.filter(w => w.isCanon);
        }

        if (!draftItem) return;
        if (canonItems.length === 0) {
            alert('No canon items exist to merge into. Promote something to canon first.');
            return;
        }

        title.textContent = `Merge Draft → Canon (${type})`;
        body.textContent = 'This will append draft details into the selected canon item without overwriting canon fields, then delete the draft.';

        canonSelect.innerHTML = canonItems.map(item => {
            const label = type === 'timeline' ? item.title : item.name || item.title;
            return `<option value="${item.id}">${this.escapeHTML(label)}</option>`;
        }).join('');

        modal.classList.add('active');
    },

    closeMergeDraftModal() {
        document.getElementById('draftMergeModal')?.classList.remove('active');
        this.canonUI.targetType = null;
        this.canonUI.targetId = null;
    },

    confirmMergeDraft() {
        const type = this.canonUI.targetType;
        const draftId = Number(this.canonUI.targetId);
        const targetId = Number(document.getElementById('draftMergeTargetSelect')?.value);
        if (!type || !Number.isFinite(draftId) || !Number.isFinite(targetId)) return;

        const union = (a, b) => Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]));
        const append = (base, extra, label = 'Merged draft') => {
            const b = String(base || '').trim();
            const e = String(extra || '').trim();
            if (!e) return b;
            const line = `${label}: ${e}`;
            if (!b) return line;
            if (b.toLowerCase().includes(line.toLowerCase())) return b;
            return `${b}\n${line}`;
        };

        if (type === 'character') {
            const draft = this.storyData.characters.find(c => c.id === draftId && !c.isCanon);
            const canon = this.storyData.characters.find(c => c.id === targetId && c.isCanon);
            if (!draft || !canon) return;
            canon.notes = append(canon.notes, `${draft.background || ''}\n${draft.personality || ''}\n${draft.notes || ''}`.trim(), 'Draft');
            canon.relatedCharacters = union(canon.relatedCharacters, draft.relatedCharacters);
            canon.tags = union(canon.tags, union(draft.tags, ['imported']));
            this.storyData.characters = this.storyData.characters.filter(c => c.id !== draftId);
        } else if (type === 'timeline') {
            const draft = this.storyData.events.find(e => e.id === draftId && !e.isCanon);
            const canon = this.storyData.events.find(e => e.id === targetId && e.isCanon);
            if (!draft || !canon) return;
            canon.fullDescription = append(canon.fullDescription, `${draft.description || ''}\n${draft.fullDescription || ''}`.trim(), 'Draft');
            canon.involvedCharacterIds = union(canon.involvedCharacterIds, draft.involvedCharacterIds);
            canon.tags = union(canon.tags, union(draft.tags, ['imported']));
            this.storyData.events = this.storyData.events.filter(e => e.id !== draftId);
            this.storyData.events.forEach((e, idx) => { e.order = idx; });
        } else {
            const draft = this.storyData.workItems.find(w => w.id === draftId && !w.isCanon);
            const canon = this.storyData.workItems.find(w => w.id === targetId && w.isCanon);
            if (!draft || !canon) return;
            canon.title = canon.title || draft.title;
            canon.category = canon.category || draft.category;
            canon.tags = union(canon.tags, union(draft.tags, ['imported']));
            this.storyData.workItems = this.storyData.workItems.filter(w => w.id !== draftId);
        }

        StorageService.saveStoryData(this.storyData);
        this.closeMergeDraftModal();
        this.render();
    },

    // ============ TEMPLATES ============

    getTemplates() {
        return [
            {
                id: 'classic-palace-intrigue',
                title: 'Classic Palace Intrigue',
                subtitle: 'Schemes, factions, hidden heirs, and shifting loyalties.',
                data: this.buildTemplateClassicPalaceIntrigue()
            },
            {
                id: 'time-travel-romance',
                title: 'Time-Travel Romance',
                subtitle: 'Modern mind meets ancient court—love vs. fate.',
                data: this.buildTemplateTimeTravelRomance()
            },
            {
                id: 'revenge-redemption',
                title: 'Revenge Redemption Arc',
                subtitle: 'Betrayal → vengeance → truth → transformation.',
                data: this.buildTemplateRevengeRedemption()
            }
        ];
    },

    renderTemplates() {
        const container = document.getElementById('templatesContainer');
        if (!container) return;

        const templates = this.getTemplates();
        container.innerHTML = `
            <div class="preview-grid" style="margin-top:0;">
                ${templates.map(t => `
                    <div class="preview-card">
                        <h4>${this.escapeHTML(t.title)}</h4>
                        <div class="preview-item-sub">${this.escapeHTML(t.subtitle)}</div>
                        <div style="display:flex; gap:0.5rem; flex-wrap: wrap; margin-top: 0.75rem;">
                            <button class="ai-btn" onclick="App.previewTemplate('${t.id}')">Preview</button>
                            <button style="background:#16a34a;" onclick="App.applyTemplate('${t.id}')">Apply Template</button>
                        </div>
                        <div class="text-sm text-gray-600" style="margin-top:0.6rem;">
                            Includes: ${t.data.characters.length} characters • ${t.data.events.length} timeline beats • ${t.data.relationships.length} relationships
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    previewTemplate(templateId) {
        const t = this.getTemplates().find(x => x.id === templateId);
        if (!t) return;
        const chars = t.data.characters.slice(0, 6).map(c => `- ${c.name} (${c.type}) — ${c.role}`).join('\n');
        const evs = t.data.events.slice(0, 8).map(e => `- Beat ${e.beat}: ${e.title}`).join('\n');
        alert(`${t.title}\n\nCharacters:\n${chars}\n\nStory Circle Beats:\n${evs}\n\nApply to load full template.`);
    },

    applyTemplate(templateId) {
        const t = this.getTemplates().find(x => x.id === templateId);
        if (!t) return;
        const ok = confirm(`Apply template "${t.title}"?\n\nThis will REPLACE your current story data in this browser.`);
        if (!ok) return;

        const data = t.data;
        this.storyData.characters = data.characters;
        this.storyData.events = data.events;
        this.storyData.plot = data.plot;
        this.storyData.politics = data.politics;
        this.storyData.workItems = data.workItems;
        // Keep AI history / visuals / master doc / storyboard as-is but regenerate master doc to reflect new data.
        this.refreshMasterDocument({ reason: 'template' });
        StorageService.saveStoryData(this.storyData);
        this.render();
        this.switchTab('dashboard');
    },

    buildTemplateClassicPalaceIntrigue() {
        const characters = [
            { id: 1, name: 'Lady Shen', age: 21, role: 'Noble Consort', type: 'gray', background: 'A clever consort navigating lethal etiquette.', personality: 'Calm, strategic, observant.', relatedCharacters: [2, 3], notes: '', isCanon: true, tags: ['palace', 'intrigue'] },
            { id: 2, name: 'Crown Prince Li', age: 24, role: 'Heir Apparent', type: 'friendly', background: 'Heir with reformist ideals and many enemies.', personality: 'Idealistic, principled, guarded.', relatedCharacters: [1, 4], notes: '', isCanon: true, tags: ['heir', 'reform'] },
            { id: 3, name: 'Grand Chancellor Xu', age: 58, role: 'Court Powerbroker', type: 'antagonist', background: 'Controls appointments and blackmails rivals.', personality: 'Manipulative, patient, ruthless.', relatedCharacters: [1, 5], notes: '', isCanon: true, tags: ['villain', 'court'] },
            { id: 4, name: 'Commander Yan', age: 29, role: 'Imperial Guard', type: 'gray', background: 'Loyal to the throne, torn between duty and truth.', personality: 'Stoic, honorable, conflicted.', relatedCharacters: [2, 6], notes: '', isCanon: true, tags: ['guard', 'duty'] },
            { id: 5, name: 'Empress Dowager', age: 54, role: 'Matriarch', type: 'gray', background: 'Keeps balance between factions to preserve stability.', personality: 'Severe, discerning, pragmatic.', relatedCharacters: [3], notes: '', isCanon: true, tags: ['matriarch', 'power'] },
            { id: 6, name: 'Palace Maid Mei', age: 18, role: 'Informant', type: 'friendly', background: 'Knows the secret passages and overhears everything.', personality: 'Quick, loyal, anxious.', relatedCharacters: [4], notes: '', isCanon: true, tags: ['informant'] }
        ];

        const events = [
            { id: 1, title: 'Court in Balance', period: 'Act 1', order: 0, beat: '1', description: 'Establish factions and the fragile peace.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['setup'] },
            { id: 2, title: 'A Whispered Accusation', period: 'Act 1', order: 1, beat: '2', description: 'A scandal surfaces: forged edicts tied to the Prince.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['catalyst'] },
            { id: 3, title: 'Crossing into the Trap', period: 'Act 1', order: 2, beat: '3', description: 'Lady Shen is ordered to investigate—dangerous either way.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['threshold'] },
            { id: 4, title: 'Secret Alliances', period: 'Act 2', order: 3, beat: '4', description: 'Mei reveals tunnels; Commander Yan offers guarded help.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['tests'] },
            { id: 5, title: 'The Hidden Ledger', period: 'Act 2', order: 4, beat: '5', description: 'A ledger proves corruption—but implicates someone close.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['reveal'] },
            { id: 6, title: 'The Price of Truth', period: 'Act 2', order: 5, beat: '6', description: 'Chancellor strikes back; an ally is punished publicly.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['price'] },
            { id: 7, title: 'Return to the Throne Room', period: 'Act 3', order: 6, beat: '7', description: 'A risky trial reveals the real mastermind.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['return'] },
            { id: 8, title: 'A New Court Order', period: 'Act 3', order: 7, beat: '8', description: 'Power shifts; Lady Shen chooses what kind of court survives.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['change'] }
        ];

        const relationships = [
            { from: 1, to: 2, type: 'ally', description: 'Mutual protection against court plots.' },
            { from: 1, to: 3, type: 'rival', description: 'He wants to use her; she refuses to be a pawn.' },
            { from: 2, to: 4, type: 'mentor', description: 'Guard trains prince in survival politics.' },
            { from: 4, to: 6, type: 'ally', description: 'Mei supplies intel; Yan keeps her safe.' }
        ];

        const byId = new Map(characters.map(c => [c.id, c]));
        relationships.forEach(r => {
            const a = byId.get(r.from); const b = byId.get(r.to);
            if (!a || !b) return;
            if (!a.relatedCharacters.includes(b.id)) a.relatedCharacters.push(b.id);
            if (!b.relatedCharacters.includes(a.id)) b.relatedCharacters.push(a.id);
            const lineA = `Relationship (${r.type}) with ${b.name}: ${r.description}`;
            const lineB = `Relationship (${r.type}) with ${a.name}: ${r.description}`;
            a.notes = a.notes ? `${a.notes}\n${lineA}` : lineA;
            b.notes = b.notes ? `${b.notes}\n${lineB}` : lineB;
        });

        return {
            characters,
            events,
            relationships,
            plot: [
                { act: 'Act 1: The Court’s Mask', content: 'A stable court hides a rotten chain of bribery and forged orders.' },
                { act: 'Act 2: The Knife’s Edge', content: 'Investigation reveals a ledger; retaliation costs blood and reputation.' },
                { act: 'Act 3: The Trial', content: 'Truth is weaponized; loyalty is tested; a new balance is forged.' }
            ],
            politics: [
                { section: 'Factions', content: 'Reformists (Prince) vs. Conservatives (Chancellor) vs. Stabilizers (Dowager).' },
                { section: 'Court Levers', content: 'Appointments, punishments, military command, palace rumors, sealed edicts.' }
            ],
            workItems: [
                { id: 1, title: 'Define the forged edict’s contents and why it matters', category: 'Plot Holes', completed: false, isCanon: false, tags: [] },
                { id: 2, title: 'Outline the secret tunnel map and key locations', category: 'Worldbuilding', completed: false, isCanon: false, tags: [] },
                { id: 3, title: 'Write the public punishment scene (Beat 6)', category: 'Dialogue', completed: false, isCanon: false, tags: [] }
            ]
        };
    },

    buildTemplateTimeTravelRomance() {
        const characters = [
            { id: 1, name: 'Dr. Lin Yue', age: 30, role: 'Modern Scientist', type: 'friendly', background: 'Accidentally time-slips into a dynasty at war.', personality: 'Rational, brave, empathetic.', relatedCharacters: [2], notes: '', isCanon: true, tags: ['time-travel'] },
            { id: 2, name: 'Prince Zhao', age: 25, role: 'Prince (incognito)', type: 'friendly', background: 'Hides identity to expose corruption.', personality: 'Charming, wary, principled.', relatedCharacters: [1, 3], notes: '', isCanon: true, tags: ['romance', 'secret-identity'] },
            { id: 3, name: 'Minister Han', age: 56, role: 'Corrupt Minister', type: 'antagonist', background: 'Fears prophecy about a “star‑born stranger”.', personality: 'Paranoid, cunning.', relatedCharacters: [2, 4], notes: '', isCanon: true, tags: ['villain'] },
            { id: 4, name: 'General Qiu', age: 33, role: 'Frontline Commander', type: 'gray', background: 'Needs victory; distrusts outsiders.', personality: 'Blunt, loyal, skeptical.', relatedCharacters: [3], notes: '', isCanon: true, tags: ['war'] }
        ];
        const events = [
            { id: 1, title: 'Before the Slip', period: 'Prologue', order: 0, beat: '1', description: 'Establish Lin’s life and obsession with a theory.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['setup'] },
            { id: 2, title: 'The Anomaly', period: 'Act 1', order: 1, beat: '2', description: 'A glitch hints something is wrong with reality.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['catalyst'] },
            { id: 3, title: 'Crossing Centuries', period: 'Act 1', order: 2, beat: '3', description: 'Accident: Lin arrives in the past and must survive.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['threshold'] },
            { id: 4, title: 'Tests in the Marketplace', period: 'Act 2', order: 3, beat: '4', description: 'She meets the Prince incognito; allies and enemies emerge.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['tests'] },
            { id: 5, title: 'A Cure that Changes the Court', period: 'Act 2', order: 4, beat: '5', description: 'Lin’s knowledge saves lives and draws attention.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['reveal'] },
            { id: 6, title: 'The Price of a Miracle', period: 'Act 2', order: 5, beat: '6', description: 'Minister frames Lin; the Prince must reveal something.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['price'] },
            { id: 7, title: 'Return with the Truth', period: 'Act 3', order: 6, beat: '7', description: 'Lin confronts the time-slip’s cause; love vs duty.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['return'] },
            { id: 8, title: 'Changed Fate', period: 'Act 3', order: 7, beat: '8', description: 'Resolution: choose the timeline and the relationship.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['change'] }
        ];
        const relationships = [
            { from: 1, to: 2, type: 'romance', description: 'Mutual respect becomes love under pressure.' },
            { from: 2, to: 3, type: 'enemy', description: 'Minister sees the Prince’s reform as a threat.' }
        ];

        const byId = new Map(characters.map(c => [c.id, c]));
        relationships.forEach(r => {
            const a = byId.get(r.from); const b = byId.get(r.to);
            if (!a || !b) return;
            if (!a.relatedCharacters.includes(b.id)) a.relatedCharacters.push(b.id);
            if (!b.relatedCharacters.includes(a.id)) b.relatedCharacters.push(a.id);
            const lineA = `Relationship (${r.type}) with ${b.name}: ${r.description}`;
            const lineB = `Relationship (${r.type}) with ${a.name}: ${r.description}`;
            a.notes = a.notes ? `${a.notes}\n${lineA}` : lineA;
            b.notes = b.notes ? `${b.notes}\n${lineB}` : lineB;
        });

        return {
            characters,
            events,
            relationships,
            plot: [
                { act: 'Act 1: The Slip', content: 'A modern scientist is thrown into a past she must decode.' },
                { act: 'Act 2: The Court’s Gravity', content: 'Her knowledge is power—and a target; romance deepens the stakes.' },
                { act: 'Act 3: The Choice', content: 'Fix the anomaly or accept a new life and rewritten fate.' }
            ],
            politics: [
                { section: 'Core Conflict', content: 'Reform vs. corruption; war pressure amplifies court stakes.' }
            ],
            workItems: [
                { id: 1, title: 'Define the time-slip mechanism and its rules', category: 'Worldbuilding', completed: false, isCanon: false, tags: [] },
                { id: 2, title: 'Write the identity reveal scene (Beat 6)', category: 'Dialogue', completed: false, isCanon: false, tags: [] }
            ]
        };
    },

    buildTemplateRevengeRedemption() {
        const characters = [
            { id: 1, name: 'Wei Ruo', age: 27, role: 'Wronged Heir', type: 'gray', background: 'Survivor of a massacre framed as treason.', personality: 'Cold, disciplined, secretly kind.', relatedCharacters: [2, 3], notes: '', isCanon: true, tags: ['revenge'] },
            { id: 2, name: 'Princess An', age: 24, role: 'Royal Investigator', type: 'friendly', background: 'Believes the official story is false.', personality: 'Brave, curious, stubborn.', relatedCharacters: [1], notes: '', isCanon: true, tags: ['justice'] },
            { id: 3, name: 'Duke Luo', age: 50, role: 'Architect of Betrayal', type: 'antagonist', background: 'Orchestrated the fall to seize power.', personality: 'Smooth, cruel, calculating.', relatedCharacters: [1, 4], notes: '', isCanon: true, tags: ['villain'] },
            { id: 4, name: 'Old Teacher Gu', age: 66, role: 'Mentor', type: 'friendly', background: 'Knows the hidden history and the cost of vengeance.', personality: 'Wise, weary, blunt.', relatedCharacters: [3], notes: '', isCanon: true, tags: ['mentor'] }
        ];
        const events = [
            { id: 1, title: 'Ashes of the Past', period: 'Act 1', order: 0, beat: '1', description: 'Wei lives under a new name, training in silence.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['setup'] },
            { id: 2, title: 'A Name Reappears', period: 'Act 1', order: 1, beat: '2', description: 'A witness resurfaces; revenge becomes possible.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['catalyst'] },
            { id: 3, title: 'Go to the Capital', period: 'Act 1', order: 2, beat: '3', description: 'Wei returns to court disguised, hunting the Duke.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['threshold'] },
            { id: 4, title: 'Tests of Trust', period: 'Act 2', order: 3, beat: '4', description: 'Princess An suspects Wei; they circle each other.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['tests'] },
            { id: 5, title: 'Proof and Doubt', period: 'Act 2', order: 4, beat: '5', description: 'Evidence surfaces—but it threatens innocent lives.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['reveal'] },
            { id: 6, title: 'The Cost of Blood', period: 'Act 2', order: 5, beat: '6', description: 'Wei’s plan causes collateral damage; guilt cracks the mask.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['price'] },
            { id: 7, title: 'Return with Mercy', period: 'Act 3', order: 6, beat: '7', description: 'Wei chooses a lawful path; the Duke panics.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['return'] },
            { id: 8, title: 'Redemption or Ruin', period: 'Act 3', order: 7, beat: '8', description: 'Confrontation resolves: truth, sacrifice, and transformation.', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['change'] }
        ];
        const relationships = [
            { from: 1, to: 2, type: 'romance', description: 'Suspicion turns into partnership and love.' },
            { from: 1, to: 3, type: 'enemy', description: 'Personal vendetta rooted in betrayal.' },
            { from: 4, to: 1, type: 'mentor', description: 'Guides Wei away from self-destruction.' }
        ];

        const byId = new Map(characters.map(c => [c.id, c]));
        relationships.forEach(r => {
            const a = byId.get(r.from); const b = byId.get(r.to);
            if (!a || !b) return;
            if (!a.relatedCharacters.includes(b.id)) a.relatedCharacters.push(b.id);
            if (!b.relatedCharacters.includes(a.id)) b.relatedCharacters.push(a.id);
            const lineA = `Relationship (${r.type}) with ${b.name}: ${r.description}`;
            const lineB = `Relationship (${r.type}) with ${a.name}: ${r.description}`;
            a.notes = a.notes ? `${a.notes}\n${lineA}` : lineA;
            b.notes = b.notes ? `${b.notes}\n${lineB}` : lineB;
        });

        return {
            characters,
            events,
            relationships,
            plot: [
                { act: 'Act 1: Return of the Ghost', content: 'A wronged heir re-enters the capital to hunt the truth.' },
                { act: 'Act 2: Revenge’s Shadow', content: 'Plans succeed—but the price reveals what Wei is becoming.' },
                { act: 'Act 3: Redemption', content: 'Justice replaces vengeance; the final confrontation transforms everyone.' }
            ],
            politics: [
                { section: 'Cover-up', content: 'A forged treason case, sealed testimonies, and bought officials.' }
            ],
            workItems: [
                { id: 1, title: 'Define the massacre incident and who benefits', category: 'Worldbuilding', completed: false, isCanon: false, tags: [] },
                { id: 2, title: 'Write the “collateral damage” turning point (Beat 6)', category: 'Scene Planning', completed: false, isCanon: false, tags: [] }
            ]
        };
    },

    // ============ IMPORT NOTES ============

    openImportNotesModal() {
        const modal = document.getElementById('importNotesModal');
        if (!modal) return;
        modal.classList.add('active');
        this.importNotesState.activeTab = 'paste';
        this.importNotesState.loading = false;
        this.importNotesState.extracted = null;
        this.importNotesState.conflicts = { characters: [], timelineEvents: [], workItems: [] };
        this.importNotesState.conflictResolutions = {};
        this.importNotesState.selections = {
            characters: {},
            timelineEvents: {},
            relationships: {},
            politics: {},
            workItems: {}
        };
        const paste = document.getElementById('importNotesPaste');
        if (paste) paste.value = this.importNotesState.rawText || '';
        this.renderImportNotesUI();
    },

    closeImportNotesModal() {
        document.getElementById('importNotesModal')?.classList.remove('active');
    },

    setImportNotesTab(tab) {
        this.importNotesState.activeTab = tab === 'upload' ? 'upload' : 'paste';
        this.renderImportNotesUI();
    },

    onImportNotesPasteChange(value) {
        this.importNotesState.rawText = String(value || '');
    },

    async onImportNotesFileSelected(file) {
        if (!file) return;
        const name = String(file.name || '').toLowerCase();
        if (!(name.endsWith('.txt') || name.endsWith('.md'))) {
            alert('Please upload a .txt or .md file.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            this.importNotesState.rawText = String(reader.result || '');
            const paste = document.getElementById('importNotesPaste');
            if (paste) paste.value = this.importNotesState.rawText;
            this.importNotesState.activeTab = 'paste';
            this.renderImportNotesUI();
        };
        reader.readAsText(file);
    },

    async extractFromNotes() {
        const status = document.getElementById('importNotesStatus');
        const text = String(this.importNotesState.rawText || '').trim();
        if (!text) {
            if (status) status.innerHTML = '<div class="ai-status disconnected">❌ Paste text or upload a file first.</div>';
            return;
        }
        this.importNotesState.loading = true;
        if (status) status.innerHTML = '<div class="ai-status analyzing"><span class="spinner"></span> Extracting structured items from notes...</div>';

        try {
            const extracted = await StorageService.importFromNotes(text);
            this.importNotesState.extracted = extracted;
            this.importNotesState.loading = false;
            this.initializeImportSelections(extracted);
            this.computeCanonConflictsForImport(extracted);
            if (status) status.innerHTML = '<div class="ai-status connected">✅ Extraction complete. Review items below.</div>';
            this.renderImportPreview();
        } catch (error) {
            this.importNotesState.loading = false;
            if (status) status.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(error.message || 'Import failed')}</div>`;
        }
    },

    initializeImportSelections(extracted) {
        const make = (arr) => {
            const map = {};
            (Array.isArray(arr) ? arr : []).forEach((_, idx) => { map[idx] = true; });
            return map;
        };
        this.importNotesState.selections = {
            characters: make(extracted?.characters),
            timelineEvents: make(extracted?.timelineEvents),
            relationships: make(extracted?.relationships),
            politics: make(extracted?.politics),
            workItems: make(extracted?.workItems)
        };
    },

    normKey(text) {
        return String(text || '').trim().toLowerCase();
    },

    computeCanonConflictsForImport(extracted) {
        const chars = Array.isArray(this.storyData.characters) ? this.storyData.characters : [];
        const events = Array.isArray(this.storyData.events) ? this.storyData.events : [];
        const work = Array.isArray(this.storyData.workItems) ? this.storyData.workItems : [];

        const canonCharByName = new Map(chars.filter(c => c && c.isCanon).map(c => [this.normKey(c.name), c]));
        const canonEventByTitle = new Map(events.filter(e => e && e.isCanon).map(e => [this.normKey(e.title), e]));
        const canonWorkByTitle = new Map(work.filter(w => w && w.isCanon).map(w => [this.normKey(w.title), w]));

        const conflicts = { characters: [], timelineEvents: [], workItems: [] };
        const resolutions = {};

        (extracted?.characters || []).forEach((c, idx) => {
            const match = canonCharByName.get(this.normKey(c.name));
            if (!match) return;
            const key = `character:${match.id}:${idx}`;
            conflicts.characters.push({ key, importedIndex: idx, canon: match, imported: c });
            resolutions[key] = 'keep';
            // Default unselect conflicting import rows (they require explicit choice).
            this.importNotesState.selections.characters[idx] = false;
        });

        (extracted?.timelineEvents || []).forEach((e, idx) => {
            const match = canonEventByTitle.get(this.normKey(e.title));
            if (!match) return;
            const key = `timeline:${match.id}:${idx}`;
            conflicts.timelineEvents.push({ key, importedIndex: idx, canon: match, imported: e });
            resolutions[key] = 'keep';
            this.importNotesState.selections.timelineEvents[idx] = false;
        });

        (extracted?.workItems || []).forEach((w, idx) => {
            const match = canonWorkByTitle.get(this.normKey(w.title));
            if (!match) return;
            const key = `workItem:${match.id}:${idx}`;
            conflicts.workItems.push({ key, importedIndex: idx, canon: match, imported: w });
            resolutions[key] = 'keep';
            this.importNotesState.selections.workItems[idx] = false;
        });

        this.importNotesState.conflicts = conflicts;
        this.importNotesState.conflictResolutions = resolutions;
    },

    setConflictResolution(conflictKey, resolution) {
        const allowed = new Set(['keep', 'draft', 'replace']);
        if (!allowed.has(resolution)) return;
        this.importNotesState.conflictResolutions[conflictKey] = resolution;
        this.renderImportPreview();
    },

    toggleImportSelection(group, idx, checked) {
        if (!this.importNotesState.selections[group]) return;
        this.importNotesState.selections[group][idx] = Boolean(checked);
    },

    renderImportNotesUI() {
        const pasteTab = document.getElementById('importTabPaste');
        const uploadTab = document.getElementById('importTabUpload');
        const pastePane = document.getElementById('importPanePaste');
        const uploadPane = document.getElementById('importPaneUpload');
        const active = this.importNotesState.activeTab;

        if (pasteTab && uploadTab) {
            pasteTab.classList.toggle('active', active === 'paste');
            uploadTab.classList.toggle('active', active === 'upload');
        }
        if (pastePane && uploadPane) {
            pastePane.style.display = active === 'paste' ? 'block' : 'none';
            uploadPane.style.display = active === 'upload' ? 'block' : 'none';
        }

        this.renderImportPreview();
    },

    renderImportPreview() {
        const container = document.getElementById('importPreview');
        if (!container) return;

        const extracted = this.importNotesState.extracted;
        if (!extracted) {
            container.innerHTML = '<div class="ai-result">No extracted items yet. Click “Extract with AI” to generate a preview.</div>';
            return;
        }

        const renderList = (title, key, arr, renderRow) => {
            const list = (Array.isArray(arr) ? arr : []);
            const sels = this.importNotesState.selections[key] || {};
            const shown = list.slice(0, 50);
            return `
                <div class="preview-card">
                    <h4>${title}</h4>
                    <ul class="preview-list">
                        ${shown.length ? shown.map((item, idx) => renderRow(item, idx, sels[idx] !== false)).join('') : `<li class="preview-item"><div class="preview-item-sub">None found.</div></li>`}
                    </ul>
                </div>
            `;
        };

        const checkbox = (group, idx, checked) =>
            `<input type="checkbox" ${checked ? 'checked' : ''} onchange="App.toggleImportSelection('${group}', ${idx}, this.checked)">`;

        const safe = (v) => this.escapeHTML(String(v ?? '').trim());

        const conflicts = this.importNotesState.conflicts || { characters: [], timelineEvents: [], workItems: [] };
        const res = this.importNotesState.conflictResolutions || {};

        const renderConflict = (label, group, conflict) => {
            const canon = conflict.canon || {};
            const imp = conflict.imported || {};
            const choice = res[conflict.key] || 'keep';
            const canonSide = group === 'characters'
                ? `Name: ${safe(canon.name)}\nType: ${safe(canon.type)}\nRole: ${safe(canon.role)}\nBackground: ${safe(canon.background)}\nNotes: ${safe(canon.notes)}`
                : group === 'timelineEvents'
                    ? `Title: ${safe(canon.title)}\nBeat: ${safe(canon.beat)}\nPeriod: ${safe(canon.period)}\nDescription: ${safe(canon.description)}\nNotes: ${safe(canon.fullDescription)}`
                    : `Title: ${safe(canon.title)}\nCategory: ${safe(canon.category)}\nCompleted: ${canon.completed ? 'true' : 'false'}`;
            const impSide = group === 'characters'
                ? `Name: ${safe(imp.name)}\nType: ${safe(imp.type)}\nDescription: ${safe(imp.description)}`
                : group === 'timelineEvents'
                    ? `Title: ${safe(imp.title)}\nBeatType: ${safe(imp.beatType)}\nDescription: ${safe(imp.description)}`
                    : `Title: ${safe(imp.title)}\nCategory: ${safe(imp.category)}`;

            return `
                <div class="preview-card" style="border-color: rgba(245, 158, 11, 0.35);">
                    <h4>⚠️ Conflict with Canon — ${label}</h4>
                    <div class="preview-item-sub">This imported item matches a Canon item. Choose what to do:</div>
                    <div class="compare-grid" style="margin-top:0.6rem;">
                        <div class="compare-block">
                            <div class="compare-col-title">Canon (Protected)</div>
                            <pre class="text-sm" style="white-space: pre-wrap; margin:0;">${canonSide}</pre>
                        </div>
                        <div class="compare-block">
                            <div class="compare-col-title">Imported</div>
                            <pre class="text-sm" style="white-space: pre-wrap; margin:0;">${impSide}</pre>
                        </div>
                    </div>
                    <div style="display:flex; gap:0.5rem; flex-wrap: wrap; margin-top:0.7rem;">
                        <button class="topbar-ghost ${choice === 'keep' ? 'modal-tab active' : ''}" onclick="App.setConflictResolution('${conflict.key}','keep')">Keep Canon</button>
                        <button class="topbar-ghost ${choice === 'draft' ? 'modal-tab active' : ''}" onclick="App.setConflictResolution('${conflict.key}','draft')">Merge (add as new Draft)</button>
                        <button class="topbar-ghost ${choice === 'replace' ? 'modal-tab active' : ''}" onclick="App.setConflictResolution('${conflict.key}','replace')">Replace anyway</button>
                    </div>
                </div>
            `;
        };

        const conflictsHtml = [
            ...conflicts.characters.map(c => renderConflict(c.canon?.name || 'Character', 'characters', c)),
            ...conflicts.timelineEvents.map(c => renderConflict(c.canon?.title || 'Timeline Event', 'timelineEvents', c)),
            ...conflicts.workItems.map(c => renderConflict(c.canon?.title || 'Work Item', 'workItems', c))
        ].join('');

        container.innerHTML = `
            ${conflictsHtml ? `<div class="ai-result warning"><strong>Conflicts with Canon</strong><div class="text-sm text-gray-600" style="margin-top:0.25rem;">Canon items are protected by default. Resolve conflicts to proceed.</div></div>${conflictsHtml}` : ''}
            <div class="preview-grid">
                ${renderList('Characters', 'characters', extracted.characters, (c, idx, checked) => `
                    <li class="preview-item">
                        ${checkbox('characters', idx, checked)}
                        <div>
                            <div class="preview-item-title">${safe(c.name)} <span class="preview-item-sub">(${safe(c.type)})</span></div>
                            ${c.description ? `<div class="preview-item-sub">${safe(c.description)}</div>` : ''}
                        </div>
                    </li>
                `)}
                ${renderList('Timeline Events', 'timelineEvents', extracted.timelineEvents, (e, idx, checked) => `
                    <li class="preview-item">
                        ${checkbox('timelineEvents', idx, checked)}
                        <div>
                            <div class="preview-item-title">${safe(e.title)}</div>
                            <div class="preview-item-sub">${safe([e.beatType ? `Beat: ${e.beatType}` : '', e.description].filter(Boolean).join(' • '))}</div>
                        </div>
                    </li>
                `)}
                ${renderList('Relationships', 'relationships', extracted.relationships, (r, idx, checked) => `
                    <li class="preview-item">
                        ${checkbox('relationships', idx, checked)}
                        <div>
                            <div class="preview-item-title">${safe(r.from)} ↔ ${safe(r.to)} <span class="preview-item-sub">(${safe(r.type || 'other')})</span></div>
                            ${r.description ? `<div class="preview-item-sub">${safe(r.description)}</div>` : ''}
                        </div>
                    </li>
                `)}
                ${renderList('Politics / Worldbuilding', 'politics', extracted.politics, (p, idx, checked) => `
                    <li class="preview-item">
                        ${checkbox('politics', idx, checked)}
                        <div>
                            <div class="preview-item-title">${safe(p.section || 'Imported')}</div>
                            <div class="preview-item-sub">${safe(p.content)}</div>
                        </div>
                    </li>
                `)}
                ${renderList('Suggested Work Items', 'workItems', extracted.workItems, (w, idx, checked) => `
                    <li class="preview-item">
                        ${checkbox('workItems', idx, checked)}
                        <div>
                            <div class="preview-item-title">${safe(w.title)}</div>
                            <div class="preview-item-sub">${safe(w.category || 'Scene Planning')}</div>
                        </div>
                    </li>
                `)}
            </div>
        `;
    },

    addImportedToStory() {
        const extracted = this.importNotesState.extracted;
        if (!extracted) return;

        const sel = this.importNotesState.selections;
        const pick = (key) => (Array.isArray(extracted[key]) ? extracted[key].filter((_, idx) => sel[key]?.[idx] !== false) : []);

        const payload = {
            characters: pick('characters'),
            timelineEvents: pick('timelineEvents'),
            relationships: pick('relationships'),
            politics: pick('politics'),
            workItems: pick('workItems')
        };

        const result = this.mergeImportedPayload(payload, {
            conflictResolutions: this.importNotesState.conflictResolutions || {},
            conflicts: this.importNotesState.conflicts || {}
        });
        this.save();
        this.switchTab('dashboard');
        this.closeImportNotesModal();
        alert(`Import summary: ${result.draftsAdded} new draft item(s) added. ${result.canonProtected} canon item(s) protected.`);
    },

    async analyzeAndImportDashboardNotes() {
        const status = document.getElementById('dashboardImportStatus');
        const textarea = document.getElementById('dashboardRawNotes');
        const raw = String(textarea?.value || '').trim();

        if (!raw) {
            if (status) status.innerHTML = '<div class="ai-status disconnected">❌ Paste notes first.</div>';
            return;
        }

        if (status) status.innerHTML = '<div class="ai-status analyzing"><span class="spinner"></span> Analyzing notes and building suggestions...</div>';

        try {
            const extracted = await StorageService.importFromNotes(raw);
            // Dashboard flow focuses on Characters, Timeline, Relationships (as requested).
            const focused = {
                characters: extracted.characters || [],
                timelineEvents: extracted.timelineEvents || [],
                relationships: extracted.relationships || [],
                politics: [],
                workItems: []
            };

            this.importNotesState.extracted = focused;
            this.initializeImportSelections(focused);
            this.openAnalyzeImportModal();

            if (status) status.innerHTML = '<div class="ai-status connected">✅ Suggestions ready. Review and import.</div>';
        } catch (error) {
            if (status) status.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(error.message || 'Analysis failed')}</div>`;
        }
    },

    openAnalyzeImportModal() {
        document.getElementById('analyzeImportModal')?.classList.add('active');
        this.renderAnalyzeImportComparison();
    },

    closeAnalyzeImportModal() {
        document.getElementById('analyzeImportModal')?.classList.remove('active');
    },

    renderAnalyzeImportComparison() {
        const container = document.getElementById('analyzeImportCompare');
        if (!container) return;

        const extracted = this.importNotesState.extracted;
        if (!extracted) {
            container.innerHTML = '<div class="ai-result">No suggestions yet.</div>';
            return;
        }

        const safe = (v) => this.escapeHTML(String(v ?? '').trim());
        const existingChars = Array.isArray(this.storyData.characters) ? this.storyData.characters : [];
        const existingEvents = Array.isArray(this.storyData.events) ? this.storyData.events : [];
        const existingRel = this.computeRelationshipPairs();

        const sel = this.importNotesState.selections;

        const currentList = (items, render) => `
            <ul class="compare-list">
                ${items.length ? items.slice(0, 40).map(render).join('') : `<li class="compare-row"><div class="preview-item-sub">None yet.</div></li>`}
            </ul>
        `;

        const suggestedList = (group, items, render) => `
            <ul class="compare-list">
                ${items.length ? items.slice(0, 60).map((it, idx) => `
                    <li class="compare-row">
                        <input type="checkbox" ${sel[group]?.[idx] !== false ? 'checked' : ''} onchange="App.toggleImportSelection('${group}', ${idx}, this.checked)">
                        <div>${render(it)}</div>
                    </li>
                `).join('') : `<li class="compare-row"><div class="preview-item-sub">No suggestions.</div></li>`}
            </ul>
        `;

        container.innerHTML = `
            <div class="compare-grid">
                <div class="compare-block">
                    <div class="compare-col-title">Current Story</div>
                    <div class="text-sm text-gray-600">Characters (${existingChars.length})</div>
                    ${currentList(existingChars, c => `<li class="compare-row"><div><div class="preview-item-title">${safe(c.name)}</div><div class="preview-item-sub">${safe(c.role || c.type || '')}</div></div></li>`)}
                    <div class="text-sm text-gray-600" style="margin-top:0.75rem;">Timeline (${existingEvents.length})</div>
                    ${currentList(existingEvents, e => `<li class="compare-row"><div><div class="preview-item-title">${safe(e.title)}</div><div class="preview-item-sub">${safe(e.period || '')}</div></div></li>`)}
                    <div class="text-sm text-gray-600" style="margin-top:0.75rem;">Relationships (linked)</div>
                    ${currentList(existingRel, r => `<li class="compare-row"><div class="preview-item-sub">${safe(r)}</div></li>`)}
                </div>

                <div class="compare-block">
                    <div class="compare-col-title">Suggested Additions</div>
                    <div class="text-sm text-gray-600">Characters (${(extracted.characters || []).length})</div>
                    ${suggestedList('characters', extracted.characters || [], c => `
                        <div>
                            <div class="preview-item-title">${safe(c.name)} <span class="preview-item-sub">(${safe(c.type)})</span></div>
                            ${c.description ? `<div class="preview-item-sub">${safe(c.description)}</div>` : ''}
                        </div>
                    `)}
                    <div class="text-sm text-gray-600" style="margin-top:0.75rem;">Timeline (${(extracted.timelineEvents || []).length})</div>
                    ${suggestedList('timelineEvents', extracted.timelineEvents || [], e => `
                        <div>
                            <div class="preview-item-title">${safe(e.title)}</div>
                            <div class="preview-item-sub">${safe([e.beatType ? `Beat: ${e.beatType}` : '', e.description].filter(Boolean).join(' • '))}</div>
                        </div>
                    `)}
                    <div class="text-sm text-gray-600" style="margin-top:0.75rem;">Relationships (${(extracted.relationships || []).length})</div>
                    ${suggestedList('relationships', extracted.relationships || [], r => `
                        <div>
                            <div class="preview-item-title">${safe(r.from)} ↔ ${safe(r.to)} <span class="preview-item-sub">(${safe(r.type || 'other')})</span></div>
                            ${r.description ? `<div class="preview-item-sub">${safe(r.description)}</div>` : ''}
                        </div>
                    `)}
                </div>
            </div>
        `;
    },

    computeRelationshipPairs() {
        const chars = Array.isArray(this.storyData.characters) ? this.storyData.characters : [];
        const byId = new Map(chars.map(c => [c.id, c]));
        const pairs = new Set();
        chars.forEach(c => {
            const rel = Array.isArray(c.relatedCharacters) ? c.relatedCharacters : [];
            rel.forEach(id => {
                const other = byId.get(id);
                if (!other) return;
                const a = String(c.name || '').trim();
                const b = String(other.name || '').trim();
                const key = [a, b].sort((x, y) => x.localeCompare(y)).join(' ↔ ');
                if (a && b) pairs.add(key);
            });
        });
        return Array.from(pairs).slice(0, 40);
    },

    applyDashboardSuggestions() {
        const extracted = this.importNotesState.extracted;
        if (!extracted) return;

        const sel = this.importNotesState.selections;
        const pick = (key) => (Array.isArray(extracted[key]) ? extracted[key].filter((_, idx) => sel[key]?.[idx] !== false) : []);

        const payload = {
            characters: pick('characters'),
            timelineEvents: pick('timelineEvents'),
            relationships: pick('relationships'),
            politics: [],
            workItems: []
        };

        const result = this.mergeImportedPayload(payload);
        this.save();
        this.closeAnalyzeImportModal();
        alert(`Added: ${result.charactersAdded} character(s), ${result.eventsAdded} event(s), ${result.relationshipsAdded} relationship link(s).`);
    },

    mergeImportedPayload(payload, options = {}) {
        const norm = (s) => String(s || '').trim().toLowerCase();
        const safeStr = (v) => String(v ?? '').trim();
        const tagsImported = ['imported'];
        const conflicts = options.conflicts || { characters: [], timelineEvents: [], workItems: [] };
        const resolutions = options.conflictResolutions || {};

        const existingChars = Array.isArray(this.storyData.characters) ? this.storyData.characters : [];
        const existingEvents = Array.isArray(this.storyData.events) ? this.storyData.events : [];
        const existingPolitics = Array.isArray(this.storyData.politics) ? this.storyData.politics : [];
        const existingWork = Array.isArray(this.storyData.workItems) ? this.storyData.workItems : [];

        const charByName = new Map(existingChars.map(c => [norm(c.name), c]));
        const eventByTitle = new Map(existingEvents.map(e => [norm(e.title), e]));
        const workByTitle = new Set(existingWork.map(w => norm(w.title)));

        let nextCharId = Math.max(...existingChars.map(c => c.id), 0) + 1;
        let nextEventId = Math.max(...existingEvents.map(e => e.id), 0) + 1;
        let nextWorkId = Math.max(...existingWork.map(w => w.id), 0) + 1;

        let charactersAdded = 0;
        let eventsAdded = 0;
        let relationshipsAdded = 0;
        let politicsAdded = 0;
        let workItemsAdded = 0;
        let canonProtected = 0;
        let draftsAdded = 0;

        const conflictDecisionFor = (group, canonId, importedIndex) => {
            const keyPrefix = group === 'characters' ? 'character' : (group === 'timelineEvents' ? 'timeline' : 'workItem');
            const key = `${keyPrefix}:${canonId}:${importedIndex}`;
            return resolutions[key] || 'keep';
        };

        // Characters
        (payload.characters || []).forEach(c => {
            const nameKey = norm(c.name);
            if (!nameKey) return;
            const existing = charByName.get(nameKey);
            if (existing) {
                if (existing.isCanon) {
                    // Find conflict by name if present; default keep.
                    const conflict = (conflicts.characters || []).find(x => norm(x.canon?.name) === nameKey);
                    const decision = conflict ? conflictDecisionFor('characters', conflict.canon.id, conflict.importedIndex) : 'keep';
                    if (decision === 'keep') {
                        canonProtected += 1;
                        return;
                    }
                    if (decision === 'draft') {
                        const newChar = {
                            id: nextCharId++,
                            name: `${safeStr(c.name)} (Draft)`,
                            age: 0,
                            role: '',
                            type: c.type || 'friendly',
                            background: safeStr(c.description),
                            personality: '',
                            relatedCharacters: [],
                            notes: '',
                            isCanon: false,
                            tags: tagsImported
                        };
                        existingChars.push(newChar);
                        charByName.set(norm(newChar.name), newChar);
                        charactersAdded += 1;
                        draftsAdded += 1;
                        return;
                    }
                    // replace anyway
                    existing.type = c.type || existing.type;
                    const desc = safeStr(c.description);
                    if (desc) existing.background = desc;
                    existing.tags = Array.isArray(existing.tags) ? Array.from(new Set([...existing.tags, ...tagsImported])) : tagsImported;
                    return;
                }
                // Merge description into notes if helpful.
                const desc = safeStr(c.description);
                if (desc && !safeStr(existing.notes).toLowerCase().includes(desc.toLowerCase())) {
                    existing.notes = safeStr(existing.notes) ? `${existing.notes}\nImported: ${desc}` : `Imported: ${desc}`;
                }
                if (c.type && !existing.type) existing.type = c.type;
                existing.tags = Array.isArray(existing.tags) ? Array.from(new Set([...existing.tags, ...tagsImported])) : tagsImported;
                return;
            }
            const newChar = {
                id: nextCharId++,
                name: safeStr(c.name),
                age: 0,
                role: '',
                type: c.type || 'friendly',
                background: safeStr(c.description),
                personality: '',
                relatedCharacters: [],
                notes: '',
                isCanon: false,
                tags: tagsImported
            };
            existingChars.push(newChar);
            charByName.set(nameKey, newChar);
            charactersAdded += 1;
            draftsAdded += 1;
        });

        // Events
        (payload.timelineEvents || []).forEach(e => {
            const titleKey = norm(e.title);
            if (!titleKey) return;
            if (eventByTitle.get(titleKey)) return;
            const beatType = safeStr(e.beatType);
            const desc = safeStr(e.description);
            const combinedDesc = [beatType ? `[Beat: ${beatType}]` : '', desc].filter(Boolean).join(' ');

            const newEvent = {
                id: nextEventId++,
                title: safeStr(e.title),
                period: '',
                order: existingEvents.length,
                beat: null,
                description: combinedDesc,
                fullDescription: '',
                involvedCharacterIds: [],
                isCanon: false,
                tags: tagsImported
            };
            existingEvents.push(newEvent);
            eventByTitle.set(titleKey, newEvent);
            eventsAdded += 1;
            draftsAdded += 1;
        });

        // Relationships → map by character names and link relatedCharacters (bidirectional)
        (payload.relationships || []).forEach(r => {
            const fromKey = norm(r.from);
            const toKey = norm(r.to);
            const from = charByName.get(fromKey);
            const to = charByName.get(toKey);
            if (!from || !to) return;

            const already = Array.isArray(from.relatedCharacters) && from.relatedCharacters.includes(to.id);
            if (!already) {
                from.relatedCharacters = Array.isArray(from.relatedCharacters) ? from.relatedCharacters : [];
                to.relatedCharacters = Array.isArray(to.relatedCharacters) ? to.relatedCharacters : [];
                from.relatedCharacters.push(to.id);
                to.relatedCharacters.push(from.id);
                relationshipsAdded += 1;
            }

            const desc = safeStr(r.description);
            const tag = safeStr(r.type || 'other');
            if (desc) {
                if (from.isCanon) return;
                const line = `Relationship (${tag}) with ${to.name}: ${desc}`;
                if (!safeStr(from.notes).toLowerCase().includes(line.toLowerCase())) {
                    from.notes = safeStr(from.notes) ? `${from.notes}\n${line}` : line;
                }
            }
        });

        // Politics/worldbuilding: add as new sections if not duplicated by section+content
        const polKey = (p) => `${norm(p.section)}::${norm(p.content)}`;
        const existingPolSet = new Set(existingPolitics.map(polKey));
        (payload.politics || []).forEach(p => {
            const section = safeStr(p.section || 'Imported Notes');
            const content = safeStr(p.content);
            if (!content) return;
            const key = `${norm(section)}::${norm(content)}`;
            if (existingPolSet.has(key)) return;
            existingPolitics.push({ section, content });
            existingPolSet.add(key);
            politicsAdded += 1;
        });

        // Work items
        (payload.workItems || []).forEach(w => {
            const title = safeStr(w.title);
            if (!title) return;
            const key = norm(title);
            if (workByTitle.has(key)) return;
            existingWork.push({
                id: nextWorkId++,
                title,
                category: safeStr(w.category || 'Scene Planning'),
                completed: false,
                isCanon: false,
                tags: tagsImported
            });
            workByTitle.add(key);
            workItemsAdded += 1;
            draftsAdded += 1;
        });

        // Re-attach mutated arrays back (defensive)
        this.storyData.characters = existingChars;
        this.storyData.events = existingEvents;
        this.storyData.politics = existingPolitics;
        this.storyData.workItems = existingWork;

        return { charactersAdded, eventsAdded, relationshipsAdded, politicsAdded, workItemsAdded, canonProtected, draftsAdded };
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
            notes,
            isCanon: false,
            tags: []
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
        if (StorageService.isCanonProtected(id, 'character')) {
            alert('This character is marked as Canon and is protected from deletion.');
            return;
        }
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
        const typeFilter = this.globalSearch.characterTypes;
        const q = this.globalSearch.query.trim().toLowerCase();
        
        const matchesChar = (char) => {
            const localMatch = char.name.toLowerCase().includes(searchTerm) || char.role.toLowerCase().includes(searchTerm);
            const globalMatch = !q || (
                (char.name || '').toLowerCase().includes(q)
                || (char.role || '').toLowerCase().includes(q)
                || (char.background || '').toLowerCase().includes(q)
                || (char.personality || '').toLowerCase().includes(q)
                || (char.notes || '').toLowerCase().includes(q)
            );
            // Relationship match: query matches any related character name.
            const rel = Array.isArray(char.relatedCharacters) ? char.relatedCharacters : [];
            const relMatch = !q || rel
                .map(id => this.storyData.characters.find(c => c.id === id))
                .filter(Boolean)
                .some(rc => (rc.name || '').toLowerCase().includes(q));

            const typeOk = typeFilter.size === 0 || typeFilter.has(char.type);
            return typeOk && localMatch && (globalMatch || relMatch);
        };

        const filtered = this.storyData.characters
            .filter(c => !this.canonUI.showCanonOnlyCharacters || c.isCanon)
            .filter(matchesChar);

        container.innerHTML = filtered.map(char => {
            const relatedNames = char.relatedCharacters
                .map(id => this.storyData.characters.find(c => c.id === id))
                .filter(c => c);

            return `
                <div
                    class="card character-card ${char.type} ${char.isCanon ? 'canon-locked' : ''}"
                    draggable="true"
                    data-character-id="${char.id}"
                    ondragstart="App.onCharacterDragStart(event, ${char.id})"
                    ondragend="App.onCharacterDragEnd(event)"
                    ondragover="App.onCharacterCardDragOver(event)"
                    ondragleave="App.onCharacterCardDragLeave(event)"
                    ondrop="App.onCharacterCardDrop(event, ${char.id})"
                    title="Drag onto another character to create a relationship. Bonus: drag onto a timeline event to mark involved characters."
                >
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                        <div>
                            <h3>
                                ${this.getCharacterEmoji(char.type)}
                                ${
                                    this.inlineEdit.kind === 'character' && this.inlineEdit.id === char.id && this.inlineEdit.field === 'name'
                                        ? `<input class="form-input inline-edit-input" style="display:inline-block; width: min(420px, 80vw); margin:0 0 0 0.4rem; padding:0.4rem 0.6rem;" value="${this.escapeHTML(this.inlineEdit.value)}" oninput="App.onInlineEditInput(this.value)" onkeydown="App.onInlineEditKeydown(event)" onblur="App.commitInlineEdit()">`
                                        : `<span style="cursor:text;" onclick="App.startInlineEdit('character', ${char.id}, 'name', '${this.escapeHTML(char.name)}')">${this.escapeHTML(char.name)}</span>`
                                }
                                ${char.isCanon ? this.renderCanonBadge('character', char.id) : ''}
                            </h3>
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

    onCharacterDragStart(event, characterId) {
        this.draggingCharacterId = characterId;
        try {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(characterId));
        } catch (error) {
            // Ignore dataTransfer issues.
        }
    },

    onCharacterDragEnd() {
        this.draggingCharacterId = null;
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    },

    onCharacterCardDragOver(event) {
        event.preventDefault();
        const el = event.currentTarget;
        if (el) el.classList.add('drop-target');
    },

    onCharacterCardDragLeave(event) {
        const el = event.currentTarget;
        if (el) el.classList.remove('drop-target');
    },

    onCharacterCardDrop(event, targetCharacterId) {
        event.preventDefault();
        const el = event.currentTarget;
        if (el) el.classList.remove('drop-target');

        const raw = (() => {
            try { return event.dataTransfer.getData('text/plain'); } catch (e) { return ''; }
        })();
        const sourceId = Number(raw || this.draggingCharacterId);
        if (!Number.isFinite(sourceId) || sourceId === targetCharacterId) return;

        this.openRelationshipLinkModal(sourceId, targetCharacterId);
    },

    openRelationshipLinkModal(fromId, toId) {
        const from = this.storyData.characters.find(c => c.id === fromId);
        const to = this.storyData.characters.find(c => c.id === toId);
        if (!from || !to) return;

        this.relationshipDraft = { fromId, toId, type: 'other', notes: '' };
        const fromEl = document.getElementById('relFromName');
        const toEl = document.getElementById('relToName');
        const typeEl = document.getElementById('relType');
        const notesEl = document.getElementById('relNotes');
        if (fromEl) fromEl.textContent = from.name;
        if (toEl) toEl.textContent = to.name;
        if (typeEl) typeEl.value = 'other';
        if (notesEl) notesEl.value = '';

        document.getElementById('relationshipModal')?.classList.add('active');
    },

    closeRelationshipModal() {
        document.getElementById('relationshipModal')?.classList.remove('active');
    },

    confirmRelationshipLink() {
        const typeEl = document.getElementById('relType');
        const notesEl = document.getElementById('relNotes');
        const type = String(typeEl?.value || 'other').trim();
        const notes = String(notesEl?.value || '').trim();

        const from = this.storyData.characters.find(c => c.id === this.relationshipDraft.fromId);
        const to = this.storyData.characters.find(c => c.id === this.relationshipDraft.toId);
        if (!from || !to) return;

        from.relatedCharacters = Array.isArray(from.relatedCharacters) ? from.relatedCharacters : [];
        to.relatedCharacters = Array.isArray(to.relatedCharacters) ? to.relatedCharacters : [];

        if (!from.relatedCharacters.includes(to.id)) from.relatedCharacters.push(to.id);
        if (!to.relatedCharacters.includes(from.id)) to.relatedCharacters.push(from.id);

        if (notes) {
            const lineA = `Relationship (${type}) with ${to.name}: ${notes}`;
            const lineB = `Relationship (${type}) with ${from.name}: ${notes}`;
            from.notes = from.notes ? `${from.notes}\n${lineA}` : lineA;
            to.notes = to.notes ? `${to.notes}\n${lineB}` : lineB;
        }

        this.save();
        this.closeRelationshipModal();
        this.renderCharacters();
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
            fullDescription: '',
            involvedCharacterIds: [],
            isCanon: false,
            tags: []
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
        if (StorageService.isCanonProtected(id, 'timeline')) {
            alert('This timeline event is marked as Canon and is protected from deletion.');
            return;
        }
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

        const sortedEventsAll = [...this.storyData.events].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
        const beatFilter = this.globalSearch.beats;
        const q = this.globalSearch.query.trim().toLowerCase();
        const sortedEvents = sortedEventsAll
            .filter(ev => !this.canonUI.showCanonOnlyTimeline || ev.isCanon)
            .filter(ev => {
                const beatOk = beatFilter.size === 0 || (ev.beat && beatFilter.has(String(ev.beat)));
                if (!beatOk) return false;
                if (!q) return true;
                const involvedNames = (Array.isArray(ev.involvedCharacterIds) ? ev.involvedCharacterIds : [])
                    .map(id => this.storyData.characters.find(c => c.id === id)?.name)
                    .filter(Boolean)
                    .join(' ');
                const blob = `${ev.title || ''} ${ev.period || ''} ${ev.description || ''} ${ev.fullDescription || ''} ${involvedNames}`;
                return blob.toLowerCase().includes(q);
            });
        const eventsWithBeat = sortedEvents.filter(e => e.beat);
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

        const charById = new Map((this.storyData.characters || []).map(c => [c.id, c]));

        timelineContainer.innerHTML = `
            <div id="timelineList" style="margin-top: 2rem;">
                ${sortedEvents.map(event => `
                    <div class="timeline-event ${event.isCanon ? 'canon-locked' : ''}"
                         data-event-id="${event.id}"
                         ondragover="App.onTimelineEventDragOver(event)"
                         ondragleave="App.onTimelineEventDragLeave(event)"
                         ondrop="App.onTimelineEventDrop(event, ${event.id})"
                    >
                        <div class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</div>
                        <div class="timeline-dot"></div>
                        <div style="flex: 1;">
                            <div style="display:flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap;">
                                ${
                                    this.inlineEdit.kind === 'event' && this.inlineEdit.id === event.id && this.inlineEdit.field === 'title'
                                        ? `<input class="form-input inline-edit-input" style="flex: 1; min-width: 220px; margin:0; padding:0.45rem 0.65rem;" value="${this.escapeHTML(this.inlineEdit.value)}" oninput="App.onInlineEditInput(this.value)" onkeydown="App.onInlineEditKeydown(event)" onblur="App.commitInlineEdit()">`
                                        : `<span style="font-weight:900; text-decoration: underline; text-underline-offset: 2px; cursor:text; color:#1d4ed8;" onclick="App.startInlineEdit('event', ${event.id}, 'title', '${this.escapeHTML(event.title)}')" title="Click to rename">${this.escapeHTML(event.title)}</span>
                                           ${event.isCanon ? this.renderCanonBadge('timeline', event.id) : ''}`
                                }
                                <button class="topbar-ghost" style="padding:0.35rem 0.6rem; font-size:0.8rem;" onclick="App.openEventEditor(${event.id})" title="Open full editor">Details</button>
                            </div>
                            <div class="text-sm text-gray-600">
                                ${this.escapeHTML(event.period || '')}
                                ${
                                    this.inlineEdit.kind === 'event' && this.inlineEdit.id === event.id && this.inlineEdit.field === 'beat'
                                        ? `<select class="form-input inline-edit-input" style="display:inline-block; width:auto; margin:0 0 0 0.4rem; padding:0.35rem 0.55rem;" oninput="App.onInlineEditInput(this.value)" onkeydown="App.onInlineEditKeydown(event)" onblur="App.commitInlineEdit()">
                                            <option value="" ${!event.beat ? 'selected' : ''}>No beat</option>
                                            <option value="1" ${event.beat === '1' ? 'selected' : ''}>Beat 1</option>
                                            <option value="2" ${event.beat === '2' ? 'selected' : ''}>Beat 2</option>
                                            <option value="3" ${event.beat === '3' ? 'selected' : ''}>Beat 3</option>
                                            <option value="4" ${event.beat === '4' ? 'selected' : ''}>Beat 4</option>
                                            <option value="5" ${event.beat === '5' ? 'selected' : ''}>Beat 5</option>
                                            <option value="6" ${event.beat === '6' ? 'selected' : ''}>Beat 6</option>
                                            <option value="7" ${event.beat === '7' ? 'selected' : ''}>Beat 7</option>
                                            <option value="8" ${event.beat === '8' ? 'selected' : ''}>Beat 8</option>
                                        </select>`
                                        : `${event.beat ? ` • <span style="cursor:text; text-decoration: underline; text-underline-offset: 2px;" onclick="App.startInlineEdit('event', ${event.id}, 'beat', '${this.escapeHTML(event.beat)}')" title="Click to change beat">Story Beat ${this.escapeHTML(event.beat)}</span>` : ` • <span style="cursor:text; text-decoration: underline; text-underline-offset: 2px;" onclick="App.startInlineEdit('event', ${event.id}, 'beat', '')" title="Click to assign beat">Assign beat</span>`}`
                                }
                            </div>
                            ${event.description ? `<div class="text-sm text-gray-700 mt-1">${event.description}</div>` : ''}
                            ${
                                Array.isArray(event.involvedCharacterIds) && event.involvedCharacterIds.length
                                    ? `<div class="mb-2" style="margin-top:0.5rem;">
                                        <strong class="text-sm">Involved:</strong>
                                        <div class="related-characters-container" style="margin-top:0.35rem;">
                                            ${event.involvedCharacterIds
                                                .map(id => charById.get(id))
                                                .filter(Boolean)
                                                .map(c => `
                                                    <span class="character-badge ${c.type}" style="cursor: default;">
                                                        ${App.getCharacterEmoji(c.type)} ${App.escapeHTML(c.name)}
                                                    </span>
                                                `).join('')}
                                        </div>
                                    </div>`
                                    : ''
                            }
                            ${event.fullDescription ? `<div class="text-sm text-gray-600 mt-2 italic">${event.fullDescription.substring(0, 100)}${event.fullDescription.length > 100 ? '...' : ''}</div>` : ''}
                        </div>
                        <button class="delete-btn" onclick="App.deleteEvent(${event.id}); event.stopPropagation();">Delete</button>
                    </div>
                `).join('')}
            </div>
        `;

        this.initTimelineDragAndDrop();
    },

    onTimelineEventDragOver(event) {
        // allow character drop
        event.preventDefault();
        const el = event.currentTarget;
        if (el) el.classList.add('drop-target');
    },

    onTimelineEventDragLeave(event) {
        const el = event.currentTarget;
        if (el) el.classList.remove('drop-target');
    },

    onTimelineEventDrop(event, eventId) {
        event.preventDefault();
        const el = event.currentTarget;
        if (el) el.classList.remove('drop-target');

        const raw = (() => {
            try { return event.dataTransfer.getData('text/plain'); } catch (e) { return ''; }
        })();
        const characterId = Number(raw || this.draggingCharacterId);
        if (!Number.isFinite(characterId)) return;

        const ev = this.storyData.events.find(e => e.id === eventId);
        if (!ev) return;

        ev.involvedCharacterIds = Array.isArray(ev.involvedCharacterIds) ? ev.involvedCharacterIds : [];
        if (!ev.involvedCharacterIds.includes(characterId)) {
            ev.involvedCharacterIds.push(characterId);
            StorageService.saveStoryData(this.storyData);
            this.renderTimelineWithCircle();
        }
    },

    initTimelineDragAndDrop() {
        const list = document.getElementById('timelineList');
        if (!list) return;
        if (typeof Sortable === 'undefined') return;

        // Re-init safely on re-render.
        try {
            if (this.timelineSortable && this.timelineSortable.destroy) {
                this.timelineSortable.destroy();
            }
        } catch (error) {
            // Ignore destroy errors.
        }

        this.timelineSortable = Sortable.create(list, {
            animation: 160,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            onEnd: () => {
                this.persistTimelineOrderFromDOM();
            }
        });
    },

    persistTimelineOrderFromDOM() {
        const list = document.getElementById('timelineList');
        if (!list) return;

        const ids = Array.from(list.querySelectorAll('[data-event-id]'))
            .map(el => Number(el.getAttribute('data-event-id')))
            .filter(n => Number.isFinite(n));

        const byId = new Map(this.storyData.events.map(e => [e.id, e]));
        const reordered = [];
        ids.forEach((id, idx) => {
            const ev = byId.get(id);
            if (!ev) return;
            ev.order = idx;
            reordered.push(ev);
        });

        // Append any events not present in DOM (safety).
        this.storyData.events
            .filter(e => !ids.includes(e.id))
            .forEach(e => {
                e.order = reordered.length;
                reordered.push(e);
            });

        this.storyData.events = reordered;
        StorageService.saveStoryData(this.storyData);
        this.renderTimelineWithCircle();
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
            completed: false,
            isCanon: false,
            tags: []
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
        if (StorageService.isCanonProtected(id, 'workItem')) {
            alert('This work item is marked as Canon and is protected from deletion.');
            return;
        }
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

        const q = this.globalSearch.query.trim().toLowerCase();
        this.storyData.workItems
            .filter(item => !this.canonUI.showCanonOnlyWorkItems || item.isCanon)
            .filter(item => {
                if (!q) return true;
                const blob = `${item.title || ''} ${item.category || ''}`;
                return blob.toLowerCase().includes(q);
            })
            .forEach(item => {
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
                        ${item.isCanon ? this.renderCanonBadge('workItem', item.id) : ''}
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
    addAIReport(type, title, content, status = 'success', suggestedActions = undefined) {
        if (!Array.isArray(this.storyData.aiReports)) {
            this.storyData.aiReports = [];
        }

        this.storyData.aiReports.unshift({
            id: Date.now(),
            type,
            title,
            content,
            status,
            suggestedActions: Array.isArray(suggestedActions) ? suggestedActions : undefined,
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
            templates: 'Templates',
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
                const parsed = this.parseAIJSON(result);
                const suggested = (Array.isArray(parsed?.suggestedActions) ? parsed.suggestedActions : [])
                    .map(a => ({
                        ...a,
                        isCanon: false,
                        tags: Array.isArray(a?.tags) ? Array.from(new Set([...a.tags, 'draft'])) : ['draft']
                    }));
                this.addAIReport('story', '📊 Full Story Analysis', result, 'success', suggested);
                runStatus.innerHTML = '<div class="ai-status connected">✅ Full story analysis saved. See Suggested Actions below.</div>';
                this.suggestedActionsUI.selected = {};
                this.renderAISuggestedActions();
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

    parseAIJSON(rawText) {
        const raw = String(rawText || '').trim();
        if (!raw) return null;
        let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }
        try {
            return JSON.parse(cleaned);
        } catch (e) {
            return null;
        }
    },

    getLatestStorySuggestedActions() {
        const reports = Array.isArray(this.storyData.aiReports) ? this.storyData.aiReports : [];
        const latest = reports.find(r => r && r.type === 'story' && r.status !== 'error');
        const actions = Array.isArray(latest?.suggestedActions) ? latest.suggestedActions : [];
        return actions.slice(0, 25);
    },

    toggleSuggestedActionSelection(idx, checked) {
        this.suggestedActionsUI.selected[idx] = Boolean(checked);
    },

    promoteSelectedSuggestedActionsToCanon() {
        const actions = this.getLatestStorySuggestedActions();
        const selectedIdxs = Object.entries(this.suggestedActionsUI.selected)
            .filter(([, v]) => v)
            .map(([k]) => Number(k))
            .filter(n => Number.isFinite(n));
        if (selectedIdxs.length === 0) {
            alert('Select at least one suggestion to promote.');
            return;
        }

        const norm = (s) => String(s || '').trim().toLowerCase();
        const eventsByTitle = new Map((this.storyData.events || []).map(e => [norm(e.title), e]));
        const workByTitle = new Map((this.storyData.workItems || []).map(w => [norm(w.title), w]));
        const charsByName = new Map((this.storyData.characters || []).map(c => [norm(c.name), c]));

        let promoted = 0;
        let skipped = 0;

        selectedIdxs.forEach(idx => {
            const a = actions[idx];
            if (!a) return;
            const type = this.normalizeSuggestedActionType(a.actionType);

            if (type === 'timeline_event') {
                const ev = eventsByTitle.get(norm(a.title));
                if (ev) {
                    ev.isCanon = true;
                    promoted += 1;
                } else {
                    skipped += 1;
                }
                return;
            }

            if (type === 'work_item') {
                const w = workByTitle.get(norm(a.title));
                if (w) {
                    w.isCanon = true;
                    promoted += 1;
                } else {
                    skipped += 1;
                }
                return;
            }

            if (type === 'character_arc_update') {
                const rel = Array.isArray(a.relatedTo) ? a.relatedTo : [];
                const names = rel
                    .filter(x => String(x).toLowerCase().startsWith('character:'))
                    .map(x => String(x).split(':').slice(1).join(':').trim())
                    .filter(Boolean);
                if (names.length === 0) {
                    skipped += 1;
                    return;
                }
                let any = false;
                names.forEach(n => {
                    const c = charsByName.get(norm(n));
                    if (c) {
                        c.isCanon = true;
                        any = true;
                    }
                });
                if (any) promoted += 1; else skipped += 1;
            }
        });

        StorageService.saveStoryData(this.storyData);
        this.render();
        alert(`Promoted ${promoted} item(s) to Canon. Skipped ${skipped} (missing corresponding items; add them first).`);
    },

    renderAISuggestedActions() {
        const container = document.getElementById('aiSuggestedActions');
        if (!container) return;
        const actions = this.getLatestStorySuggestedActions();
        if (actions.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div class="ai-result suggestion" style="margin-top: 0.75rem;">
                <div class="ai-header">
                    <h3 style="margin: 0;">Suggested Actions</h3>
                    <div style="display:flex; gap:0.5rem; flex-wrap: wrap;">
                        <button style="background:#2563eb; font-size:0.85rem; padding:0.5rem 0.75rem;" onclick="App.applySuggestedActionsToTimeline()">Add as New Timeline Events</button>
                        <button style="background:#16a34a; font-size:0.85rem; padding:0.5rem 0.75rem;" onclick="App.applySuggestedActionsToWorkItems()">Add as Work Items</button>
                        <button style="background:#7c3aed; font-size:0.85rem; padding:0.5rem 0.75rem;" onclick="App.applySuggestedActionsToCharacterArcs()">Update Character Arcs</button>
                        <button style="background:#d97706; font-size:0.85rem; padding:0.5rem 0.75rem;" onclick="App.promoteSelectedSuggestedActionsToCanon()">Promote selected to Canon</button>
                    </div>
                </div>
                <div class="text-sm text-gray-600" style="margin-top:0.5rem;">Based on the latest Full Story Analysis. Buttons apply all matching suggestions (deduped).</div>
                <div style="margin-top:0.75rem;">
                    ${actions.map((a, idx) => `
                        <div class="preview-item" style="border-bottom: 1px solid rgba(15, 23, 42, 0.06);">
                            <input type="checkbox" onchange="App.toggleSuggestedActionSelection(${idx}, this.checked)">
                            <div style="flex:1;">
                                <div class="preview-item-title">${this.escapeHTML(String(a.title || 'Suggestion'))} <span class="preview-item-sub">(${this.escapeHTML(String(this.normalizeSuggestedActionType(a.actionType)))}, draft)</span></div>
                                <div class="preview-item-sub">${this.escapeHTML(String(a.description || ''))}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    normalizeSuggestedActionType(t) {
        const x = String(t || '').trim().toLowerCase();
        if (x.includes('timeline')) return 'timeline_event';
        if (x.includes('work')) return 'work_item';
        if (x.includes('arc') || x.includes('character')) return 'character_arc_update';
        return x;
    },

    applySuggestedActionsToTimeline() {
        const actions = this.getLatestStorySuggestedActions()
            .filter(a => this.normalizeSuggestedActionType(a.actionType) === 'timeline_event');
        if (actions.length === 0) return;

        const existingTitles = new Set((this.storyData.events || []).map(e => String(e.title || '').trim().toLowerCase()));
        let nextEventId = Math.max(...(this.storyData.events || []).map(e => e.id), 0) + 1;
        let added = 0;

        actions.forEach(a => {
            const title = String(a.title || '').trim();
            if (!title) return;
            const key = title.toLowerCase();
            if (existingTitles.has(key)) return;
            this.storyData.events.push({
                id: nextEventId++,
                title,
                period: '',
                order: this.storyData.events.length,
                beat: null,
                description: String(a.description || '').trim(),
                fullDescription: '',
                involvedCharacterIds: []
            });
            existingTitles.add(key);
            added += 1;
        });

        StorageService.saveStoryData(this.storyData);
        this.renderTimelineWithCircle();
        alert(`Added ${added} timeline event(s).`);
    },

    applySuggestedActionsToWorkItems() {
        const actions = this.getLatestStorySuggestedActions()
            .filter(a => this.normalizeSuggestedActionType(a.actionType) === 'work_item');
        if (actions.length === 0) return;

        const existing = new Set((this.storyData.workItems || []).map(w => String(w.title || '').trim().toLowerCase()));
        let nextWorkId = Math.max(...(this.storyData.workItems || []).map(w => w.id), 0) + 1;
        let added = 0;

        actions.forEach(a => {
            const title = String(a.title || '').trim();
            if (!title) return;
            const key = title.toLowerCase();
            if (existing.has(key)) return;
            this.storyData.workItems.push({
                id: nextWorkId++,
                title,
                category: 'Scene Planning',
                completed: false
            });
            existing.add(key);
            added += 1;
        });

        StorageService.saveStoryData(this.storyData);
        this.renderWorkItems();
        alert(`Added ${added} work item(s).`);
    },

    applySuggestedActionsToCharacterArcs() {
        const actions = this.getLatestStorySuggestedActions()
            .filter(a => this.normalizeSuggestedActionType(a.actionType) === 'character_arc_update');
        if (actions.length === 0) return;

        const byName = new Map((this.storyData.characters || []).map(c => [String(c.name || '').trim().toLowerCase(), c]));
        let updated = 0;
        actions.forEach(a => {
            const rel = Array.isArray(a.relatedTo) ? a.relatedTo : [];
            const names = rel
                .filter(x => String(x).toLowerCase().startsWith('character:'))
                .map(x => String(x).split(':').slice(1).join(':').trim())
                .filter(Boolean);
            const desc = String(a.description || '').trim();
            if (!desc) return;
            (names.length ? names : []).forEach(n => {
                const c = byName.get(n.toLowerCase());
                if (!c) return;
                const line = `Arc update: ${String(a.title || 'Suggestion').trim()} — ${desc}`;
                if (!String(c.notes || '').toLowerCase().includes(line.toLowerCase())) {
                    c.notes = c.notes ? `${c.notes}\n${line}` : line;
                    updated += 1;
                }
            });
        });
        StorageService.saveStoryData(this.storyData);
        this.renderCharacters();
        alert(`Updated ${updated} character note(s) with arc suggestions.`);
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

// Import Notes Modal
function createImportNotesModal() {
    const html = `
        <div id="importNotesModal" class="ai-settings-modal">
            <div class="ai-settings-content" style="max-width: 860px;">
                <span class="modal-close" onclick="App.closeImportNotesModal()">&times;</span>
                <h2>📝 Import Notes</h2>
                <p class="text-gray-600 mb-4">Paste your story notes or upload a file. The local AI will extract structured items you can merge into your story.</p>

                <div class="modal-tabs">
                    <button id="importTabPaste" class="modal-tab active" onclick="App.setImportNotesTab('paste')">Paste Text</button>
                    <button id="importTabUpload" class="modal-tab" onclick="App.setImportNotesTab('upload')">Upload File (.txt, .md)</button>
                </div>

                <div id="importPanePaste" style="margin-top: 0.75rem;">
                    <label class="block text-sm font-medium mb-2">Paste notes</label>
                    <textarea id="importNotesPaste" class="form-input" rows="8" placeholder="Paste your notes here..." oninput="App.onImportNotesPasteChange(this.value)"></textarea>
                </div>

                <div id="importPaneUpload" style="display:none; margin-top: 0.75rem;">
                    <label class="block text-sm font-medium mb-2">Upload a .txt or .md file</label>
                    <input type="file" class="form-input" accept=".txt,.md,text/plain,text/markdown" onchange="App.onImportNotesFileSelected(this.files?.[0] || null)">
                    <div class="text-sm text-gray-600" style="margin-top:0.4rem;">After upload, you’ll be returned to Paste Text with the file contents loaded.</div>
                </div>

                <div style="display:flex; gap:0.6rem; flex-wrap: wrap; margin-top: 0.9rem;">
                    <button class="ai-btn" onclick="App.extractFromNotes()">✨ Extract with AI</button>
                    <button style="background:#16a34a;" onclick="App.addImportedToStory()">✅ Add to Story</button>
                    <button class="topbar-ghost" onclick="App.closeImportNotesModal()">Cancel</button>
                </div>

                <div id="importNotesStatus" style="margin-top: 0.75rem;"></div>
                <div id="importPreview" style="margin-top: 0.75rem;"></div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

// Analyze & Import (Dashboard) comparison modal
function createAnalyzeImportModal() {
    const html = `
        <div id="analyzeImportModal" class="ai-settings-modal">
            <div class="ai-settings-content" style="max-width: 980px;">
                <span class="modal-close" onclick="App.closeAnalyzeImportModal()">&times;</span>
                <h2>✨ Analyze & Import</h2>
                <p class="text-gray-600 mb-4">Review suggestions side-by-side with your current story. Uncheck anything you don’t want to add.</p>

                <div style="display:flex; gap:0.6rem; flex-wrap: wrap;">
                    <button style="background:#16a34a;" onclick="App.applyDashboardSuggestions()">✅ Add Accepted Items</button>
                    <button class="topbar-ghost" onclick="App.closeAnalyzeImportModal()">Close</button>
                </div>

                <div id="analyzeImportCompare" style="margin-top: 0.85rem;"></div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

// Relationship link modal (drag character onto character)
function createRelationshipModal() {
    const html = `
        <div id="relationshipModal" class="event-editor-modal">
            <div class="event-editor-content" style="max-width: 720px;">
                <span class="modal-close" onclick="App.closeRelationshipModal()">&times;</span>
                <h2>Create Relationship</h2>
                <div class="ai-result" style="margin-top: 0.75rem;">
                    <strong id="relFromName">Character A</strong>
                    <span style="margin: 0 0.4rem;">↔</span>
                    <strong id="relToName">Character B</strong>
                    <div class="text-sm text-gray-600" style="margin-top: 0.35rem;">This will link them as related characters. Optionally add type + notes.</div>
                </div>

                <div style="margin-top: 0.75rem;">
                    <label class="block text-sm font-medium mb-2">Relationship Type</label>
                    <select id="relType" class="form-input">
                        <option value="ally">Ally</option>
                        <option value="enemy">Enemy</option>
                        <option value="family">Family</option>
                        <option value="romance">Romance</option>
                        <option value="mentor">Mentor</option>
                        <option value="rival">Rival</option>
                        <option value="other" selected>Other</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Notes (optional)</label>
                    <textarea id="relNotes" class="form-input" rows="4" placeholder="Short relationship notes..."></textarea>
                </div>

                <div style="display:flex; gap:0.6rem; flex-wrap: wrap; margin-top: 0.75rem;">
                    <button style="background:#16a34a;" onclick="App.confirmRelationshipLink()">✅ Link Characters</button>
                    <button class="topbar-ghost" onclick="App.closeRelationshipModal()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

// Command palette modal
function createCommandPaletteModal() {
    const html = `
        <div id="commandPaletteModal" class="ai-settings-modal">
            <div class="ai-settings-content" style="max-width: 720px;">
                <span class="modal-close" onclick="App.closeCommandPalette()">&times;</span>
                <h2>⌘ Command Palette</h2>
                <p class="text-gray-600 mb-4">Type to filter, Enter to run. (Cmd/Ctrl+K)</p>
                <input id="commandPaletteInput" class="form-input" placeholder="Search commands..." oninput="App.onCommandPaletteQuery(this.value)" onkeydown="App.onCommandPaletteKeydown(event)">
                <div id="commandPaletteList" style="margin-top:0.75rem;"></div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

// Canon confirm modal
function createCanonConfirmModal() {
    const html = `
        <div id="canonConfirmModal" class="event-editor-modal">
            <div class="event-editor-content" style="max-width: 620px;">
                <span class="modal-close" onclick="App.closeCanonConfirmModal()">&times;</span>
                <h2 id="canonModalTitle">Mark as Canon?</h2>
                <div class="ai-result" style="margin-top:0.75rem;">
                    <div id="canonModalBody">Marking as Canon protects this item from deletion and prevents AI imports from overwriting it.</div>
                </div>
                <div style="display:flex; gap:0.6rem; flex-wrap: wrap; margin-top: 0.75rem;">
                    <button id="canonModalActionBtn" style="background:#d97706;" onclick="App.confirmToggleCanon()">Mark as Canon</button>
                    <button class="topbar-ghost" onclick="App.closeCanonConfirmModal()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

// Draft merge modal
function createDraftMergeModal() {
    const html = `
        <div id="draftMergeModal" class="event-editor-modal">
            <div class="event-editor-content" style="max-width: 720px;">
                <span class="modal-close" onclick="App.closeMergeDraftModal()">&times;</span>
                <h2 id="draftMergeTitle">Merge Draft → Canon</h2>
                <div class="ai-result" style="margin-top:0.75rem;">
                    <div id="draftMergeBody">Select the canon item to merge into.</div>
                </div>
                <div style="margin-top:0.75rem;">
                    <label class="block text-sm font-medium mb-2">Canon target</label>
                    <select id="draftMergeTargetSelect" class="form-input"></select>
                </div>
                <div style="display:flex; gap:0.6rem; flex-wrap: wrap; margin-top: 0.75rem;">
                    <button style="background:#2563eb;" onclick="App.confirmMergeDraft()">Merge & Delete Draft</button>
                    <button class="topbar-ghost" onclick="App.closeMergeDraftModal()">Cancel</button>
                </div>
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
createImportNotesModal();
createAnalyzeImportModal();
createRelationshipModal();
createCommandPaletteModal();
createCanonConfirmModal();
createDraftMergeModal();

// Start the application
App.init();
