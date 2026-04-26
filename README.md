# C Drama Story Planner - AI Enhanced

A web-based story planning application for C Drama writers with AI integration for story analysis.

## Features

- 📖 Character management with relationships and type classification
- 📅 Timeline events mapped to Dan Harmon's Story Circle
- 🎬 Plot outline organization
- 🏛️ Political intrigue tracking
- ✅ Work item management
- 🤖 AI-powered story analysis (LM Studio & Ollama)
- 💾 Persistent local storage

## Project Structure

```
story-planner-app/
├── index.html              # Main HTML structure
├── css/
│   └── styles.css         # All styling
├── js/
│   ├── app.js             # Main application logic
│   ├── ai-service.js      # AI integration service
│   └── storage.js         # Data persistence
├── package.json           # Project metadata
└── README.md             # This file
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

All data is stored locally in your browser's LocalStorage. No data is sent to external servers except to your local AI instance (LM Studio/Ollama).
