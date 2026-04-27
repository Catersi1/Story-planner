# C Drama Story Planner - AI Enhanced

A web-based story planning application for C Drama writers with AI integration for story analysis.

## Features

- 📖 Character management with relationships and type classification
- 📅 Timeline events mapped to Dan Harmon's Story Circle (beats, order, **locations**, canon vs draft)
- 🗺️ **Story World Map (Ghost Border)** on the Visualizer tab: static realm SVG with a live overlay—pins from timeline `location`, glowing story path, time-travel jump hints, click-through to Timeline
- 🎬 Plot outline organization
- 🏛️ Political intrigue tracking
- ✅ Work item management
- 📊 Dashboard summaries, story momentum, and location-grouped timeline overview
- 🖼️ Visual storyboard builder and optional **image API** map gallery (Grok Imagine–style prompts)
- 🤖 AI-powered story analysis (LM Studio & Ollama)
- 💾 Persistent local storage

## Project Structure

```
AI story builder/
├── index.html              # Main HTML shell; tab bodies assembled from js/components
├── css/
│   └── styles.css          # All styling
├── js/
│   ├── app.js              # App singleton: state, rendering, CRUD, AI, map overlay logic
│   ├── ai-service.js       # AI integration (chat + image endpoints)
│   ├── storage.js          # localStorage persistence and migrations
│   └── components/         # Tab and section HTML templates (Visualizer, Timeline, etc.)
├── package.json
├── README.md               # This file
└── ARCHITECTURE.md         # Technical deep-dive (keep in sync with major changes)
```

## Development in Cursor

1. Open the `story-planner-app` folder in Cursor
2. Run `npm run dev` to start a local server on port 8080
3. Open http://localhost:8080 in your browser

## AI Configuration

### LM Studio
- Download: https://lmstudio.ai
- Default endpoint: localhost:1234
- API: OpenAI-compatible `/v1/chat/completions`

### Ollama
- Download: https://ollama.ai
- Default endpoint: localhost:11434
- API: `/api/chat` endpoint

## Next Steps for Development

- [ ] Add more robust settings with validation
- [ ] Create IndexedDB storage for larger datasets
- [ ] Add export/import functionality
- [ ] Create character visualization graphs
- [ ] Add collaborative features
- [ ] Build API backend for multi-user support
- [ ] Add PDF export for story documents
- [ ] Implement undo/redo system

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- LocalStorage support required
- CORS enabled for local AI endpoints

## Notes

All data is stored locally in your browser's LocalStorage. No data is sent to external servers except to your local AI instance (LM Studio/Ollama) or to endpoints you configure for image generation.

---

## Change log (major updates)

| When (local) | Summary |
|----------------|----------|
| **2026-04-26 17:37 CDT** | Interactive **Ghost Border** story map: timeline-driven pins and path on `Visualizer`; timeline `location` presets; README/structure refresh; documentation changelog started. |

*After each major feature or UX change, add a new row above with **date and time** and a one-line summary. Keep `ARCHITECTURE.md` aligned the same way.*
