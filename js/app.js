/**
 * Main Application Module
 * Core application logic and UI management
 */

import {
    StorageService,
    TIMELINE_LOCATION_PRESETS,
    TIMELINE_LOCATION_OTHER,
    splitTimelineLocation,
    joinTimelineLocation,
    createTimelineEvent,
    updateTimelineEvent,
    getGhostBorderCanonStoryCore
} from './storage.js';
import { AIService } from './ai-service.js';
import { TAB_RENDERERS } from './components/tabs.js';

/** Campbell/Vogler — ids match `event.heroJourney` ('1'…'12'). */
const HERO_JOURNEY_STEPS = [
    { id: '1', short: 'Ordinary World', abbr: 'Ordinary' },
    { id: '2', short: 'Call to Adventure', abbr: 'Call' },
    { id: '3', short: 'Refusal of the Call', abbr: 'Refusal' },
    { id: '4', short: 'Meeting the Mentor', abbr: 'Mentor' },
    { id: '5', short: 'Crossing the Threshold', abbr: 'Threshold' },
    { id: '6', short: 'Tests, Allies, Enemies', abbr: 'Tests' },
    { id: '7', short: 'Approach to the Inmost Cave', abbr: 'Approach' },
    { id: '8', short: 'Ordeal', abbr: 'Ordeal' },
    { id: '9', short: 'Reward', abbr: 'Reward' },
    { id: '10', short: 'The Road Back', abbr: 'Road back' },
    { id: '11', short: 'Resurrection', abbr: 'Resurrection' },
    { id: '12', short: 'Return with the Elixir', abbr: 'Elixir' }
];

const TIMELINE_SHAPE_KINDS = ['circle', 'rounded', 'square', 'diamond'];

