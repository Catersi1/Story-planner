/**
 * Storage Module
 * Handles all data persistence using localStorage
 */

const STORAGE_KEYS = {
    STORY_DATA: 'storyData',
    AI_SETTINGS: 'aiSettings'
};

const StorageService = {
    /**
     * Initialize default story data
     */
    initializeStoryData() {
        return {
            characters: [
                {
                    id: 1,
                    name: "Main Character",
                    age: 38,
                    role: "Scientist",
                    type: "friendly",
                    background: "A brilliant scientist who accidentally discovers a way to time travel during an experiment.",
                    personality: "Intelligent, curious, compassionate. Struggles with guilt and responsibility.",
                    relatedCharacters: [2, 3],
                    notes: "Must learn to trust her heart over logic."
                },
                {
                    id: 2,
                    name: "Prince",
                    age: 23,
                    role: "Royal",
                    type: "friendly",
                    background: "A young prince hiding his true identity to understand his people.",
                    personality: "Charming, idealistic, struggling with duty vs. desire.",
                    relatedCharacters: [1, 4],
                    notes: "Secret identity crucial to plot development."
                },
                {
                    id: 3,
                    name: "Antagonist",
                    age: 62,
                    role: "Court Official",
                    type: "antagonist",
                    background: "Powerful court member seeking to consolidate power and eliminate threats.",
                    personality: "Calculating, ambitious, manipulative.",
                    relatedCharacters: [4, 5],
                    notes: "Represents the old order that must be challenged."
                },
                {
                    id: 4,
                    name: "Bad Guy's Son",
                    age: 28,
                    role: "Soldier",
                    type: "gray",
                    background: "Son of the antagonist, forced to choose between family and morality.",
                    personality: "Conflicted, honorable, driven by conscience.",
                    relatedCharacters: [2, 3],
                    notes: "Potential ally despite family connections."
                },
                {
                    id: 5,
                    name: "Emperor",
                    age: 55,
                    role: "Ruler",
                    type: "gray",
                    background: "The aging emperor, wanting to see real change but constrained by tradition.",
                    personality: "Wise but weary, progressive but cautious.",
                    relatedCharacters: [2, 3],
                    notes: "Key to legitimizing reform."
                }
            ],
            events: [
                { id: 1, title: "Before Time Travel", period: "Prologue", order: 0, beat: "1", description: "Main character discovers experimental results", fullDescription: "" },
                { id: 2, title: "Time Travel Accident", period: "Act 1", order: 1, beat: "3", description: "Transported to Tang Dynasty during experiment", fullDescription: "" },
                { id: 3, title: "Meets the Prince", period: "Act 1", order: 2, beat: "5", description: "Encounters prince incognito in market", fullDescription: "" },
                { id: 4, title: "Court Conflict Escalates", period: "Act 2", order: 3, beat: "4", description: "Antagonist discovers her origins", fullDescription: "" },
                { id: 5, title: "Final Arc", period: "Act 3", order: 4, beat: "8", description: "Confrontation with antagonist and choice about future", fullDescription: "" }
            ],
            plot: [
                { act: "Act 1: Crossing Thresholds", content: "Main character discovers time travel and is transported. Must adapt to Tang Dynasty while hiding her origins." },
                { act: "Act 2: Road of Trials", content: "Political intrigue intensifies. Antagonist grows suspicious. Romance with prince deepens conflict." },
                { act: "Act 3: The Confrontation", content: "Truth is revealed. Must choose between returning to modern time or staying in Tang Dynasty." },
                { act: "Act 4: Transformation", content: "Resolution addresses both romance and political changes. Character transformation complete." }
            ],
            politics: [
                { section: "Court Structure", content: "The Tang Dynasty court has multiple factions competing for influence. Emperor as ultimate authority but limited by tradition." },
                { section: "Factions", content: "Conservative faction led by Antagonist vs. Progressive faction around the Prince and Emperor." },
                { section: "Prince's Backstory", content: "Prince is testing court officials to find loyal allies. His disguise allows him to judge character beyond rank." },
                { section: "Military", content: "Army control is key to power. Bad Guy's Son leads important military faction, creating tension." }
            ],
            workItems: [
                { id: 1, title: "Research Tang Dynasty etiquette and customs", category: "Historical Research", completed: false },
                { id: 2, title: "Develop prince's secret identity revelation scene", category: "Character Development", completed: false },
                { id: 3, title: "Resolve how main character can return to future", category: "Plot Holes", completed: false },
                { id: 4, title: "Detail the mechanism of time travel", category: "Worldbuilding", completed: false },
                { id: 5, title: "Write first encounter dialogue between main character and prince", category: "Dialogue", completed: false },
                { id: 6, title: "Plan antagonist's discovery scene", category: "Scene Planning", completed: false },
                { id: 7, title: "Research historical events of chosen time period", category: "Historical Research", completed: false },
                { id: 8, title: "Flesh out supporting character arcs", category: "Character Development", completed: false },
                { id: 9, title: "Clarify the love triangle dynamics", category: "Plot Holes", completed: false },
                { id: 10, title: "Develop magic/science system rules", category: "Worldbuilding", completed: false },
                { id: 11, title: "Write major action sequence", category: "Dialogue", completed: false },
                { id: 12, title: "Plan final confrontation beats", category: "Scene Planning", completed: false },
                { id: 13, title: "Research royal politics and power structures", category: "Historical Research", completed: false },
                { id: 14, title: "Define antagonist's motivation in depth", category: "Character Development", completed: false },
                { id: 15, title: "Plan romantic tension throughout acts", category: "Plot Holes", completed: false },
                { id: 16, title: "Create detailed era-appropriate settings", category: "Worldbuilding", completed: false },
                { id: 17, title: "Write climactic dialogue scenes", category: "Dialogue", completed: false },
                { id: 18, title: "Map emotional beats for each character", category: "Scene Planning", completed: false }
            ],
            aiReports: [],
            aiVisuals: [],
            masterDocument: {
                version: 1,
                format: "markdown",
                updatedAt: null,
                text: ""
            },
            visualStoryboard: {
                version: 1,
                items: []
            }
        };
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
            return parsed;
        } catch (error) {
            console.error('Error loading story data:', error);
            return this.initializeStoryData();
        }
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
