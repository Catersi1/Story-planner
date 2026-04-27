/**
 * Storage Module
 * Handles all data persistence using localStorage
 */

export const STORAGE_KEYS = {
    STORY_DATA: 'storyData',
    AI_SETTINGS: 'aiSettings'
};

/** Preset locations for timeline events (Add/Edit Event UI). Matches Ghost Border map registry + aliases in `App.js`. */
export const TIMELINE_LOCATION_PRESETS = [
    'Time Portal Cave',
    'Disgraced Manor',
    'Forbidden Garden',
    'Imperial Market Square',
    'Daming Palace',
    'Grey Dragon Road',
    'Secret Metropolis'
];

/** `<select>` value when the stored location is custom (not a preset). */
export const TIMELINE_LOCATION_OTHER = '__other__';

/**
 * Map stored `event.location` to dropdown value + optional custom line.
 */
export function splitTimelineLocation(location) {
    const s = String(location ?? '').trim();
    if (!s) return { preset: '', custom: '' };
    if (TIMELINE_LOCATION_PRESETS.includes(s)) return { preset: s, custom: '' };
    return { preset: TIMELINE_LOCATION_OTHER, custom: s };
}

/**
 * Persist location from preset `<select>` + optional custom field.
 */
export function joinTimelineLocation(preset, custom) {
    const p = String(preset ?? '').trim();
    const c = String(custom ?? '').trim();
    if (!p) return c;
    if (p === TIMELINE_LOCATION_OTHER) return c;
    return p;
}

/**
 * Default shape for a timeline row (`storyData.events[]`): includes `location` (preset string or custom text).
 * @typedef {Object} TimelineEvent
 * @property {number} id
 * @property {string} title
 * @property {string} period
 * @property {number} order
 * @property {string|null} beat
 * @property {string} description
 * @property {string} location
 * @property {string} fullDescription
 * @property {number[]} involvedCharacterIds
 * @property {boolean} isCanon
 * @property {string[]} tags
 */

/**
 * Create a timeline row with defaults; `location` defaults to "".
 * @param {Object} [overrides]
 * @returns {TimelineEvent}
 */
export function createTimelineEvent(overrides = {}) {
    return {
        id: 0,
        title: '',
        period: '',
        order: 0,
        beat: null,
        description: '',
        location: '',
        fullDescription: '',
        involvedCharacterIds: [],
        isCanon: false,
        tags: [],
        ...overrides
    };
}

/** Same as {@link createTimelineEvent} (legacy name). */
export function createEmptyTimelineEvent(overrides = {}) {
    return createTimelineEvent(overrides);
}

/**
 * Merge `patch` into a timeline event and normalize `location` (string) and arrays.
 * @param {Object|null|undefined} event
 * @param {Object} [patch]
 * @returns {TimelineEvent}
 */
export function updateTimelineEvent(event, patch = {}) {
    const base = event && typeof event === 'object' ? event : {};
    const next = { ...base, ...patch };
    if (typeof next.location !== 'string') {
        next.location = '';
    }
    if (!Array.isArray(next.involvedCharacterIds)) {
        next.involvedCharacterIds = [];
    }
    if (!Array.isArray(next.tags)) {
        next.tags = [];
    }
    if (typeof next.isCanon !== 'boolean') {
        next.isCanon = false;
    }
    return /** @type {TimelineEvent} */ (next);
}

/**
 * Canon starter pack: **Ghost Border — The Disgraced Grandson** (Feng, Prince Yu, Tang logistics realism).
 * Used by `initializeStoryData()` and by `App.buildTemplateGhostBorderDisgracedGrandson()`.
 * @returns {{ characters: object[], events: object[], plot: object[], politics: object[], workItems: object[] }}
 */