const STORY_WIZARD_DRAFT_KEY = 'cdrama_story_wizard_draft_v1';

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

    // ============ STORY WIZARD (DAN HARMON STORY CIRCLE) ============

    storySetupWizard: {
        open: false,
        running: false,
        phase: 'intro', // intro | questions | followups | review | committed
        baseIndex: 0,
        /** Per Story Circle question id (e.g. 1_you) — allows prefill, edit, skip */
        answerById: {},
        followUpQuestions: [],
        followUpAnswers: [], // [{ question, answer }]
        followupHistory: [],
        lastAI: { raw: '', mode: null, payload: null, questions: [] },
        staged: { characters: [], timelineBeats: [], relationships: [], workItems: [] },
        preview: { summary: '' },
        editMode: false,
        editedJson: ''
    },

    /**
     * Initialize the application
     */
    init() {
        this.mountTabs();
        this.initTheme();
        this.render();
        this.setupEventListeners();
        this.initMobileQuickAdd();
        AIService.checkConnection().then(() => this.updateAIStatus());
        setInterval(() => {
            AIService.checkConnection().then(() => this.updateAIStatus());
        }, 5000);
    },

    openStorySetupWizard() {
        const st = this.storySetupWizard;
        st.open = true;
        st.running = false;
        st.phase = 'intro';
        st.followUpQuestions = [];
        st.followUpAnswers = [];
        st.followupHistory = [];
        st.lastAI = { raw: '', mode: null, payload: null, questions: [] };
        st.staged = { characters: [], timelineBeats: [], relationships: [], workItems: [] };
        st.preview = { summary: '' };
        st.editMode = false;
        st.editedJson = '';

        const seeds = this.buildWizardAnswerSeedsFromStory();
        let draft = null;
        try {
            draft = JSON.parse(localStorage.getItem(STORY_WIZARD_DRAFT_KEY) || 'null');
        } catch {
            draft = null;
        }
        const draftAnswers = draft && typeof draft.answerById === 'object' ? draft.answerById : {};
        st.answerById = { ...seeds, ...draftAnswers };
        if (typeof draft?.baseIndex === 'number' && draft.baseIndex >= 0 && draft.baseIndex <= 8) {
            st.baseIndex = draft.baseIndex;
        } else {
            st.baseIndex = this.computeWizardFirstIncompleteIndex(st.answerById);
        }

        document.getElementById('storySetupWizardModal')?.classList.add('active');
        this.renderStorySetupWizardModal();
        setTimeout(() => document.getElementById('storySetupWizardAnswer')?.focus(), 0);
    },

    saveStorySetupWizardDraft() {
        const st = this.storySetupWizard;
        try {
            localStorage.setItem(
                STORY_WIZARD_DRAFT_KEY,
                JSON.stringify({
                    answerById: st.answerById,
                    baseIndex: st.baseIndex,
                    savedAt: Date.now()
                })
            );
        } catch {
            /* ignore quota */
        }
    },

    clearStorySetupWizardDraft() {
        try {
            localStorage.removeItem(STORY_WIZARD_DRAFT_KEY);
        } catch {
            /* ignore */
        }
    },

    computeWizardFirstIncompleteIndex(answerById) {
        const qs = this.storyCircleQuestions();
        for (let i = 0; i < qs.length; i++) {
            if (!String(answerById?.[qs[i].id] || '').trim()) return i;
        }
        return qs.length;
    },

    /**
     * Suggested text per Story Circle id from current story data (characters, beats, tasks, relationships).
     */
    buildWizardAnswerSeedsFromStory() {
        const out = {};
        const chars = Array.isArray(this.storyData?.characters) ? this.storyData.characters : [];
        const events = Array.isArray(this.storyData?.events) ? this.storyData.events : [];
        const rels = Array.isArray(this.storyData?.relationships) ? this.storyData.relationships : [];
        const workItems = Array.isArray(this.storyData?.workItems) ? this.storyData.workItems : [];

        const canonicalChars = chars.filter((c) => c && c.isCanon);
        const protagonist = canonicalChars[0] || chars[0] || null;
        if (protagonist) {
            out['1_you'] = [
                `${protagonist.name || 'Protagonist'} is the current protagonist focus.`,
                protagonist.role ? `Role: ${protagonist.role}.` : '',
                protagonist.description ? protagonist.description : protagonist.background || ''
            ]
                .filter(Boolean)
                .join(' ')
                .trim();
            out['2_need'] = protagonist.personality
                ? `Likely deep need inferred from personality notes: ${protagonist.personality}`
                : protagonist.notes
                    ? `Likely deep need inferred from notes: ${protagonist.notes}`
                    : '';
        }

        const firstEventByBeat = new Map();
        events.forEach((event) => {
            const beat = String(event?.beat || '').trim();
            if (!beat || firstEventByBeat.has(beat)) return;
            firstEventByBeat.set(beat, event);
        });
        const mapBeatToQuestion = {
            '3': '3_go',
            '4': '4_search',
            '5': '5_find',
            '6': '6_take',
            '7': '7_return',
            '8': '8_change'
        };
        Object.entries(mapBeatToQuestion).forEach(([beat, questionId]) => {
            const event = firstEventByBeat.get(beat);
            if (!event) return;
            out[questionId] = [
                event.title ? `Existing beat ${beat}: ${event.title}.` : '',
                event.description ? event.description : '',
                event.location ? `Location: ${event.location}.` : ''
            ]
                .filter(Boolean)
                .join(' ')
                .trim();
        });

        if (!out['4_search']) {
            const openTasks = workItems
                .filter((w) => w && !w.completed)
                .slice(0, 3)
                .map((w) => String(w.title || '').trim())
                .filter(Boolean);
            if (openTasks.length) out['4_search'] = `Current unresolved trials/tasks: ${openTasks.join('; ')}.`;
        }

        if (!out['8_change']) {
            const relHints = rels
                .slice(0, 3)
                .map(
                    (r) =>
                        `${r.from || r.fromName || 'Character'} → ${r.to || r.toName || 'Character'} (${r.type || 'relationship'})`
                );
            if (relHints.length) out['8_change'] = `Relationship shifts already tracked: ${relHints.join('; ')}.`;
        }

        return out;
    },

    wizardBaseAnswersOrdered() {
        const qs = this.storyCircleQuestions();
        const st = this.storySetupWizard;
        return qs
            .map((q) => ({
                id: q.id,
                label: q.label,
                expandWhere: q.expandWhere,
                answer: String(st.answerById[q.id] || '').trim()
            }))
            .filter((a) => a.answer);
    },

    async storySetupWizardBegin() {
        const st = this.storySetupWizard;
        st.phase = 'questions';
        if (st.baseIndex >= 8) {
            st.running = true;
            this.renderStorySetupWizardModal();
            await this.runStorySetupWizardAI();
            return;
        }
        this.renderStorySetupWizardModal();
        setTimeout(() => document.getElementById('storySetupWizardAnswer')?.focus(), 0);
    },

    storySetupWizardBeginFresh() {
        const st = this.storySetupWizard;
        this.clearStorySetupWizardDraft();
        st.answerById = { ...this.buildWizardAnswerSeedsFromStory() };
        st.baseIndex = this.computeWizardFirstIncompleteIndex(st.answerById);
        void this.storySetupWizardBegin();
    },

    closeStorySetupWizard() {
        this.storySetupWizard.open = false;
        this.storySetupWizard.running = false;
        document.getElementById('storySetupWizardModal')?.classList.remove('active');
    },

    skipStorySetupWizard() {
        this.closeStorySetupWizard();
    },

    storyCircleQuestions() {
        return [
            {
                id: '1_you',
                label: '1) You — Who is your protagonist (and what do they want right now)?',
                context:
                    'Dan Harmon’s “You” is the comfort zone: who they are and what they think they want before the story really grabs them. Name concrete traits, rank, habits, and the surface goal—plus what they would never admit they are afraid of.',
                expandWhere:
                    'Characters tab (protagonist description, role, background) and timeline Story Circle beat 1—the emotional “before” picture.'
            },
            {
                id: '2_need',
                label: '2) Need — What do they need (deeply) that they don’t yet understand?',
                context:
                    'The “Need” is internal: the lesson or change that will matter in beat 8, often hidden behind the “Want.” Contrast what they chase (ego, duty, revenge) with what would actually heal or mature them.',
                expandWhere:
                    'Character notes, personality, and arc fields; this need should complicate their choices in beats 4–6 when you draft scenes.'
            },
            {
                id: '3_go',
                label: '3) Go — What do they enter / commit to (new world, mission, court, war)?',
                context:
                    'The “Go” beat is the doorway: a choice or push that makes the new situation unavoidable—crossing into court politics, a campaign, time travel, or a pact. What do they say yes to, and what closes the door behind them?',
                expandWhere:
                    'Timeline Story Circle beat 3 (commitment / new world). If that event is thin, add title, description, and location there.'
            },
            {
                id: '4_search',
                label: '4) Search — What trials force them to adapt (politics, logistics, danger)?',
                context:
                    'The “Search” is trial-and-error: schemes fail, allies waver, rules of the new world bite. List pressures (supply, legitimacy, rivals, time-travel limits) that force new behavior—not just fights, but bureaucracy and morale.',
                expandWhere:
                    'Timeline beat 4 and open work items (research, continuity, plot-hole tasks). Weak answers here often mean a thin middle act.'
            },
            {
                id: '5_find',
                label: '5) Find — What do they get (a win, ally, tool, truth) and what does it cost?',
                context:
                    'The “Find” is a real gain—information, an ally, a battle won—but Harmon uses it to set up a harder choice. What do they *think* victory looks like, and what complication comes with it?',
                expandWhere:
                    'Timeline beat 5 (midpoint / apparent win). Make sure the “cost” echoes later so beat 6 feels earned.'
            },
            {
                id: '6_take',
                label: '6) Take — What do they pay / sacrifice / lose to move forward?',
                context:
                    'The “Take” is the price under pressure: a loss, moral compromise, public humiliation, or someone hurt because of their plan. This is often the darkest or most honest beat before the return.',
                expandWhere:
                    'Timeline beat 6 and relationship fractures—name who loses trust, status, or safety if this is vague.'
            },
            {
                id: '7_return',
                label: '7) Return — How do they return to the old world / new normal?',
                context:
                    'The “Return” carries the lesson or prize back toward the ordinary world or a new status quo—chase, aftermath, trial, or reconciliation. How is the external situation different now?',
                expandWhere:
                    'Timeline beat 7 (road back / consequences landing), locations, and who is still in play from earlier beats.'
            },
            {
                id: '8_change',
                label: '8) Change — How are they transformed (beliefs, tactics, relationships)?',
                context:
                    'The “Change” proves growth: they act differently than in beat 1, or see the same world with new eyes. Show the shift in one decisive behavior or line of dialogue you could write tomorrow.',
                expandWhere:
                    'Timeline beat 8 and the Relationships tab—who trusts them now, who they owe; proof the arc landed.'
            }
        ];
    },

    wizardAllAnswers() {
        const base = this.storyCircleQuestions().map((q) => {
            const answer = String(this.storySetupWizard.answerById[q.id] || '').trim();
            if (!answer) return null;
            const question = q.expandWhere ? `${q.label}\n[Where to expand in the project: ${q.expandWhere}]` : q.label;
            return { questionId: q.id, question, answer };
        }).filter(Boolean);
        const follow = this.storySetupWizard.followUpAnswers.map((a) => ({
            questionId: 'followup',
            question: a.question,
            answer: a.answer
        }));
        return [...base, ...follow].filter((x) => String(x.answer || '').trim());
    },

    async submitStorySetupWizardAnswer() {
        if (this.storySetupWizard.running) return;
        const input = document.getElementById('storySetupWizardAnswer');
        const text = String(input?.value || '').trim();
        const qs = this.storyCircleQuestions();
        const phase = this.storySetupWizard.phase;

        if (phase === 'followups' && !text) return;

        if (phase === 'questions' && !text) return;

        if (input) input.value = '';

        if (this.storySetupWizard.phase === 'questions') {
            const idx = this.storySetupWizard.baseIndex;
            const q = qs[idx];
            if (q) {
                this.storySetupWizard.answerById[q.id] = text;
                this.storySetupWizard.baseIndex = Math.min(qs.length, idx + 1);
            }
            this.saveStorySetupWizardDraft();
            await this.runStorySetupWizardAI();
            return;
        }

        if (this.storySetupWizard.phase === 'followups') {
            const q = this.storySetupWizard.followUpQuestions[0];
            if (q) {
                this.storySetupWizard.followUpAnswers.push({ question: q, answer: text });
                this.storySetupWizard.followUpQuestions = this.storySetupWizard.followUpQuestions.slice(1);
            }
            this.saveStorySetupWizardDraft();
            await this.runStorySetupWizardAI();
            return;
        }
    },

    async storySetupWizardSkipCurrentQuestion() {
        const st = this.storySetupWizard;
        if (st.running) return;
        if (st.phase === 'questions') {
            const qs = this.storyCircleQuestions();
            const q = qs[st.baseIndex];
            if (!q) return;
            delete st.answerById[q.id];
            st.baseIndex = Math.min(qs.length, st.baseIndex + 1);
            this.saveStorySetupWizardDraft();
            await this.runStorySetupWizardAI();
            return;
        }
        if (st.phase === 'followups') {
            const q = st.followUpQuestions[0];
            if (q) {
                st.followUpAnswers.push({ question: q, answer: '(skipped)' });
                st.followUpQuestions = st.followUpQuestions.slice(1);
            }
            this.saveStorySetupWizardDraft();
            await this.runStorySetupWizardAI();
        }
    },

    async runStorySetupWizardAI() {
        this.storySetupWizard.running = true;
        this.renderStorySetupWizardModal();
        try {
            const answers = this.wizardAllAnswers();
            const result = await AIService.runStorySetupWizardTurn(this.storyData, answers, {
                followupHistory: this.storySetupWizard.followupHistory
            });

            this.storySetupWizard.lastAI = {
                raw: String(result?.raw || ''),
                mode: result?.mode || null,
                payload: result?.payload || null,
                questions: Array.isArray(result?.questions) ? result.questions : []
            };

            if (result?.mode === 'ready' && result?.payload) {
                this.stageWizardPopulation(result.payload);
                this.storySetupWizard.phase = 'review';
            } else {
                const qs = Array.isArray(result?.questions) ? result.questions : [];
                const cleaned = qs.map((q) => String(q || '').trim()).filter(Boolean).slice(0, 3);
                this.storySetupWizard.followUpQuestions = cleaned.length
                    ? cleaned
                    : ['What is the single most important realism constraint for this story?'];
                this.storySetupWizard.followupHistory.push(...this.storySetupWizard.followUpQuestions);
                this.storySetupWizard.phase = 'followups';
            }
        } catch (e) {
            this.storySetupWizard.lastAI = { raw: `Error: ${e?.message || e}`, mode: 'error', payload: null, questions: [] };
            this.storySetupWizard.followUpQuestions = ['AI error. Paste a short summary of your premise and main conflict (1–2 paragraphs).'];
            this.storySetupWizard.phase = 'followups';
        } finally {
            this.storySetupWizard.running = false;
            this.renderStorySetupWizardModal();
            setTimeout(() => document.getElementById('storySetupWizardAnswer')?.focus(), 0);
        }
    },

    normalizeWizardLocation(loc) {
        const raw = String(loc || '').trim();
        if (!raw) return 'Daming Palace';
        const low = raw.toLowerCase();
        const aliases = this.GHOST_BORDER_LOCATION_ALIASES || {};
        const viaAlias = aliases[low];
        if (viaAlias) return viaAlias;
        const known = Object.keys(this.GHOST_BORDER_LOCATION_COORDS || {});
        const direct = known.find(k => k.toLowerCase() === low);
        if (direct) return direct;
        const fuzzy = known.find(k => low.includes(k.toLowerCase()) || k.toLowerCase().includes(low));
        return fuzzy || raw;
    },

    stageWizardPopulation(payload) {
        const p = payload || {};
        const chars = Array.isArray(p.characters) ? p.characters : [];
        const beats = Array.isArray(p.timelineBeats) ? p.timelineBeats : [];
        const rels = Array.isArray(p.relationships) ? p.relationships : [];
        const items = Array.isArray(p.workItems) ? p.workItems : [];

        this.storySetupWizard.staged = {
            characters: chars.map(c => ({
                name: String(c?.name || '').trim(),
                type: String(c?.type || 'gray').trim().toLowerCase(),
                description: String(c?.description || '').trim(),
                isCanon: Boolean(c?.isCanon)
            })).filter(c => c.name),
            timelineBeats: beats.map((b, idx) => ({
                title: String(b?.title || '').trim() || `Beat ${idx + 1}`,
                order: Number.isFinite(Number(b?.order)) ? Number(b.order) : idx,
                beat: String(b?.beat || '').trim() || String(((idx % 8) + 1)),
                description: String(b?.description || '').trim(),
                location: this.normalizeWizardLocation(b?.location || ''),
                isCanon: Boolean(b?.isCanon)
            })),
            relationships: rels.map(r => ({
                fromName: String(r?.fromName || '').trim(),
                toName: String(r?.toName || '').trim(),
                type: String(r?.type || 'other').trim().toLowerCase(),
                label: String(r?.label || '').trim(),
                strength: Math.max(1, Math.min(5, Number(r?.strength) || 2)),
                secret: Boolean(r?.secret),
                description: String(r?.description || '').trim()
            })).filter(r => r.fromName && r.toName),
            workItems: items.map(w => ({
                title: String(w?.title || '').trim(),
                category: String(w?.category || 'Story').trim(),
                completed: Boolean(w?.completed),
                isCanon: Boolean(w?.isCanon)
            })).filter(w => w.title)
        };
    },

    commitStorySetupWizard() {
        const staged = this.storySetupWizard.staged || {};
        const existingChars = Array.isArray(this.storyData.characters) ? this.storyData.characters : [];
        const existingNames = new Set(existingChars.map(c => String(c?.name || '').trim().toLowerCase()).filter(Boolean));

        const now = Date.now();
        const newChars = [];
        staged.characters.forEach((c, idx) => {
            const key = String(c.name || '').trim().toLowerCase();
            if (!key || existingNames.has(key)) return;
            existingNames.add(key);
            newChars.push({
                id: now + idx + Math.floor(Math.random() * 10000),
                name: c.name,
                type: ['friendly', 'antagonist', 'gray'].includes(c.type) ? c.type : 'gray',
                description: c.description,
                isCanon: Boolean(c.isCanon),
                relatedCharacters: [],
                notes: ''
            });
        });

        const charByName = new Map([...existingChars, ...newChars].map(c => [String(c.name || '').trim().toLowerCase(), c]));

        const newEvents = [];
        const baseOrder = (Array.isArray(this.storyData.events) ? this.storyData.events : []).length;
        staged.timelineBeats.forEach((b, idx) => {
            newEvents.push({
                id: now + 50000 + idx + Math.floor(Math.random() * 10000),
                title: b.title,
                period: 'Story Circle',
                order: baseOrder + idx,
                beat: String(b.beat || ((idx % 8) + 1)),
                description: b.description,
                location: b.location,
                fullDescription: '',
                involvedCharacterIds: [],
                isCanon: Boolean(b.isCanon),
                tags: ['setup']
            });
        });

        const newWork = [];
        const baseWid = now + 90000;
        staged.workItems.forEach((w, idx) => {
            newWork.push({
                id: baseWid + idx + Math.floor(Math.random() * 10000),
                title: w.title,
                category: w.category,
                completed: Boolean(w.completed),
                isCanon: Boolean(w.isCanon),
                tags: []
            });
        });

        this.ensureRelationshipStore?.();
        const relArr = Array.isArray(this.storyData.relationships) ? this.storyData.relationships : [];
        const newRels = [];
        staged.relationships.forEach((r, idx) => {
            const a = charByName.get(String(r.fromName).toLowerCase());
            const b = charByName.get(String(r.toName).toLowerCase());
            if (!a || !b) return;
            newRels.push({
                id: now + 130000 + idx + Math.floor(Math.random() * 10000),
                fromId: a.id,
                toId: b.id,
                type: r.type || 'other',
                label: r.label || '',
                strength: r.strength,
                secret: r.secret,
                description: r.description || ''
            });
        });

        this.storyData.characters = [...existingChars, ...newChars];
        this.storyData.events = [...(this.storyData.events || []), ...newEvents];
        this.storyData.workItems = [...(this.storyData.workItems || []), ...newWork];
        this.storyData.relationships = [...relArr, ...newRels];

        StorageService.saveStoryData(this.storyData);
        this.clearStorySetupWizardDraft();
        this.storySetupWizard.phase = 'committed';
        this.render();
        this.generateOrUpdateMasterScript?.();
        this.renderStorySetupWizardModal();
    },

    storySetupWizardBack() {
        const st = this.storySetupWizard;
        if (st.running) return;
        if (st.phase === 'followups') {
            st.phase = 'questions';
            // After each base question we advance baseIndex for the *next* step before AI runs,
            // so to re-open the step the user just left, go back one index (cap at last question).
            st.baseIndex = Math.max(0, Math.min(st.baseIndex - 1, 7));
            this.saveStorySetupWizardDraft();
            this.renderStorySetupWizardModal();
            setTimeout(() => document.getElementById('storySetupWizardAnswer')?.focus(), 0);
            return;
        }
        if (st.phase !== 'questions') return;
        if (st.baseIndex <= 0) {
            st.phase = 'intro';
            this.saveStorySetupWizardDraft();
            this.renderStorySetupWizardModal();
            return;
        }
        st.baseIndex = Math.max(0, st.baseIndex - 1);
        this.saveStorySetupWizardDraft();
        this.renderStorySetupWizardModal();
        setTimeout(() => document.getElementById('storySetupWizardAnswer')?.focus(), 0);
    },

    async storySetupWizardSkipToEnd() {
        const st = this.storySetupWizard;
        if (st.running) return;
        // Treat as "we're done with base questions" and let AI decide follow-up or READY.
        st.baseIndex = 8;
        await this.runStorySetupWizardAI();
    },

    storySetupWizardStartEditing() {
        const st = this.storySetupWizard;
        st.editMode = true;
        st.editedJson = JSON.stringify(st.staged || {}, null, 2);
        this.renderStorySetupWizardModal();
        setTimeout(() => document.getElementById('storySetupWizardEditJson')?.focus(), 0);
    },

    storySetupWizardApplyEditedJson() {
        const st = this.storySetupWizard;
        const raw = String(st.editedJson || '').trim();
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            // Allow either {characters,...} or full payload with those keys.
            this.stageWizardPopulation(parsed);
            st.editMode = false;
            this.renderStorySetupWizardModal();
        } catch (e) {
            const err = document.getElementById('storySetupWizardEditError');
            if (err) err.textContent = `Invalid JSON: ${e?.message || e}`;
        }
    },

    storySetupWizardOnEditJson(val) {
        this.storySetupWizard.editedJson = String(val || '');
        const err = document.getElementById('storySetupWizardEditError');
        if (err) err.textContent = '';
    },

    renderStorySetupWizardModal() {
        const root = document.getElementById('storySetupWizardBody');
        if (!root) return;

        const qs = this.storyCircleQuestions();
        const st = this.storySetupWizard;
        const phase = st.phase;

        // Ensure modal exists if opened before modals were created (rare, but safe).
        if (st.open && !document.getElementById('storySetupWizardModal')) {
            // no-op; modal is created at startup
        }

        const pct = Math.round((Math.min(st.baseIndex, 8) / 8) * 100);
        const stepDisplay = Math.min(8, st.baseIndex + 1);

        const answerList = (arr) => arr.map((a) => `
            <div class="rounded-2xl border border-zinc-800/80 bg-zinc-950/55 p-4">
                <div class="text-xs font-extrabold uppercase tracking-[0.14em] text-zinc-500">${this.escapeHTML(a.label || a.question || '')}</div>
                ${a.expandWhere ? `<div class="mt-1.5 text-[11px] font-semibold leading-relaxed text-violet-300/90">Where to expand: ${this.escapeHTML(a.expandWhere)}</div>` : ''}
                <div class="mt-2 text-sm font-semibold leading-relaxed text-zinc-200">${this.escapeHTML(a.answer || '')}</div>
            </div>
        `).join('');

        const intro = `
            <div class="space-y-6">
                <div class="rounded-2xl border border-violet-500/20 bg-gradient-to-b from-zinc-950 via-zinc-950 to-violet-950/20 p-6 ring-1 ring-inset ring-violet-500/10">
                    <div class="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-300/95">Story Wizard</div>
                    <div class="mt-2 font-serif text-3xl font-semibold tracking-tight text-zinc-50">Build Your Story Context</div>
                    <div class="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400">We’ll walk the 8 beats of Dan Harmon’s Story Circle. Each step includes <strong class="text-zinc-200">what the beat means</strong> and <strong class="text-zinc-200">where to expand in the app</strong> (timeline beats, characters, work items). Fields are <strong class="text-zinc-200">pre-filled from your current story</strong> where possible—edit, add detail, or use <strong class="text-zinc-200">Skip</strong> on any step. Your local LLM reads every answer and may ask <strong class="text-zinc-200">1–3 short follow-ups</strong> to clarify before it stages characters, beats, relationships, and tasks.</div>
                    <p class="text-xs font-semibold text-zinc-500">Progress is saved in this browser until you apply to the story or tap “Begin fresh”.</p>
                </div>
                <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="button" class="w-full flex-1 rounded-2xl bg-violet-600 px-6 py-4 text-base font-extrabold text-white shadow-[0_18px_60px_-14px_rgba(91,33,182,0.85)] ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 active:scale-[0.99] sm:min-w-[200px]" onclick="App.storySetupWizardBegin()">Continue</button>
                    <button type="button" class="w-full flex-1 rounded-2xl border border-zinc-600/90 bg-zinc-900/60 px-6 py-4 text-sm font-extrabold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/80 sm:min-w-[200px]" onclick="App.storySetupWizardBeginFresh()">Begin fresh <span class="block text-[11px] font-semibold text-zinc-500">(story seeds only, clears saved draft)</span></button>
                </div>
            </div>
        `;

        const baseQObj = st.baseIndex < 8 ? qs[st.baseIndex] : null;
        const currentQ =
            phase === 'followups'
                ? (st.followUpQuestions?.[0] || 'Follow-up')
                : baseQObj?.label || (st.running ? 'Working with your local model…' : 'Finishing…');
        const followQ = st.followUpQuestions?.[0] || 'Follow-up';
        const taPrefill = baseQObj ? String(st.answerById[baseQObj.id] || '') : '';

        const questionPanel = `
            <div class="space-y-6">
                <div class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-5">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-zinc-500">Step ${Math.max(1, Math.min(8, stepDisplay))} of 8 – Dan Harmon Story Circle</div>
                            <div class="mt-2 text-lg font-black tracking-tight text-zinc-50">${phase === 'followups' ? 'Follow-up (only if needed)' : 'Canon foundation'}</div>
                        </div>
                        <button type="button" class="rounded-xl border border-zinc-700/90 bg-zinc-950/50 px-4 py-2 text-xs font-extrabold text-zinc-200 ring-1 ring-inset ring-white/[0.03] transition hover:border-zinc-600 hover:bg-zinc-900/70" onclick="App.storySetupWizardSkipToEnd()">Skip to end</button>
                    </div>
                    <div class="mt-4 h-2 w-full overflow-hidden rounded-full border border-zinc-800 bg-zinc-950/70">
                        <div class="h-full bg-gradient-to-r from-violet-600 to-fuchsia-500" style="width:${pct}%"></div>
                    </div>
                </div>

                <div class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-6">
                    <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet-300/90">${phase === 'followups' ? 'Follow-up' : 'Story Circle'}</div>
                    <div class="mt-2 text-2xl font-black tracking-tight text-zinc-50">${this.escapeHTML(phase === 'followups' ? followQ : currentQ)}</div>
                    ${phase === 'questions' && baseQObj ? `
                        <div class="mt-4 space-y-3 rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-950/35 to-zinc-950/40 p-4 ring-1 ring-inset ring-violet-500/10">
                            <p class="text-sm leading-relaxed text-zinc-300">${this.escapeHTML(baseQObj.context)}</p>
                            <div class="border-t border-violet-500/15 pt-3">
                                <div class="text-[10px] font-extrabold uppercase tracking-[0.14em] text-violet-200/95">Where to expand in your project</div>
                                <p class="mt-1.5 text-xs font-semibold leading-relaxed text-violet-100/90">${this.escapeHTML(baseQObj.expandWhere)}</p>
                            </div>
                        </div>
                        <p class="mt-3 text-xs font-semibold text-zinc-500">Edit the answer below or skip this beat — the model sees all saved answers and this step’s context.</p>
                    ` : ''}
                    ${phase === 'followups' ? `<p class="mt-3 text-xs font-semibold text-zinc-500">Short answers are fine. Skip if you prefer — the model still uses your Story Circle answers.</p>` : ''}
                    <div class="mt-4">
                        <textarea id="storySetupWizardAnswer" rows="6" class="w-full rounded-2xl border border-zinc-700/90 bg-zinc-950 p-5 text-sm font-semibold leading-relaxed text-zinc-100 shadow-inner shadow-black/40 outline-none ring-2 ring-transparent placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-violet-500/25" placeholder="Type your answer…">${this.escapeHTML(taPrefill)}</textarea>
                        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                <button type="button" class="rounded-xl border border-zinc-700/90 bg-zinc-950/40 px-6 py-3 text-sm font-extrabold text-zinc-200 shadow-md ring-1 ring-inset ring-white/[0.03] transition hover:border-zinc-600 hover:bg-zinc-900/70" onclick="App.storySetupWizardBack()">Back</button>
                                <button type="button" class="rounded-xl bg-violet-600 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 active:scale-[0.99] disabled:opacity-60" ${st.running ? 'disabled' : ''} onclick="App.submitStorySetupWizardAnswer()">${st.running ? 'Thinking…' : (phase === 'followups' ? 'Submit answer' : 'Save &amp; continue')}</button>
                                <button type="button" class="rounded-xl border border-zinc-600/80 bg-zinc-900/50 px-6 py-3 text-sm font-extrabold text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800/70 disabled:opacity-50" ${st.running ? 'disabled' : ''} onclick="App.storySetupWizardSkipCurrentQuestion()">${phase === 'followups' ? 'Skip question' : 'Skip this question'}</button>
                            </div>
                            <button type="button" class="topbar-ghost" onclick="App.skipStorySetupWizard()">Close</button>
                        </div>
                        ${st.lastAI?.raw && st.lastAI.mode === 'error' ? `<div class="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm font-semibold text-rose-100">${this.escapeHTML(st.lastAI.raw)}</div>` : ''}
                    </div>
                </div>

                ${this.wizardBaseAnswersOrdered().length ? `
                    <details class="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-5">
                        <summary class="cursor-pointer list-none text-sm font-extrabold text-zinc-200 select-none [&::-webkit-details-marker]:hidden">Story Circle answers and expansion hints (sent to the model)</summary>
                        <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                            ${answerList(this.wizardBaseAnswersOrdered())}
                        </div>
                    </details>
                ` : ''}
            </div>
        `;

        const review = (() => {
            const s = st.staged || {};
            const c = Array.isArray(s.characters) ? s.characters : [];
            const b = Array.isArray(s.timelineBeats) ? s.timelineBeats : [];
            const r = Array.isArray(s.relationships) ? s.relationships : [];
            const w = Array.isArray(s.workItems) ? s.workItems : [];

            const list = (title, arr, pick) => `
                <div class="rounded-2xl border border-zinc-800/80 bg-zinc-950/45 p-5">
                    <div class="flex items-baseline justify-between gap-3">
                        <div class="text-sm font-black text-zinc-100">${title}</div>
                        <div class="text-xs font-extrabold uppercase tracking-[0.14em] text-zinc-500">${arr.length}</div>
                    </div>
                    <div class="mt-3 space-y-2 text-sm font-semibold text-zinc-300">
                        ${arr.slice(0, 6).map(x => `<div class="truncate">• ${this.escapeHTML(pick(x))}</div>`).join('') || `<div class="text-zinc-500">None</div>`}
                    </div>
                </div>
            `;

            return `
                <div class="space-y-6">
                    <div class="rounded-2xl border border-violet-500/20 bg-gradient-to-b from-zinc-950 via-zinc-950 to-violet-950/20 p-6 ring-1 ring-inset ring-violet-500/10">
                        <div class="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-300/95">READY_TO_POPULATE</div>
                        <div class="mt-2 text-2xl font-black tracking-tight text-zinc-50">Review before committing</div>
                        <div class="mt-2 text-sm font-semibold leading-relaxed text-zinc-400">These items will be added to your project. You can edit everything afterward.</div>
                    </div>

                    ${st.editMode ? `
                        <div class="rounded-2xl border border-zinc-800/80 bg-zinc-950/55 p-5">
                            <div class="text-sm font-black text-zinc-100">Edit Before Applying</div>
                            <div class="mt-2 text-xs font-semibold text-zinc-500">Edit the staged JSON, then apply to re-stage (still not committed until “Apply to Story”).</div>
                            <textarea id="storySetupWizardEditJson" class="mt-4 w-full resize-y rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 font-mono text-xs leading-relaxed text-zinc-100 shadow-inner shadow-black/30 outline-none" rows="18" spellcheck="false" oninput="App.storySetupWizardOnEditJson(this.value)">${this.escapeHTML(String(st.editedJson || ''))}</textarea>
                            <div id="storySetupWizardEditError" class="mt-3 text-sm font-semibold text-rose-200"></div>
                            <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <button type="button" class="rounded-xl bg-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500" onclick="App.storySetupWizardApplyEditedJson()">Apply edited JSON (stage)</button>
                                <button type="button" class="topbar-ghost" onclick="App.storySetupWizard.editMode=false; App.renderStorySetupWizardModal();">Cancel edit</button>
                            </div>
                        </div>
                    ` : ''}

                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                        ${list('Characters', c, x => x.name)}
                        ${list('Timeline beats', b, x => `${x.title} — ${x.location}`)}
                        ${list('Relationships', r, x => `${x.fromName} → ${x.toName} (${x.type})`)}
                        ${list('Work items', w, x => x.title)}
                    </div>

                    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <button type="button" class="rounded-2xl bg-violet-600 px-6 py-4 text-base font-extrabold text-white shadow-[0_18px_60px_-14px_rgba(91,33,182,0.85)] ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 active:scale-[0.99]" onclick="App.commitStorySetupWizard()">Apply to Story</button>
                            <button type="button" class="rounded-2xl border border-zinc-700/90 bg-zinc-950/40 px-6 py-4 text-base font-extrabold text-zinc-100 shadow-md ring-1 ring-inset ring-white/[0.03] transition hover:border-zinc-600 hover:bg-zinc-900/70" onclick="App.storySetupWizardStartEditing()">Edit Before Applying</button>
                        </div>
                        <button type="button" class="topbar-ghost" onclick="App.skipStorySetupWizard()">Close</button>
                    </div>

                    <details class="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-5">
                        <summary class="cursor-pointer list-none text-sm font-extrabold text-zinc-200 select-none [&::-webkit-details-marker]:hidden">Show raw AI output</summary>
                        <pre class="mt-4 whitespace-pre-wrap rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-xs text-zinc-300">${this.escapeHTML(String(st.lastAI?.raw || ''))}</pre>
                    </details>
                </div>
            `;
        })();

        const committed = `
            <div class="space-y-6">
                <div class="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6 ring-1 ring-inset ring-emerald-500/10">
                    <div class="text-[11px] font-extrabold uppercase tracking-[0.2em] text-emerald-200/95">Saved</div>
                    <div class="mt-2 text-2xl font-black tracking-tight text-zinc-50">Story context populated</div>
                    <div class="mt-2 text-sm font-semibold leading-relaxed text-zinc-300">Next: go to <strong class="text-white">Timeline</strong> to refine beats, then <strong class="text-white">Visualizer</strong> to map &amp; relationships.</div>
                </div>
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" class="rounded-xl bg-violet-600 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500" onclick="App.switchTab('timeline'); App.closeStorySetupWizard();">Open Timeline</button>
                    <button type="button" class="topbar-ghost" onclick="App.closeStorySetupWizard()">Close</button>
                </div>
            </div>
        `;

        if (phase === 'intro') root.innerHTML = intro;
        else if (phase === 'review') root.innerHTML = review;
        else if (phase === 'committed') root.innerHTML = committed;
        else root.innerHTML = questionPanel;
    },

    // ============ MOBILE QUICK ADD ============

    initMobileQuickAdd() {
        const sheet = document.getElementById('mobileQuickAddSheet');
        if (sheet) {
            sheet.classList.remove('active');
        }
        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('mobileQuickAdd');
            const target = e.target;
            if (!wrap || !(target instanceof Element)) return;
            if (wrap.contains(target)) return;
            this.closeMobileQuickAdd();
        });
    },

    toggleMobileQuickAdd() {
        const sheet = document.getElementById('mobileQuickAddSheet');
        if (!sheet) return;
        sheet.classList.toggle('active');
    },

    closeMobileQuickAdd() {
        const sheet = document.getElementById('mobileQuickAddSheet');
        if (!sheet) return;
        sheet.classList.remove('active');
    },

    quickAdd(kind) {
        const k = String(kind || '');
        this.closeMobileQuickAdd();
        if (k === 'character') {
            this.switchTab('characters');
            setTimeout(() => document.getElementById('newCharName')?.focus(), 0);
            return;
        }
        if (k === 'event') {
            this.switchTab('timeline');
            setTimeout(() => document.getElementById('newEventTitle')?.focus(), 0);
            return;
        }
        if (k === 'task') {
            this.switchTab('workitems');
            setTimeout(() => document.getElementById('newWorkTitle')?.focus(), 0);
        }
    },

    /**
     * Render tab shells from component modules.
     * This keeps index.html as a pure shell.
     */
    mountTabs() {
        Object.entries(TAB_RENDERERS).forEach(([tabId, renderFn]) => {
            const el = document.getElementById(tabId);
            if (!el) return;
            try {
                el.innerHTML = renderFn();
            } catch (error) {
                el.innerHTML = `<div class="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-rose-50"><h2 class="m-0 text-lg font-black tracking-tight">Failed to render tab</h2><div class="mt-2 text-sm text-rose-100/80">Tab: ${this.escapeHTML(tabId)}</div></div>`;
                console.error('Tab render failed:', tabId, error);
            }
        });
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
        // Tailwind v3 class-based dark mode (see index.html tailwind.config)
        document.documentElement.classList.toggle('dark', next === 'dark');
        // Keep Tailwind utility-driven page chrome aligned with the saved theme.
        document.body.className =
            next === 'dark'
                ? 'min-h-screen bg-[#09090b] text-zinc-100 antialiased'
                : 'min-h-screen bg-zinc-50 text-zinc-900 antialiased';
        const main = document.querySelector('.main');
        if (main) {
            main.className =
                next === 'dark'
                    ? 'main main-content min-w-0 bg-[#09090b]'
                    : 'main main-content min-w-0 bg-zinc-50';
        }
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
            { id: 'suggest-story-build', label: 'Suggest story builds from issues', run: () => { this.switchTab('dashboard'); this.suggestStoryBuildFromIssues(); } },
            { id: 'analyze-history', label: 'Check historical accuracy', run: () => { this.switchTab('dashboard'); this.analyzeHistoricalAccuracy(); } },
            { id: 'integrity-check', label: 'Run Full Story Integrity Check', run: () => { this.switchTab('dashboard'); this.runFullStoryIntegrityCheck(); } },
            { id: 'tang-accuracy', label: 'Run Historical Tang Accuracy Check', run: () => { this.switchTab('dashboard'); this.runHistoricalTangAccuracyCheck(); } },
            { id: 'master-script', label: 'Generate / Update Master Script', run: () => { this.switchTab('dashboard'); this.generateOrUpdateMasterScript(); } },
            { id: 'voice-memo', label: 'Process Spoken Idea / Voice Memo', run: () => { this.switchTab('dashboard'); this.openVoiceMemoModal(); } },
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
            const on =
                'rounded-full border border-violet-500 bg-violet-950/90 px-3 py-1 text-xs font-extrabold text-white shadow-lg shadow-violet-500/20 transition';
            const off =
                'rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-extrabold text-zinc-300 transition hover:border-violet-500/30 hover:bg-zinc-800 hover:text-zinc-50';
            el.className = `${isActive ? on : off}`;
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
            actionBtn.style.background = '';
            actionBtn.className = isCanon
                ? 'rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-2.5 text-sm font-extrabold text-rose-100 hover:bg-rose-500/15'
                : 'rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm font-extrabold text-amber-200 hover:bg-amber-400/15';
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
        return `<span class="canon-badge canon-shield" title="Canon - protected" onclick="App.openCanonConfirmModal('${type}', ${id}); event.stopPropagation();">🛡️</span>`;
    },

    renderDraftTag() {
        return `<span class="draft-tag" title="Draft - not yet canon">Draft</span>`;
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

        document.querySelectorAll(`.tab-button[onclick*="App.switchTab('${tabName}')"]`).forEach(btn => {
            btn.classList.add('active');
        });

        if (tabName === 'timeline') {
            this.renderTimelineWithCircle();
        }
        if (tabName === 'master-document') {
            this.renderMasterDocument();
        }
        if (tabName === 'visualizer') {
            this.renderStoryboard();
            this.renderVisualGallery();
            this.renderStoryLocationsOverview();
            this.renderStoryWorldMap();
            this.renderRelationshipNetworkGraph();
        }
        if (tabName === 'ai-queue') {
            this.renderAIExpansionQueue();
        }
        if (tabName === 'templates') {
            this.renderTemplates();
        }
        if (tabName === 'dashboard') {
            this.updateDashboard();
            this.renderDashboardMiniTimeline();
            this.renderReviewDrafts();
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
        this.renderDashboardMiniTimeline();
        this.renderReviewDrafts();
        this.renderCanonStatusIndicator();
        this.renderAIActionItems();
        this.renderAIReports();
        this.renderAISuggestedActions();
        this.renderStoryboard();
        this.renderVisualGallery();
        this.renderStoryWorldMap();
        this.renderRelationshipNetworkGraph();
        this.renderCharacterArcTracker();
        this.renderMasterDocument();
        this.updateGlobalChipUI();
        this.renderQueueSidebarPanel();
    },

    renderCanonStatusIndicator() {
        const el = document.getElementById('canonStatusIndicatorText');
        if (!el) return;
        const canon = StorageService.getAllCanonItems();
        const canonCount =
            (canon.characters?.length || 0)
            + (canon.timelineEvents?.length || 0)
            + (canon.workItems?.length || 0);
        const draftsCount = this.getAllDraftItems().length;
        el.innerHTML = `<span class="text-violet-300">${canonCount} Canon</span><span class="text-zinc-600"> · </span><span class="text-violet-400">protected</span><span class="text-zinc-600"> · </span><span class="text-violet-300">${draftsCount} Drafts</span><span class="text-zinc-500"> pending</span>`;
    },

    goToDraftsReview() {
        this.openDraftsPanel();
    },

    openDraftsPanel() {
        const modal = document.getElementById('draftsPanelModal');
        if (!modal) return;
        modal.classList.add('active');
        this.renderDraftsPanel();
    },

    closeDraftsPanel() {
        document.getElementById('draftsPanelModal')?.classList.remove('active');
    },

    renderDraftsPanel() {
        const container = document.getElementById('draftsPanelBody');
        if (!container) return;
        container.innerHTML = this.getDraftsListHTML(140);
    },

    getDraftsListHTML(limit = 80) {
        const drafts = this.getAllDraftItems();
        if (drafts.length === 0) {
            return '<div class="ai-result suggestion">No drafts right now. Everything is Canon or you haven’t added new items yet.</div>';
        }

        const badge = (type) => {
            if (type === 'character') return '👥 Character';
            if (type === 'timeline') return '🗓️ Timeline';
            return '✅ Work Item';
        };

        const max = Math.max(0, Number(limit) || 80);
        return `
            <div class="preview-card" style="margin:0;">
                <div class="mb-2 text-sm text-zinc-400">Draft items (${drafts.length})</div>
                <ul class="preview-list" style="margin:0;">
                    ${drafts.slice(0, max).map(d => `
                        <li class="preview-item">
                            <div style="min-width: 140px;" class="preview-item-sub">${badge(d.type)}</div>
                            <div style="flex:1;">
                                <div class="preview-item-title">${this.escapeHTML(d.title || '')}</div>
                                <div class="preview-item-sub">${this.escapeHTML(d.subtitle || '')}</div>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <button class="rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-extrabold text-amber-200 hover:bg-amber-400/15" onclick="App.promoteDraft('${d.type}', ${d.id})">Promote to Canon</button>
                                <button class="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.openMergeDraftModal('${d.type}', ${d.id})">Merge into Canon</button>
                                <button class="delete-btn rounded-lg px-3 py-1.5 text-[11px] font-extrabold" onclick="App.deleteDraft('${d.type}', ${d.id})">Delete Draft</button>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    },

    // ============ REVIEW DRAFTS ============

    getAllDraftItems() {
        const drafts = [];
        (Array.isArray(this.storyData.characters) ? this.storyData.characters : []).forEach(c => {
            if (c && !c.isCanon) drafts.push({ type: 'character', id: c.id, title: c.name, subtitle: `${c.type || 'type?'} • ${c.role || 'Role TBD'}` });
        });
        (Array.isArray(this.storyData.events) ? this.storyData.events : []).forEach(e => {
            if (e && !e.isCanon) {
                const locBit = e.location ? ` · ${e.location}` : '';
                drafts.push({ type: 'timeline', id: e.id, title: e.title, subtitle: `${e.period || 'Period TBD'}${e.beat ? ` • Beat ${e.beat}` : ''}${locBit}` });
            }
        });
        (Array.isArray(this.storyData.workItems) ? this.storyData.workItems : []).forEach(w => {
            if (w && !w.isCanon) drafts.push({ type: 'workItem', id: w.id, title: w.title, subtitle: `${w.category || 'Scene Planning'}${w.completed ? ' • completed' : ''}` });
        });
        return drafts;
    },

    renderReviewDrafts() {
        const container = document.getElementById('draftsReviewContainer');
        if (!container) return;
        container.innerHTML = this.getDraftsListHTML(80);
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
            if (!String(canon.location || '').trim() && String(draft.location || '').trim()) {
                canon.location = String(draft.location).trim();
            }
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
                id: 'ghost-border-disgraced-grandson',
                title: 'Ghost Border — The Disgraced Grandson',
                subtitle: 'Default canon: Feng (logistics veteran), Prince Yu, Lady Lin, Commander Lu, Minister Cui — Tang map beats.',
                data: this.buildTemplateGhostBorderDisgracedGrandson()
            },
            {
                id: 'classic-palace-intrigue',
                title: 'Classic Palace Intrigue',
                subtitle: 'Schemes, factions, hidden heirs, and shifting loyalties.',
                data: this.buildTemplateClassicPalaceIntrigue()
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
                        <div class="mt-3 flex flex-wrap gap-2">
                            <button class="rounded-xl border border-zinc-200/60 bg-white/70 px-3 py-2 text-xs font-extrabold text-zinc-900 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:hover:bg-zinc-950" onclick="App.previewTemplate('${t.id}')">Preview</button>
                            <button class="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.applyTemplate('${t.id}')">Apply template</button>
                        </div>
                        <div class="mt-2 text-sm text-zinc-400">
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
        this.storyData.events = (data.events || []).map(e => createTimelineEvent(e));
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
            { id: 1, title: 'Court in Balance', period: 'Act 1', order: 0, beat: '1', description: 'Establish factions and the fragile peace.', location: 'Daming Palace', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['setup'] },
            { id: 2, title: 'A Whispered Accusation', period: 'Act 1', order: 1, beat: '2', description: 'A scandal surfaces: forged edicts tied to the Prince.', location: 'Forbidden Garden', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['catalyst'] },
            { id: 3, title: 'Crossing into the Trap', period: 'Act 1', order: 2, beat: '3', description: 'Lady Shen is ordered to investigate—dangerous either way.', location: 'Daming Palace', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['threshold'] },
            { id: 4, title: 'Secret Alliances', period: 'Act 2', order: 3, beat: '4', description: 'Mei reveals tunnels; Commander Yan offers guarded help.', location: 'Forbidden Garden', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['tests'] },
            { id: 5, title: 'The Hidden Ledger', period: 'Act 2', order: 4, beat: '5', description: 'A ledger proves corruption—but implicates someone close.', location: 'Daming Palace', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['reveal'] },
            { id: 6, title: 'The Price of Truth', period: 'Act 2', order: 5, beat: '6', description: 'Chancellor strikes back; an ally is punished publicly.', location: 'Imperial Market Square', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['price'] },
            { id: 7, title: 'Return to the Throne Room', period: 'Act 3', order: 6, beat: '7', description: 'A risky trial reveals the real mastermind.', location: 'Daming Palace', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['return'] },
            { id: 8, title: 'A New Court Order', period: 'Act 3', order: 7, beat: '8', description: 'Power shifts; Lady Shen chooses what kind of court survives.', location: 'Daming Palace', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['change'] }
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

    /** Same payload as `StorageService.initializeStoryData()` story core (Feng / Ghost Border). */
    buildTemplateGhostBorderDisgracedGrandson() {
        const core = getGhostBorderCanonStoryCore();
        return { ...core, relationships: [] };
    },

    buildTemplateRevengeRedemption() {
        const characters = [
            { id: 1, name: 'Wei Ruo', age: 27, role: 'Wronged Heir', type: 'gray', background: 'Survivor of a massacre framed as treason.', personality: 'Cold, disciplined, secretly kind.', relatedCharacters: [2, 3], notes: '', isCanon: true, tags: ['revenge'] },
            { id: 2, name: 'Princess An', age: 24, role: 'Royal Investigator', type: 'friendly', background: 'Believes the official story is false.', personality: 'Brave, curious, stubborn.', relatedCharacters: [1], notes: '', isCanon: true, tags: ['justice'] },
            { id: 3, name: 'Duke Luo', age: 50, role: 'Architect of Betrayal', type: 'antagonist', background: 'Orchestrated the fall to seize power.', personality: 'Smooth, cruel, calculating.', relatedCharacters: [1, 4], notes: '', isCanon: true, tags: ['villain'] },
            { id: 4, name: 'Old Teacher Gu', age: 66, role: 'Mentor', type: 'friendly', background: 'Knows the hidden history and the cost of vengeance.', personality: 'Wise, weary, blunt.', relatedCharacters: [3], notes: '', isCanon: true, tags: ['mentor'] }
        ];
        const events = [
            { id: 1, title: 'Ashes of the Past', period: 'Act 1', order: 0, beat: '1', description: 'Wei lives under a new name, training in silence.', location: 'Forbidden Garden', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['setup'] },
            { id: 2, title: 'A Name Reappears', period: 'Act 1', order: 1, beat: '2', description: 'A witness resurfaces; revenge becomes possible.', location: 'Imperial Market Square', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['catalyst'] },
            { id: 3, title: 'Go to the Capital', period: 'Act 1', order: 2, beat: '3', description: 'Wei returns to court disguised, hunting the Duke.', location: 'Imperial Market Square', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['threshold'] },
            { id: 4, title: 'Tests of Trust', period: 'Act 2', order: 3, beat: '4', description: 'Princess An suspects Wei; they circle each other.', location: 'Daming Palace', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['tests'] },
            { id: 5, title: 'Proof and Doubt', period: 'Act 2', order: 4, beat: '5', description: 'Evidence surfaces—but it threatens innocent lives.', location: 'Daming Palace', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['reveal'] },
            { id: 6, title: 'The Cost of Blood', period: 'Act 2', order: 5, beat: '6', description: 'Wei’s plan causes collateral damage; guilt cracks the mask.', location: 'Daming Palace', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['price'] },
            { id: 7, title: 'Return with Mercy', period: 'Act 3', order: 6, beat: '7', description: 'Wei chooses a lawful path; the Duke panics.', location: 'Daming Palace', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['return'] },
            { id: 8, title: 'Redemption or Ruin', period: 'Act 3', order: 7, beat: '8', description: 'Confrontation resolves: truth, sacrifice, and transformation.', location: 'Daming Palace', fullDescription: '', involvedCharacterIds: [], isCanon: true, tags: ['change'] }
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

    _pdfJsWorkerSrc: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',

    async readImportNotesFileAsText(file) {
        const name = String(file?.name || '').toLowerCase();

        if (name.endsWith('.txt') || name.endsWith('.md')) {
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('Could not read text file.'));
                reader.readAsText(file);
            });
        }

        if (name.endsWith('.docx')) {
            if (typeof globalThis.mammoth === 'undefined') {
                throw new Error('DOCX support did not load (mammoth). Refresh the page or check your network.');
            }
            const buf = await file.arrayBuffer();
            const result = await globalThis.mammoth.extractRawText({ arrayBuffer: buf });
            const warnings = Array.isArray(result?.messages)
                ? result.messages.map((m) => m?.message).filter(Boolean)
                : [];
            if (warnings.length) {
                console.warn('DOCX import:', warnings.slice(0, 3).join(' '));
            }
            return String(result?.value || '').trim();
        }

        if (name.endsWith('.pdf')) {
            const pdfjs = globalThis.pdfjsLib;
            if (!pdfjs?.getDocument) {
                throw new Error('PDF support did not load (pdf.js). Refresh the page or check your network.');
            }
            pdfjs.GlobalWorkerOptions.workerSrc = this._pdfJsWorkerSrc;
            const buf = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: buf }).promise;
            const parts = [];
            for (let i = 1; i <= pdf.numPages; i += 1) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const line = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
                parts.push(line);
            }
            return parts.join('\n\n').trim();
        }

        throw new Error('Unsupported file type.');
    },

    async onImportNotesFileSelected(file) {
        if (!file) return;
        const name = String(file.name || '').toLowerCase();
        const ok =
            name.endsWith('.txt') ||
            name.endsWith('.md') ||
            name.endsWith('.docx') ||
            name.endsWith('.pdf');
        if (!ok) {
            alert('Please upload a .txt, .md, .docx, or .pdf file.');
            return;
        }

        const status = document.getElementById('importNotesStatus');
        if (status && (name.endsWith('.docx') || name.endsWith('.pdf'))) {
            status.innerHTML = '<div class="ai-status analyzing"><span class="spinner"></span> Reading file…</div>';
        }

        try {
            const text = await this.readImportNotesFileAsText(file);
            this.importNotesState.rawText = text;
            const paste = document.getElementById('importNotesPaste');
            if (paste) paste.value = this.importNotesState.rawText;
            this.importNotesState.activeTab = 'paste';

            if (status) {
                const trimmed = String(this.importNotesState.rawText || '').trim();
                if (!trimmed && name.endsWith('.pdf')) {
                    status.innerHTML =
                        '<div class="ai-status disconnected">No selectable text found in this PDF (it may be image-only). Try OCR elsewhere, then paste.</div>';
                } else if (!trimmed && (name.endsWith('.docx') || name.endsWith('.pdf'))) {
                    status.innerHTML = '<div class="ai-status disconnected">No text was extracted from this file.</div>';
                } else if (name.endsWith('.docx') || name.endsWith('.pdf')) {
                    status.innerHTML =
                        '<div class="ai-status connected">✅ File loaded into the editor. Run Extract when ready.</div>';
                }
            }
            this.renderImportNotesUI();
        } catch (e) {
            if (status) {
                status.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(e?.message || 'Could not read file')}</div>`;
            } else {
                alert(e?.message || 'Could not read file');
            }
        }
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
                    ? `Title: ${safe(canon.title)}\nBeat: ${safe(canon.beat)}\nPeriod: ${safe(canon.period)}\nLocation: ${safe(canon.location)}\nDescription: ${safe(canon.description)}\nNotes: ${safe(canon.fullDescription)}`
                    : `Title: ${safe(canon.title)}\nCategory: ${safe(canon.category)}\nCompleted: ${canon.completed ? 'true' : 'false'}`;
            const impSide = group === 'characters'
                ? `Name: ${safe(imp.name)}\nType: ${safe(imp.type)}\nDescription: ${safe(imp.description)}`
                : group === 'timelineEvents'
                    ? `Title: ${safe(imp.title)}\nBeatType: ${safe(imp.beatType)}\nLocation: ${safe(imp.location)}\nDescription: ${safe(imp.description)}`
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
            ${conflictsHtml ? `<div class="ai-result warning"><strong>Conflicts with Canon</strong><div class="text-sm text-zinc-400" style="margin-top:0.25rem;">Canon items are protected by default. Resolve conflicts to proceed.</div></div>${conflictsHtml}` : ''}
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
                    <div class="text-sm text-zinc-400">Characters (${existingChars.length})</div>
                    ${currentList(existingChars, c => `<li class="compare-row"><div><div class="preview-item-title">${safe(c.name)}</div><div class="preview-item-sub">${safe(c.role || c.type || '')}</div></div></li>`)}
                    <div class="text-sm text-zinc-400" style="margin-top:0.75rem;">Timeline (${existingEvents.length})</div>
                    ${currentList(existingEvents, e => `<li class="compare-row"><div><div class="preview-item-title">${safe(e.title)}</div><div class="preview-item-sub">${safe(e.period || '')}</div></div></li>`)}
                    <div class="text-sm text-zinc-400" style="margin-top:0.75rem;">Relationships (linked)</div>
                    ${currentList(existingRel, r => `<li class="compare-row"><div class="preview-item-sub">${safe(r)}</div></li>`)}
                </div>

                <div class="compare-block">
                    <div class="compare-col-title">Suggested Additions</div>
                    <div class="text-sm text-zinc-400">Characters (${(extracted.characters || []).length})</div>
                    ${suggestedList('characters', extracted.characters || [], c => `
                        <div>
                            <div class="preview-item-title">${safe(c.name)} <span class="preview-item-sub">(${safe(c.type)})</span></div>
                            ${c.description ? `<div class="preview-item-sub">${safe(c.description)}</div>` : ''}
                        </div>
                    `)}
                    <div class="text-sm text-zinc-400" style="margin-top:0.75rem;">Timeline (${(extracted.timelineEvents || []).length})</div>
                    ${suggestedList('timelineEvents', extracted.timelineEvents || [], e => `
                        <div>
                            <div class="preview-item-title">${safe(e.title)}</div>
                            <div class="preview-item-sub">${safe([e.beatType ? `Beat: ${e.beatType}` : '', e.description].filter(Boolean).join(' • '))}</div>
                        </div>
                    `)}
                    <div class="text-sm text-zinc-400" style="margin-top:0.75rem;">Relationships (${(extracted.relationships || []).length})</div>
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

            const newEvent = createTimelineEvent({
                id: nextEventId++,
                title: safeStr(e.title),
                period: '',
                order: existingEvents.length,
                beat: null,
                description: combinedDesc,
                location: safeStr(e.location),
                fullDescription: '',
                involvedCharacterIds: [],
                isCanon: false,
                tags: tagsImported
            });
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

                const charCanon = c.isCanon ? ' `[CANON]`' : '';
                lines.push(`- **${safe(c.name) || 'Unnamed'}** (${safe(c.role) || 'Role TBD'} • ${c.type || 'type?'} • age ${Number.isFinite(c.age) ? c.age : 0})${charCanon}`);
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
                const canonMark = e.isCanon ? ' `[CANON]`' : '';
                const header = `- E${e.id}: **${safe(e.title) || 'Untitled'}** (${safe(e.period) || 'Period TBD'} • ${beatLabel})${canonMark}`;
                lines.push(header);
                if (safe(e.location)) lines.push(`  - Location: ${safe(e.location)}`);
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
                    <div class="mb-4 flex items-start justify-between gap-3">
                        <div>
                            <h3>
                                ${this.getCharacterEmoji(char.type)}
                                ${
                                    this.inlineEdit.kind === 'character' && this.inlineEdit.id === char.id && this.inlineEdit.field === 'name'
                                        ? `<input class="form-input inline-edit-input" style="display:inline-block; width: min(420px, 80vw); margin:0 0 0 0.4rem; padding:0.4rem 0.6rem;" value="${this.escapeHTML(this.inlineEdit.value)}" oninput="App.onInlineEditInput(this.value)" onkeydown="App.onInlineEditKeydown(event)" onblur="App.commitInlineEdit()">`
                                        : `<span class="cursor-text" onclick="App.startInlineEdit('character', ${char.id}, 'name', '${this.escapeHTML(char.name)}')">${this.escapeHTML(char.name)}</span>`
                                }
                                ${char.isCanon ? this.renderCanonBadge('character', char.id) : this.renderDraftTag()}
                            </h3>
                            <p class="text-sm text-zinc-400">${char.age ? char.age + ' years old' : ''} • ${char.role}</p>
                        </div>
                        <div class="flex gap-2">
                            <button class="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.openCharacterEditor(${char.id})">Edit</button>
                            <button class="delete-btn rounded-lg px-3 py-1.5 text-xs font-extrabold" onclick="App.deleteCharacter(${char.id})">Delete</button>
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
                    ${char.notes ? `<p class="text-sm text-zinc-400 mt-2"><strong>Notes:</strong> ${char.notes}</p>` : ''}
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

        // Persist structured relationship for Relationship Network Graph.
        this.storyData.relationships = Array.isArray(this.storyData.relationships) ? this.storyData.relationships : [];
        this.storyData.relationships.push({
            id: Date.now(),
            fromId: from.id,
            toId: to.id,
            from: from.name,
            to: to.name,
            type: type || 'other',
            label: type || 'other',
            description: notes || '',
            strength: 3,
            secret: false,
            updatedAt: new Date().toISOString()
        });

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
        const locPreset = document.getElementById('newEventLocationPreset')?.value ?? '';
        const locCustom = document.getElementById('newEventLocationCustom')?.value ?? '';

        if (!title) {
            alert('Please enter an event title');
            return;
        }

        const hj = document.getElementById('newEventHeroJourney')?.value?.trim() || '';
        const newEvent = createTimelineEvent({
            id: Math.max(...this.storyData.events.map(e => e.id), 0) + 1,
            title,
            period,
            order: this.storyData.events.length,
            beat: beat || null,
            heroJourney: hj || null,
            description,
            location: joinTimelineLocation(locPreset, locCustom)
        });

        this.storyData.events.push(newEvent);
        this.save();
        this.renderTimelineWithCircle();

        document.getElementById('newEventTitle').value = '';
        document.getElementById('newEventPeriod').value = '';
        document.getElementById('newEventBeat').value = '';
        const nhj = document.getElementById('newEventHeroJourney');
        if (nhj) nhj.value = '';
        document.getElementById('newEventDescription').value = '';
        const np = document.getElementById('newEventLocationPreset');
        const nc = document.getElementById('newEventLocationCustom');
        if (np) np.value = '';
        if (nc) nc.value = '';
        this.syncTimelineLocationFormVisibility('newEvent');
    },

    /**
     * Show/hide custom location field when "Other (custom)" is selected.
     * @param {'newEvent'|'editEvent'} prefix
     */
    syncTimelineLocationFormVisibility(prefix) {
        const sel = document.getElementById(`${prefix}LocationPreset`);
        const wrap = document.getElementById(`${prefix}LocationCustomWrap`);
        if (!sel || !wrap) return;
        wrap.style.display = sel.value === TIMELINE_LOCATION_OTHER ? 'block' : 'none';
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
        const locParts = splitTimelineLocation(event.location);

        const presetOpts = [
            `<option value="" ${!locParts.preset ? 'selected' : ''}>— None (optional) —</option>`,
            ...TIMELINE_LOCATION_PRESETS.map((p) => {
                const esc = this.escapeHTML(p);
                return `<option value="${esc}" ${locParts.preset === p ? 'selected' : ''}>${esc}</option>`;
            }),
            `<option value="${TIMELINE_LOCATION_OTHER}" ${locParts.preset === TIMELINE_LOCATION_OTHER ? 'selected' : ''}>Other (custom)</option>`
        ].join('');

        const customWrapDisplay = locParts.preset === TIMELINE_LOCATION_OTHER ? 'block' : 'none';

        form.innerHTML = `
            <div>
                <label class="block text-sm font-medium mb-2">Event Title</label>
                <input type="text" id="editEventTitle" class="form-input" value="${this.escapeHTML(event.title)}">
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Period / Act</label>
                <input type="text" id="editEventPeriod" class="form-input" value="${this.escapeHTML(event.period || '')}">
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Location</label>
                <select id="editEventLocationPreset" class="form-input" onchange="App.syncTimelineLocationFormVisibility('editEvent')">
                    ${presetOpts}
                </select>
            </div>
            <div id="editEventLocationCustomWrap" style="display:${customWrapDisplay};">
                <label class="block text-sm font-medium mb-2">Custom location</label>
                <input type="text" id="editEventLocationCustom" class="form-input" placeholder="e.g., Riverside pavilion" value="${this.escapeHTML(locParts.custom)}">
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
                <label class="block text-sm font-medium mb-2">Hero's Journey step (optional)</label>
                <select id="editEventHeroJourney" class="form-input">
                    <option value="">— None —</option>
                    ${HERO_JOURNEY_STEPS.map((s) => {
                        const sel = String(event.heroJourney || '') === s.id ? 'selected' : '';
                        return `<option value="${s.id}" ${sel}>${s.id} · ${this.escapeHTML(s.short)}</option>`;
                    }).join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Short Description</label>
                <input type="text" id="editEventDescription" class="form-input" value="${this.escapeHTML(event.description || '')}">
            </div>
            <div>
                <label class="block text-sm font-medium mb-2">Detailed Event Notes</label>
                <textarea id="editEventFullDescription" class="form-input" rows="6" placeholder="Write detailed notes about this event...">${this.escapeHTML(event.fullDescription || '')}</textarea>
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
        if (!event) return;

        const locPreset = document.getElementById('editEventLocationPreset')?.value ?? '';
        const locCustom = document.getElementById('editEventLocationCustom')?.value ?? '';
        const hjVal = document.getElementById('editEventHeroJourney')?.value?.trim() || '';
        const patch = {
            title: document.getElementById('editEventTitle').value.trim(),
            period: document.getElementById('editEventPeriod').value.trim(),
            beat: document.getElementById('editEventBeat').value || null,
            heroJourney: hjVal || null,
            description: document.getElementById('editEventDescription').value.trim(),
            fullDescription: document.getElementById('editEventFullDescription').value.trim(),
            location: joinTimelineLocation(locPreset, locCustom)
        };
        Object.assign(event, updateTimelineEvent(event, patch));

        this.save();
        this.closeEventEditor();
        this.renderTimelineWithCircle();
    },

    /**
     * Hero's Journey: 12 shape columns; events with matching heroJourney appear as chips.
     * @param {Array<object>} sortedEvents same filter as story-order strip
     */
    renderHeroJourneyStrip(sortedEvents) {
        const host = document.getElementById('heroJourneyShapeHost');
        if (!host) return;

        const byStep = new Map();
        HERO_JOURNEY_STEPS.forEach((s) => byStep.set(s.id, []));
        (sortedEvents || []).forEach((ev) => {
            const hj = ev.heroJourney != null && ev.heroJourney !== '' ? String(ev.heroJourney) : '';
            if (byStep.has(hj)) byStep.get(hj).push(ev);
        });
        byStep.forEach((list) => list.sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0)));

        const columns = HERO_JOURNEY_STEPS.map((step, i) => {
            const kind = TIMELINE_SHAPE_KINDS[i % TIMELINE_SHAPE_KINDS.length];
            const eventsHere = byStep.get(step.id) || [];
            const chips = eventsHere
                .map((ev) => {
                    const raw = String(ev.title || 'Untitled').trim();
                    const short = raw.length > 18 ? `${raw.slice(0, 17)}…` : raw;
                    const cj = ev.isCanon ? 'hero-journey-chip-canon' : 'hero-journey-chip-draft';
                    return `<button type="button" class="hero-journey-event-chip ${cj}" onclick="App.openEventEditor(${ev.id})" title="${this.escapeHTML(ev.title)}">${this.escapeHTML(short)}</button>`;
                })
                .join('');

            return `
                <div role="listitem" class="hero-journey-step-column">
                    <div class="timeline-shape-icon timeline-shape-kind-${kind} timeline-shape-hero-ref" title="${this.escapeHTML(step.short)}">
                        <span class="timeline-shape-label-inner">${i + 1}</span>
                    </div>
                    <div class="hero-journey-step-name">${this.escapeHTML(step.abbr)}</div>
                    <div class="hero-journey-chip-stack">${chips || '<span class="hero-journey-step-empty" aria-hidden="true">—</span>'}</div>
                </div>
            `;
        });

        host.innerHTML = columns.join('');
    },

    /**
     * Render timeline with story circle
     */
    renderTimelineWithCircle() {
        const circleContainer = document.getElementById('eventsOnCircle');
        const timelineContainer = document.getElementById('timelineContainer');
        if (!circleContainer || !timelineContainer) {
            this.renderGhostBorderInteractiveMap();
            return;
        }

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
                const blob = `${ev.title || ''} ${ev.period || ''} ${ev.location || ''} ${ev.description || ''} ${ev.fullDescription || ''} ${involvedNames}`;
                return blob.toLowerCase().includes(q);
            });

        if (sortedEvents.length === 0) {
            circleContainer.innerHTML = '<div class="timeline-shapes-empty">No events match the current filters. Add events below or adjust search / canon filter.</div>';
        } else {
            const nodes = sortedEvents.map((event, i) => {
                const kind = TIMELINE_SHAPE_KINDS[i % TIMELINE_SHAPE_KINDS.length];
                const canonClass = event.isCanon ? 'timeline-shape-canon' : 'timeline-shape-draft';
                const rawTitle = String(event.title || 'Untitled').trim();
                const titleShort = rawTitle.length > 24 ? `${rawTitle.slice(0, 23)}…` : rawTitle;
                const beatNote = event.beat
                    ? `<div class="timeline-shape-beat">Beat ${this.escapeHTML(String(event.beat))}</div>`
                    : '';
                return `
                    <div role="listitem" class="timeline-event-shape-node"
                         onclick="App.openEventEditor(${event.id})"
                         title="Click to edit: ${this.escapeHTML(event.title)}">
                        <div class="timeline-shape-icon timeline-shape-kind-${kind} ${canonClass}">
                            <span class="timeline-shape-label-inner">${i + 1}</span>
                        </div>
                        <div class="timeline-shape-title">${this.escapeHTML(titleShort)}</div>
                        ${beatNote}
                    </div>
                `;
            });
            circleContainer.innerHTML = nodes.join('<span class="timeline-shape-arrow" aria-hidden="true">→</span>');
        }

        this.renderHeroJourneyStrip(sortedEvents);

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
                                           ${event.isCanon ? this.renderCanonBadge('timeline', event.id) : this.renderDraftTag()}`
                                }
                                <button class="topbar-ghost" style="padding:0.35rem 0.6rem; font-size:0.8rem;" onclick="App.openEventEditor(${event.id})" title="Open full editor">Details</button>
                            </div>
                            <div class="text-sm text-zinc-400">
                                ${this.escapeHTML(event.period || '')}
                                ${
                                    event.location
                                        ? ` · <span class="text-violet-300/90">${this.escapeHTML(event.location)}</span>`
                                        : ''
                                }
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
                                ${event.heroJourney ? ` · <span class="font-semibold text-teal-600 dark:text-teal-400/90" title="Hero's Journey step (edit in Details)">HJ ${this.escapeHTML(String(event.heroJourney))}</span>` : ''}
                            </div>
                            ${event.description ? `<div class="text-sm text-zinc-300 mt-1">${event.description}</div>` : ''}
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
                            ${event.fullDescription ? `<div class="text-sm text-zinc-400 mt-2 italic">${event.fullDescription.substring(0, 100)}${event.fullDescription.length > 100 ? '...' : ''}</div>` : ''}
                        </div>
                        <button class="delete-btn" onclick="App.deleteEvent(${event.id}); event.stopPropagation();">Delete</button>
                    </div>
                `).join('')}
            </div>
        `;

        this.initTimelineDragAndDrop();
        this.renderGhostBorderInteractiveMap();
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
            <div class="mb-4 rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
                <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Act</div>
                <h3 class="mt-1 text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">${section.act}</h3>
                <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">${section.content}</p>
            </div>
        `).join('');
    },

    /**
     * Render politics
     */
    renderPolitics() {
        const container = document.getElementById('politicsContainer');
        container.innerHTML = this.storyData.politics.map((section, idx) => `
            <div class="mb-4 rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
                <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Politics</div>
                <h3 class="mt-1 text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">${section.section}</h3>
                <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">${section.content}</p>
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
            <div class="mb-4 rounded-2xl border border-zinc-200/50 bg-white/80 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
                <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Category</div>
                <h3 class="mt-1 text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">${category}</h3>
                <div class="mt-3 space-y-2">
                ${items.map(item => `
                    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200/50 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/35">
                        <input class="h-4 w-4 rounded border-zinc-300 text-indigo-500 focus:ring-indigo-500/40 dark:border-zinc-700 dark:bg-zinc-900" type="checkbox" ${item.completed ? 'checked' : ''} onchange="App.toggleWorkItem(${item.id})">
                        <span class="min-w-[160px] flex-1 text-sm font-semibold ${item.completed ? 'text-zinc-500 line-through dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}">${item.title}</span>
                        <div class="flex flex-wrap items-center gap-2">
                            ${item.isCanon ? this.renderCanonBadge('workItem', item.id) : this.renderDraftTag()}
                            <button class="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.editWorkItem(${item.id})">Edit</button>
                            <button class="rounded-lg border border-violet-500/35 bg-violet-600/15 px-3 py-1.5 text-[11px] font-extrabold text-violet-900 hover:bg-violet-600/25 dark:text-violet-100 dark:hover:bg-violet-600/20" onclick="App.runDeepResearchWorkItem(${item.id})">Deep research</button>
                            <button class="rounded-lg border border-zinc-200/60 bg-white/70 px-3 py-1.5 text-[11px] font-extrabold text-zinc-900 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:hover:bg-zinc-950" onclick="App.openWebResearch(${item.id})">Web</button>
                            <button class="delete-btn rounded-lg px-3 py-1.5 text-[11px] font-extrabold" onclick="App.deleteWorkItem(${item.id})">Delete</button>
                        </div>
                    </div>
                `).join('')}
                </div>
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

        const cc = document.getElementById('character-count');
        if (cc) cc.textContent = String(characters.length);
        const ec = document.getElementById('event-count');
        if (ec) ec.textContent = String(this.storyData.events.length);
        const fc = document.getElementById('friendly-count');
        if (fc) fc.textContent = String(friendly);
        const ac = document.getElementById('antagonist-count');
        if (ac) ac.textContent = String(antagonist);
        const gc = document.getElementById('gray-count');
        if (gc) gc.textContent = String(gray);

        const totalTasks = this.storyData.workItems.length;
        const completedTasks = this.storyData.workItems.filter(w => w.completed).length;
        const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        document.getElementById('task-count').textContent = totalTasks - completedTasks;
        const pctVal = document.getElementById('completion-percentage-value');
        if (pctVal) pctVal.textContent = String(percentage);
        const bar = document.getElementById('completion-bar');
        if (bar) bar.style.width = percentage + '%';

        const ring = document.getElementById('momentumRing');
        if (ring) {
            const radius = 54;
            const circumference = 2 * Math.PI * radius;
            ring.setAttribute('stroke-dasharray', String(circumference));
            const clamped = Math.max(0, Math.min(100, percentage));
            const offset = circumference * (1 - clamped / 100);
            ring.setAttribute('stroke-dashoffset', String(offset));
        }

        const relCount = document.getElementById('dashboardRelationshipCount');
        if (relCount) {
            const rels = Array.isArray(this.storyData.relationships) ? this.storyData.relationships : [];
            relCount.textContent = String(rels.length);
        }

        this.renderDashboardMapPreview();
        this.renderStoryLocationsOverview();
    },

    renderDashboardMapPreview() {
        const wrap = document.getElementById('dashboardMapPreview');
        if (!wrap) return;
        this.ensureStoryWorldMapGallery?.();

        const gallery = this.storyData.storyWorldMapGallery || {};
        const active = String(gallery.activeImageUrl || '').trim();
        const fallback = String(gallery.items?.[0]?.imageUrl || '').trim();
        const url = active || fallback;

        if (!url) {
            wrap.style.backgroundImage = '';
            wrap.innerHTML = `
                <div class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                    <div class="text-sm font-black text-zinc-100">No map image saved yet</div>
                    <div class="text-xs font-semibold text-zinc-500">Open Visualizer → “Upload image” or “Fetch via image API”.</div>
                </div>
            `;
            return;
        }

        wrap.innerHTML = '';
        wrap.style.backgroundImage = `linear-gradient(to top, rgba(9,9,11,0.85), rgba(9,9,11,0.15)), url("${url}")`;
        wrap.style.backgroundSize = 'cover';
        wrap.style.backgroundPosition = 'center';
        wrap.style.backgroundRepeat = 'no-repeat';
    },

    /**
     * Dashboard: horizontal mini timeline from current story events.
     */
    renderDashboardMiniTimeline() {
        const strip = document.getElementById('dashboardMiniTimelineStrip');
        if (!strip) return;

        const events = Array.isArray(this.storyData.events) ? this.storyData.events : [];
        const sorted = [...events].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
        const charById = new Map((this.storyData.characters || []).map(c => [c.id, c]));

        const initials = (name) => {
            const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
            if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
            const s = parts[0] || '?';
            return s.slice(0, 2).toUpperCase();
        };

        const ringClass = (type) => {
            if (type === 'friendly') return 'border-emerald-400/45 bg-emerald-400/12 text-emerald-400';
            if (type === 'antagonist') return 'border-rose-500/45 bg-rose-500/12 text-rose-500';
            return 'border-zinc-500/40 bg-zinc-700/30 text-zinc-400';
        };

        const summary = (ev) => {
            const d = String(ev.description || '').trim();
            if (d) return d.length > 96 ? `${d.slice(0, 96)}…` : d;
            const fd = String(ev.fullDescription || '').trim();
            if (fd) return fd.length > 96 ? `${fd.slice(0, 96)}…` : fd;
            const p = String(ev.period || '').trim();
            return p || 'No summary yet';
        };

        if (sorted.length === 0) {
            strip.innerHTML = `
                <div class="flex min-w-full flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700/90 bg-zinc-900 px-8 py-14 text-center shadow-inner shadow-black/30">
                    <div class="text-base font-black tracking-tight text-zinc-100">No timeline beats yet</div>
                    <div class="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">Add events from the Timeline tab — they will appear here in story order.</div>
                    <button type="button" class="dashboard-qa-btn mt-6 rounded-xl bg-violet-600 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)]" onclick="App.switchTab('timeline')">Go to Timeline</button>
                </div>
            `;
            return;
        }

        const connector = `
                <div class="dashboard-mini-connector flex w-5 shrink-0 flex-col items-center justify-center self-center px-0.5" aria-hidden="true">
                    <div class="h-px w-full rounded-full bg-gradient-to-r from-violet-600/50 via-violet-400/90 to-violet-600/40 shadow-[0_0_12px_rgba(139,92,246,0.45)]"></div>
                </div>`;

        strip.innerHTML = sorted
            .map((ev, idx) => {
            const id = Number(ev.id);
            const beat = ev.beat != null && ev.beat !== '' ? String(ev.beat) : '—';
            const title = this.escapeHTML(ev.title || 'Untitled');
            const sum = this.escapeHTML(summary(ev));
            const involved = Array.isArray(ev.involvedCharacterIds) ? ev.involvedCharacterIds : [];
            const faces = involved.slice(0, 5).map(cid => {
                const c = charById.get(Number(cid));
                if (!c) return '';
                const ini = this.escapeHTML(initials(c.name));
                const rc = ringClass(c.type);
                return `<span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${rc} shadow-sm" title="${this.escapeHTML(c.name)}">${ini}</span>`;
            }).join('');
            const more = involved.length > 5
                ? `<span class="inline-flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-full border border-violet-500/40 bg-violet-950/50 px-1.5 text-[11px] font-black text-violet-100 shadow-sm" title="More characters">+${involved.length - 5}</span>`
                : '';
            const canon = ev.isCanon ? this.renderCanonBadge('timeline', id) : '';

            const card = `
                <div role="button" tabindex="0" class="dashboard-mini-card group relative flex w-[min(100%,280px)] shrink-0 cursor-pointer flex-col rounded-2xl border border-zinc-700/90 bg-zinc-900 p-4 text-left shadow-[0_12px_40px_-12px_rgba(0,0,0,0.75)] ring-1 ring-inset ring-white/[0.04] transition hover:border-violet-500/45 hover:shadow-[0_0_32px_-6px_rgba(139,92,246,0.22)] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70"
                    onclick="App.focusTimelineEvent(${id})"
                    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.focusTimelineEvent(${id});}"
                >
                    <div class="flex items-start justify-between gap-3">
                        <span class="inline-flex items-center rounded-lg border border-violet-500/40 bg-violet-600/20 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-violet-200">Beat ${this.escapeHTML(beat)}</span>
                        <span class="shrink-0 text-right leading-none">${canon}</span>
                    </div>
                    <div class="mt-3 line-clamp-2 text-base font-black leading-snug tracking-tight text-zinc-50">${title}</div>
                    <div class="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-400">${sum}</div>
                    <div class="mt-4 flex min-h-[2.25rem] flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-3">
                        ${faces || '<span class="text-xs font-semibold text-zinc-600">No characters linked</span>'}
                        ${more}
                    </div>
                </div>`;
            const tail = idx < sorted.length - 1 ? connector : '';
            return card + tail;
        })
            .join('');
    },

    /**
     * Open Timeline tab and scroll/highlight a specific event row.
     */
    focusTimelineEvent(eventId) {
        const numId = Number(eventId);
        if (!Number.isFinite(numId)) return;

        this.switchTab('timeline');

        const tryHighlight = (attempt = 0) => {
            const row = document.querySelector(`#timelineList .timeline-event[data-event-id="${numId}"]`)
                || document.querySelector(`.timeline-event[data-event-id="${numId}"]`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('timeline-event-spotlight');
                window.clearTimeout(row._spotlightTimer);
                row._spotlightTimer = window.setTimeout(() => {
                    row.classList.remove('timeline-event-spotlight');
                    row._spotlightTimer = null;
                }, 2600);
                return;
            }
            if (attempt < 30) {
                window.setTimeout(() => tryHighlight(attempt + 1), 45);
            }
        };

        window.setTimeout(() => tryHighlight(0), 0);
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
        document.getElementById('localGenerationTimeoutMinutes').value =
            AIService.settings.localGenerationTimeoutMinutes ?? 15;
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
            modelDiv.innerHTML = '<div class="model-item text-zinc-400">No models detected. Load a model in your AI platform first.</div>';
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
        let localGenerationTimeoutMinutes = Number.parseInt(
            document.getElementById('localGenerationTimeoutMinutes').value,
            10
        );
        if (!Number.isInteger(localGenerationTimeoutMinutes)) {
            localGenerationTimeoutMinutes = 15;
        }
        localGenerationTimeoutMinutes = Math.min(120, Math.max(1, localGenerationTimeoutMinutes));

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
            localGenerationTimeoutMinutes,
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
        const timelineItems = this.storyData.events.map(e => {
            const loc = e.location ? ` @ ${e.location}` : '';
            return `${e.title} (${e.period || 'Unknown period'})${loc} — ${e.description || 'No description'}`;
        });
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
                            <div class="text-sm text-zinc-400">${new Date(item.createdAt).toLocaleString()}</div>
                            <p>${this.escapeHTML(item.prompt)}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Predefined map coordinates (viewBox 0 0 1000 640) for timeline location presets.
     */
    STORY_WORLD_MAP_BASE: Object.freeze({
        'Tang Imperial Palace': [502, 198],
        'Forbidden Garden': [738, 276],
        'Imperial Market Square': [498, 432],
        'Time Portal': [218, 312],
        'Modern City District': [148, 528]
    }),

    /** Ghost Border static map (Visualizer 1200×620) — pin coordinates. */
    GHOST_BORDER_LOCATION_COORDS: Object.freeze({
        'Time Portal': { x: 210, y: 170 },
        'Disgraced Manor': { x: 395, y: 365 },
        'Forbidden Garden': { x: 520, y: 240 },
        'Imperial Market': { x: 710, y: 400 },
        'Daming Palace': { x: 940, y: 195 },
        'Grey Dragon Road': { x: 610, y: 355 },
        'Secret Metropolis': { x: 1045, y: 420 }
    }),

    GHOST_BORDER_LOCATION_ALIASES: Object.freeze({
        'time portal cave': 'Time Portal',
        'imperial market square': 'Imperial Market',
        'tang imperial palace': 'Daming Palace',
        'modern city district': 'Secret Metropolis',
        'forbidden garden': 'Forbidden Garden',
        'time portal': 'Time Portal',
        'disgraced manor': 'Disgraced Manor',
        'grey dragon road': 'Grey Dragon Road',
        'secret metropolis': 'Secret Metropolis',
        'daming palace': 'Daming Palace',
        'imperial market': 'Imperial Market'
    }),

    hashGhostBorderPoint(ev) {
        let h = Number(ev?.id) || 0;
        const s = String(ev?.title || ev?.location || '');
        for (let i = 0; i < s.length; i += 1) {
            h = ((h << 5) - h) + s.charCodeAt(i) | 0;
        }
        return {
            x: 200 + (Math.abs(h) % 760),
            y: 110 + (Math.abs(h >> 10) % 420)
        };
    },

    resolveGhostBorderBasePoint(ev) {
        const raw = String(ev?.location || '').trim();
        const reg = this.GHOST_BORDER_LOCATION_COORDS;
        const aliases = this.GHOST_BORDER_LOCATION_ALIASES;
        if (raw) {
            const low = raw.toLowerCase();
            const viaAlias = aliases[low];
            if (viaAlias && reg[viaAlias]) {
                return { x: reg[viaAlias].x, y: reg[viaAlias].y };
            }
            const direct = Object.keys(reg).find((k) => k.toLowerCase() === low);
            if (direct) {
                return { x: reg[direct].x, y: reg[direct].y };
            }
            const fuzzy = Object.keys(reg).find((k) =>
                low.includes(k.toLowerCase()) || k.toLowerCase().includes(low));
            if (fuzzy) {
                return { x: reg[fuzzy].x, y: reg[fuzzy].y };
            }
        }
        return this.hashGhostBorderPoint(ev);
    },

    ghostBorderStoryJump(prevEv, nextEv) {
        const A = String(prevEv?.location || '').toLowerCase();
        const B = String(nextEv?.location || '').toLowerCase();
        return (A.includes('portal') && (B.includes('modern') || B.includes('metropolis') || B.includes('secret')))
            || ((A.includes('modern') || A.includes('metropolis') || A.includes('secret'))
                && (B.includes('palace') || B.includes('daming') || B.includes('tang')));
    },

    buildGhostBorderSmoothPath(points) {
        if (!points || points.length < 2) return '';
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i += 1) {
            const p = points[i];
            const prev = points[i - 1];
            const mx = (prev.x + p.x) / 2;
            const my = (prev.y + p.y) / 2;
            d += ` Q ${mx} ${my} ${p.x} ${p.y}`;
        }
        return d;
    },

    /**
     * Ghost Border map overlay: pins from timeline `location`, purple story path, jump dashes, in-map legend.
     */
    renderGhostBorderInteractiveMap() {
        const overlay = document.getElementById('ghostBorderMapOverlay');
        if (!overlay) return;

        const events = [...(Array.isArray(this.storyData?.events) ? this.storyData.events : [])]
            .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0) || (Number(a?.id) || 0) - (Number(b?.id) || 0));

        const stackAt = new Map();
        const pinPlacements = [];
        const pathPoints = [];

        events.forEach((ev) => {
            const base = this.resolveGhostBorderBasePoint(ev);
            const ck = `${Math.round(base.x)}|${Math.round(base.y)}`;
            const n = stackAt.get(ck) || 0;
            stackAt.set(ck, n + 1);
            const ang = ((n * 42) - 90) * Math.PI / 180;
            const rad = 12 + n * 18;
            const x = Math.round(base.x + Math.cos(ang) * rad);
            const y = Math.round(base.y + Math.sin(ang) * rad);
            pathPoints.push({ x, y, ev });
            if (String(ev.location || '').trim()) {
                pinPlacements.push({ x, y, ev });
            }
        });

        const pathD = pathPoints.length >= 2 ? this.buildGhostBorderSmoothPath(pathPoints) : '';

        const jumpLines = [];
        for (let i = 1; i < pathPoints.length; i += 1) {
            if (this.ghostBorderStoryJump(pathPoints[i - 1].ev, pathPoints[i].ev)) {
                jumpLines.push({
                    x1: pathPoints[i - 1].x,
                    y1: pathPoints[i - 1].y,
                    x2: pathPoints[i].x,
                    y2: pathPoints[i].y
                });
            }
        }

        const pathSvg = pathD
            ? `<path d="${pathD}" fill="none" stroke="rgba(167,139,250,0.35)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>
               <path d="${pathD}" fill="none" stroke="rgba(196,181,253,0.95)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#ghostBorderRouteGlow)" pointer-events="none"/>`
            : '';

        const jumpsSvg = jumpLines.map((ln) =>
            `<line x1="${ln.x1}" y1="${ln.y1}" x2="${ln.x2}" y2="${ln.y2}" stroke="rgba(167,139,250,0.92)" stroke-width="3.2" stroke-dasharray="10 14" stroke-linecap="round" pointer-events="none"/>`
        ).join('');

        const pinsSvg = pinPlacements.map(({ x, y, ev }) => {
            const nid = Number(ev.id);
            const beat = ev.beat != null && ev.beat !== '' ? String(ev.beat) : '—';
            const title = String(ev.title || 'Untitled').trim();
            const short = title.length > 44 ? `${title.slice(0, 44)}…` : title;
            const tip = `Beat ${beat} — ${short}`;
            const shield = ev.isCanon
                ? '<g transform="translate(11,-19)" aria-label="Canon"><path d="M0 4.5 L7.5 0 L15 4.5 L12 17 L3 17 Z" fill="#fbbf24" stroke="#78350f" stroke-width="0.85"/></g>'
                : '';
            return `
            <g class="ghost-border-map-pin" transform="translate(${x},${y})" role="button" tabindex="0"
               onclick="App.focusTimelineEvent(${nid})"
               onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.focusTimelineEvent(${nid});}">
              <title>${this.escapeHTML(tip)}</title>
              <circle r="26" fill="rgba(251,191,36,0.2)" filter="url(#ghostBorderPinGlow)" />
              <circle r="16" fill="#0a0810" stroke="#fbbf24" stroke-width="2.6" />
              <circle r="6.5" fill="#6d28d9" stroke="#ddd6fe" stroke-width="0.8" />
              <text text-anchor="middle" y="4.5" fill="#fffbeb" font-size="10.5" font-family="system-ui,-apple-system,sans-serif" font-weight="800">${this.escapeHTML(beat)}</text>
              ${shield}
            </g>`;
        }).join('');

        const legend = `
        <g id="ghostBorderMapLegend" transform="translate(788, 405)" pointer-events="none">
          <rect width="396" height="218" rx="12" fill="rgba(5,5,8,0.88)" stroke="rgba(139,92,246,0.5)" stroke-width="1" />
          <text x="18" y="30" fill="#f5e9d0" font-size="13" font-weight="800" font-family="system-ui,sans-serif">Legend</text>
          <circle cx="22" cy="54" r="8" fill="#6d28d9" stroke="#fbbf24" stroke-width="2.2" />
          <text x="38" y="58" fill="#cbd5e1" font-size="11.5" font-family="system-ui,sans-serif">Gold pin = canon event</text>
          <line x1="14" y1="78" x2="38" y2="78" stroke="#c4b5fd" stroke-width="4" stroke-linecap="round" />
          <text x="44" y="82" fill="#cbd5e1" font-size="11.5" font-family="system-ui,sans-serif">Purple line = story progression</text>
          <line x1="14" y1="100" x2="38" y2="100" stroke="rgba(167,139,250,0.95)" stroke-width="2.8" stroke-dasharray="8 10" stroke-linecap="round" />
          <text x="44" y="104" fill="#94a3b8" font-size="11.5" font-family="system-ui,sans-serif">Dashed purple = time-travel jumps</text>
          <text x="18" y="132" fill="#78716c" font-size="10" font-family="system-ui,sans-serif">Gold shield on pin = isCanon. Pins only when a Timeline location is set. Click pin → Timeline.</text>
        </g>`;

        overlay.innerHTML = `${pathSvg}${jumpsSvg}${pinsSvg}${legend}`;
    },

    /**
     * Rich, map-specific prompt for Grok Imagine (timeline + locations); built in AIService.
     */
    buildStoryWorldMapGrokPrompt() {
        return AIService.buildStoryWorldMapGrokPrompt(this.storyData);
    },

    syncStoryWorldMapGrokPromptUI() {
        const text = this.buildStoryWorldMapGrokPrompt();
        const modalTa = document.getElementById('storyWorldMapGrokModalPrompt');
        if (modalTa && !modalTa.dataset.aiPending) {
            modalTa.value = text;
        }
    },

    /**
     * Story World Map modal: show which local model is targeted and what it is doing.
     * @param {{ modelLine?: string, variant: 'loading'|'ready'|'fallback'|'error', detailText?: string }} opts
     */
    updateStoryWorldMapGrokModalModelStatus(opts) {
        const { modelLine, variant, detailText } = opts || {};
        const label = document.getElementById('storyWorldMapGrokModalModelLabel');
        const detailEl = document.getElementById('storyWorldMapGrokModalStatusDetail');
        if (label != null && modelLine != null) {
            label.textContent = modelLine;
        }
        if (!detailEl) return;
        const base = 'mt-2 text-sm';
        if (variant === 'loading') {
            detailEl.className = `${base} text-zinc-300`;
            detailEl.innerHTML = `<span class="inline-flex items-center gap-2"><span class="spinner"></span><span>${this.escapeHTML(detailText || 'Working…')}</span></span>`;
            return;
        }
        detailEl.textContent = detailText || '';
        if (variant === 'ready') detailEl.className = `${base} font-medium text-emerald-300/95`;
        else if (variant === 'error') detailEl.className = `${base} text-rose-300`;
        else detailEl.className = `${base} text-amber-200/95`;
    },

    /**
     * Open Grok Imagine modal and fill prompt via text AI (AIService), with fallback to built-in draft.
     */
    async openStoryWorldMapGrokModal() {
        const modal = document.getElementById('storyWorldMapGrokModal');
        const ta = document.getElementById('storyWorldMapGrokModalPrompt');
        const actions = document.getElementById('storyWorldMapGrokModalActions');
        modal?.classList.add('active');
        const modelLine = AIService.getLocalTextAiSummary();
        this.updateStoryWorldMapGrokModalModelStatus({
            modelLine,
            variant: 'loading',
            detailText: 'Calling your local text model to expand the map prompt…'
        });
        if (ta) {
            ta.dataset.aiPending = '1';
            ta.value = 'Generating a detailed, ready-to-copy prompt with your text AI (LM Studio / Ollama)…\n\nIf this takes too long, close and try again after Test Connection in AI Settings.';
        }
        if (actions) actions.classList.add('pointer-events-none', 'opacity-50');

        try {
            const result = await AIService.generateStoryWorldMapGrokPromptDetailed(this.storyData);
            if (ta) ta.value = result.text;
            const variant =
                result.mode === 'ai' ? 'ready' : result.mode === 'error' ? 'error' : 'fallback';
            this.updateStoryWorldMapGrokModalModelStatus({
                modelLine,
                variant,
                detailText: result.userMessage
            });
        } catch (err) {
            const fb = this.buildStoryWorldMapGrokPrompt();
            if (ta) ta.value = fb;
            this.updateStoryWorldMapGrokModalModelStatus({
                modelLine: AIService.getLocalTextAiSummary(),
                variant: 'error',
                detailText: String(err?.message || err || 'Unexpected error.')
            });
        } finally {
            if (ta) delete ta.dataset.aiPending;
            if (actions) actions.classList.remove('pointer-events-none', 'opacity-50');
        }
    },

    closeStoryWorldMapGrokModal() {
        document.getElementById('storyWorldMapGrokModal')?.classList.remove('active');
        const label = document.getElementById('storyWorldMapGrokModalModelLabel');
        const detail = document.getElementById('storyWorldMapGrokModalStatusDetail');
        if (label) label.textContent = '';
        if (detail) {
            detail.textContent = '';
            detail.className = 'mt-2 text-sm text-zinc-400';
        }
    },

    async copyStoryWorldMapGrokModalPrompt() {
        const ta = document.getElementById('storyWorldMapGrokModalPrompt');
        const text = (ta?.value || this.buildStoryWorldMapGrokPrompt()).trim();
        const status = document.getElementById('storyWorldMapAiStatus');
        try {
            await navigator.clipboard.writeText(text);
            if (status) status.innerHTML = '<div class="ai-status connected">✅ Prompt copied — paste into Grok Imagine.</div>';
        } catch (err) {
            try {
                if (ta) {
                    ta.focus();
                    ta.select();
                    document.execCommand('copy');
                }
                if (status) status.innerHTML = '<div class="ai-status connected">✅ Copied (browser fallback).</div>';
            } catch (err2) {
                if (status) {
                    status.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(err2.message || err.message || 'Could not copy')}</div>`;
                }
            }
        }
    },

    ensureStoryWorldMapGallery() {
        if (!this.storyData.storyWorldMapGallery || typeof this.storyData.storyWorldMapGallery !== 'object') {
            this.storyData.storyWorldMapGallery = { version: 1, items: [], activeImageUrl: null };
        }
        if (!Array.isArray(this.storyData.storyWorldMapGallery.items)) {
            this.storyData.storyWorldMapGallery.items = [];
        }
        if (typeof this.storyData.storyWorldMapGallery.activeImageUrl !== 'string') {
            this.storyData.storyWorldMapGallery.activeImageUrl = this.storyData.storyWorldMapGallery.activeImageUrl == null
                ? null
                : String(this.storyData.storyWorldMapGallery.activeImageUrl);
        }
    },

    /**
     * If user has a saved realm map image, use it as the visible "atlas" background
     * behind the interactive SVG pins/paths.
     */
    applyActiveStoryWorldMapBackground() {
        const wrap = document.getElementById('ghostBorderStoryMapWrap');
        const svg = document.getElementById('ghostBorderStoryMapSvg');
        if (!wrap) return;
        this.ensureStoryWorldMapGallery();

        const active = String(this.storyData.storyWorldMapGallery.activeImageUrl || '').trim();
        const fallback = String(this.storyData.storyWorldMapGallery.items?.[0]?.imageUrl || '').trim();
        const url = active || fallback;

        if (!url) {
            wrap.style.removeProperty('background-image');
            wrap.style.removeProperty('background-size');
            wrap.style.removeProperty('background-position');
            wrap.style.removeProperty('background-repeat');
            if (svg) svg.style.background = '#0f0f0f';
            return;
        }

        wrap.style.backgroundImage = `url("${url.replace(/"/g, '\\"')}")`;
        wrap.style.backgroundSize = 'cover';
        wrap.style.backgroundPosition = 'center';
        wrap.style.backgroundRepeat = 'no-repeat';
        // Let the uploaded image be the background; pins/paths remain interactive above it.
        if (svg) svg.style.background = 'transparent';
    },

    // ============ FULL STORY INTEGRITY CHECK (LOCAL TEXT AI) ============

    integrityCheckState: {
        running: false,
        raw: '',
        parsed: null,
        applied: null
    },

    openIntegrityCheckModal() {
        document.getElementById('integrityCheckModal')?.classList.add('active');
        this.renderIntegrityCheckModal();
    },

    closeIntegrityCheckModal() {
        document.getElementById('integrityCheckModal')?.classList.remove('active');
    },

    renderIntegrityCheckModal() {
        const root = document.getElementById('integrityCheckBody');
        const meta = document.getElementById('integrityCheckMeta');
        const applyBtn = document.getElementById('integrityCheckApplyBtn');
        if (!root || !meta || !applyBtn) return;

        const parsed = this.integrityCheckState.parsed;
        const raw = String(this.integrityCheckState.raw || '').trim();

        const safeArr = (x) => Array.isArray(x) ? x : [];
        const safeStr = (x) => (typeof x === 'string' ? x : (x == null ? '' : String(x)));
        const esc = (x) => this.escapeHTML(safeStr(x));

        if (this.integrityCheckState.running) {
            meta.innerHTML = `<div class="ai-status analyzing"><span class="spinner"></span> Running full integrity check via local text AI…</div>`;
        } else if (!raw) {
            meta.innerHTML = `<div class="ai-status">No report yet. Run the check from Dashboard.</div>`;
        } else {
            const verdict = esc(parsed?.summary?.verdict || 'Report received.');
            meta.innerHTML = `<div class="ai-status connected">✅ ${verdict}</div>`;
        }

        const fixActions = safeArr(parsed?.fixActions);
        applyBtn.disabled = !(fixActions.length > 0) || this.integrityCheckState.running;
        applyBtn.classList.toggle('opacity-50', applyBtn.disabled);
        applyBtn.classList.toggle('pointer-events-none', applyBtn.disabled);

        if (!parsed) {
            root.innerHTML = raw
                ? `<pre class="whitespace-pre-wrap break-words rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-200">${esc(raw)}</pre>`
                : `<div class="rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-950/50 p-10 text-center text-sm text-zinc-500">Run the integrity check to populate this report.</div>`;
            return;
        }

        const section = (title, klass, items, renderItem) => {
            const list = safeArr(items);
            const content = list.length
                ? `<div class="mt-3 space-y-3">${list.map(renderItem).join('')}</div>`
                : `<div class="mt-3 rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3 text-xs font-semibold text-zinc-500">None.</div>`;
            return `
                <section class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-5 ring-1 ring-inset ${klass}">
                  <div class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500">${esc(title)}</div>
                  ${content}
                </section>`;
        };

        const renderIssue = (i, tone) => {
            const title = esc(i?.title || 'Untitled');
            const details = esc(i?.details || '');
            const fix = esc(i?.fix || '');
            const evidence = safeArr(i?.evidence).map((e) => `<li class="ml-4 list-disc text-xs text-zinc-400">${esc(e)}</li>`).join('');
            const evidenceBlock = evidence ? `<div class="mt-2"><div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Evidence</div><ul class="mt-2">${evidence}</ul></div>` : '';
            const fixTone =
                tone === 'rose'
                    ? 'border-rose-500/25 bg-rose-500/10 text-rose-100'
                    : 'border-amber-400/25 bg-amber-400/10 text-amber-100';
            const fixBlock = fix
                ? `<div class="mt-3 rounded-xl border ${fixTone} px-4 py-3 text-xs font-semibold">Fix: ${fix}</div>`
                : '';
            return `
                <div class="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4">
                  <div class="text-sm font-black tracking-tight text-zinc-100">${title}</div>
                  ${details ? `<div class="mt-2 text-sm leading-relaxed text-zinc-300">${details}</div>` : ''}
                  ${evidenceBlock}
                  ${fixBlock}
                </div>`;
        };

        const renderSuggestion = (s) => {
            const title = esc(s?.title || 'Suggestion');
            const details = esc(s?.details || '');
            return `
                <div class="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4">
                  <div class="text-sm font-black tracking-tight text-zinc-100">${title}</div>
                  ${details ? `<div class="mt-2 text-sm leading-relaxed text-zinc-300">${details}</div>` : ''}
                </div>`;
        };

        const renderBullet = (t) => `<div class="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200">${esc(t)}</div>`;

        const fixesPreview = fixActions.length
            ? `<div class="mt-3 rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
                 <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-200/80">Automatable fixes (${fixActions.length})</div>
                 <ul class="mt-3 space-y-2">
                   ${fixActions.slice(0, 12).map((a) => `<li class="rounded-xl border border-zinc-800/80 bg-zinc-950/55 px-4 py-3 text-xs text-zinc-300"><span class="font-extrabold text-zinc-100">${esc(a?.title || a?.actionType || 'Fix')}</span><div class="mt-1 text-zinc-400">${esc(a?.details || '')}</div></li>`).join('')}
                   ${fixActions.length > 12 ? `<li class="text-xs font-semibold text-zinc-500">…and ${fixActions.length - 12} more</li>` : ''}
                 </ul>
               </div>`
            : `<div class="mt-3 rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-950/50 p-6 text-center text-sm text-zinc-500">No safe fix actions were returned.</div>`;

        const topRisks = safeArr(parsed?.summary?.topRisks);
        const topSteps = safeArr(parsed?.summary?.topNextSteps);

        root.innerHTML = `
          <div class="space-y-4">
            <section class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-5 ring-1 ring-inset ring-violet-500/10">
              <div class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500">Summary</div>
              <div class="mt-3 text-sm font-black tracking-tight text-zinc-100">${esc(parsed?.summary?.verdict || '—')}</div>
              ${(topRisks.length || topSteps.length) ? `
                <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div class="rounded-2xl border border-zinc-800/80 bg-zinc-950/55 p-4">
                    <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Top risks</div>
                    <div class="mt-3 space-y-2">${topRisks.length ? topRisks.map(renderBullet).join('') : `<div class="text-sm text-zinc-500">—</div>`}</div>
                  </div>
                  <div class="rounded-2xl border border-zinc-800/80 bg-zinc-950/55 p-4">
                    <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Top next steps</div>
                    <div class="mt-3 space-y-2">${topSteps.length ? topSteps.map(renderBullet).join('') : `<div class="text-sm text-zinc-500">—</div>`}</div>
                  </div>
                </div>
              ` : ''}
              ${fixesPreview}
            </section>

            ${section('Critical Issues', 'ring-rose-500/20', parsed?.criticalIssues, (i) => renderIssue(i, 'rose'))}
            ${section('Minor Issues / Improvements', 'ring-amber-400/15', parsed?.minorIssues, (i) => renderIssue(i, 'amber'))}
            ${section('Strong Points', 'ring-emerald-400/10', parsed?.strongPoints, (t) => renderBullet(t))}
            ${section('Specific Suggestions', 'ring-violet-500/10', parsed?.specificSuggestions, (s) => renderSuggestion(s))}

            <details class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-5">
              <summary class="cursor-pointer text-sm font-extrabold text-zinc-200 select-none">Raw JSON output</summary>
              <pre class="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-200">${esc(raw)}</pre>
            </details>
          </div>
        `;
    },

    async runFullStoryIntegrityCheck() {
        const runStatus = document.getElementById('aiRunStatus');
        if (runStatus) {
            runStatus.innerHTML = '<div class="ai-result"><span class="spinner"></span> Running full story integrity check (local text AI)…</div>';
        }

        this.integrityCheckState.running = true;
        this.integrityCheckState.raw = '';
        this.integrityCheckState.parsed = null;
        this.integrityCheckState.applied = null;
        this.openIntegrityCheckModal();

        try {
            const raw = await AIService.runFullStoryIntegrityCheck(this.storyData);
            this.integrityCheckState.raw = raw;
            this.integrityCheckState.parsed = this.parseAIJSON(raw);
            if (this.integrityCheckState.parsed?.queueTasks) {
                this.addToExpansionQueue(this.integrityCheckState.parsed.queueTasks, 'Integrity Check');
            }
            this.integrityCheckState.running = false;
            this.renderIntegrityCheckModal();
            if (runStatus) runStatus.innerHTML = '<div class="ai-status connected">✅ Integrity check complete. See the modal for details and fix actions.</div>';
        } catch (error) {
            this.integrityCheckState.running = false;
            this.integrityCheckState.raw = `Error: ${error.message}`;
            this.integrityCheckState.parsed = null;
            this.renderIntegrityCheckModal();
            if (runStatus) runStatus.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(error.message)}</div>`;
        }
    },

    async runHistoricalTangAccuracyCheck() {
        const runStatus = document.getElementById('aiRunStatus');
        if (runStatus) {
            runStatus.innerHTML = '<div class="ai-result"><span class="spinner"></span> Running Tang historical accuracy check (local text AI)…</div>';
        }

        this.tangAccuracyState.running = true;
        this.tangAccuracyState.raw = '';
        this.tangAccuracyState.parsed = null;
        this.openTangAccuracyModal();

        try {
            const raw = await AIService.runHistoricalTangAccuracyCheck(this.storyData);
            this.tangAccuracyState.raw = raw;
            this.tangAccuracyState.parsed = this.parseAIJSON(raw);
            if (this.tangAccuracyState.parsed?.queueTasks) {
                this.addToExpansionQueue(this.tangAccuracyState.parsed.queueTasks, 'Tang Accuracy');
            }
            this.tangAccuracyState.running = false;
            this.renderTangAccuracyModal();
            if (runStatus) runStatus.innerHTML = '<div class="ai-status connected">✅ Tang accuracy check complete. See the modal for details.</div>';
        } catch (error) {
            this.tangAccuracyState.running = false;
            this.tangAccuracyState.raw = `Error: ${error.message}`;
            this.tangAccuracyState.parsed = null;
            this.renderTangAccuracyModal();
            if (runStatus) runStatus.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(error.message)}</div>`;
        }
    },

    applyIntegrityFixes() {
        const parsed = this.integrityCheckState.parsed;
        const statusEl = document.getElementById('integrityCheckApplyStatus');
        if (!parsed) return;

        const fixActions = Array.isArray(parsed.fixActions) ? parsed.fixActions : [];
        if (fixActions.length === 0) return;

        const ok = confirm(`Apply ${fixActions.length} suggested fix action(s)? This will only add draft work items / flags — it will not overwrite canon.`);
        if (!ok) return;

        const ensureTags = (obj) => {
            obj.tags = Array.isArray(obj.tags) ? obj.tags : [];
            return obj.tags;
        };
        const addTag = (obj, tag) => {
            const tags = ensureTags(obj);
            if (!tags.includes(tag)) tags.push(tag);
        };

        let workItemsAdded = 0;
        let eventsFlagged = 0;
        const errors = [];

        fixActions.forEach((a) => {
            try {
                const type = String(a?.actionType || '').trim();
                if (type === 'add_work_item') {
                    this.storyData.workItems = Array.isArray(this.storyData.workItems) ? this.storyData.workItems : [];
                    const title = String(a?.title || 'Integrity follow-up').trim().slice(0, 140);
                    const category = String(a?.category || 'Story Integrity').trim().slice(0, 80);
                    const details = String(a?.details || '').trim();
                    const tags = Array.isArray(a?.tags) ? a.tags.filter(Boolean).map(String) : [];

                    const nextId = Math.max(...this.storyData.workItems.map(w => w.id), 0) + 1;
                    const item = {
                        id: nextId,
                        title: details ? `${title} — ${details}`.slice(0, 160) : title,
                        category,
                        completed: false,
                        isCanon: false,
                        tags: Array.from(new Set(['draft', 'integrity', ...tags]))
                    };
                    this.storyData.workItems.push(item);
                    workItemsAdded += 1;
                    return;
                }

                if (type === 'flag_event') {
                    const evs = Array.isArray(this.storyData.events) ? this.storyData.events : [];
                    const id = a?.eventId != null ? Number(a.eventId) : null;
                    const byId = Number.isFinite(id) ? evs.find(e => Number(e?.id) === id) : null;
                    const byTitle = !byId && a?.eventTitle
                        ? evs.find(e => String(e?.title || '').trim().toLowerCase() === String(a.eventTitle).trim().toLowerCase())
                        : null;
                    const ev = byId || byTitle;
                    if (!ev) throw new Error(`Could not find event for flag: ${a?.eventId || a?.eventTitle || '(missing)'}`);
                    addTag(ev, 'integrity-flag');
                    addTag(ev, 'draft');
                    eventsFlagged += 1;
                    return;
                }
            } catch (err) {
                errors.push(err?.message || String(err));
            }
        });

        this.save();
        this.render();

        const msg = `✅ Applied: ${workItemsAdded} work item(s) added, ${eventsFlagged} event(s) flagged.`;
        this.integrityCheckState.applied = { workItemsAdded, eventsFlagged, errors };
        if (statusEl) {
            statusEl.innerHTML = errors.length
                ? `<div class="ai-result warning">${this.escapeHTML(msg)} Some actions failed:\n${this.escapeHTML(errors.slice(0, 6).join(' • '))}</div>`
                : `<div class="ai-status connected">${this.escapeHTML(msg)}</div>`;
        }
    },

    // ============ HISTORICAL TANG ACCURACY CHECK (LOCAL TEXT AI) ============

    tangAccuracyState: {
        running: false,
        raw: '',
        parsed: null
    },

    openTangAccuracyModal() {
        document.getElementById('tangAccuracyModal')?.classList.add('active');
        this.renderTangAccuracyModal();
    },

    closeTangAccuracyModal() {
        document.getElementById('tangAccuracyModal')?.classList.remove('active');
    },

    renderTangAccuracyModal() {
        const root = document.getElementById('tangAccuracyBody');
        const meta = document.getElementById('tangAccuracyMeta');
        const copyBtn = document.getElementById('tangAccuracyCopyBtn');
        if (!root || !meta || !copyBtn) return;

        const parsed = this.tangAccuracyState.parsed;
        const raw = String(this.tangAccuracyState.raw || '').trim();
        const safeArr = (x) => Array.isArray(x) ? x : [];
        const safeStr = (x) => (typeof x === 'string' ? x : (x == null ? '' : String(x)));
        const esc = (x) => this.escapeHTML(safeStr(x));

        if (this.tangAccuracyState.running) {
            meta.innerHTML = `<div class="ai-status analyzing"><span class="spinner"></span> Running Tang (720 AD, Kaiyuan era) accuracy check via local text AI…</div>`;
        } else if (!raw) {
            meta.innerHTML = `<div class="ai-status">No report yet. Run the check from Dashboard.</div>`;
        } else {
            const verdict = esc(parsed?.summary?.verdict || 'Report received.');
            meta.innerHTML = `<div class="ai-status connected">✅ ${verdict}</div>`;
        }

        copyBtn.disabled = !raw || this.tangAccuracyState.running;
        copyBtn.classList.toggle('opacity-50', copyBtn.disabled);
        copyBtn.classList.toggle('pointer-events-none', copyBtn.disabled);

        if (!parsed) {
            root.innerHTML = raw
                ? `<pre class="whitespace-pre-wrap break-words rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-200">${esc(raw)}</pre>`
                : `<div class="rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-950/50 p-10 text-center text-sm text-zinc-500">Run the Tang accuracy check to populate this report.</div>`;
            return;
        }

        const itemCard = (title, details, note, tone) => {
            const toneClass =
                tone === 'red'
                    ? 'border-rose-500/25 bg-rose-500/10 ring-rose-500/15'
                    : tone === 'yellow'
                        ? 'border-amber-400/25 bg-amber-400/10 ring-amber-400/15'
                        : 'border-emerald-400/20 bg-emerald-400/[0.08] ring-emerald-400/10';
            const heading =
                tone === 'red'
                    ? 'text-rose-100'
                    : tone === 'yellow'
                        ? 'text-amber-100'
                        : 'text-emerald-100';
            return `
                <div class="rounded-2xl border ${toneClass} p-4 ring-1">
                    <div class="text-sm font-black tracking-tight ${heading}">${esc(title || 'Untitled')}</div>
                    ${details ? `<div class="mt-2 text-sm leading-relaxed text-zinc-200">${esc(details)}</div>` : ''}
                    ${note ? `<div class="mt-3 rounded-xl border border-zinc-800/70 bg-zinc-950/55 px-4 py-3 text-xs font-semibold text-zinc-300"><span class="font-extrabold text-zinc-100">Historical note:</span> ${esc(note)}</div>` : ''}
                </div>`;
        };

        const section = (label, tone, arr, mapFn) => {
            const list = safeArr(arr);
            return `
                <section class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-5">
                    <div class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500">${esc(label)}</div>
                    <div class="mt-3 space-y-3">
                        ${list.length ? list.map(mapFn).join('') : `<div class="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3 text-xs font-semibold text-zinc-500">None.</div>`}
                    </div>
                </section>`;
        };

        const risks = safeArr(parsed?.summary?.topHistoricalRisks);
        const fixes = safeArr(parsed?.summary?.topFixes);

        root.innerHTML = `
            <div class="space-y-4">
                <section class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-5 ring-1 ring-inset ring-violet-500/10">
                    <div class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500">Summary</div>
                    <div class="mt-3 text-sm font-black tracking-tight text-zinc-100">${esc(parsed?.summary?.verdict || '—')}</div>
                    ${(risks.length || fixes.length) ? `
                        <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div class="rounded-2xl border border-zinc-800/80 bg-zinc-950/55 p-4">
                                <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Top historical risks</div>
                                <ul class="mt-3 space-y-2">
                                    ${risks.length ? risks.map((t) => `<li class="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200">${esc(t)}</li>`).join('') : `<li class="text-sm text-zinc-500">—</li>`}
                                </ul>
                            </div>
                            <div class="rounded-2xl border border-zinc-800/80 bg-zinc-950/55 p-4">
                                <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Top fixes</div>
                                <ul class="mt-3 space-y-2">
                                    ${fixes.length ? fixes.map((t) => `<li class="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200">${esc(t)}</li>`).join('') : `<li class="text-sm text-zinc-500">—</li>`}
                                </ul>
                            </div>
                        </div>
                    ` : ''}
                </section>

                ${section('Critical Anachronisms / Historical Errors', 'red', parsed?.criticalAnachronisms, (i) => itemCard(i?.title, i?.details, i?.historicalNote, 'red') + (i?.exactFix ? `<div class="mt-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-100">Exact fix: ${esc(i.exactFix)}</div>` : ''))}
                ${section('Minor Inaccuracies or Improvements', 'yellow', parsed?.minorInaccuracies, (i) => itemCard(i?.title, i?.details, i?.historicalNote, 'yellow') + (i?.exactFix ? `<div class="mt-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs font-semibold text-amber-100">Exact fix: ${esc(i.exactFix)}</div>` : ''))}
                ${section('Period-Accurate Strengths', 'green', parsed?.periodAccurateStrengths, (i) => itemCard(i?.title, i?.details, null, 'green'))}
                ${section('Specific, actionable suggestions', 'green', parsed?.actionableSuggestions, (s) => itemCard(s?.title, s?.details, null, 'green') + (s?.exactFix ? `<div class="mt-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-xs font-semibold text-emerald-100">Exact fix: ${esc(s.exactFix)}</div>` : ''))}

                <details class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-5">
                    <summary class="cursor-pointer text-sm font-extrabold text-zinc-200 select-none">Raw JSON output</summary>
                    <pre class="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-200">${esc(raw)}</pre>
                </details>
            </div>
        `;
    },

    buildTangAccuracyCopyText() {
        const parsed = this.tangAccuracyState.parsed;
        const raw = String(this.tangAccuracyState.raw || '').trim();
        if (!parsed) return raw;

        const lines = [];
        const A = (x) => Array.isArray(x) ? x : [];
        const S = (x) => (typeof x === 'string' ? x : (x == null ? '' : String(x))).trim();

        lines.push('Tang Dynasty Historical Accuracy Report (720 AD, Kaiyuan era)');
        lines.push('');
        if (parsed.summary?.verdict) lines.push(`Verdict: ${S(parsed.summary.verdict)}`);
        const risks = A(parsed.summary?.topHistoricalRisks).map(S).filter(Boolean);
        const fixes = A(parsed.summary?.topFixes).map(S).filter(Boolean);
        if (risks.length) {
            lines.push('');
            lines.push('Top historical risks:');
            risks.forEach(r => lines.push(`- ${r}`));
        }
        if (fixes.length) {
            lines.push('');
            lines.push('Top fixes:');
            fixes.forEach(f => lines.push(`- ${f}`));
        }

        const block = (title, arr) => {
            const list = A(arr);
            lines.push('');
            lines.push(title);
            if (!list.length) { lines.push('- None'); return; }
            list.forEach((it, idx) => {
                lines.push(`${idx + 1}. ${S(it.title)}`);
                if (it.details) lines.push(`   - Details: ${S(it.details)}`);
                if (it.historicalNote) lines.push(`   - Historical note: ${S(it.historicalNote)}`);
                if (it.exactFix) lines.push(`   - Exact fix: ${S(it.exactFix)}`);
            });
        };

        block('Critical Anachronisms / Historical Errors', parsed.criticalAnachronisms);
        block('Minor Inaccuracies or Improvements', parsed.minorInaccuracies);
        block('Period-Accurate Strengths', parsed.periodAccurateStrengths);
        block('Specific, actionable suggestions', parsed.actionableSuggestions);

        lines.push('');
        lines.push('--- Raw JSON ---');
        lines.push(raw);
        return lines.join('\n');
    },

    async copyTangAccuracyReport() {
        const status = document.getElementById('tangAccuracyCopyStatus');
        const text = this.buildTangAccuracyCopyText();
        try {
            await navigator.clipboard.writeText(text);
            if (status) status.innerHTML = '<div class="ai-status connected">✅ Report copied.</div>';
        } catch (err) {
            if (status) status.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(err.message || String(err))}</div>`;
        }
    },

    // ============ MASTER SCRIPT (LOCAL TEXT AI) ============

    masterScriptState: {
        running: false,
        text: '',
        updatedAt: null,
        lastError: null
    },

    openMasterScriptModal() {
        document.getElementById('masterScriptModal')?.classList.add('active');
        this.renderMasterScriptModal();
    },

    closeMasterScriptModal() {
        document.getElementById('masterScriptModal')?.classList.remove('active');
    },

    renderMasterScriptModal() {
        const meta = document.getElementById('masterScriptMeta');
        const ta = document.getElementById('masterScriptText');
        const copyBtn = document.getElementById('masterScriptCopyBtn');
        const saveBtn = document.getElementById('masterScriptSaveBtn');
        const regenBtn = document.getElementById('masterScriptRegenBtn');
        if (!meta || !ta || !copyBtn || !saveBtn || !regenBtn) return;

        if (this.masterScriptState.running) {
            meta.innerHTML = `<div class="ai-status analyzing"><span class="spinner"></span> Generating Master Script via local text AI…</div>`;
        } else if (this.masterScriptState.lastError) {
            meta.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(String(this.masterScriptState.lastError))}</div>`;
        } else if (this.masterScriptState.text) {
            const when = this.masterScriptState.updatedAt
                ? new Date(this.masterScriptState.updatedAt).toLocaleString()
                : 'just now';
            meta.innerHTML = `<div class="ai-status connected">✅ Updated: ${this.escapeHTML(when)}</div>`;
        } else {
            meta.innerHTML = `<div class="ai-status">No Master Script yet. Click Generate.</div>`;
        }

        ta.value = String(this.masterScriptState.text || '');

        const disabled = this.masterScriptState.running;
        [copyBtn, saveBtn, regenBtn].forEach((b) => {
            b.disabled = disabled;
            b.classList.toggle('opacity-50', disabled);
            b.classList.toggle('pointer-events-none', disabled);
        });
        copyBtn.disabled = disabled || !this.masterScriptState.text;
        saveBtn.disabled = disabled || !this.masterScriptState.text;
    },

    async generateOrUpdateMasterScript() {
        const runStatus = document.getElementById('aiRunStatus');
        if (runStatus) {
            runStatus.innerHTML = '<div class="ai-result"><span class="spinner"></span> Generating / updating Master Script (local text AI)…</div>';
        }

        this.masterScriptState.running = true;
        this.masterScriptState.lastError = null;
        this.openMasterScriptModal();

        try {
            const text = await AIService.generateMasterScript(this.storyData);
            this.masterScriptState.text = String(text || '').trim();
            this.masterScriptState.updatedAt = new Date().toISOString();
            this.masterScriptState.running = false;
            this.renderMasterScriptModal();
            if (runStatus) runStatus.innerHTML = '<div class="ai-status connected">✅ Master Script generated. Open the modal to copy or save.</div>';
        } catch (error) {
            this.masterScriptState.running = false;
            this.masterScriptState.lastError = error?.message || String(error);
            this.renderMasterScriptModal();
            if (runStatus) runStatus.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(this.masterScriptState.lastError)}</div>`;
        }
    },

    async copyMasterScriptToClipboard() {
        const status = document.getElementById('masterScriptCopyStatus');
        const text = String(this.masterScriptState.text || '').trim();
        try {
            await navigator.clipboard.writeText(text);
            if (status) status.innerHTML = '<div class="ai-status connected">✅ Copied.</div>';
        } catch (err) {
            if (status) status.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(err.message || String(err))}</div>`;
        }
    },

    saveMasterScriptAsMasterDocument() {
        const status = document.getElementById('masterScriptCopyStatus');
        const text = String(this.masterScriptState.text || '').trim();
        if (!text) return;

        const now = new Date().toISOString();
        if (!this.storyData.masterDocument || typeof this.storyData.masterDocument !== 'object') {
            this.storyData.masterDocument = { version: this.MASTER_DOC_VERSION, format: 'markdown', updatedAt: null, text: '' };
        }

        const header = `\n\n---\n\n## Master Script Snapshot (${new Date(now).toLocaleString()})\n\n`;
        const existing = String(this.storyData.masterDocument.text || '');
        this.storyData.masterDocument.text = `${existing}${header}${text}\n`;
        this.storyData.masterDocument.updatedAt = now;
        this.save();

        // If master document UI is mounted, refresh it.
        this.renderMasterDocument();

        if (status) status.innerHTML = '<div class="ai-status connected">✅ Appended to Master Document.</div>';
    },

    // ============ VOICE MEMO PROCESSOR (LOCAL TEXT AI) ============

    voiceMemoState: {
        running: false,
        raw: '',
        parsed: null
    },

    // ============ AI STORY TASKS & EXPANSION QUEUE ============

    expansionQueueUI: {
        filter: 'open',
        query: ''
    },

    ensureExpansionQueue() {
        if (!this.storyData.aiExpansionQueue || typeof this.storyData.aiExpansionQueue !== 'object') {
            this.storyData.aiExpansionQueue = { version: 1, items: [] };
        }
        if (!Array.isArray(this.storyData.aiExpansionQueue.items)) {
            this.storyData.aiExpansionQueue.items = [];
        }
    },

    setExpansionQueueFilter(f) {
        this.expansionQueueUI.filter = String(f || 'open').toLowerCase();
        this.renderAIExpansionQueue();
    },

    setExpansionQueueQuery(q) {
        this.expansionQueueUI.query = String(q || '').trim().toLowerCase();
        this.renderAIExpansionQueue();
    },

    clearExpansionQueueDismissed() {
        this.ensureExpansionQueue();
        const before = this.storyData.aiExpansionQueue.items.length;
        this.storyData.aiExpansionQueue.items = this.storyData.aiExpansionQueue.items.filter(i => i?.status !== 'dismissed');
        const after = this.storyData.aiExpansionQueue.items.length;
        StorageService.saveStoryData(this.storyData);
        this.renderAIExpansionQueue();
        const st = document.getElementById('aiQueueStatus');
        if (st) st.innerHTML = `<div class="ai-status connected">✅ Cleared ${before - after} dismissed item(s).</div>`;
    },

    normalizeQueuePriority(p) {
        const x = String(p || '').trim().toLowerCase();
        if (x.startsWith('h')) return 'High';
        if (x.startsWith('l')) return 'Low';
        return 'Medium';
    },

    addToExpansionQueue(tasks, source = 'LLM') {
        const list = Array.isArray(tasks) ? tasks : [];
        if (!list.length) return;
        this.ensureExpansionQueue();
        const now = new Date().toISOString();

        const norm = (s) => String(s || '').trim().toLowerCase();
        const existingKeys = new Set(this.storyData.aiExpansionQueue.items.map(i => norm(i.title)));

        list.forEach((t) => {
            const title = String(t?.title || '').trim();
            if (!title) return;
            const key = norm(title);
            if (existingKeys.has(key)) return;
            existingKeys.add(key);

            this.storyData.aiExpansionQueue.items.unshift({
                id: Date.now() + Math.floor(Math.random() * 10000),
                createdAt: now,
                status: 'open',
                title,
                source: String(t?.source || source),
                priority: this.normalizeQueuePriority(t?.priority || 'Medium'),
                description: String(t?.description || t?.details || '').trim(),
                actionHint: String(t?.actionHint || t?.actionTypeHint || '').trim().toLowerCase() || null
            });
        });

        // Keep queue bounded.
        this.storyData.aiExpansionQueue.items = this.storyData.aiExpansionQueue.items.slice(0, 120);
        StorageService.saveStoryData(this.storyData);
        this.renderAIExpansionQueue();
    },

    updateQueueItemStatus(id, status) {
        this.ensureExpansionQueue();
        const nid = Number(id);
        const item = this.storyData.aiExpansionQueue.items.find(i => Number(i?.id) === nid);
        if (!item) return;
        item.status = status;
        item.updatedAt = new Date().toISOString();
        StorageService.saveStoryData(this.storyData);
        this.renderAIExpansionQueue();
    },

    dismissQueueItem(id) { this.updateQueueItemStatus(id, 'dismissed'); },
    markQueueItemDone(id) { this.updateQueueItemStatus(id, 'done'); },

    expandQueueItemNow(id) {
        this.ensureExpansionQueue();
        const nid = Number(id);
        const item = this.storyData.aiExpansionQueue.items.find(i => Number(i?.id) === nid);
        if (!item) return;
        const ta = document.getElementById('voiceMemoText');
        this.openVoiceMemoModal();
        const seed = `Expand this task into concrete beats + work items:\n\nTitle: ${item.title}\nPriority: ${item.priority}\nSource: ${item.source}\n\nDetails:\n${item.description || ''}\n`;
        const memoTa = document.getElementById('voiceMemoText');
        if (memoTa) memoTa.value = seed;
    },

    addQueueItemAsWorkItem(id) {
        this.ensureExpansionQueue();
        const nid = Number(id);
        const item = this.storyData.aiExpansionQueue.items.find(i => Number(i?.id) === nid);
        if (!item) return;
        this.storyData.workItems = Array.isArray(this.storyData.workItems) ? this.storyData.workItems : [];
        this.storyData.workItems.push({
            id: Math.max(...this.storyData.workItems.map(w => w.id), 0) + 1,
            title: String(item.title).slice(0, 160),
            category: item.source === 'Tang Accuracy' ? 'Historical Research' : 'Story Integrity',
            completed: false,
            isCanon: false,
            tags: ['draft', 'ai-queue']
        });
        this.save();
        this.markQueueItemDone(id);
        this.switchTab('workitems');
    },

    addQueueItemToTimeline(id) {
        this.ensureExpansionQueue();
        const nid = Number(id);
        const item = this.storyData.aiExpansionQueue.items.find(i => Number(i?.id) === nid);
        if (!item) return;
        const nextId = Math.max(...(this.storyData.events || []).map(e => e.id), 0) + 1;
        const newEvent = createTimelineEvent({
            id: nextId,
            title: String(item.title).slice(0, 120),
            period: 'Draft',
            order: (this.storyData.events || []).length,
            beat: null,
            description: String(item.description || '').slice(0, 320),
            location: ''
        });
        this.storyData.events.push(newEvent);
        this.save();
        this.markQueueItemDone(id);
        this.focusTimelineEvent(nextId);
    },

    renderAIExpansionQueue() {
        const listEl = document.getElementById('aiQueueList');
        const statusEl = document.getElementById('aiQueueStatus');
        if (!listEl || !statusEl) return;

        this.ensureExpansionQueue();
        const items = [...this.storyData.aiExpansionQueue.items];

        const filter = String(this.expansionQueueUI.filter || 'open');
        const q = String(this.expansionQueueUI.query || '').trim().toLowerCase();

        const shown = items
            .filter((i) => {
                if (!i) return false;
                if (filter !== 'all' && String(i.status || 'open') !== filter) return false;
                if (!q) return true;
                const hay = `${i.title || ''}\n${i.description || ''}\n${i.source || ''}`.toLowerCase();
                return hay.includes(q);
            })
            .sort((a, b) => {
                const pr = (x) => x === 'High' ? 0 : x === 'Medium' ? 1 : 2;
                return pr(a.priority) - pr(b.priority) || (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0));
            });

        statusEl.innerHTML = `<div class="text-sm font-semibold text-zinc-500">Showing <span class="text-zinc-200">${shown.length}</span> of <span class="text-zinc-200">${items.length}</span> tasks.</div>`;

        if (shown.length === 0) {
            listEl.innerHTML = `<div class="rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-950/50 p-10 text-center text-sm text-zinc-500">No queue items yet. Run Integrity / Tang checks, or process a voice memo.</div>`;
            return;
        }

        const pill = (txt, cls) => `<span class="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${cls}">${this.escapeHTML(txt)}</span>`;

        listEl.innerHTML = `<div class="space-y-3">
            ${shown.map((i) => {
                const priCls = i.priority === 'High'
                    ? 'border-rose-400/30 bg-rose-400/10 text-rose-100'
                    : i.priority === 'Low'
                        ? 'border-zinc-500/25 bg-zinc-500/10 text-zinc-200'
                        : 'border-amber-400/30 bg-amber-400/10 text-amber-100';
                const srcCls = 'border-violet-500/25 bg-violet-500/10 text-violet-100';
                const statusCls = i.status === 'done'
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
                    : i.status === 'dismissed'
                        ? 'border-zinc-600/25 bg-zinc-600/10 text-zinc-200'
                        : 'border-violet-400/25 bg-violet-400/10 text-violet-100';

                return `
                <article class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-5 shadow-[0_18px_50px_-22px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-violet-500/[0.06]">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-2">
                                <div class="min-w-0 text-base font-black tracking-tight text-zinc-100">${this.escapeHTML(i.title || 'Untitled')}</div>
                                ${pill(i.priority || 'Medium', priCls)}
                                ${pill(i.source || 'LLM', srcCls)}
                                ${pill(i.status || 'open', statusCls)}
                            </div>
                            ${i.description ? `<div class="mt-2 text-sm leading-relaxed text-zinc-300">${this.escapeHTML(i.description)}</div>` : ''}
                        </div>
                    </div>
                    <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <button class="rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm ring-1 ring-inset ring-white/10 hover:bg-violet-500" onclick="App.addQueueItemToTimeline(${Number(i.id)})">Add to Timeline</button>
                        <button class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-extrabold text-emerald-100 hover:bg-emerald-500/15" onclick="App.addQueueItemAsWorkItem(${Number(i.id)})">Add as Work Item</button>
                        <button class="rounded-xl border border-zinc-600/90 bg-zinc-900/60 px-4 py-2.5 text-xs font-extrabold text-zinc-200 hover:bg-zinc-800/80" onclick="App.expandQueueItemNow(${Number(i.id)})">Expand Now</button>
                        <button class="rounded-xl border border-zinc-600/90 bg-zinc-950/40 px-4 py-2.5 text-xs font-extrabold text-zinc-200 hover:bg-zinc-900/60" onclick="App.markQueueItemDone(${Number(i.id)})">Mark Done</button>
                        <button class="rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-2.5 text-xs font-extrabold text-rose-100 hover:bg-rose-500/15" onclick="App.dismissQueueItem(${Number(i.id)})">Dismiss</button>
                    </div>
                </article>`;
            }).join('')}
        </div>`;
    },

    getOpenQueueItemsForSidebar(limit = 6) {
        this.ensureExpansionQueue();
        const items = [...this.storyData.aiExpansionQueue.items]
            .filter(i => i && (i.status || 'open') === 'open')
            .sort((a, b) => {
                const pr = (x) => x === 'High' ? 0 : x === 'Medium' ? 1 : 2;
                return pr(a.priority) - pr(b.priority) || (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0));
            });
        return items.slice(0, Math.max(1, Number(limit) || 6));
    },

    buildQueuePlainText(items) {
        const list = Array.isArray(items) ? items : [];
        const lines = [];
        list.forEach((i, idx) => {
            const pri = String(i?.priority || 'Medium');
            const src = String(i?.source || 'LLM');
            const title = String(i?.title || '').trim();
            if (!title) return;
            lines.push(`${idx + 1}. ${title} [${pri} • ${src}]`);
        });
        return lines.join('\n');
    },

    async copyAllQueueQuestions() {
        const items = this.getOpenQueueItemsForSidebar(20);
        const text = this.buildQueuePlainText(items);
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            // Silent fail; user can still copy from queue tab if needed.
        }
    },

    async copyQueueItem(id) {
        this.ensureExpansionQueue();
        const nid = Number(id);
        const item = this.storyData.aiExpansionQueue.items.find(i => Number(i?.id) === nid);
        if (!item) return;
        const text = this.buildQueuePlainText([item]);
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            // ignore
        }
    },

    renderQueueSidebarPanel() {
        const el = document.getElementById('aiQueueSidebarList');
        if (!el) return;
        const items = this.getOpenQueueItemsForSidebar(6);
        if (items.length === 0) {
            el.innerHTML = `<div class="rounded-xl border border-dashed border-zinc-800/70 bg-zinc-950/40 px-3 py-3 text-xs font-semibold text-zinc-500">No queued questions yet. Run Integrity / Tang, or process a voice memo.</div>`;
            return;
        }

        const priBadge = (p) => {
            const x = String(p || 'Medium');
            if (x === 'High') return `<span class="ml-2 inline-flex items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-extrabold text-rose-100">High</span>`;
            return `<span class="ml-2 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-extrabold text-amber-100">Med</span>`;
        };

        el.innerHTML = items.map((i, idx) => {
            const title = this.escapeHTML(String(i.title || '').trim());
            const src = this.escapeHTML(String(i.source || '').trim() || 'LLM');
            return `
                <div class="rounded-xl border border-zinc-800/80 bg-zinc-950/45 px-3 py-2.5">
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0 flex-1">
                            <div class="text-xs font-black leading-snug text-zinc-100">${idx + 1}. ${title}${priBadge(i.priority)}</div>
                            <div class="mt-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-violet-300/80">${src}</div>
                        </div>
                        <div class="flex shrink-0 items-center gap-1">
                            <button class="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-2 py-1 text-[10px] font-extrabold text-zinc-200 hover:bg-zinc-900/70" onclick="App.copyQueueItem(${Number(i.id)})">Copy</button>
                            <button class="rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-2 py-1 text-[10px] font-extrabold text-zinc-200 hover:bg-zinc-900/70" onclick="App.markQueueItemDone(${Number(i.id)})">Done</button>
                        </div>
                    </div>
                </div>`;
        }).join('');
    },

    openVoiceMemoModal() {
        document.getElementById('voiceMemoModal')?.classList.add('active');
        this.renderVoiceMemoModal();
        setTimeout(() => document.getElementById('voiceMemoText')?.focus(), 0);
    },

    closeVoiceMemoModal() {
        document.getElementById('voiceMemoModal')?.classList.remove('active');
    },

    getVoiceMemoIssuesContext() {
        const parts = [];

        const integ = this.integrityCheckState?.raw ? String(this.integrityCheckState.raw).trim() : '';
        if (integ) {
            parts.push('Latest Story Integrity Check (raw excerpt):');
            parts.push(integ.slice(0, 3000));
        }

        const tang = this.tangAccuracyState?.raw ? String(this.tangAccuracyState.raw).trim() : '';
        if (tang) {
            parts.push('');
            parts.push('Latest Tang Accuracy Check (raw excerpt):');
            parts.push(tang.slice(0, 3000));
        }

        // Also reference any saved reports of these types if present.
        const reports = Array.isArray(this.storyData?.aiReports) ? this.storyData.aiReports : [];
        const latestByType = (type) => reports.filter(r => r?.type === type).sort((a, b) => (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0)))[0];
        const savedInteg = latestByType('integrity');
        const savedTang = latestByType('tang-accuracy');
        if (!integ && savedInteg?.content) {
            parts.push('Saved Story Integrity report excerpt:');
            parts.push(String(savedInteg.content).slice(0, 3000));
        }
        if (!tang && savedTang?.content) {
            parts.push('Saved Tang Accuracy report excerpt:');
            parts.push(String(savedTang.content).slice(0, 3000));
        }

        return parts.filter(Boolean).join('\n');
    },

    renderVoiceMemoModal() {
        const meta = document.getElementById('voiceMemoMeta');
        const results = document.getElementById('voiceMemoResults');
        const applyRow = document.getElementById('voiceMemoApplyRow');
        const copyBtn = document.getElementById('voiceMemoCopyBtn');
        if (!meta || !results || !applyRow || !copyBtn) return;

        if (this.voiceMemoState.running) {
            meta.innerHTML = `<div class="ai-status analyzing"><span class="spinner"></span> Processing voice memo with local LLM…</div>`;
        } else if (this.voiceMemoState.raw) {
            meta.innerHTML = `<div class="ai-status connected">✅ Processed. Review + apply below.</div>`;
        } else {
            meta.innerHTML = `<div class="ai-status">Paste a transcription and click Process.</div>`;
        }

        const parsed = this.voiceMemoState.parsed;
        const raw = String(this.voiceMemoState.raw || '').trim();
        const esc = (x) => this.escapeHTML(String(x ?? ''));
        const safeArr = (x) => Array.isArray(x) ? x : [];

        copyBtn.disabled = this.voiceMemoState.running || !raw;
        copyBtn.classList.toggle('opacity-50', copyBtn.disabled);
        copyBtn.classList.toggle('pointer-events-none', copyBtn.disabled);

        if (!parsed) {
            results.innerHTML = raw
                ? `<pre class="whitespace-pre-wrap break-words rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-200">${esc(raw)}</pre>`
                : `<div class="rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-950/50 p-10 text-center text-sm text-zinc-500">No output yet.</div>`;
            applyRow.classList.add('hidden');
            return;
        }

        const insights = safeArr(parsed.keyInsights);
        const fixes = safeArr(parsed.fixesForFlaggedIssues);
        const actions = safeArr(parsed.suggestedActions);

        const block = (title, contentHtml) => `
            <section class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-5">
              <div class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500">${esc(title)}</div>
              <div class="mt-3">${contentHtml}</div>
            </section>`;

        const list = (arr) => arr.length
            ? `<ul class="space-y-2">${arr.map(t => `<li class="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200">${esc(t)}</li>`).join('')}</ul>`
            : `<div class="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3 text-xs font-semibold text-zinc-500">None.</div>`;

        const actionsHtml = actions.length
            ? `<div class="space-y-3">${actions.map((a) => `
                <div class="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4">
                  <div class="text-sm font-black tracking-tight text-zinc-100">${esc(a?.title || 'Suggestion')}</div>
                  <div class="mt-1 text-xs font-extrabold uppercase tracking-[0.14em] text-violet-300/90">${esc(a?.actionType || 'action')}</div>
                  <div class="mt-2 text-sm leading-relaxed text-zinc-300">${esc(a?.description || '')}</div>
                </div>`).join('')}</div>`
            : `<div class="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3 text-xs font-semibold text-zinc-500">No structured suggestedActions returned.</div>`;

        results.innerHTML = `
            <div class="space-y-4">
                ${block('Key Insights from the Memo', list(insights))}
                ${block('Suggested New/Updated Timeline Beats + Work Items', actionsHtml)}
                ${block('Any Fixes for Flagged Issues', list(fixes))}
                <details class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-5">
                  <summary class="cursor-pointer text-sm font-extrabold text-zinc-200 select-none">Raw JSON output</summary>
                  <pre class="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-200">${esc(raw)}</pre>
                </details>
            </div>
        `;

        applyRow.classList.toggle('hidden', actions.length === 0);
    },

    async processVoiceMemoWithLocalLLM() {
        const text = String(document.getElementById('voiceMemoText')?.value || '').trim();
        const refIssues = Boolean(document.getElementById('voiceMemoRefIssues')?.checked);
        const issuesContext = refIssues ? this.getVoiceMemoIssuesContext() : '';

        this.voiceMemoState.running = true;
        this.voiceMemoState.raw = '';
        this.voiceMemoState.parsed = null;
        this.renderVoiceMemoModal();

        try {
            const raw = await AIService.processVoiceMemo(this.storyData, text, { issuesContext });
            this.voiceMemoState.raw = raw;
            const parsed = this.parseAIJSON(raw);
            if (parsed?.queueTasks) {
                this.addToExpansionQueue(parsed.queueTasks, 'Voice Memo');
            }
            const actions = (Array.isArray(parsed?.suggestedActions) ? parsed.suggestedActions : [])
                .map((a) => ({
                    ...a,
                    isCanon: false,
                    tags: Array.isArray(a?.tags) ? Array.from(new Set([...(a.tags || []), 'draft', 'voice-memo'])) : ['draft', 'voice-memo']
                }));

            this.voiceMemoState.parsed = { ...parsed, suggestedActions: actions };
            this.voiceMemoState.running = false;
            this.renderVoiceMemoModal();

            // Save as AI report so existing "apply suggested actions" buttons can be reused.
            if (actions.length) {
                const content = [
                    '## Key Insights',
                    ...(Array.isArray(parsed?.keyInsights) ? parsed.keyInsights.map(x => `- ${x}`) : ['_None_']),
                    '',
                    '## Fixes for flagged issues',
                    ...(Array.isArray(parsed?.fixesForFlaggedIssues) ? parsed.fixesForFlaggedIssues.map(x => `- ${x}`) : ['_None_']),
                    '',
                    '## Suggested actions',
                    ...actions.map(a => `- **${a.title}** (${a.actionType}): ${a.description}`)
                ].join('\n');
                this.addAIReport('voice-memo', '🎙️ Voice memo processed', content, 'success', actions);
                this.suggestedActionsUI.selected = {};
                this.renderAISuggestedActions();
                this.renderAIReports();
                this.renderAIActionItems();
            }
        } catch (error) {
            this.voiceMemoState.running = false;
            this.voiceMemoState.raw = `Error: ${error.message}`;
            this.voiceMemoState.parsed = null;
            this.renderVoiceMemoModal();
        }
    },

    async copyVoiceMemoResult() {
        const status = document.getElementById('voiceMemoCopyStatus');
        const raw = String(this.voiceMemoState.raw || '').trim();
        try {
            await navigator.clipboard.writeText(raw);
            if (status) status.innerHTML = '<div class="ai-status connected">✅ Copied.</div>';
        } catch (err) {
            if (status) status.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(err.message || String(err))}</div>`;
        }
    },

    renderStoryWorldMapGallery() {
        const el = document.getElementById('storyWorldMapGallery');
        if (!el) return;
        this.ensureStoryWorldMapGallery();
        const items = [...this.storyData.storyWorldMapGallery.items].sort((a, b) => {
            const ta = new Date(a.createdAt || 0).getTime();
            const tb = new Date(b.createdAt || 0).getTime();
            return tb - ta;
        });
        if (items.length === 0) {
            el.innerHTML = `
                <div class="rounded-xl border border-dashed border-zinc-700/60 bg-zinc-950/40 px-4 py-10 text-center text-xs text-zinc-500">
                    No saved map images yet. Use <strong class="text-zinc-300">Upload image</strong>, <strong class="text-zinc-300">Add image URL</strong>, or <strong class="text-zinc-300">Fetch via image API</strong> above — results persist with your story.
                </div>`;
            return;
        }
        el.innerHTML = `
            <div class="story-world-map-gallery-grid grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                ${items.map((it) => {
            const url = this.escapeHTML(String(it.imageUrl || ''));
            const when = it.createdAt ? this.escapeHTML(new Date(it.createdAt).toLocaleString()) : '';
            const id = Number(it.id);
            return `
                    <figure class="m-0 overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950/60 ring-1 ring-inset ring-violet-500/10">
                        <a href="${url}" target="_blank" rel="noopener noreferrer" class="block">
                            <img src="${url}" alt="Saved world map" class="h-32 w-full object-cover sm:h-36" loading="lazy" />
                        </a>
                        <figcaption class="border-t border-zinc-800/90 px-2 py-1.5 text-[10px] font-semibold text-zinc-500">${when}</figcaption>
                    </figure>`;
        }).join('')}
            </div>`;
    },

    openStoryWorldMapGalleryUpload() {
        const input = document.getElementById('storyWorldMapGalleryUploadInput');
        if (input) input.click();
    },

    onStoryWorldMapGalleryFileSelected(file) {
        const status = document.getElementById('storyWorldMapAiStatus');
        const panel = document.getElementById('storyWorldMapAiPanel');
        try {
            if (!file) return;
            if (!String(file.type || '').startsWith('image/')) {
                throw new Error('Please choose an image file (PNG/JPG/WebP).');
            }
            if (file.size > 8 * 1024 * 1024) {
                throw new Error('Image is too large. Please use a file under 8MB.');
            }
            const reader = new FileReader();
            reader.onload = () => {
                const url = String(reader.result || '').trim();
                if (!url) {
                    if (status) status.innerHTML = '<div class="ai-status disconnected">❌ Could not read image.</div>';
                    return;
                }
                const prompt = String(document.getElementById('storyWorldMapGrokModalPrompt')?.value || '').trim();
                this.ensureStoryWorldMapGallery();
                this.storyData.storyWorldMapGallery.items.unshift({
                    id: Date.now(),
                    createdAt: new Date().toISOString(),
                    imageUrl: url,
                    source: 'upload',
                    prompt
                });
                // Make the uploaded image the current atlas background.
                this.storyData.storyWorldMapGallery.activeImageUrl = url;
                this.storyData.storyWorldMapGallery.items = this.storyData.storyWorldMapGallery.items.slice(0, 36);
                this.save();
                this.renderStoryWorldMapGallery();
                this.applyActiveStoryWorldMapBackground();
                this.renderGhostBorderInteractiveMap();
                if (panel) {
                    panel.classList.remove('hidden');
                    panel.innerHTML = `
                        <div class="mb-3 text-xs font-extrabold uppercase tracking-wide text-violet-300/90">Latest realm map</div>
                        <img src="${this.escapeHTML(url)}" alt="Uploaded story world map" loading="lazy" />
                        <p class="mt-3 text-xs leading-relaxed text-zinc-500">Saved to your story gallery below.</p>`;
                }
                if (status) status.innerHTML = '<div class="ai-status connected">✅ Map image saved to Realm Atlas gallery.</div>';
            };
            reader.onerror = () => {
                if (status) status.innerHTML = '<div class="ai-status disconnected">❌ Could not read image.</div>';
            };
            reader.readAsDataURL(file);
        } catch (err) {
            if (status) status.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(err.message || String(err))}</div>`;
        }
    },

    addStoryWorldMapGalleryByUrl() {
        const status = document.getElementById('storyWorldMapAiStatus');
        const panel = document.getElementById('storyWorldMapAiPanel');
        try {
            const raw = prompt('Paste an image URL (https://...) or a data:image/... URL:');
            const url = String(raw || '').trim();
            if (!url) return;
            const ok = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/');
            if (!ok) throw new Error('URL must start with http(s):// or data:image/.');
            const promptText = String(document.getElementById('storyWorldMapGrokModalPrompt')?.value || '').trim();
            this.ensureStoryWorldMapGallery();
            this.storyData.storyWorldMapGallery.items.unshift({
                id: Date.now(),
                createdAt: new Date().toISOString(),
                imageUrl: url,
                source: 'url',
                prompt: promptText
            });
            this.storyData.storyWorldMapGallery.activeImageUrl = url;
            this.storyData.storyWorldMapGallery.items = this.storyData.storyWorldMapGallery.items.slice(0, 36);
            this.save();
            this.renderStoryWorldMapGallery();
            this.applyActiveStoryWorldMapBackground();
            this.renderGhostBorderInteractiveMap();
            if (panel) {
                panel.classList.remove('hidden');
                panel.innerHTML = `
                    <div class="mb-3 text-xs font-extrabold uppercase tracking-wide text-violet-300/90">Latest realm map</div>
                    <img src="${this.escapeHTML(url)}" alt="Saved story world map" loading="lazy" />
                    <p class="mt-3 text-xs leading-relaxed text-zinc-500">Saved to your story gallery below.</p>`;
            }
            if (status) status.innerHTML = '<div class="ai-status connected">✅ Map image saved to Realm Atlas gallery.</div>';
        } catch (err) {
            if (status) status.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(err.message || String(err))}</div>`;
        }
    },

    async copyStoryWorldMapGrokPrompt() {
        this.syncStoryWorldMapGrokPromptUI();
        const text = this.buildStoryWorldMapGrokPrompt();
        const status = document.getElementById('storyWorldMapAiStatus');
        try {
            await navigator.clipboard.writeText(text);
            if (status) {
                status.innerHTML = '<div class="ai-status connected">✅ Prompt copied for Grok Imagine.</div>';
            }
        } catch (err) {
            try {
                const ta = document.getElementById('storyWorldMapGrokModalPrompt');
                if (ta) {
                    ta.value = text;
                    ta.focus();
                    ta.select();
                    document.execCommand('copy');
                }
                if (status) {
                    status.innerHTML = '<div class="ai-status connected">✅ Prompt copied (browser fallback).</div>';
                }
            } catch (err2) {
                if (status) {
                    status.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(err2.message || err.message || 'Could not copy')}</div>`;
                }
            }
        }
    },

    /**
     * Build HTML for Story Locations Overview (Visualizer + Dashboard after Story Momentum).
     */
    buildStoryLocationsOverviewHTML() {
        const events = [...(Array.isArray(this.storyData.events) ? this.storyData.events : [])];
        const total = events.length;

        if (total === 0) {
            return `
                <div class="rounded-2xl border border-dashed border-zinc-700/80 bg-zinc-950/60 px-8 py-16 text-center shadow-inner shadow-black/20">
                    <p class="m-0 text-base font-semibold text-zinc-300">No timeline events yet</p>
                    <p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-500">Add beats on the <strong class="text-zinc-200">Timeline</strong> tab. They will show up here grouped by location.</p>
                    <button type="button" class="mt-8 rounded-xl bg-violet-600 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500" onclick="App.switchTab('timeline')">Go to Timeline</button>
                </div>`;
        }

        const hasAnyLocation = events.some((e) => String(e.location || '').trim());
        if (!hasAnyLocation) {
            return `
                <div class="rounded-2xl border border-dashed border-violet-500/25 bg-zinc-950/70 px-8 py-16 text-center shadow-inner shadow-violet-950/20">
                    <p class="m-0 text-base font-semibold text-zinc-200">No locations set yet</p>
                    <p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-500">You have <strong class="text-zinc-300">${total}</strong> timeline event(s) without a place. Open each event on the <strong class="text-zinc-300">Timeline</strong> tab and pick a location (or a custom one).</p>
                    <button type="button" class="mt-8 rounded-xl bg-violet-600 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500" onclick="App.switchTab('timeline')">Set locations on Timeline</button>
                </div>`;
        }

        const byLoc = new Map();
        events.forEach((e) => {
            const raw = String(e.location || '').trim();
            const key = raw || '__none__';
            if (!byLoc.has(key)) byLoc.set(key, []);
            byLoc.get(key).push(e);
        });

        const groups = [...byLoc.entries()].map(([key, evs]) => {
            const sorted = [...evs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const minOrder = sorted.length ? Math.min(...sorted.map((x) => x.order ?? 0)) : 0;
            const label = key === '__none__' ? 'Unspecified location' : key;
            const canonCount = sorted.filter((e) => e.isCanon).length;
            return { key, label, events: sorted, minOrder, count: sorted.length, canonCount };
        });
        groups.sort((a, b) => a.minOrder - b.minOrder || a.label.localeCompare(b.label));

        const sharePct = (n) => Math.round((n / total) * 100);

        const cards = groups.map((g) => {
            const pct = sharePct(g.count);
            const widthPct = Math.min(100, Math.max(0, (g.count / total) * 100));
            const canonBadge = g.canonCount > 0
                ? `<span class="inline-flex shrink-0 items-center rounded-full border border-amber-400/45 bg-amber-400/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber-200/95">${g.canonCount} canon</span>`
                : '';

            const beats = g.events.map((e) => {
                const nid = Number(e.id);
                const b = e.beat != null && e.beat !== '' ? String(e.beat) : '';
                const title = this.escapeHTML(String(e.title || 'Untitled'));
                const lineLabel = b ? `Beat ${this.escapeHTML(b)} — ${title}` : `No beat — ${title}`;
                const draftHint = e.isCanon
                    ? ''
                    : '<span class="ml-2 text-[10px] font-bold uppercase tracking-wide text-violet-400/80">Draft</span>';
                return `
                    <li class="m-0 list-none">
                        <button type="button"
                            class="group flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-left text-sm text-zinc-200 ring-1 ring-inset ring-white/[0.02] transition hover:border-violet-500/40 hover:bg-violet-500/[0.08] hover:shadow-[0_0_24px_-8px_rgba(139,92,246,0.35)]"
                            onclick="App.focusTimelineEvent(${nid})">
                            <span class="min-w-0 flex-1 font-medium leading-snug tracking-tight text-zinc-100">${lineLabel}${draftHint}</span>
                            <span class="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-violet-400/0 transition group-hover:text-violet-300">Open →</span>
                        </button>
                    </li>`;
            }).join('');

            return `
                <article class="flex min-h-0 flex-col rounded-2xl border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-violet-500/[0.06]">
                    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/80 pb-5">
                        <div class="min-w-0 flex-1">
                            <h3 class="m-0 font-serif text-2xl font-normal leading-tight tracking-wide text-zinc-50 sm:text-[1.65rem]">${this.escapeHTML(g.label)}</h3>
                            <p class="mt-2 text-sm font-semibold text-violet-300/90">${g.count} event${g.count === 1 ? '' : 's'} here</p>
                        </div>
                        ${canonBadge}
                    </div>
                    <div class="mt-5">
                        <div class="flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">
                            <span>Story share</span>
                            <span class="text-violet-400/90">${pct}%</span>
                        </div>
                        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow="${g.count}" aria-valuemin="0" aria-valuemax="${total}" aria-label="Share of timeline at this location">
                            <div class="h-full min-w-[4px] rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-400" style="width: ${widthPct}%"></div>
                        </div>
                    </div>
                    <ul class="m-0 mt-6 flex flex-1 flex-col gap-2 p-0">${beats}</ul>
                </article>`;
        }).join('');

        return `<div class="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">${cards}</div>`;
    },

    /**
     * Dashboard (after Story Momentum) + Visualizer: location cards; updates whenever `render()` or `updateDashboard()` runs.
     */
    renderStoryLocationsOverview() {
        const html = this.buildStoryLocationsOverviewHTML();
        ['storyLocationsOverview', 'storyLocationsOverviewDashboard'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        });
    },

    /**
     * Redraw the SVG story world map from current timeline events.
     */
    renderStoryWorldMap() {
        try {
        const mount = document.getElementById('storyWorldMapMount');
        if (!mount) {
            this.syncStoryWorldMapGrokPromptUI();
            this.renderStoryWorldMapGallery();
            this.applyActiveStoryWorldMapBackground();
            return;
        }

        const events = [...(Array.isArray(this.storyData.events) ? this.storyData.events : [])]
            .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));

        if (events.length === 0) {
            mount.innerHTML = `
                <div class="rounded-xl border border-dashed border-zinc-700/90 bg-zinc-950/70 px-6 py-14 text-center text-sm text-zinc-500">
                    No timeline events yet. Add beats on the <strong class="text-zinc-300">Timeline</strong> tab — pins appear here by location and story order.
                </div>`;
            this.syncStoryWorldMapGrokPromptUI();
            this.renderStoryWorldMapGallery();
            return;
        }

        const LOCATION_BASE = this.STORY_WORLD_MAP_BASE;
        const hashLoc = (str) => {
            let h = 0;
            const s = String(str || '');
            for (let i = 0; i < s.length; i += 1) {
                h = ((h << 5) - h) + s.charCodeAt(i) | 0;
            }
            return Math.abs(h);
        };
        const coordKey = (xy) => `${Math.round(xy[0])}|${Math.round(xy[1])}`;
        const stackCounts = new Map();

        const placements = events.map((ev) => {
            const loc = String(ev.location || '').trim();
            let base = LOCATION_BASE[loc];
            if (!base) {
                const h = hashLoc(loc || `ev-${ev.id}`);
                base = [340 + (h % 320), 230 + ((h >> 4) % 180)];
            }
            const k = coordKey(base);
            const n = stackCounts.get(k) || 0;
            stackCounts.set(k, n + 1);
            const ang = ((n * 48) - 90) * Math.PI / 180;
            const rad = 12 + n * 20;
            const x = Math.round(base[0] + Math.cos(ang) * rad);
            const y = Math.round(base[1] + Math.sin(ang) * rad);
            return { ev, x, y };
        });

        const routeD = placements.length >= 2
            ? placements.map((p, j) => `${j === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
            : '';

        /** Top-down symbolic anchors (palace, garden, market, portal, modern district). */
        const regionIconsSvg = `
  <g class="story-map-region-icons" pointer-events="none" opacity="0.9">
    <g transform="translate(502,198)" aria-label="Palace">
      <rect x="-52" y="-32" width="104" height="78" rx="5" fill="rgba(24,24,27,0.58)" stroke="rgba(251,191,36,0.42)" stroke-width="1.5"/>
      <rect x="-34" y="-14" width="68" height="44" rx="2" fill="none" stroke="rgba(113,113,122,0.45)" stroke-width="0.9"/>
      <line x1="0" y1="-14" x2="0" y2="30" stroke="rgba(113,113,122,0.35)" stroke-width="0.8"/>
      <polygon points="0,-54 -46,-32 46,-32" fill="rgba(79,70,229,0.48)" stroke="rgba(196,181,253,0.55)" stroke-width="1.2"/>
      <rect x="-8" y="-46" width="16" height="10" rx="1" fill="rgba(251,191,36,0.25)"/>
    </g>
    <g transform="translate(738,276)" aria-label="Garden">
      <ellipse cx="0" cy="0" rx="56" ry="44" fill="rgba(46,16,101,0.2)" stroke="rgba(139,92,246,0.42)" stroke-width="1.3"/>
      <ellipse cx="6" cy="-10" rx="18" ry="10" fill="rgba(59,130,246,0.22)" stroke="rgba(96,165,250,0.4)" stroke-width="1"/>
      <circle cx="-24" cy="-6" r="11" fill="rgba(34,197,94,0.16)" stroke="rgba(74,222,128,0.38)" stroke-width="1"/>
      <circle cx="22" cy="8" r="13" fill="rgba(34,197,94,0.14)" stroke="rgba(74,222,128,0.32)" stroke-width="1"/>
      <circle cx="-6" cy="22" r="10" fill="rgba(34,197,94,0.18)" stroke="rgba(74,222,128,0.36)" stroke-width="1"/>
      <path d="M-12,-28 L-4,-36 L4,-28 L12,-36" fill="none" stroke="rgba(167,139,250,0.35)" stroke-width="1.2" stroke-linecap="round"/>
    </g>
    <g transform="translate(498,432)" aria-label="Market">
      <rect x="-76" y="-40" width="152" height="80" rx="12" fill="rgba(24,24,27,0.55)" stroke="rgba(251,191,36,0.26)" stroke-width="1.3"/>
      <g stroke="rgba(113,113,122,0.4)" stroke-width="0.75">
        ${[-48, -16, 16, 48].map((dx) => `<line x1="${dx}" y1="-28" x2="${dx}" y2="28"/>`).join('')}
        ${[-20, 4, 28].map((dy) => `<line x1="-60" y1="${dy}" x2="60" y2="${dy}"/>`).join('')}
      </g>
      <rect x="-68" y="-34" width="18" height="10" rx="2" fill="rgba(251,191,36,0.15)"/>
      <rect x="8" y="8" width="20" height="10" rx="2" fill="rgba(251,191,36,0.12)"/>
      <rect x="-36" y="12" width="16" height="10" rx="2" fill="rgba(251,191,36,0.14)"/>
    </g>
    <g transform="translate(218,312)" aria-label="Portal">
      <circle r="40" fill="none" stroke="rgba(167,139,250,0.5)" stroke-width="2" stroke-dasharray="7 6"/>
      <circle r="26" fill="rgba(99,102,241,0.14)" stroke="rgba(196,181,253,0.35)" stroke-width="1.2"/>
      <path d="M-18,0 A18,18 0 1,1 18,0 A18,18 0 1,1 -18,0" fill="none" stroke="rgba(167,139,250,0.45)" stroke-width="1.5"/>
    </g>
    <g transform="translate(148,528)" aria-label="Modern district">
      <rect x="-44" y="-28" width="88" height="56" rx="4" fill="rgba(39,39,42,0.45)" stroke="rgba(148,163,184,0.35)" stroke-width="1"/>
      <g fill="rgba(148,163,184,0.25)">
        <rect x="-36" y="-20" width="10" height="18"/><rect x="-22" y="-12" width="10" height="26"/><rect x="-8" y="-20" width="10" height="20"/>
        <rect x="6" y="-16" width="10" height="30"/><rect x="20" y="-22" width="10" height="22"/><rect x="34" y="-14" width="8" height="24"/>
      </g>
    </g>
  </g>`;

        const pinsSvg = placements.map(({ ev, x, y }) => {
            const beat = ev.beat != null && ev.beat !== '' ? String(ev.beat) : '—';
            const count = Array.isArray(ev.involvedCharacterIds) ? ev.involvedCharacterIds.length : 0;
            const title = this.escapeHTML(String(ev.title || 'Event'));
            const nid = Number(ev.id);
            return `
            <g class="story-map-pin" transform="translate(${x},${y})" onclick="App.focusTimelineEvent(${nid})" role="button" tabindex="0"
               onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.focusTimelineEvent(${nid});}">
                <title>${title}</title>
                <circle r="28" fill="rgba(251,191,36,0.14)" filter="url(#storyMapPinHalo)"/>
                <circle r="22" fill="#0f0d14" stroke="#fbbf24" stroke-width="2.5"/>
                <text text-anchor="middle" y="6" fill="#fde68a" font-size="14" font-family="system-ui, -apple-system, sans-serif" font-weight="800">${this.escapeHTML(beat)}</text>
                <text text-anchor="middle" y="34" fill="#c4b5fd" font-size="10" font-family="system-ui, -apple-system, sans-serif" font-weight="700">${count}</text>
            </g>`;
        }).join('');

        mount.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet" aria-label="Story world map">
  <defs>
    <linearGradient id="swmParchment" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#15121f"/>
      <stop offset="50%" stop-color="#0b090f"/>
      <stop offset="100%" stop-color="#110f18"/>
    </linearGradient>
    <linearGradient id="swmRiver" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(79,70,229,0.15)"/>
      <stop offset="50%" stop-color="rgba(139,92,246,0.35)"/>
      <stop offset="100%" stop-color="rgba(67,56,202,0.2)"/>
    </linearGradient>
    <filter id="storyMapRouteGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="storyMapPinHalo" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="5" result="g"/>
      <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1000" height="640" fill="url(#swmParchment)"/>
  <g opacity="0.9">
    <path d="M -30 130 C 200 90 320 210 460 235 S 640 275 800 315 S 1040 380 1060 480" fill="none" stroke="url(#swmRiver)" stroke-width="22" stroke-linecap="round"/>
    <path d="M -30 130 C 200 90 320 210 460 235 S 640 275 800 315 S 1040 380 1060 480" fill="none" stroke="rgba(196,181,253,0.25)" stroke-width="7"/>
  </g>
  <path d="M70 420 L115 310 L165 395 L210 285 L255 430 Z" fill="rgba(39,39,42,0.55)" stroke="rgba(82,82,91,0.6)" stroke-width="1.2"/>
  <path d="M805 165 L855 75 L905 135 L955 95 L1005 215 L850 195 Z" fill="rgba(30,27,38,0.65)" stroke="rgba(113,113,122,0.5)" stroke-width="1.2"/>
  <path d="M600 80 L640 40 L700 55 L720 100 L680 130 L620 115 Z" fill="rgba(39,39,42,0.4)" stroke="rgba(82,82,91,0.45)" stroke-width="1"/>
  ${regionIconsSvg}
  ${routeD ? `<path d="${routeD}" fill="none" stroke="rgba(167,139,250,0.95)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" filter="url(#storyMapRouteGlow)" opacity="0.92"/>
  <path d="${routeD}" fill="none" stroke="rgba(196,181,253,0.35)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>` : ''}
  ${pinsSvg}
</svg>`;
        this.syncStoryWorldMapGrokPromptUI();
        this.renderStoryWorldMapGallery();
        this.applyActiveStoryWorldMapBackground();
        } finally {
            this.renderGhostBorderInteractiveMap();
        }
    },

    // ============ RELATIONSHIP NETWORK GRAPH ============

    relationshipGraphState: {
        nodes: [],
        links: [],
        positions: new Map(),
        hoveredId: null,
        filter: 'all',
        searchQuery: '',
        draggingId: null,
        dragMoved: false,
        simRunning: false,
        simFrame: null,
        seed: 1
    },

    ensureRelationshipStore() {
        this.storyData.relationships = Array.isArray(this.storyData.relationships) ? this.storyData.relationships : [];
        this.storyData.relationshipGraphLayout = (this.storyData.relationshipGraphLayout && typeof this.storyData.relationshipGraphLayout === 'object')
            ? this.storyData.relationshipGraphLayout
            : { version: 1, positions: {} };
        if (!this.storyData.relationshipGraphLayout.positions || typeof this.storyData.relationshipGraphLayout.positions !== 'object') {
            this.storyData.relationshipGraphLayout.positions = {};
        }

        const chars = Array.isArray(this.storyData?.characters) ? this.storyData.characters : [];
        const byName = new Map(chars.map((c) => [String(c.name || '').trim().toLowerCase(), c]));
        let changed = false;

        this.storyData.relationships.forEach((r) => {
            if (r == null || typeof r !== 'object') return;
            if (r.id == null) { r.id = Date.now() + Math.floor(Math.random() * 10000); changed = true; }
            if (r.strength == null || !Number.isFinite(Number(r.strength))) { r.strength = 3; changed = true; }
            if (r.secret == null) { r.secret = false; changed = true; }
            if (!r.label) { r.label = r.type || 'other'; changed = true; }
            if (!r.type) { r.type = 'other'; changed = true; }
            if (r.fromId == null && r.from) {
                const c = byName.get(String(r.from).trim().toLowerCase());
                if (c) { r.fromId = c.id; changed = true; }
            }
            if (r.toId == null && r.to) {
                const c = byName.get(String(r.to).trim().toLowerCase());
                if (c) { r.toId = c.id; changed = true; }
            }
        });

        // Load persisted positions into working map.
        const posObj = this.storyData.relationshipGraphLayout.positions;
        if (posObj && typeof posObj === 'object' && this.relationshipGraphState.positions.size === 0) {
            Object.entries(posObj).forEach(([k, v]) => {
                const id = Number(k);
                if (!Number.isFinite(id) || !v) return;
                const x = Number(v.x), y = Number(v.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return;
                this.relationshipGraphState.positions.set(id, { x, y, vx: 0, vy: 0 });
            });
        }

        if (changed) StorageService.saveStoryData(this.storyData);
    },

    setRelationshipGraphFilter(filter) {
        this.relationshipGraphState.filter = String(filter || 'all').toLowerCase();
        this.renderRelationshipNetworkGraph({ forceRestart: false });
    },

    setRelationshipGraphQuery(q) {
        this.relationshipGraphState.searchQuery = String(q || '').trim().toLowerCase();
        this.renderRelationshipNetworkGraph({ forceRestart: false });
    },

    autoLayoutRelationshipNetwork() {
        // Keep relationships but clear positions so the simulation can settle.
        this.storyData.relationshipGraphLayout = this.storyData.relationshipGraphLayout || { version: 1, positions: {} };
        this.storyData.relationshipGraphLayout.positions = {};
        this.relationshipGraphState.positions = new Map();
        StorageService.saveStoryData(this.storyData);
        this.renderRelationshipNetworkGraph({ forceRestart: true });
    },

    resetRelationshipNetworkPositions() {
        const ok = confirm('Reset relationship graph positions? (Your manual layout will be cleared.)');
        if (!ok) return;
        this.autoLayoutRelationshipNetwork();
    },

    stopRelationshipGraphSim() {
        if (this.relationshipGraphState.simFrame) {
            cancelAnimationFrame(this.relationshipGraphState.simFrame);
            this.relationshipGraphState.simFrame = null;
        }
        this.relationshipGraphState.simRunning = false;
    },

    refreshRelationshipNetworkGraph() {
        this.relationshipGraphState.seed = (this.relationshipGraphState.seed || 1) + 1;
        this.relationshipGraphState.positions = new Map();
        this.stopRelationshipGraphSim();
        this.renderRelationshipNetworkGraph({ forceRestart: true });
    },

    refreshCharacterArcTracker() {
        this.renderCharacterArcTracker({ force: true });
    },

    inferArcStageText(char) {
        const notes = String(char?.notes || '');
        const background = String(char?.background || '');
        const personality = String(char?.personality || '');
        const hay = `${notes}\n${background}\n${personality}`;
        const m = hay.match(/(?:^|\n)\s*(?:Arc(?:\s*stage)?|Current\s*arc)\s*[:\-]\s*(.+)\s*$/im);
        if (m && m[1]) return String(m[1]).trim();

        // Heuristic fallbacks.
        if (/survivor|massacre|wronged|exile/i.test(hay)) return 'Disillusioned Survivor → Strategic Reformer';
        if (/investigator|truth|justice/i.test(hay)) return 'Idealist Investigator → Relentless Truth-Seeker';
        if (/guard|commander|soldier|veteran/i.test(hay)) return 'Duty-Bound Protector → Principle-Driven Leader';
        if (/consort|palace|court/i.test(hay)) return 'Caged Court Player → Calculating Power Broker';
        return 'Arc evolving → (add “Arc:” line in character notes for precision)';
    },

    inferArcShiftText(char, appearances = []) {
        const notes = String(char?.notes || '');
        const m = notes.match(/(?:^|\n)\s*(?:Shift|Motivation|Key\s*(?:shift|turn))\s*[:\-]\s*(.+)\s*$/im);
        if (m && m[1]) return String(m[1]).trim();

        const last = appearances.length ? appearances[appearances.length - 1] : null;
        if (last?.title) {
            return `After “${String(last.title).trim()}”: pressure reveals true priorities.`;
        }
        return 'Motivation shift: (add “Shift:” line in notes to track this explicitly)';
    },

    renderCharacterArcTracker({ force = false } = {}) {
        const root = document.getElementById('characterArcTracker');
        if (!root) return;

        const characters = Array.isArray(this.storyData?.characters) ? this.storyData.characters : [];
        const events = [...(Array.isArray(this.storyData?.events) ? this.storyData.events : [])]
            .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0) || (Number(a?.id) || 0) - (Number(b?.id) || 0));

        if (!characters.length) {
            root.innerHTML = `
                <div class="rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-950/50 p-10 text-center text-sm text-zinc-500">
                    No characters yet. Add characters to see arc progress.
                </div>`;
            return;
        }

        const byId = new Map(characters.map((c) => [Number(c.id), c]));
        const appearancesByChar = new Map();
        characters.forEach((c) => appearancesByChar.set(Number(c.id), []));

        events.forEach((ev) => {
            const involved = Array.isArray(ev?.involvedCharacterIds) ? ev.involvedCharacterIds : [];
            involved.forEach((cid) => {
                const id = Number(cid);
                if (!appearancesByChar.has(id)) appearancesByChar.set(id, []);
                appearancesByChar.get(id).push({
                    id: Number(ev.id),
                    order: ev.order ?? 0,
                    beat: ev.beat != null && ev.beat !== '' ? String(ev.beat) : '',
                    title: String(ev.title || 'Untitled'),
                    location: String(ev.location || ''),
                    isCanon: Boolean(ev.isCanon)
                });
            });
        });

        // Sort canon first, then by involvement count.
        const sortedChars = [...characters].sort((a, b) => {
            const ac = Boolean(a.isCanon), bc = Boolean(b.isCanon);
            if (ac !== bc) return ac ? -1 : 1;
            const aa = (appearancesByChar.get(Number(a.id)) || []).length;
            const bb = (appearancesByChar.get(Number(b.id)) || []).length;
            return bb - aa || String(a.name || '').localeCompare(String(b.name || ''));
        });

        const typeColors = (type) => {
            const t = String(type || 'gray').toLowerCase();
            if (t === 'friendly') return { ring: 'border-emerald-400/25 bg-emerald-400/10', accent: 'text-emerald-200', dot: 'bg-emerald-400' };
            if (t === 'antagonist') return { ring: 'border-rose-400/25 bg-rose-400/10', accent: 'text-rose-200', dot: 'bg-rose-400' };
            return { ring: 'border-zinc-400/25 bg-zinc-400/10', accent: 'text-zinc-200', dot: 'bg-zinc-300' };
        };

        const beatSlots = ['1','2','3','4','5','6','7','8'];
        const beatLabel = (b) => b ? `Beat ${b}` : '—';

        const cards = sortedChars.map((c) => {
            const id = Number(c.id);
            const name = this.escapeHTML(String(c.name || 'Unknown'));
            const role = String(c.role || '').trim();
            const ini = this.escapeHTML((String(c.name || '?').trim()[0] || '?').toUpperCase());
            const colors = typeColors(c.type);
            const appearances = appearancesByChar.get(id) || [];
            const last = appearances.length ? appearances[appearances.length - 1] : null;
            const recentIds = new Set(appearances.slice(-3).map(a => a.id));

            const stage = this.escapeHTML(this.inferArcStageText(c));
            const shift = this.escapeHTML(this.inferArcShiftText(c, appearances));

            const beatPresence = new Set(appearances.map((a) => String(a.beat || '').trim()).filter(Boolean));
            const bar = `
                <div class="mt-3">
                    <div class="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">
                        <span>Beat presence</span>
                        <span class="text-violet-300/90">${appearances.length} scene${appearances.length === 1 ? '' : 's'}</span>
                    </div>
                    <div class="mt-2 grid grid-cols-8 gap-1.5">
                        ${beatSlots.map((b) => {
                            const on = beatPresence.has(b);
                            const cls = on
                                ? 'bg-violet-500/70 border-violet-400/50 shadow-[0_0_14px_rgba(139,92,246,0.35)]'
                                : 'bg-zinc-900/70 border-zinc-800/80';
                            return `<div class="h-2 rounded-full border ${cls}" title="${this.escapeHTML(beatLabel(b))}"></div>`;
                        }).join('')}
                    </div>
                </div>`;

            const chips = appearances.length
                ? `<div class="mt-4 flex flex-wrap gap-2 border-t border-zinc-800/80 pt-4">
                    ${appearances.map((a) => {
                        const isRecent = recentIds.has(a.id);
                        const chipCls = isRecent
                            ? 'border-violet-400/45 bg-violet-500/15 text-violet-100 shadow-[0_0_18px_rgba(139,92,246,0.22)]'
                            : 'border-zinc-700/80 bg-zinc-950/40 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900/60';
                        const label = a.beat ? `B${this.escapeHTML(a.beat)}` : '—';
                        const tip = `${a.title}${a.location ? ` @ ${a.location}` : ''}`;
                        return `<button type="button" class="rounded-full border px-3 py-1 text-[11px] font-extrabold ${chipCls}"
                            onclick="App.focusTimelineEvent(${Number(a.id)})"
                            title="${this.escapeHTML(tip)}">${label}</button>`;
                    }).join('')}
                </div>`
                : `<div class="mt-4 rounded-xl border border-dashed border-zinc-800/70 bg-zinc-950/40 px-4 py-3 text-xs font-semibold text-zinc-500">No timeline appearances linked yet. Add this character to events in Timeline.</div>`;

            const canonBadge = c.isCanon
                ? `<span class="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-400/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber-200">Canon</span>`
                : `<span class="inline-flex items-center rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-violet-200/80">Draft</span>`;

            const lastLine = last
                ? `<div class="mt-2 text-xs font-semibold text-zinc-400">Latest: <span class="text-zinc-200">${this.escapeHTML(last.title)}</span> ${last.beat ? `<span class="ml-2 inline-flex items-center rounded-full border border-violet-400/35 bg-violet-500/10 px-2 py-0.5 text-[10px] font-extrabold text-violet-100">Beat ${this.escapeHTML(last.beat)}</span>` : ''}</div>`
                : '';

            return `
                <article class="rounded-2xl border border-zinc-800/90 bg-zinc-950/55 p-5 shadow-[0_18px_50px_-22px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-violet-500/[0.06]">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex min-w-0 flex-1 items-start gap-3">
                            <button type="button" class="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${colors.ring} font-black ${colors.accent}"
                                onclick="App.openCharacterEditor(${id})" title="Open character">
                                ${ini}
                            </button>
                            <div class="min-w-0">
                                <div class="flex flex-wrap items-center gap-2">
                                    <div class="truncate text-base font-black tracking-tight text-zinc-100">${name}</div>
                                    ${canonBadge}
                                </div>
                                <div class="mt-1 text-xs font-semibold text-zinc-500">${this.escapeHTML(role || '—')}</div>
                                ${lastLine}
                            </div>
                        </div>
                        <div class="shrink-0">
                            <span class="inline-flex items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-950/50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-zinc-300">
                                <span class="h-2.5 w-2.5 rounded-full ${colors.dot}"></span>${this.escapeHTML(String(c.type || 'gray'))}
                            </span>
                        </div>
                    </div>

                    <div class="mt-4">
                        <div class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500">Current arc stage</div>
                        <div class="mt-2 text-sm font-semibold leading-relaxed text-zinc-200">${stage}</div>
                    </div>

                    <div class="mt-4">
                        <div class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500">Current shift</div>
                        <div class="mt-2 text-sm leading-relaxed text-zinc-300">${shift}</div>
                    </div>

                    ${bar}
                    ${chips}
                </article>`;
        }).join('');

        root.innerHTML = `<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">${cards}</div>`;
    },
    relationshipTypeStyle(rel = {}) {
        const typeRaw = rel?.type || rel?.label || '';
        const t = String(typeRaw || '').trim().toLowerCase();
        const isSecret = Boolean(rel?.secret) || t.includes('secret') || t.includes('hidden');
        const strengthBase = Number(rel?.strength);
        const strength = Number.isFinite(strengthBase) ? Math.max(1, Math.min(5, strengthBase)) : 3;

        let color = 'rgba(196,181,253,0.55)'; // violet default
        if (t.includes('ally') || t.includes('alliance')) color = 'rgba(52,211,153,0.55)'; // emerald
        if (t.includes('enemy') || t.includes('rival')) color = 'rgba(248,113,113,0.6)'; // rose
        if (t.includes('blood') || t.includes('family') || t.includes('lineage')) color = 'rgba(251,191,36,0.55)'; // amber
        if (t.includes('mentor')) color = 'rgba(125,211,252,0.55)'; // sky
        if (t.includes('marriage') || t.includes('romance') || t.includes('lover')) color = 'rgba(167,139,250,0.65)'; // brighter violet

        return { color, isSecret, strength };
    },

    buildRelationshipNetworkData() {
        this.ensureRelationshipStore();
        const characters = Array.isArray(this.storyData?.characters) ? this.storyData.characters : [];
        const byName = new Map(characters.map((c) => [String(c.name || '').trim().toLowerCase(), c]));

        const nodes = characters.map((c) => ({
            id: Number(c.id),
            name: String(c.name || 'Unknown'),
            type: String(c.type || 'gray'),
            role: String(c.role || ''),
            isCanon: Boolean(c.isCanon)
        }));

        const links = [];
        const addLink = (rel) => {
            const fromId = rel?.fromId;
            const toId = rel?.toId;
            const type = rel?.type;
            const a = Number(fromId);
            const b = Number(toId);
            if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return;
            const key = a < b ? `${a}|${b}|${String(type || '').toLowerCase()}|${String(rel?.id ?? '')}` : `${b}|${a}|${String(type || '').toLowerCase()}|${String(rel?.id ?? '')}`;
            if (links.some((l) => l._key === key)) return;
            links.push({
                id: rel?.id,
                source: a,
                target: b,
                type: String(rel?.type || 'other'),
                label: String(rel?.label || rel?.type || 'other'),
                description: String(rel?.description || '').trim(),
                strength: Number(rel?.strength) || 3,
                secret: Boolean(rel?.secret),
                _key: key
            });
        };

        const rels = Array.isArray(this.storyData?.relationships) ? this.storyData.relationships : [];
        if (rels.length) {
            rels.forEach((r) => {
                const fromId = r?.fromId ?? byName.get(String(r?.from || '').trim().toLowerCase())?.id;
                const toId = r?.toId ?? byName.get(String(r?.to || '').trim().toLowerCase())?.id;
                if (fromId != null && toId != null) addLink({ ...r, fromId, toId });
            });
        }

        // Fallback: parse relationship lines embedded in character notes.
        if (links.length === 0) {
            const rx = /Relationship\s*\(([^)]+)\)\s*with\s*([^:]+)\s*:\s*(.+)$/i;
            characters.forEach((c) => {
                const notes = String(c?.notes || '');
                notes.split('\n').forEach((line) => {
                    const m = line.match(rx);
                    if (!m) return;
                    const type = String(m[1] || 'other').trim();
                    const toName = String(m[2] || '').trim().toLowerCase();
                    const desc = String(m[3] || '').trim();
                    const to = byName.get(toName);
                    if (to) addLink({ id: Date.now() + Math.floor(Math.random() * 10000), fromId: c.id, toId: to.id, type, label: type, description: desc, strength: 3, secret: type.toLowerCase().includes('secret') });
                });
            });
        }

        // Final fallback: relatedCharacters without labels.
        if (links.length === 0) {
            characters.forEach((c) => {
                const rel = Array.isArray(c.relatedCharacters) ? c.relatedCharacters : [];
                rel.forEach((id) => addLink({ id: Date.now() + Math.floor(Math.random() * 10000), fromId: c.id, toId: id, type: 'linked', label: 'linked', description: '', strength: 2, secret: false }));
            });
        }

        // Strip internal key.
        links.forEach((l) => delete l._key);
        return { nodes, links };
    },

    renderRelationshipNetworkGraph({ forceRestart = false } = {}) {
        const svg = document.getElementById('relationshipNetworkSvg');
        const linksG = document.getElementById('relationshipNetworkLinks');
        const labelsG = document.getElementById('relationshipNetworkLabels');
        const nodesG = document.getElementById('relationshipNetworkNodes');
        const status = document.getElementById('relationshipNetworkStatus');
        if (!svg || !linksG || !labelsG || !nodesG) return;

        const W = 1200;
        const H = 520;
        const pad = 48;

        const { nodes, links } = this.buildRelationshipNetworkData();
        this.relationshipGraphState.nodes = nodes;
        this.relationshipGraphState.links = links;

        if (status) {
            status.innerHTML = `<div class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500">Stats</div>
                <div class="mt-3 text-sm font-semibold text-zinc-200">${nodes.length} character${nodes.length === 1 ? '' : 's'} • ${links.length} connection${links.length === 1 ? '' : 's'}</div>
                <div class="mt-2 text-xs text-zinc-500">Hover a node to highlight connections. Click to open details.</div>`;
        }

        const rng = (seed) => {
            let s = seed | 0;
            return () => {
                s = (s * 1664525 + 1013904223) | 0;
                return ((s >>> 0) % 10000) / 10000;
            };
        };
        const rand = rng(this.relationshipGraphState.seed || 1);

        // Initialize positions if missing.
        const pos = this.relationshipGraphState.positions;
        const centerX = W / 2;
        const centerY = H / 2;
        const ring = Math.min(W, H) * 0.32;
        nodes.forEach((n, i) => {
            if (!pos.has(n.id) || forceRestart) {
                const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
                const x = centerX + Math.cos(a) * ring + (rand() - 0.5) * 90;
                const y = centerY + Math.sin(a) * ring + (rand() - 0.5) * 70;
                pos.set(n.id, { x, y, vx: 0, vy: 0 });
            }
        });

        const byId = new Map(nodes.map((n) => [n.id, n]));
        const hovered = this.relationshipGraphState.hoveredId;
        const query = String(this.relationshipGraphState.searchQuery || '').trim().toLowerCase();
        const filter = String(this.relationshipGraphState.filter || 'all').toLowerCase();

        const matchesQuery = (n) => !query || String(n?.name || '').toLowerCase().includes(query);

        const linkCategory = (l) => {
            const t = `${l?.type || ''} ${l?.label || ''} ${l?.description || ''}`.toLowerCase();
            if (l?.secret || t.includes('secret') || t.includes('hidden')) return 'secret';
            if (t.includes('blood') || t.includes('family') || t.includes('lineage')) return 'bloodline';
            if (t.includes('romance') || t.includes('marriage') || t.includes('lover')) return 'romance';
            if (t.includes('rival') || t.includes('enemy')) return 'rivalry';
            if (t.includes('ally') || t.includes('alliance')) return 'alliance';
            if (t.includes('military') || t.includes('guard') || t.includes('commander') || t.includes('soldier')) return 'military';
            return 'all';
        };

        const filteredLinks = links.filter((l) => {
            const cat = linkCategory(l);
            if (filter !== 'all' && cat !== filter) return false;
            if (query) {
                const a = byId.get(l.source);
                const b = byId.get(l.target);
                if (!matchesQuery(a) && !matchesQuery(b)) return false;
            }
            return true;
        });

        const neighbor = new Set();
        if (hovered != null) {
            filteredLinks.forEach((l) => {
                if (l.source === hovered) neighbor.add(l.target);
                if (l.target === hovered) neighbor.add(l.source);
            });
        }

        const querySet = new Set(nodes.filter(matchesQuery).map((n) => n.id));

        const nodeColor = (type) => {
            const t = String(type || '').toLowerCase();
            if (t === 'friendly') return { fill: '#34d399', stroke: 'rgba(16,185,129,0.55)' };
            if (t === 'antagonist') return { fill: '#fb7185', stroke: 'rgba(244,63,94,0.55)' };
            return { fill: '#d4d4d8', stroke: 'rgba(161,161,170,0.45)' };
        };

        // Render links
        linksG.innerHTML = filteredLinks.map((l) => {
            const a = pos.get(l.source);
            const b = pos.get(l.target);
            if (!a || !b) return '';
            const style = this.relationshipTypeStyle(l);
            const isQueryOn = !query || querySet.has(l.source) || querySet.has(l.target);
            const isOn = isQueryOn && (hovered == null || l.source === hovered || l.target === hovered || neighbor.has(l.source) || neighbor.has(l.target));
            const opacity = isOn ? 0.9 : 0.12;
            const width = 1.6 + (style.strength * 0.9);
            const dash = style.isSecret ? '8 8' : '';
            const glow = isOn ? 'filter="url(#relLinkGlow)"' : '';
            return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}"
                stroke="${style.color}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" stroke-dasharray="${dash}"
                opacity="${opacity}" ${glow}
                role="button" tabindex="0"
                onclick="App.openRelationshipEdgeModal(${Number(l.id)})"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.openRelationshipEdgeModal(${Number(l.id)});}"/>`;
        }).join('');

        // Render link labels (lightweight: only when not hovering, or for hovered neighborhood)
        labelsG.innerHTML = filteredLinks.map((l) => {
            const a = pos.get(l.source);
            const b = pos.get(l.target);
            if (!a || !b) return '';
            const isOn = hovered == null || l.source === hovered || l.target === hovered || neighbor.has(l.source) || neighbor.has(l.target);
            if (!isOn) return '';
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const label = String(l.label || l.type || '').trim();
            if (!label) return '';
            return `<text x="${mx.toFixed(2)}" y="${(my - 6).toFixed(2)}" text-anchor="middle"
                fill="rgba(244,244,245,0.72)" font-size="10.5" font-family="system-ui,-apple-system,sans-serif" font-weight="700"
                opacity="0.85">${this.escapeHTML(label)}</text>`;
        }).join('');

        // Render nodes
        nodesG.innerHTML = nodes.map((n) => {
            const p = pos.get(n.id);
            if (!p) return '';
            const c = nodeColor(n.type);
            const isQueryMatch = matchesQuery(n);
            const isActive = (!query || isQueryMatch) && (hovered == null || n.id === hovered || neighbor.has(n.id));
            const opacity = isActive ? 1 : 0.18;
            const r = n.isCanon ? 18 : 14;
            const halo = n.isCanon
                ? `<circle r="${r + 9}" fill="rgba(251,191,36,0.10)" stroke="rgba(251,191,36,0.28)" stroke-width="2" filter="url(#relNodeGlow)"/>`
                : `<circle r="${r + 7}" fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.20)" stroke-width="1.5" filter="url(#relNodeGlow)"/>`;
            const name = this.escapeHTML(n.name);
            const isHovered = hovered != null && n.id === hovered;
            const scale = isHovered ? 1.06 : 1.0;
            return `
                <g class="relationship-node" transform="translate(${p.x.toFixed(2)},${p.y.toFixed(2)}) scale(${scale})" opacity="${opacity}"
                   role="button" tabindex="0"
                   onmouseenter="App.onRelationshipNodeHover(${n.id})"
                   onmouseleave="App.onRelationshipNodeHover(null)"
                   onpointerdown="App.onRelationshipNodePointerDown(event, ${n.id})"
                   onclick="App.onRelationshipNodeClick(${n.id})"
                   onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.openCharacterEditor(${n.id});}">
                  <title>${name}</title>
                  ${halo}
                  <circle r="${r}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${n.isCanon ? 3.0 : 2.3}" ${isHovered ? 'filter="url(#relNodeGlow)"' : ''}/>
                  <text x="0" y="${r + 18}" text-anchor="middle" fill="rgba(244,244,245,0.9)" font-size="12" font-family="system-ui,-apple-system,sans-serif" font-weight="800">${name}</text>
                </g>`;
        }).join('');

        // Start/continue force simulation (lightweight)
        const needsSim = forceRestart || !this.relationshipGraphState.simRunning;
        if (!needsSim) return;

        this.stopRelationshipGraphSim();
        this.relationshipGraphState.simRunning = true;

        const linkPairs = filteredLinks
            .map((l) => ({ a: l.source, b: l.target, style: this.relationshipTypeStyle(l) }));

        const tick = () => {
            const P = this.relationshipGraphState.positions;
            const N = nodes;

            // Physics constants (tuned for "premium calm" motion)
            const repulse = 2200;
            const spring = 0.012;
            const damping = 0.86;
            const centerPull = 0.0016;

            // Repulsion
            for (let i = 0; i < N.length; i += 1) {
                const pi = P.get(N[i].id);
                if (!pi) continue;
                for (let j = i + 1; j < N.length; j += 1) {
                    const pj = P.get(N[j].id);
                    if (!pj) continue;
                    let dx = pi.x - pj.x;
                    let dy = pi.y - pj.y;
                    const d2 = dx * dx + dy * dy + 80;
                    const f = repulse / d2;
                    dx *= f; dy *= f;
                    pi.vx += dx; pi.vy += dy;
                    pj.vx -= dx; pj.vy -= dy;
                }
            }

            // Springs
            linkPairs.forEach((lp) => {
                const a = P.get(lp.a);
                const b = P.get(lp.b);
                if (!a || !b) return;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const target = 210 / lp.style.strength;
                const f = (dist - target) * spring;
                const fx = (dx / dist) * f;
                const fy = (dy / dist) * f;
                a.vx += fx; a.vy += fy;
                b.vx -= fx; b.vy -= fy;
            });

            // Centering + integrate
            N.forEach((n) => {
                const p = P.get(n.id);
                if (!p) return;
                p.vx += (centerX - p.x) * centerPull;
                p.vy += (centerY - p.y) * centerPull;
                p.vx *= damping;
                p.vy *= damping;
                p.x += p.vx;
                p.y += p.vy;

                // Clamp bounds
                p.x = Math.max(pad, Math.min(W - pad, p.x));
                p.y = Math.max(pad, Math.min(H - pad, p.y));
            });

            // Redraw (without restarting)
            this.relationshipGraphState.simFrame = requestAnimationFrame(() => {
                this.relationshipGraphState.simFrame = null;
                // End simulation when motion is small.
                const motion = N.reduce((acc, n) => {
                    const p = P.get(n.id);
                    return acc + (p ? Math.abs(p.vx) + Math.abs(p.vy) : 0);
                }, 0);
                this.renderRelationshipNetworkGraph({ forceRestart: false });
                if (motion < 0.8) {
                    this.stopRelationshipGraphSim();
                } else {
                    tick();
                }
            });
        };

        tick();
    },

    onRelationshipNodeHover(id) {
        const next = id == null ? null : Number(id);
        this.relationshipGraphState.hoveredId = Number.isFinite(next) ? next : null;
        // Do not restart the simulation; just re-render for highlight.
        this.renderRelationshipNetworkGraph({ forceRestart: false });
    },

    onRelationshipNodeClick(id) {
        // If user dragged the node, suppress click-to-open.
        if (this.relationshipGraphState.dragMoved) {
            this.relationshipGraphState.dragMoved = false;
            return;
        }
        this.openCharacterEditor(Number(id));
    },

    relationshipSvgPoint(evt) {
        const svg = document.getElementById('relationshipNetworkSvg');
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        const x = ((evt.clientX - rect.left) / rect.width) * 1200;
        const y = ((evt.clientY - rect.top) / rect.height) * 520;
        return { x, y };
    },

    onRelationshipNodePointerDown(evt, id) {
        try { evt.preventDefault(); } catch (e) { /* ignore */ }
        const svg = document.getElementById('relationshipNetworkSvg');
        if (!svg) return;
        const nid = Number(id);
        if (!Number.isFinite(nid)) return;
        this.relationshipGraphState.draggingId = nid;
        this.relationshipGraphState.dragMoved = false;

        const move = (e) => {
            const p = this.relationshipSvgPoint(e);
            if (!p) return;
            const pos = this.relationshipGraphState.positions.get(nid) || { x: p.x, y: p.y, vx: 0, vy: 0 };
            pos.x = p.x;
            pos.y = p.y;
            pos.vx = 0;
            pos.vy = 0;
            this.relationshipGraphState.positions.set(nid, pos);
            this.relationshipGraphState.dragMoved = true;
            this.stopRelationshipGraphSim();
            this.renderRelationshipNetworkGraph({ forceRestart: false });
        };

        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            const id2 = this.relationshipGraphState.draggingId;
            this.relationshipGraphState.draggingId = null;
            if (id2 != null) {
                this.persistRelationshipGraphPositions();
            }
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    },

    persistRelationshipGraphPositions() {
        this.ensureRelationshipStore();
        const obj = {};
        this.relationshipGraphState.positions.forEach((p, id) => {
            obj[String(id)] = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
        });
        this.storyData.relationshipGraphLayout.positions = obj;
        StorageService.saveStoryData(this.storyData);
    },

    openRelationshipEdgeModal(relId) {
        this.ensureRelationshipStore();
        const id = Number(relId);
        if (!Number.isFinite(id)) return;

        const rel = (this.storyData.relationships || []).find(r => Number(r?.id) === id);
        if (!rel) return;

        const from = (this.storyData.characters || []).find(c => Number(c?.id) === Number(rel.fromId));
        const to = (this.storyData.characters || []).find(c => Number(c?.id) === Number(rel.toId));

        const setVal = (elId, val) => {
            const el = document.getElementById(elId);
            if (el) el.value = val;
        };
        const setText = (elId, val) => {
            const el = document.getElementById(elId);
            if (el) el.textContent = val;
        };

        setText('relEdgeTitle', `${from?.name || rel.from || 'Unknown'} ↔ ${to?.name || rel.to || 'Unknown'}`);
        setVal('relEdgeType', String(rel.type || 'other'));
        setVal('relEdgeLabel', String(rel.label || rel.type || ''));
        setVal('relEdgeStrength', String(rel.strength ?? 3));
        setVal('relEdgeSecret', rel.secret ? '1' : '');
        setVal('relEdgeDescription', String(rel.description || ''));
        setText('relEdgeStrengthValue', String(rel.strength ?? 3));
        document.getElementById('relationshipEdgeModal')?.classList.add('active');
        document.getElementById('relationshipEdgeModal')?.setAttribute('data-rel-id', String(id));
    },

    closeRelationshipEdgeModal() {
        document.getElementById('relationshipEdgeModal')?.classList.remove('active');
    },

    onRelEdgeStrengthInput(val) {
        const el = document.getElementById('relEdgeStrengthValue');
        if (el) el.textContent = String(val);
    },

    saveRelationshipEdgeEdits() {
        this.ensureRelationshipStore();
        const modal = document.getElementById('relationshipEdgeModal');
        const id = Number(modal?.getAttribute('data-rel-id'));
        if (!Number.isFinite(id)) return;

        const rel = (this.storyData.relationships || []).find(r => Number(r?.id) === id);
        if (!rel) return;

        const type = String(document.getElementById('relEdgeType')?.value || 'other').trim();
        const label = String(document.getElementById('relEdgeLabel')?.value || type).trim();
        const strength = Number(document.getElementById('relEdgeStrength')?.value || 3);
        const secret = Boolean(document.getElementById('relEdgeSecret')?.checked);
        const description = String(document.getElementById('relEdgeDescription')?.value || '').trim();

        rel.type = type || 'other';
        rel.label = label || rel.type;
        rel.strength = Number.isFinite(strength) ? Math.max(1, Math.min(5, strength)) : 3;
        rel.secret = secret;
        rel.description = description;
        rel.updatedAt = new Date().toISOString();

        StorageService.saveStoryData(this.storyData);
        this.renderRelationshipNetworkGraph({ forceRestart: false });
        this.closeRelationshipEdgeModal();
    },

    openAddRelationshipModal() {
        this.ensureRelationshipStore();
        const chars = Array.isArray(this.storyData?.characters) ? this.storyData.characters : [];
        const fromSel = document.getElementById('addRelFrom');
        const toSel = document.getElementById('addRelTo');
        if (fromSel && toSel) {
            const options = chars.map(c => `<option value="${Number(c.id)}">${this.escapeHTML(String(c.name || 'Unknown'))}</option>`).join('');
            fromSel.innerHTML = options;
            toSel.innerHTML = options;
        }
        const typeEl = document.getElementById('addRelType');
        if (typeEl) typeEl.value = 'alliance';
        const labelEl = document.getElementById('addRelLabel');
        if (labelEl) labelEl.value = 'Alliance';
        const strengthEl = document.getElementById('addRelStrength');
        if (strengthEl) strengthEl.value = '3';
        const secret = document.getElementById('addRelSecret');
        if (secret) secret.checked = false;
        const descEl = document.getElementById('addRelDescription');
        if (descEl) descEl.value = '';
        const strengthVal = document.getElementById('addRelStrengthValue');
        if (strengthVal) strengthVal.textContent = '3';
        document.getElementById('addRelationshipModal')?.classList.add('active');
    },

    closeAddRelationshipModal() {
        document.getElementById('addRelationshipModal')?.classList.remove('active');
    },

    onAddRelStrengthInput(val) {
        const el = document.getElementById('addRelStrengthValue');
        if (el) el.textContent = String(val);
    },

    saveNewRelationship() {
        this.ensureRelationshipStore();
        const fromId = Number(document.getElementById('addRelFrom')?.value);
        const toId = Number(document.getElementById('addRelTo')?.value);
        if (!Number.isFinite(fromId) || !Number.isFinite(toId) || fromId === toId) {
            alert('Pick two different characters.');
            return;
        }
        const from = (this.storyData.characters || []).find(c => Number(c?.id) === fromId);
        const to = (this.storyData.characters || []).find(c => Number(c?.id) === toId);
        const type = String(document.getElementById('addRelType')?.value || 'other').trim();
        const label = String(document.getElementById('addRelLabel')?.value || type).trim();
        const strength = Number(document.getElementById('addRelStrength')?.value || 3);
        const secret = Boolean(document.getElementById('addRelSecret')?.checked);
        const description = String(document.getElementById('addRelDescription')?.value || '').trim();

        const rel = {
            id: Date.now(),
            fromId,
            toId,
            from: from?.name || '',
            to: to?.name || '',
            type: type || 'other',
            label: label || type || 'other',
            description,
            strength: Number.isFinite(strength) ? Math.max(1, Math.min(5, strength)) : 3,
            secret,
            updatedAt: new Date().toISOString()
        };
        this.storyData.relationships.push(rel);

        // Keep relatedCharacters linked (bidirectional) for other parts of the app.
        if (from && to) {
            from.relatedCharacters = Array.isArray(from.relatedCharacters) ? from.relatedCharacters : [];
            to.relatedCharacters = Array.isArray(to.relatedCharacters) ? to.relatedCharacters : [];
            if (!from.relatedCharacters.includes(to.id)) from.relatedCharacters.push(to.id);
            if (!to.relatedCharacters.includes(from.id)) to.relatedCharacters.push(from.id);
        }

        StorageService.saveStoryData(this.storyData);
        this.render();
        this.closeAddRelationshipModal();
    },

    refreshStoryWorldMap() {
        const wrap = document.getElementById('ghostBorderStoryMapWrap');
        if (wrap) {
            wrap.classList.add('ring-violet-500/40');
            window.setTimeout(() => wrap.classList.remove('ring-violet-500/40'), 400);
        }
        this.renderStoryWorldMap();
    },

    /**
     * Generate a single AI map image (configure Grok Imagine / OpenAI-compatible image API in AI Settings).
     */
    async generateStoryWorldMapAI() {
        const status = document.getElementById('storyWorldMapAiStatus');
        const panel = document.getElementById('storyWorldMapAiPanel');
        if (!status || !panel) return;

        status.innerHTML = '<div class="ai-status analyzing"><span class="spinner"></span> Building map prompt (text AI if available), then requesting image…</div>';
        const promptResult = await AIService.generateStoryWorldMapGrokPromptDetailed(this.storyData);
        const prompt = promptResult.text;
        const promptSourceLine =
            promptResult.mode === 'ai'
                ? 'Local text AI expanded the prompt.'
                : promptResult.userMessage;

        status.innerHTML = `<div class="ai-status analyzing"><span class="spinner"></span> ${this.escapeHTML(promptSourceLine)} Now requesting map from your image API…</div>`;
        panel.classList.add('hidden');
        panel.innerHTML = '';

        try {
            const imageUrl = await AIService.generateImage(prompt);
            this.ensureStoryWorldMapGallery();
            this.storyData.storyWorldMapGallery.items.unshift({
                id: Date.now(),
                imageUrl,
                createdAt: new Date().toISOString()
            });
            this.storyData.storyWorldMapGallery.activeImageUrl = imageUrl;
            this.storyData.storyWorldMapGallery.items = this.storyData.storyWorldMapGallery.items.slice(0, 36);
            StorageService.saveStoryData(this.storyData);
            this.renderStoryWorldMapGallery();
            this.applyActiveStoryWorldMapBackground();
            this.renderGhostBorderInteractiveMap();

            panel.classList.remove('hidden');
            panel.innerHTML = `
                <div class="mb-3 text-xs font-extrabold uppercase tracking-wide text-violet-300/90">Latest AI realm map</div>
                <img src="${imageUrl}" alt="AI-generated story world map" loading="lazy" />
                <p class="mt-3 text-xs leading-relaxed text-zinc-500">Saved to your story gallery below. Open full size in a new tab from the gallery thumbnails.</p>`;
            status.innerHTML = '<div class="ai-status connected">✅ Map image received and saved. Tune model in AI Settings if results differ.</div>';
        } catch (error) {
            status.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(error.message)}</div>`;
        }
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
                        <div class="text-sm text-zinc-400">Timeline event: E${item.eventId}</div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-extrabold text-emerald-100 hover:bg-emerald-500/15" onclick="App.copyStoryboardPrompt(${item.id})">Copy prompt</button>
                        <button class="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.regenStoryboardPrompt(${item.id})">Rebuild</button>
                    </div>
                </div>
                <div class="storyboard-card-body">
                    <textarea class="storyboard-prompt" oninput="App.updateStoryboardPrompt(${item.id}, this.value)">${prompt}</textarea>
                    <div style="margin-top:0.75rem;">
                        ${hasImage
                            ? `<img class="storyboard-image" src="${this.escapeHTML(imgSrc)}" alt="Storyboard scene image">`
                            : `<div class="storyboard-image flex items-center justify-center text-sm text-zinc-500">No image yet</div>`
                        }
                    </div>
                    <div class="storyboard-dropzone" onpaste="App.handleStoryboardPaste(event, ${item.id})">
                        <strong>Paste / Attach Image</strong>
                        <div class="text-sm text-zinc-400">Paste an image from the clipboard, paste a URL, or upload a file.</div>
                        <input type="text" placeholder="Paste image URL (https://... or data:image/...)" value="${this.escapeHTML(imgSrc)}" oninput="App.setStoryboardImageUrl(${item.id}, this.value)">
                        <div class="storyboard-actions">
                            <input type="file" accept="image/*" onchange="App.uploadStoryboardImage(${item.id}, this.files?.[0] || null)" />
                            <button class="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-[11px] font-extrabold text-rose-100 hover:bg-rose-500/15" onclick="App.removeStoryboardImage(${item.id})">Remove image</button>
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
                : (report.type === 'continuity' || report.type === 'historical-accuracy' ? 'warning' : 'suggestion');
            const timestamp = new Date(report.createdAt).toLocaleString();
            const suggestedTab = this.inferReportTargetTab(report);
            const suggestedLabel = this.getTabDisplayName(suggestedTab);
            return `<div class="ai-result ${cssClass} mb-4">
                <strong>${report.title}</strong>
                <div class="mt-1 text-sm text-zinc-400">${timestamp}</div>
                <div class="mt-4 whitespace-pre-wrap">${this.formatReportContent(report.content)}</div>
                <div class="mt-4 flex flex-wrap gap-2">
                    <button class="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.openReportTarget(${report.id})">Open suggested area (${suggestedLabel})</button>
                    <button class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-extrabold text-emerald-100 hover:bg-emerald-500/15" onclick="App.addReportToWorkItems(${report.id})">Add as work item</button>
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
                || normalized.includes('risk')
                || normalized.includes('anachron')
                || normalized.includes('historical')
                || normalized.includes('likely issue')
                || normalized.includes('uncertain');
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
                    || normalized.includes('risk')
                    || normalized.includes('anachron')
                    || normalized.includes('likely issue')
                    || normalized.includes('uncertain—verify')
                    || normalized.includes('research angles');
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
                    <button class="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.switchTab('${item.suggestedTab}')">Open ${this.getTabDisplayName(item.suggestedTab)}</button>
                    <button class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-extrabold text-emerald-100 hover:bg-emerald-500/15" onclick="App.addActionItemToWorkItems('${item.id}')">Add task</button>
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
                            <button class="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-[11px] font-extrabold text-rose-100 hover:bg-rose-500/15" onclick="App.switchTab('ai-actions')">View all (${items.length})</button>
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
        if (report?.type === 'story-build') return 'dashboard';
        if (report?.type === 'historical-accuracy') return 'workitems';
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
            'ai-queue': 'AI Queue',
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

        const category = report.type === 'historical-accuracy'
            ? 'Historical Research'
            : (categoryMap[targetTab] || 'Scene Planning');

        this.storyData.workItems.push({
            id: Math.max(...this.storyData.workItems.map(w => w.id), 0) + 1,
            title,
            category,
            completed: false,
            isCanon: false,
            tags: []
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
                this.renderAIReports();
                this.renderAIActionItems();
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
     * Synthesize continuity/plot/character findings + story snapshot into structured builds
     * (new beats, work items, character arc notes) via AIService.
     */
    async suggestStoryBuildFromIssues() {
        const runStatus = document.getElementById('aiRunStatus');
        if (!runStatus) return;
        runStatus.innerHTML = '<div class="ai-result"><span class="spinner"></span> Finding issues and drafting story builds from your data and recent AI reports…</div>';

        try {
            const raw = await AIService.generateStoryBuildSuggestions(this.storyData);
            const parsed = this.parseAIJSON(raw);
            const actions = (Array.isArray(parsed?.suggestedActions) ? parsed.suggestedActions : [])
                .map((a) => ({
                    ...a,
                    isCanon: false,
                    tags: Array.isArray(a?.tags) ? Array.from(new Set([...(a.tags || []), 'draft', 'story-build'])) : ['draft', 'story-build']
                }));
            const issues = Array.isArray(parsed?.issuesFound) ? parsed.issuesFound : [];

            const lines = [];
            lines.push('## Issues flagged');
            if (issues.length === 0) {
                lines.push('_No issues array in model output — see raw JSON in Saved reports if needed._');
            } else {
                issues.forEach((i) => {
                    const sev = String(i.severity || 'med').trim();
                    const area = String(i.area || 'general').trim();
                    const sum = String(i.summary || '').trim();
                    lines.push(`- **${sev}** · ${area}: ${sum}`);
                });
            }
            lines.push('');
            lines.push('## Suggested builds (checkboxes + apply buttons below)');
            if (actions.length === 0) {
                lines.push('_No structured suggestedActions returned. Open Saved reports for raw model text, tighten AI settings, or retry._');
            } else {
                actions.forEach((a) => {
                    const t = String(a.title || 'Untitled').trim();
                    const ty = String(a.actionType || '').trim();
                    const d = String(a.description || '').trim();
                    lines.push(`- **${t}** (${ty}): ${d}`);
                });
            }

            const humanContent = lines.join('\n');
            const fallbackRaw = raw && String(raw).trim() && actions.length === 0
                ? `\n\n--- Model output (trimmed) ---\n${String(raw).slice(0, 12000)}`
                : '';

            this.addAIReport(
                'story-build',
                '🔧 AI story build from issues',
                `${humanContent}${fallbackRaw}`,
                'success',
                actions.length ? actions : undefined
            );
            this.suggestedActionsUI.selected = {};
            this.renderAISuggestedActions();
            this.renderAIReports();
            this.renderAIActionItems();

            if (actions.length === 0) {
                runStatus.innerHTML = '<div class="ai-result suggestion">⚠️ Report saved, but suggestions could not be parsed as JSON. Check <strong>Saved reports</strong> for raw output, then retry or run <strong>Full story analysis</strong>.</div>';
            } else {
                runStatus.innerHTML = '<div class="ai-status connected">✅ Build suggestions saved. Use the checklist below to add timeline beats, tasks, or character arc notes.</div>';
            }
        } catch (error) {
            this.addAIReport('story-build', '🔧 AI story build from issues', `Error: ${error.message}`, 'error');
            runStatus.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(error.message)}</div>`;
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

    /**
     * Latest structured suggestions from the most recent AI report that included `suggestedActions`
     * (full story analysis, story-build pass, etc.). Reports are newest-first.
     */
    getLatestStorySuggestedActions() {
        const reports = Array.isArray(this.storyData.aiReports) ? this.storyData.aiReports : [];
        for (let i = 0; i < reports.length; i += 1) {
            const r = reports[i];
            if (!r || r.status === 'error') continue;
            const actions = Array.isArray(r.suggestedActions) ? r.suggestedActions : [];
            if (actions.length) return actions.slice(0, 25);
        }
        return [];
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
            <div class="ai-result suggestion mt-3">
                <div class="ai-header">
                    <h3 class="m-0">Suggested actions</h3>
                    <div class="flex flex-wrap gap-2">
                        <button class="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.applySuggestedActionsToTimeline()">Add timeline events</button>
                        <button class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-extrabold text-emerald-100 hover:bg-emerald-500/15" onclick="App.applySuggestedActionsToWorkItems()">Add work items</button>
                        <button class="rounded-xl border border-violet-500/35 bg-violet-600/15 px-3 py-2 text-xs font-extrabold text-violet-100 hover:bg-violet-600/20" onclick="App.applySuggestedActionsToCharacterArcs()">Update character arcs</button>
                        <button class="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs font-extrabold text-amber-200 hover:bg-amber-400/15" onclick="App.promoteSelectedSuggestedActionsToCanon()">Promote selected to canon</button>
                    </div>
                </div>
                <div class="mt-2 text-sm text-zinc-400">Pulled from the <strong class="text-zinc-200">newest AI report</strong> that included structured suggestions (full story analysis or <strong class="text-zinc-200">Suggest fixes & builds</strong>). Buttons apply all matching rows (deduped by title).</div>
                <div class="mt-3">
                    ${actions.map((a, idx) => `
                        <div class="preview-item border-b border-zinc-200/40 last:border-b-0 dark:border-zinc-800/80">
                            <input type="checkbox" onchange="App.toggleSuggestedActionSelection(${idx}, this.checked)">
                            <div class="min-w-0 flex-1">
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
            this.storyData.events.push(createTimelineEvent({
                id: nextEventId++,
                title,
                period: '',
                order: this.storyData.events.length,
                beat: null,
                description: String(a.description || '').trim(),
                location: String(a.location || '').trim()
            }));
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
                category: String(a.category || '').trim() || 'Scene Planning',
                completed: false,
                isCanon: false,
                tags: []
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
                this.renderAIReports();
                this.renderAIActionItems();
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
                this.renderAIReports();
                this.renderAIActionItems();
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
                this.renderAIReports();
                this.renderAIActionItems();
            } else {
                const message = 'Failed to analyze plot. Check AI connection in settings.';
                this.addAIReport('plot', '📖 Plot Structure Analysis', message, 'error');
                runStatus.innerHTML = `<div class="ai-status disconnected">❌ ${message}</div>`;
            }
        } catch (error) {
            this.addAIReport('plot', '📖 Plot Structure Analysis', `Error: ${error.message}`, 'error');
            runStatus.innerHTML = '<div class="ai-status disconnected">❌ Error: ' + error.message + '</div>';
        }
    },

    /**
     * Historical / material / institutional accuracy (not character arcs or beat structure).
     */
    async analyzeHistoricalAccuracy() {
        const runStatus = document.getElementById('aiRunStatus');
        if (!runStatus) return;
        runStatus.innerHTML = '<div class="ai-result"><span class="spinner"></span> Checking historical & material plausibility…</div>';

        try {
            const result = await AIService.analyzeHistoricalAccuracy(this.storyData);
            if (result) {
                this.addAIReport('historical-accuracy', '📜 Historical accuracy pass', result, 'success');
                runStatus.innerHTML = '<div class="ai-status connected">✅ Historical report saved. Use “Add as work item” to queue research tasks.</div>';
                this.renderAIReports();
                this.renderAIActionItems();
            } else {
                const message = 'Failed to run historical pass. Check AI connection in settings.';
                this.addAIReport('historical-accuracy', '📜 Historical accuracy pass', message, 'error');
                runStatus.innerHTML = `<div class="ai-status disconnected">❌ ${message}</div>`;
            }
        } catch (error) {
            this.addAIReport('historical-accuracy', '📜 Historical accuracy pass', `Error: ${error.message}`, 'error');
            runStatus.innerHTML = `<div class="ai-status disconnected">❌ ${this.escapeHTML(error.message)}</div>`;
        }
    }
};