export function getGhostBorderCanonStoryCore() {
    const characters = [
        {
            id: 1,
            name: 'Feng',
            age: 38,
            role: 'Disgraced grandson · logistics veteran',
            type: 'friendly',
            background: 'Battle-hardened 38-year-old veteran pulled through a lightning-struck time portal. Former military logistics officer: systems, routes, ration accounting, and cold-truth efficiency. Carries the “disgraced grandson” look—worn cloak, rope-burned hands, eyes that inventory exits before pleasantries.',
            personality: 'Pragmatic, sparing with words, dry humor under stress. Scar-first posture; distrusts court poetry until it proves useful.',
            relatedCharacters: [2, 3, 4],
            notes: 'Relationship (uneasy ally) with Prince Yu: Feng reads Yu as “soft hands, hard spine”—someone hiding rank.\nRelationship (professional trust) with Commander Lu: Lu holds the yard; Feng holds the numbers.\nRelationship (partner) with Lady Lin: she runs rumors and ledgers; he runs tools and risk.',
            isCanon: true,
            tags: ['protagonist', 'ghost-border', 'time-slip']
        },
        {
            id: 2,
            name: 'Prince Yu',
            age: 23,
            role: 'Survivor royal (incognito)',
            type: 'friendly',
            background: 'Young prince who lived through betrayal and now wants breath as a man, not a title. Moves quietly through border counties, testing who still remembers duty over lineage.',
            personality: 'Quiet, introspective, observant. Courtesy as armor; anger slow to rise but expensive when it does.',
            relatedCharacters: [1, 3, 5],
            notes: 'Relationship (mutual cover) with Feng: Yu needs competence without questions; Feng needs protection without bows.\nRelationship (loyalty under orders) with Commander Lu: childhood tether; Lu would die for him and hates that fact.\nRelationship (enemy of my enemy) with Minister Cui: Cui’s faction broke Yu’s world once—Yu does not forget.',
            isCanon: true,
            tags: ['royal', 'incognito']
        },
        {
            id: 3,
            name: 'Commander Lu',
            age: 44,
            role: 'Scarred general · loyal enforcer',
            type: 'friendly',
            background: 'Massive, road-weathered general who enforces Prince Yu’s safety like a religion. Commands a small loyal cadre; prefers drill yards to tea poems.',
            personality: 'Few words, loud integrity. Measures people by how they stand watch, not how they quote classics.',
            relatedCharacters: [1, 2, 4, 5],
            notes: 'Relationship (soldier’s respect) with Feng: hates Feng’s “strange talk,” loves that Feng makes the men eat on time.\nRelationship (oath-bound) with Prince Yu: would burn a province to keep Yu breathing.\nRelationship (cautious respect) with Lady Lin: accepts her schemes if they save blood.',
            isCanon: true,
            tags: ['military']
        },
        {
            id: 4,
            name: 'Lady Lin',
            age: 34,
            role: 'Strategist · Feng’s wife',
            type: 'friendly',
            background: 'Brilliant tactician behind the disgraced branch’s survival: marriage alliances, grain rumors, who owes whom in the market. Reads court edicts like battle maps.',
            personality: 'Warm in private, steel in public. Laughs rarely; when she does, the room exhales.',
            relatedCharacters: [1, 2, 3],
            notes: 'Relationship (marriage of survival) with Feng: love is proven in ledgers shared at midnight.\nRelationship (political sisterhood-in-arms) with Prince Yu: teaches Yu how gossip moves faster than horses.\nRelationship (chain of command) with Commander Lu: she plans; he hits.',
            isCanon: true,
            tags: ['strategist']
        },
        {
            id: 5,
            name: 'Minister Cui Hang',
            age: 62,
            role: 'Grand Secretary (high court)',
            type: 'antagonist',
            background: 'Senior minister of the Chancellery: silk voice, jade-calm face, files that ruin families. Survived three reigns by never standing in the wrong shadow.',
            personality: 'Cold, intelligent, ruthless. Rewards competence that serves him; buries competence that does not.',
            relatedCharacters: [2, 3],
            notes: 'Relationship (predator) with Prince Yu: knows a prince’s footprint even in peasant boots.\nRelationship (instrumental view) with Commander Lu: a blade he cannot buy—therefore a blade he will break.',
            isCanon: true,
            tags: ['antagonist', 'court']
        }
    ];

    const events = [
        {
            id: 1,
            title: 'Lightning in the Time Portal Cave',
            period: 'Ep 1 · cold open',
            order: 0,
            beat: '1',
            description: 'Thunder splits the cliff; ozone and wet stone. Feng snaps awake with a mouth full of ash, hands already checking pulse and gear—muscle memory before thought.',
            location: 'Time Portal Cave',
            fullDescription: 'You / establish protagonist: sensory overload, no exposition dump—only what his body does when the world wrong-foots him.',
            involvedCharacterIds: [1],
            isCanon: true,
            tags: ['beat-1', 'portal']
        },
        {
            id: 2,
            title: 'Dragged back to the Disgraced Manor',
            period: 'Ep 1',
            order: 1,
            beat: '2',
            description: 'Torches, rough ropes, familiar shame. The Feng compound is half ruin: broken gate spirit, millet porridge thin as rumor. He needs allies, food, and silence—immediately.',
            location: 'Disgraced Manor',
            fullDescription: 'Need: survival stakes; the house is a character—drafts through paper windows, ancestors who do not forgive.',
            involvedCharacterIds: [1, 4],
            isCanon: true,
            tags: ['beat-2']
        },
        {
            id: 3,
            title: 'Courtyard: Prince Yu and Commander Lu',
            period: 'Ep 1–2',
            order: 2,
            beat: '3',
            description: 'At false dawn, two men wait in the yard like a trial. Yu speaks softly; Lu does not speak at all. Feng realizes he has crossed from “lost” into someone else’s war.',
            location: 'Disgraced Manor',
            fullDescription: 'Go / threshold: first crossing into the hidden royal orbit—no crowns, only posture and consequence.',
            involvedCharacterIds: [1, 2, 3, 4],
            isCanon: true,
            tags: ['beat-3']
        },
        {
            id: 4,
            title: 'Forbidden Garden: herbs, walls, and watchers',
            period: 'Ep 2',
            order: 3,
            beat: '4',
            description: 'Lin maps which walls echo and which do not. Feng catalogs plants like supply lines—what burns, what steeps, what sells without questions.',
            location: 'Forbidden Garden',
            fullDescription: 'Search: intelligence gathering as physical labor; Tang-era plant names where possible; tension through chores.',
            involvedCharacterIds: [1, 4],
            isCanon: true,
            tags: ['beat-4']
        },
        {
            id: 5,
            title: "Dragon's Breath — first primitive still",
            period: 'Ep 2–3',
            order: 4,
            beat: '5',
            description: 'Copper scrap, clay seal, bad odds. The first distillate catches—blue flame, men crossing themselves. It is not magic; it is heat management, and it changes what they can trade.',
            location: 'Disgraced Manor',
            fullDescription: 'Find / “goddess”: the still as earned miracle—show chemistry through sweat and failure beats, not lecture.',
            involvedCharacterIds: [1, 3, 4],
            isCanon: true,
            tags: ['beat-5', 'still']
        },
        {
            id: 6,
            title: 'Imperial Market Square: salt talk and knives in smiles',
            period: 'Ep 3',
            order: 5,
            beat: '6',
            description: 'Yu haggles in plain cloth; Feng moves crates like a sergeant. A salt merchant’s joke lands wrong—someone is listening for accents that do not belong.',
            location: 'Imperial Market Square',
            fullDescription: 'Take / price: visibility buys supplies and buys danger; court eyes as commerce.',
            involvedCharacterIds: [1, 2, 4],
            isCanon: true,
            tags: ['beat-6']
        },
        {
            id: 7,
            title: 'Grey Dragon Road: escort and rumor',
            period: 'Ep 3–4',
            order: 6,
            beat: '7',
            description: 'Dust column on the road—Lu’s men form a traveling shell. Feng teaches march intervals using pebbles and breath, not slogans. A toll clerk remembers faces.',
            location: 'Grey Dragon Road',
            fullDescription: 'Return: bringing hard-won logistics knowledge “home” to the unit; the road remembers.',
            involvedCharacterIds: [1, 3],
            isCanon: true,
            tags: ['beat-7']
        },
        {
            id: 8,
            title: 'Daming Palace: distance, drums, and a lesson in power',
            period: 'Ep 4',
            order: 7,
            beat: '8',
            description: 'From a pilgrim vantage, Feng watches scarlet columns swallow sound. He understands scale: the manor is a skirmish; this is a campaign map with no friendly margins.',
            location: 'Daming Palace',
            fullDescription: 'Change: worldview shift—Tang authority as logistics of violence and ritual.',
            involvedCharacterIds: [1, 2],
            isCanon: true,
            tags: ['beat-8']
        },
        {
            id: 9,
            title: 'Lady Lin and Prince Yu — ledger and lineage',
            period: 'Ep 4',
            order: 8,
            beat: '5',
            description: 'In the garden’s blind corner, Lin lays out names like chess. Yu admits what he cannot print on paper. The alliance stops being convenient and becomes chosen.',
            location: 'Forbidden Garden',
            fullDescription: '',
            involvedCharacterIds: [2, 4],
            isCanon: true,
            tags: ['alliance']
        },
        {
            id: 10,
            title: "Minister Cui's net tightens",
            period: 'Ep 4–5',
            order: 9,
            beat: '6',
            description: 'A chancellery memo travels faster than horses: “foreign methods,” “unregistered stills,” “prince-shaped rumors.” Cui does not accuse; he arranges.',
            location: 'Daming Palace',
            fullDescription: '',
            involvedCharacterIds: [5, 2],
            isCanon: true,
            tags: ['antagonist-pressure']
        },
        {
            id: 11,
            title: 'Secret Metropolis: smoke on the horizon (draft)',
            period: 'Ep 5+ outline',
            order: 10,
            beat: '4',
            description: 'PLACEHOLDER: whispers of a river-bend settlement where “sky metal” is traded—prep for later arc; do not resolve on-screen yet.',
            location: 'Secret Metropolis',
            fullDescription: 'Draft beat for industrial/spy thread; keep details sparse until research pass.',
            involvedCharacterIds: [],
            isCanon: false,
            tags: ['draft']
        },
        {
            id: 12,
            title: 'Paper pulp trial at the market sheds (draft)',
            period: 'Ep 5+ outline',
            order: 11,
            beat: '4',
            description: 'PLACEHOLDER: Feng tests fiber length for forged travel permits vs. legitimate bills—legal drama hook.',
            location: 'Imperial Market Square',
            fullDescription: '',
            involvedCharacterIds: [1],
            isCanon: false,
            tags: ['draft', 'paper']
        },
        {
            id: 13,
            title: 'Manor drill: spear wall in the mud (draft)',
            period: 'Ep 5+ outline',
            order: 12,
            beat: '3',
            description: 'PLACEHOLDER: Lu runs recruits; Feng introduces simple whistle signals—culture clash as comedy and dread.',
            location: 'Disgraced Manor',
            fullDescription: '',
            involvedCharacterIds: [1, 3],
            isCanon: false,
            tags: ['draft', 'training']
        },
        {
            id: 14,
            title: 'Grey Dragon toll dispute — whose seal counts? (draft)',
            period: 'Ep 5+ outline',
            order: 13,
            beat: '6',
            description: 'PLACEHOLDER: bureaucratic violence; a seal ring that does not match the roster.',
            location: 'Grey Dragon Road',
            fullDescription: '',
            involvedCharacterIds: [3, 5],
            isCanon: false,
            tags: ['draft']
        },
        {
            id: 15,
            title: 'Second storm omen at the cave mouth (draft)',
            period: 'Ep 6+ outline',
            order: 14,
            beat: '2',
            description: 'PLACEHOLDER: portal instability returns—physical stakes, not mystic babble.',
            location: 'Time Portal Cave',
            fullDescription: '',
            involvedCharacterIds: [1],
            isCanon: false,
            tags: ['draft', 'portal']
        }
    ];

    const plot = [
        {
            act: 'Act I — Ash, Manor, First Flame',
            content: 'Feng crosses from the cave into disgrace and duty. The still (“Dragon’s Breath”) becomes proof they can fight on Tang terms: trade, training, and secrecy—not speeches.'
        },
        {
            act: 'Act II — Market Eyes, Road Blood, Palace Shadow',
            content: 'Visibility buys leverage and enemies. Yu’s incognito frays; Cui arranges without shouting. The Ghost Border stops being geography and becomes a ledger of who is allowed to live.'
        },
        {
            act: 'Act III — Steel, Paper, Throne',
            content: 'Industrial edges (paper, distillation, signals) collide with court law. Feng must choose what “home” means when the portal storms again and Yu’s name is forced into the open.'
        }
    ];

    const politics = [
        {
            section: 'Chancellery vs. border realism',
            content: 'Minister Cui Hang controls memoranda, impeachment rhythms, and “economic morality.” The Feng branch survives in the cracks: small stills, tolerated smuggling routes, marriage webs Lady Lin tends.'
        },
        {
            section: 'Prince Yu’s survival politics',
            content: 'Yu is not hiding for romance—he is buying time after betrayal. Incognito travel lets him see which commanders still move like Tang soldiers, not landlord thugs.'
        },
        {
            section: 'Military logistics (Tang-grounded)',
            content: 'Granaries, relay horses, corvée labor, and river barges matter more than duels. Commander Lu’s legitimacy is tied to men fed on schedule; Feng’s modern sense of throughput reads as sorcery until it eats.'
        },
        {
            section: 'Antagonist philosophy',
            content: 'Cui does not sneer at technology—he weaponizes regulation. Paper trails beat swords if the ink is the right color.'
        }
    ];

    const workItems = [
        { id: 1, title: 'Research Tang distillation, salt monopoly, and sulfur availability (Ghost Border counties)', category: 'Historical Research', completed: true, isCanon: true, tags: ['canon'] },
        { id: 2, title: "Blueprint v1 of the 'Dragon's Breath' pot still (copper, clay, safety fail-modes)", category: 'Worldbuilding', completed: true, isCanon: true, tags: ['canon', 'still'] },
        { id: 3, title: 'Paper fiber tests for forged travel permits vs. legitimate chancellery stock', category: 'Historical Research', completed: false, isCanon: true, tags: ['canon', 'paper'] },
        { id: 4, title: 'Drill script: spear wall + whistle signals (manor yard, mud, comedy/dread)', category: 'Scene Planning', completed: false, isCanon: true, tags: ['canon', 'training'] },
        { id: 5, title: 'Map Grey Dragon Road toll stations, bribes, and roster seal patterns', category: 'Worldbuilding', completed: false, isCanon: true, tags: ['canon'] },
        { id: 6, title: "Vet Prince Yu's cover story against court genealogy records (what Cui can check)", category: 'Character Development', completed: false, isCanon: true, tags: ['canon'] },
        { id: 7, title: 'Minister Cui Hang: client list, impeachment habits, favorite clerks (antagonist bible)', category: 'Character Development', completed: false, isCanon: true, tags: ['canon'] },
        { id: 8, title: 'Episode 4: cold open — Daming Palace drums from pilgrim distance (shot list)', category: 'Scene Planning', completed: false, isCanon: false, tags: ['draft'] },
        { id: 9, title: 'Secret Metropolis thread: what “sky metal” rumor means materially (research)', category: 'Plot Holes', completed: false, isCanon: false, tags: ['draft'] },
        { id: 10, title: 'Write courtyard first-meet dialogue (Feng / Yu / Lu) — no rank reveal on page', category: 'Dialogue', completed: false, isCanon: true, tags: ['canon'] }
    ];

    return { characters, events, plot, politics, workItems };
}