// Keep legacy global access for inline onclick handlers.
globalThis.App = App;

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
                <h2>Add / Edit Event</h2>
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

                <div class="mb-6 rounded-2xl border border-zinc-200/50 bg-zinc-50/80 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200">
                    <strong>Platform info</strong>
                    <p id="platformInfo" class="mt-2 text-sm text-zinc-500 dark:text-zinc-400"></p>
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
                <div>
                    <label class="block text-sm font-medium mb-2">Local text AI timeout (minutes)</label>
                    <input type="number" id="localGenerationTimeoutMinutes" class="form-input" min="1" max="120" step="1" placeholder="15">
                    <p class="text-zinc-400 text-sm mt-1">Max wait per LM Studio / Ollama reply (slow or CPU models often need 15–60+).</p>
                </div>

                <button class="test-connection-btn" style="width: 100%; margin-bottom: 1rem;" onclick="App.testAIConnection()">🔗 Test Connection</button>

                <div id="aiConnectionStatus"></div>

                <h3 style="margin-bottom: 1rem; margin-top: 1.5rem;">Available Models</h3>
                <div id="modelList" class="model-list">
                    <div class="model-item text-zinc-400">No models loaded.</div>
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
                    <p class="text-zinc-400 text-sm" style="margin-top: 0.5rem;">
                        Uses an OpenAI-compatible image endpoint (POST with model + prompt). You can plug in Grok Imagine, Gemini-compatible gateways, or other providers.
                    </p>
                </div>

                <div id="nanoBananaFields" style="display:none;">
                    <div>
                        <label class="block text-sm font-medium mb-2">Nano Banana API Key</label>
                        <input type="password" id="nanoBananaApiKey" class="form-input" placeholder="Bearer token for AceData Cloud">
                    </div>
                    <p class="text-zinc-400 text-sm" style="margin-top: 0.5rem;">
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
                <p class="text-zinc-400 text-sm" style="margin-top: 0.5rem;">
                    Set this endpoint to your LangChain Open Deep Research server. Work item buttons allow agent research and optional web fallback.
                </p>

                <button class="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.saveAISettings()">Save settings</button>
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
                <p class="text-zinc-400 mb-4">Paste your story notes or upload a file. The local AI will extract structured items you can merge into your story.</p>

                <div class="modal-tabs">
                    <button id="importTabPaste" class="modal-tab active" onclick="App.setImportNotesTab('paste')">Paste Text</button>
                    <button id="importTabUpload" class="modal-tab" onclick="App.setImportNotesTab('upload')">Upload File</button>
                </div>

                <div id="importPanePaste" style="margin-top: 0.75rem;">
                    <label class="block text-sm font-medium mb-2">Paste notes</label>
                    <textarea id="importNotesPaste" class="form-input" rows="8" placeholder="Paste your notes here..." oninput="App.onImportNotesPasteChange(this.value)"></textarea>
                </div>

                <div id="importPaneUpload" style="display:none; margin-top: 0.75rem;">
                    <label class="block text-sm font-medium mb-2">Upload a file</label>
                    <input type="file" class="form-input" accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" onchange="App.onImportNotesFileSelected(this.files?.[0] || null)">
                    <div class="text-sm text-zinc-400" style="margin-top:0.4rem;">Supported: <strong class="text-zinc-300">.txt</strong>, <strong class="text-zinc-300">.md</strong>, <strong class="text-zinc-300">.docx</strong>, <strong class="text-zinc-300">.pdf</strong> (text-based PDFs; scanned pages need OCR). Contents load into Paste Text.</div>
                </div>

                <div style="display:flex; gap:0.6rem; flex-wrap: wrap; margin-top: 0.9rem;">
                    <button class="ai-btn" onclick="App.extractFromNotes()">✨ Extract with AI</button>
                    <button class="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.addImportedToStory()">✅ Add to story</button>
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
                <p class="text-zinc-400 mb-4">Review suggestions side-by-side with your current story. Uncheck anything you don’t want to add.</p>

                <div style="display:flex; gap:0.6rem; flex-wrap: wrap;">
                    <button class="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.applyDashboardSuggestions()">✅ Add accepted items</button>
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
                    <div class="text-sm text-zinc-400" style="margin-top: 0.35rem;">This will link them as related characters. Optionally add type + notes.</div>
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
                    <button class="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.confirmRelationshipLink()">✅ Link characters</button>
                    <button class="topbar-ghost" onclick="App.closeRelationshipModal()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

function createRelationshipEdgeModal() {
    const html = `
        <div id="relationshipEdgeModal" class="ai-settings-modal" onclick="if(event.target && event.target.id==='relationshipEdgeModal'){ App.closeRelationshipEdgeModal(); }">
            <div class="ai-settings-content" style="max-width: 720px;">
                <span class="modal-close" onclick="App.closeRelationshipEdgeModal()">&times;</span>
                <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet-400/95">Relationship</div>
                <h2 id="relEdgeTitle" class="mt-2 text-2xl font-black tracking-tight">Relationship</h2>
                <p class="mt-2 text-sm leading-relaxed text-zinc-500">Edit type, label, strength, secrecy, and description. This updates the Relationship Network graph.</p>

                <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                        <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Type</label>
                        <input id="relEdgeType" class="form-input w-full" placeholder="alliance / rivalry / romance / bloodline / mentor / military / other" />
                    </div>
                    <div>
                        <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Label</label>
                        <input id="relEdgeLabel" class="form-input w-full" placeholder="Short readable label (e.g. Secret Protector)" />
                    </div>
                </div>

                <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                        <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Strength <span id="relEdgeStrengthValue" class="ml-2 text-violet-300">3</span></label>
                        <input id="relEdgeStrength" type="range" min="1" max="5" step="1" class="w-full" oninput="App.onRelEdgeStrengthInput(this.value)" />
                    </div>
                    <div class="flex items-end gap-2">
                        <label class="inline-flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200">
                            <input id="relEdgeSecret" type="checkbox" class="h-4 w-4" />
                            Secret / hidden (dashed)
                        </label>
                    </div>
                </div>

                <div class="mt-4">
                    <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Description</label>
                    <textarea id="relEdgeDescription" class="form-input w-full" rows="5" placeholder="Full relationship description..."></textarea>
                </div>

                <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <button type="button" class="rounded-xl bg-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 active:scale-[0.99]" onclick="App.saveRelationshipEdgeEdits()">Save</button>
                    <button type="button" class="topbar-ghost" onclick="App.closeRelationshipEdgeModal()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

function createAddRelationshipModal() {
    const html = `
        <div id="addRelationshipModal" class="ai-settings-modal" onclick="if(event.target && event.target.id==='addRelationshipModal'){ App.closeAddRelationshipModal(); }">
            <div class="ai-settings-content" style="max-width: 760px;">
                <span class="modal-close" onclick="App.closeAddRelationshipModal()">&times;</span>
                <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet-400/95">Relationship</div>
                <h2 class="mt-2 text-2xl font-black tracking-tight">➕ Add New Relationship</h2>
                <p class="mt-2 text-sm leading-relaxed text-zinc-500">Create a new connection between two characters. This will appear immediately in the Relationship Network.</p>

                <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                        <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">From</label>
                        <select id="addRelFrom" class="form-input w-full"></select>
                    </div>
                    <div>
                        <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">To</label>
                        <select id="addRelTo" class="form-input w-full"></select>
                    </div>
                </div>

                <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                        <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Type</label>
                        <input id="addRelType" class="form-input w-full" placeholder="alliance / rivalry / romance / bloodline / mentor / military / other" />
                    </div>
                    <div>
                        <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Label</label>
                        <input id="addRelLabel" class="form-input w-full" placeholder="Short readable label (e.g. Forced Marriage)" />
                    </div>
                </div>

                <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                        <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Strength <span id="addRelStrengthValue" class="ml-2 text-violet-300">3</span></label>
                        <input id="addRelStrength" type="range" min="1" max="5" step="1" class="w-full" oninput="App.onAddRelStrengthInput(this.value)" />
                    </div>
                    <div class="flex items-end gap-2">
                        <label class="inline-flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200">
                            <input id="addRelSecret" type="checkbox" class="h-4 w-4" />
                            Secret / hidden (dashed)
                        </label>
                    </div>
                </div>

                <div class="mt-4">
                    <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Description</label>
                    <textarea id="addRelDescription" class="form-input w-full" rows="5" placeholder="Full relationship description..."></textarea>
                </div>

                <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <button type="button" class="rounded-xl bg-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 active:scale-[0.99]" onclick="App.saveNewRelationship()">Save relationship</button>
                    <button type="button" class="topbar-ghost" onclick="App.closeAddRelationshipModal()">Cancel</button>
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
                <p class="text-zinc-400 mb-4">Type to filter, Enter to run. (Cmd/Ctrl+K)</p>
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
                    <button id="canonModalActionBtn" class="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm font-extrabold text-amber-200 hover:bg-amber-400/15" onclick="App.confirmToggleCanon()">Mark as canon</button>
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
                    <button class="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.confirmMergeDraft()">Merge & delete draft</button>
                    <button class="topbar-ghost" onclick="App.closeMergeDraftModal()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

// Drafts review panel modal
function createDraftsPanelModal() {
    const html = `
        <div id="draftsPanelModal" class="ai-settings-modal" onclick="if(event.target && event.target.id==='draftsPanelModal'){ App.closeDraftsPanel(); }">
            <div class="ai-settings-content" style="max-width: 920px;">
                <span class="modal-close" onclick="App.closeDraftsPanel()">&times;</span>
                <h2>🧾 Review Drafts</h2>
                <p class="text-zinc-400 mb-4">Drafts are non‑canon suggestions. Promote intentionally or merge into an existing canon item.</p>
                <div id="draftsPanelBody"></div>
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
createRelationshipEdgeModal();
createAddRelationshipModal();
createCommandPaletteModal();
createCanonConfirmModal();
createDraftMergeModal();
createDraftsPanelModal();

function createStoryWorldMapGrokModal() {
    const html = `
        <div id="storyWorldMapGrokModal" class="ai-settings-modal story-world-map-grok-modal" onclick="if(event.target && event.target.id==='storyWorldMapGrokModal'){ App.closeStoryWorldMapGrokModal(); }">
            <div class="ai-settings-content story-world-map-grok-modal-content max-h-[min(92vh,56rem)] overflow-y-auto rounded-2xl border border-zinc-800/90 bg-zinc-950 p-6 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-violet-500/15 sm:p-8">
                <span class="modal-close text-zinc-500 hover:text-zinc-200" onclick="App.closeStoryWorldMapGrokModal()">&times;</span>
                <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet-400/95">Grok Imagine</div>
                <h2 class="mt-2 text-2xl font-black tracking-tight text-zinc-50">Story World Map — prompt</h2>
                <p class="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">Timeline events <strong class="text-zinc-200">with a location</strong> are sent to your <strong class="text-violet-300">text AI</strong> (LM Studio / Ollama) to produce one rich, copy-ready image prompt. If the text AI is offline, you still get the built-in draft.</p>
                <div id="storyWorldMapGrokModalModelStatus" class="mt-4 rounded-xl border border-violet-500/20 bg-violet-950/20 px-4 py-3 ring-1 ring-inset ring-violet-500/10" role="region" aria-label="Local text model status">
                    <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-300/90">Model &amp; action</div>
                    <div id="storyWorldMapGrokModalModelLabel" class="mt-1 font-semibold text-zinc-200"></div>
                    <div id="storyWorldMapGrokModalStatusDetail" class="mt-2 text-sm text-zinc-400" role="status" aria-live="polite"></div>
                </div>
                <textarea id="storyWorldMapGrokModalPrompt" readonly rows="22" spellcheck="false" class="form-input story-world-map-prompt-text mt-4 min-h-[14rem] w-full resize-y rounded-xl border border-zinc-700/90 bg-zinc-900/80 px-4 py-3 text-sm leading-relaxed text-zinc-100 shadow-inner shadow-black/30 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-100" aria-label="Grok Imagine world map prompt"></textarea>
                <div id="storyWorldMapGrokModalActions" class="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <button type="button" class="w-full rounded-xl bg-violet-600 px-6 py-3.5 text-base font-extrabold text-white shadow-lg shadow-violet-950/50 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:brightness-105 active:scale-[0.99] sm:w-auto" onclick="App.copyStoryWorldMapGrokModalPrompt()">Copy Prompt to Clipboard</button>
                    <button type="button" class="w-full rounded-xl border border-zinc-600/90 bg-zinc-900/60 px-6 py-3 text-sm font-extrabold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/80 sm:w-auto" onclick="App.openStoryWorldMapGalleryUpload()">Add finished image…</button>
                    <button type="button" class="w-full rounded-xl border border-zinc-600/90 bg-zinc-900/60 px-6 py-3 text-sm font-extrabold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/80 sm:w-auto" onclick="App.closeStoryWorldMapGrokModal()">Close</button>
                </div>
                <input id="storyWorldMapGalleryUploadInput" type="file" accept="image/*" class="hidden" onchange="App.onStoryWorldMapGalleryFileSelected(this.files?.[0] || null); this.value='';" />
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

createStoryWorldMapGrokModal();

function createIntegrityCheckModal() {
    const html = `
        <div id="integrityCheckModal" class="ai-settings-modal" onclick="if(event.target && event.target.id==='integrityCheckModal'){ App.closeIntegrityCheckModal(); }">
            <div class="ai-settings-content" style="max-width: 920px;">
                <span class="modal-close" onclick="App.closeIntegrityCheckModal()">&times;</span>
                <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet-400/95">Integrity</div>
                <h2 class="mt-2 text-2xl font-black tracking-tight">🛡️ Full Story Integrity Check</h2>
                <p class="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">Runs on your local text AI (LM Studio / Ollama) and checks continuity, canon protection, Tang-era realism, logistics, and contradictions against your Master Document.</p>
                <div id="integrityCheckMeta" class="mt-4"></div>
                <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <button id="integrityCheckApplyBtn" type="button" class="rounded-xl bg-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 active:scale-[0.99]" onclick="App.applyIntegrityFixes()">Apply Suggested Fixes</button>
                    <button type="button" class="topbar-ghost" onclick="App.closeIntegrityCheckModal()">Close</button>
                    <div id="integrityCheckApplyStatus" class="text-sm"></div>
                </div>
                <div id="integrityCheckBody" class="mt-6"></div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

createIntegrityCheckModal();

function createTangAccuracyModal() {
    const html = `
        <div id="tangAccuracyModal" class="ai-settings-modal" onclick="if(event.target && event.target.id==='tangAccuracyModal'){ App.closeTangAccuracyModal(); }">
            <div class="ai-settings-content" style="max-width: 920px;">
                <span class="modal-close" onclick="App.closeTangAccuracyModal()">&times;</span>
                <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet-400/95">History</div>
                <h2 class="mt-2 text-2xl font-black tracking-tight">🏮 Historical Tang Accuracy Checker</h2>
                <p class="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">Strict consultant pass for <strong>Kaiyuan era (720 AD)</strong>: clothing, etiquette, hierarchy, military logistics, tech level, daily life, and anachronisms—while respecting time-travel modernization.</p>
                <div id="tangAccuracyMeta" class="mt-4"></div>
                <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <button id="tangAccuracyCopyBtn" type="button" class="rounded-xl bg-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 active:scale-[0.99]" onclick="App.copyTangAccuracyReport()">Copy Report</button>
                    <button type="button" class="topbar-ghost" onclick="App.closeTangAccuracyModal()">Close</button>
                    <div id="tangAccuracyCopyStatus" class="text-sm"></div>
                </div>
                <div id="tangAccuracyBody" class="mt-6"></div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

createTangAccuracyModal();

function createMasterScriptModal() {
    const html = `
        <div id="masterScriptModal" class="ai-settings-modal" onclick="if(event.target && event.target.id==='masterScriptModal'){ App.closeMasterScriptModal(); }">
            <div class="ai-settings-content" style="max-width: 980px;">
                <span class="modal-close" onclick="App.closeMasterScriptModal()">&times;</span>
                <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet-400/95">Master script</div>
                <h2 class="mt-2 text-2xl font-black tracking-tight">📄 Master Script / Series Treatment</h2>
                <p class="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">Living big-picture overview generated from your current story data via local text AI (LM Studio / Ollama).</p>
                <div id="masterScriptMeta" class="mt-4"></div>

                <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <button id="masterScriptCopyBtn" type="button" class="rounded-xl bg-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 active:scale-[0.99]" onclick="App.copyMasterScriptToClipboard()">Copy to Clipboard</button>
                    <button id="masterScriptSaveBtn" type="button" class="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-5 py-3 text-sm font-extrabold text-emerald-100 shadow-sm ring-1 ring-inset ring-emerald-400/15 transition hover:bg-emerald-400/15 active:scale-[0.99]" onclick="App.saveMasterScriptAsMasterDocument()">Save as Master Document</button>
                    <button id="masterScriptRegenBtn" type="button" class="rounded-xl border border-zinc-600/90 bg-zinc-900/60 px-5 py-3 text-sm font-extrabold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/80 active:scale-[0.99]" onclick="App.generateOrUpdateMasterScript()">Regenerate</button>
                    <button type="button" class="topbar-ghost" onclick="App.closeMasterScriptModal()">Close</button>
                    <div id="masterScriptCopyStatus" class="text-sm"></div>
                </div>

                <textarea id="masterScriptText" class="form-input mt-6 w-full resize-y rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 font-mono text-xs leading-relaxed text-zinc-100 shadow-inner shadow-black/30 outline-none" rows="26" readonly spellcheck="false" style="white-space: pre;"></textarea>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

createMasterScriptModal();

function createVoiceMemoModal() {
    const html = `
        <div id="voiceMemoModal" class="ai-settings-modal" onclick="if(event.target && event.target.id==='voiceMemoModal'){ App.closeVoiceMemoModal(); }">
            <div class="ai-settings-content" style="max-width: 980px;">
                <span class="modal-close" onclick="App.closeVoiceMemoModal()">&times;</span>
                <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet-400/95">Voice memo</div>
                <h2 class="mt-2 text-2xl font-black tracking-tight">🎙️ Process Spoken Idea / Voice Memo</h2>
                <p class="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">Paste a phone transcription, process with your local LLM, then apply the suggested beats/tasks directly to your story.</p>

                <div class="mt-5">
                    <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Paste voice memo transcription here…</label>
                    <textarea id="voiceMemoText" class="form-input w-full resize-y rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 font-mono text-xs leading-relaxed text-zinc-100 shadow-inner shadow-black/30 outline-none" rows="10" spellcheck="false" placeholder="Paste voice memo transcription here…"></textarea>
                </div>

                <label class="mt-4 inline-flex items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-200">
                    <input id="voiceMemoRefIssues" type="checkbox" class="h-4 w-4" />
                    Reference latest Story Integrity / Tang Accuracy issues
                </label>

                <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <button type="button" class="rounded-xl bg-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 active:scale-[0.99]" onclick="App.processVoiceMemoWithLocalLLM()">Process with Local LLM</button>
                    <button id="voiceMemoCopyBtn" type="button" class="rounded-xl border border-zinc-600/90 bg-zinc-900/60 px-5 py-3 text-sm font-extrabold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/80 active:scale-[0.99]" onclick="App.copyVoiceMemoResult()">Copy Output</button>
                    <button type="button" class="topbar-ghost" onclick="App.closeVoiceMemoModal()">Close</button>
                    <div id="voiceMemoCopyStatus" class="text-sm"></div>
                </div>

                <div id="voiceMemoMeta" class="mt-4"></div>

                <div id="voiceMemoApplyRow" class="mt-4 hidden rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
                    <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-200/80">Apply suggested actions</div>
                    <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <button type="button" class="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.applySuggestedActionsToTimeline()">Add timeline beats</button>
                        <button type="button" class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-extrabold text-emerald-100 hover:bg-emerald-500/15" onclick="App.applySuggestedActionsToWorkItems()">Add work items</button>
                        <button type="button" class="rounded-xl border border-violet-500/35 bg-violet-600/15 px-4 py-2.5 text-sm font-extrabold text-violet-100 hover:bg-violet-600/20" onclick="App.applySuggestedActionsToCharacterArcs()">Update character arcs</button>
                    </div>
                    <div class="mt-2 text-xs font-semibold text-zinc-500">These buttons apply from the newest “Voice memo processed” report (draft-only).</div>
                </div>

                <div id="voiceMemoResults" class="mt-6"></div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

function createStorySetupWizardModal() {
    const html = `
        <div id="storySetupWizardModal" class="ai-settings-modal" onclick="if(event.target && event.target.id==='storySetupWizardModal'){ App.closeStorySetupWizard(); }">
            <div class="ai-settings-content h-[100vh] w-[100vw] max-h-none overflow-y-auto rounded-none border-0 bg-zinc-950 p-8 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.85)] ring-0 sm:p-10">
                <span class="modal-close text-zinc-500 hover:text-zinc-200" onclick="App.closeStorySetupWizard()">&times;</span>
                <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet-400/95">Story Wizard</div>
                <h2 class="mt-2 text-3xl font-black tracking-tight text-zinc-50">Dan Harmon Story Circle</h2>
                <p class="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400">Each beat includes guidance and where to grow your story in the planner. Your local LLM reads those answers, asks follow-ups only when needed, then stages characters, beats, relationships, and work items for your review.</p>
                <div id="storySetupWizardBody" class="mt-6"></div>
                <div class="mt-6 flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-6">
                    <button type="button" class="topbar-ghost" onclick="App.skipStorySetupWizard()">Skip story wizard</button>
                    <button type="button" class="topbar-ghost" onclick="App.closeStorySetupWizard()">Close</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').innerHTML += html;
}

createVoiceMemoModal();
createStorySetupWizardModal();

// Start the application
App.init();