export const StorageService = {
    /**
     * Initialize default story data
     */
    initializeStoryData() {
        const core = getGhostBorderCanonStoryCore();
        return {
            ...core,
            aiReports: [],
            aiVisuals: [],
            masterDocument: {
                version: 1,
                format: 'markdown',
                updatedAt: null,
                text: ''
            },
            visualStoryboard: {
                version: 1,
                items: []
            },
            storyWorldMapGallery: {
                version: 1,
                items: []
            }
        };
    },

    /**
     * Replace persisted story with the built-in **Ghost Border — The Disgraced Grandson** canon
     * (see `getGhostBorderCanonStoryCore()`): Feng, Prince Yu, mapped timeline locations, protected beats.
     * @returns {object}
     */
    loadDefaultStory() {
        const data = this.initializeStoryData();
        this.saveStoryData(data);
        return data;
    },

    /**
     * Initialize default AI settings
     */
    initializeAISettings() {
        return {
            platform: 'lmstudio',
            host: 'localhost',
            port: 1234,
            model: 'auto',
            imageProvider: 'openai_compatible',
            imageApiUrl: 'https://api.x.ai/v1/images/generations',
            imageModel: 'grok-2-image',
            imageApiKey: '',
            nanoBananaApiKey: '',
            researchMode: 'both',
            deepResearchApiUrl: 'http://127.0.0.1:2024/research',
            deepResearchApiKey: ''
        };
    },

    /**
     * Load story data from localStorage
     */
    loadStoryData() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.STORY_DATA);
            if (!data) return this.initializeStoryData();

            const parsed = JSON.parse(data);
            const defaults = this.initializeStoryData();
            // Backward-compatible migration for existing users.
            if (!Array.isArray(parsed.aiReports)) {
                parsed.aiReports = [];
            }
            if (!Array.isArray(parsed.aiVisuals)) {
                parsed.aiVisuals = [];
            }
            if (!parsed.masterDocument || typeof parsed.masterDocument !== 'object') {
                parsed.masterDocument = defaults.masterDocument;
            } else {
                parsed.masterDocument = {
                    ...defaults.masterDocument,
                    ...parsed.masterDocument
                };
            }
            if (!parsed.visualStoryboard || typeof parsed.visualStoryboard !== 'object') {
                parsed.visualStoryboard = defaults.visualStoryboard;
            } else {
                parsed.visualStoryboard = {
                    ...defaults.visualStoryboard,
                    ...parsed.visualStoryboard
                };
                if (!Array.isArray(parsed.visualStoryboard.items)) {
                    parsed.visualStoryboard.items = [];
                }
            }
            if (!parsed.storyWorldMapGallery || typeof parsed.storyWorldMapGallery !== 'object') {
                parsed.storyWorldMapGallery = defaults.storyWorldMapGallery;
            } else {
                parsed.storyWorldMapGallery = {
                    ...defaults.storyWorldMapGallery,
                    ...parsed.storyWorldMapGallery
                };
                if (!Array.isArray(parsed.storyWorldMapGallery.items)) {
                    parsed.storyWorldMapGallery.items = [];
                }
            }

            // Migration: ensure timeline events can store involved characters.
            if (Array.isArray(parsed.events)) {
                parsed.events = parsed.events.map(e => {
                    if (!e || typeof e !== 'object') return e;
                    if (!Array.isArray(e.involvedCharacterIds)) {
                        e.involvedCharacterIds = [];
                    }
                    if (typeof e.isCanon !== 'boolean') {
                        e.isCanon = false;
                    }
                    if (!Array.isArray(e.tags)) {
                        e.tags = [];
                    }
                    if (typeof e.location !== 'string') {
                        e.location = '';
                    }
                    return e;
                });
            }

            // Migration: canon + tags for characters and work items.
            if (Array.isArray(parsed.characters)) {
                parsed.characters = parsed.characters.map(c => {
                    if (!c || typeof c !== 'object') return c;
                    if (typeof c.isCanon !== 'boolean') c.isCanon = false;
                    if (!Array.isArray(c.tags)) c.tags = [];
                    return c;
                });
            }
            if (Array.isArray(parsed.workItems)) {
                parsed.workItems = parsed.workItems.map(w => {
                    if (!w || typeof w !== 'object') return w;
                    if (typeof w.isCanon !== 'boolean') w.isCanon = false;
                    if (!Array.isArray(w.tags)) w.tags = [];
                    return w;
                });
            }
            return parsed;
        } catch (error) {
            console.error('Error loading story data:', error);
            return this.initializeStoryData();
        }
    },

    toggleCanon(id, type) {
        const data = this.loadStoryData();
        const numId = Number(id);
        if (!Number.isFinite(numId)) return false;

        let collection;
        if (type === 'character') collection = data.characters;
        if (type === 'timeline') collection = data.events;
        if (type === 'workItem') collection = data.workItems;
        if (!Array.isArray(collection)) return false;

        const item = collection.find(x => x && x.id === numId);
        if (!item) return false;
        item.isCanon = !Boolean(item.isCanon);
        this.saveStoryData(data);
        return item.isCanon;
    },

    isCanonProtected(id, type) {
        const data = this.loadStoryData();
        const numId = Number(id);
        if (!Number.isFinite(numId)) return false;

        let collection;
        if (type === 'character') collection = data.characters;
        if (type === 'timeline') collection = data.events;
        if (type === 'workItem') collection = data.workItems;
        if (!Array.isArray(collection)) return false;

        const item = collection.find(x => x && x.id === numId);
        return Boolean(item?.isCanon);
    },

    getAllCanonItems() {
        const data = this.loadStoryData();
        const onlyCanon = (arr) => (Array.isArray(arr) ? arr.filter(x => x && x.isCanon) : []);
        return {
            characters: onlyCanon(data.characters),
            timelineEvents: onlyCanon(data.events),
            workItems: onlyCanon(data.workItems)
        };
    },

    /**
     * Save story data to localStorage
     */
    saveStoryData(data) {
        try {
            localStorage.setItem(STORAGE_KEYS.STORY_DATA, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error saving story data:', error);
            return false;
        }
    },

    /**
     * Load AI settings from localStorage
     */
    loadAISettings() {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.AI_SETTINGS);
            if (!data) return this.initializeAISettings();

            const parsed = JSON.parse(data);
            const defaults = this.initializeAISettings();
            return { ...defaults, ...parsed };
        } catch (error) {
            console.error('Error loading AI settings:', error);
            return this.initializeAISettings();
        }
    },

    /**
     * Save AI settings to localStorage
     */
    saveAISettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEYS.AI_SETTINGS, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving AI settings:', error);
            return false;
        }
    },

    /**
     * Import story notes by extracting structured JSON using the local AI service.
     * Returns a normalized object:
     * {
     *   characters: [{ name, type, description }],
     *   timelineEvents: [{ title, description, beatType, orderHint }],
     *   relationships: [{ from, to, type, description }],
     *   politics: [{ section, content }],
     *   workItems: [{ title, category }]
     * }
     */
    async importFromNotes(text) {
        const notes = String(text || '').trim();
        if (!notes) {
            throw new Error('No notes provided.');
        }
        if (typeof globalThis.AIService === 'undefined' || !globalThis.AIService?.callAI) {
            throw new Error('AIService is not available.');
        }

        const canon = this.getAllCanonItems();
        const canonBrief = {
            characters: (canon.characters || []).map(c => ({ name: c.name, type: c.type, background: c.background })),
            timelineEvents: (canon.timelineEvents || []).map(e => ({ title: e.title, beat: e.beat, description: e.description })),
            workItems: (canon.workItems || []).map(w => ({ title: w.title, category: w.category }))
        };

        const prompt = `Extract the following from the user's story notes:
- List of characters with short descriptions and types (Friendly, Antagonist, Gray)
- Timeline events with approximate order and beat type (Setup, Catalyst, etc.)
- Key relationships
- Any political intrigue or world-building elements
Return structured JSON matching our data models.

Respect all items marked isCanon: true. Never contradict or delete canon information. Suggest new draft items instead.

IMPORTANT:
- Output ONLY valid JSON (no markdown, no code fences).
- Use this exact top-level shape:
{
  "characters": [{"name": "...", "type": "friendly|antagonist|gray", "description": "..."}],
  "timelineEvents": [{"title": "...", "description": "...", "beatType": "...", "orderHint": 1}],
  "relationships": [{"from": "...", "to": "...", "type": "ally|enemy|family|romance|mentor|rival|other", "description": "..."}],
  "politics": [{"section": "...", "content": "..."}],
  "workItems": [{"title": "...", "category": "Historical Research|Character Development|Plot Holes|Worldbuilding|Dialogue|Scene Planning"}]
}

CANON (Protected, do not contradict):
${JSON.stringify(canonBrief, null, 2)}

NOTES:
${notes}`;

        const raw = await globalThis.AIService.callAI(prompt, 900);
        const parsed = this.parsePossiblyWrappedJSON(raw);
        return this.normalizeImportedNotes(parsed);
    },

    parsePossiblyWrappedJSON(rawText) {
        const raw = String(rawText || '').trim();
        if (!raw) {
            throw new Error('AI returned an empty response.');
        }

        // Strip common markdown fences if they appear despite instructions.
        let cleaned = raw
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/```$/i, '')
            .trim();

        // If response contains other text, try to extract the first JSON object.
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }

        try {
            return JSON.parse(cleaned);
        } catch (error) {
            throw new Error('Could not parse JSON from AI response. Try simplifying notes or re-run.');
        }
    },

    normalizeImportedNotes(obj) {
        const safeArr = (v) => Array.isArray(v) ? v : [];
        const safeStr = (v) => String(v ?? '').trim();
        const normalizeType = (t) => {
            const x = safeStr(t).toLowerCase();
            if (x.startsWith('ant')) return 'antagonist';
            if (x.startsWith('g')) return 'gray';
            return 'friendly';
        };

        const normalized = {
            characters: safeArr(obj?.characters).map(c => ({
                name: safeStr(c?.name),
                type: normalizeType(c?.type),
                description: safeStr(c?.description || c?.background || c?.notes || '')
            })).filter(c => c.name),

            timelineEvents: safeArr(obj?.timelineEvents).map(e => ({
                title: safeStr(e?.title),
                description: safeStr(e?.description),
                beatType: safeStr(e?.beatType),
                location: safeStr(e?.location),
                orderHint: Number.isFinite(Number(e?.orderHint)) ? Number(e.orderHint) : null
            })).filter(e => e.title),

            relationships: safeArr(obj?.relationships).map(r => ({
                from: safeStr(r?.from),
                to: safeStr(r?.to),
                type: safeStr(r?.type || 'other').toLowerCase(),
                description: safeStr(r?.description)
            })).filter(r => r.from && r.to),

            politics: safeArr(obj?.politics).map(p => ({
                section: safeStr(p?.section || 'Imported Notes'),
                content: safeStr(p?.content)
            })).filter(p => p.content),

            workItems: safeArr(obj?.workItems).map(w => ({
                title: safeStr(w?.title),
                category: safeStr(w?.category || 'Scene Planning')
            })).filter(w => w.title)
        };

        return normalized;
    },

    /**
     * Export story data as JSON
     */
    exportStoryData(storyData) {
        const dataStr = JSON.stringify(storyData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `story-data-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    },

    /**
     * Import story data from JSON file
     */
    importStoryData(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                callback(data);
            } catch (error) {
                console.error('Error importing story data:', error);
                alert('Invalid story data file');
            }
        };
        reader.readAsText(file);
    },

    /**
     * Clear all data (backup first!)
     */
    clearAllData() {
        if (confirm('This will delete all your story data. This cannot be undone. Are you sure?')) {
            localStorage.removeItem(STORAGE_KEYS.STORY_DATA);
            localStorage.removeItem(STORAGE_KEYS.AI_SETTINGS);
            location.reload();
        }
    }
};

// Keep legacy global access for inline onclick handlers.
globalThis.StorageService = StorageService;
