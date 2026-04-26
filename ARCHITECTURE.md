# C Drama Story Planner - Architecture and Technical Documentation

## 1) Purpose

This application is a browser-based story planning workspace for C-Drama development. It combines:

- structured story planning (characters, timeline, plot, politics, work items),
- local-first persistence (no backend required),
- AI-assisted analysis and action extraction,
- optional image generation for visual storyboarding.

The app is designed to help a writer move from concept to actionable revision and, eventually, script finalization.

## 2) High-Level Architecture

The app is a static frontend application with modular JavaScript files:

- `index.html` - full UI shell and tab layout.
- `css/styles.css` - component and layout styles.
- `js/storage.js` - localStorage persistence and default data initialization.
- `js/ai-service.js` - AI integration layer (text analysis + image generation endpoint adapter).
- `js/app.js` - UI state management, rendering, events, orchestration.

There is no backend server requirement for business logic. During development, a static server (`http-server`) is used to serve files.

## 3) Runtime Model

At runtime:

1. Browser loads `index.html`.
2. `storage.js` initializes data and settings from localStorage (with migration defaults).
3. `ai-service.js` initializes AI settings and helper methods.
4. `app.js` creates modals, initializes app state, renders tabs, and starts AI status polling.

Primary app singleton:

- `App` in `js/app.js` owns UI behavior and story editing workflows.
- `AIService` in `js/ai-service.js` owns external AI calls and response parsing.
- `StorageService` in `js/storage.js` owns persistence.

## 4) Feature Surface (What the App Does)

### Dashboard

- Shows top-level stats (characters, events, work item progress, type counts).
- Runs AI analyses directly.
- Displays AI action queue (extracted actionable lines from report history).
- Shows saved AI reports with action buttons.

### Characters

- Add character with type, role, personality, notes.
- Edit character via dedicated in-app modal.
- Delete character.
- Manage character relationships (selector modal with related character badges).
- Search/filter characters by name/role.

### Timeline

- Add timeline events mapped to Dan Harmon Story Circle beats.
- Visual circle with clickable event markers.
- Timeline list with clickable event titles for edit.
- Edit event details (title, period, beat, short and long descriptions).

### Plot / Politics

- Displays structured narrative and world/political sections from story data.

### Work Items

- Add categorized work items.
- Toggle completion.
- Edit existing item title/category.
- Delete item.
- Launch deep web search per item in new browser tab for research.

### AI Action Items

- Dedicated tab that aggregates likely actionable findings from saved AI reports.
- One-click navigation to suggested app area.
- One-click conversion into a work item.

### AI Settings

- Configure text AI provider host/port/platform/model.
- Test provider connection and list available models.
- Configure image provider endpoint/model/api key for visualizer.

### AI Visualizer

- Generate storyboard-like images from Timeline, Plot, or both.
- Customize scene count and style prompt.
- Persist generated visuals in local story data.
- Clear visual gallery.

## 5) Data Model

Main object in localStorage key `storyData` (managed by `StorageService`):

- `characters[]`
  - `id`, `name`, `age`, `role`, `type`, `background`, `personality`, `relatedCharacters[]`, `notes`
- `events[]`
  - `id`, `title`, `period`, `order`, `beat`, `description`, `fullDescription`
- `plot[]`
  - `act`, `content`
- `politics[]`
  - `section`, `content`
- `workItems[]`
  - `id`, `title`, `category`, `completed`
- `aiReports[]`
  - `id`, `type`, `title`, `content`, `status`, `createdAt`
- `aiVisuals[]`
  - `id`, `prompt`, `imageUrl`, `createdAt`

AI settings object in localStorage key `aiSettings`:

- text model settings:
  - `platform` (`lmstudio` or `ollama`)
  - `host`
  - `port`
  - `model`
- image generation settings:
  - `imageApiUrl`
  - `imageModel`
  - `imageApiKey`

## 6) Persistence and Migration Strategy

`StorageService.loadStoryData()` and `StorageService.loadAISettings()` merge/fill defaults to stay backward-compatible.

Examples:

- existing users missing `aiReports` or `aiVisuals` are auto-migrated with empty arrays,
- existing AI settings are merged with newly introduced fields.

This allows iterative feature growth without breaking old local data.

## 7) AI Integration Architecture

## Text Analysis

`AIService.callAI()` handles provider-specific chat calls:

- LM Studio: `/v1/chat/completions`
- Ollama: `/api/chat`

Response parsing includes multiple formats to handle provider variations:

- `choices[0].message.content`
- `choices[0].message.reasoning_content`
- other fallback content shapes

Connection tests:

- LM Studio: `/v1/models`
- Ollama: `/api/tags`

`App` analysis methods (`analyzeStory`, `analyzeContinuity`, `analyzeCharacters`, `analyzePlot`) persist each result/error as an AI report.

## Image Generation

`AIService.generateImage(prompt)` targets an OpenAI-compatible image endpoint (`imageApiUrl`) and supports:

- URL image payloads (`data[0].url`)
- base64 payloads (`data[0].b64_json`)

`App.generateStoryVisuals()` builds prompts from story structure and saves generated images to `storyData.aiVisuals`.

## 8) UI Rendering Strategy

Rendering is manual (string-template based), no framework.

Core pattern:

- mutate in-memory state (`App.storyData`),
- `save()` -> persist via `StorageService`,
- rerender UI sections.

Key renderers:

- `renderCharacters()`
- `renderTimelineWithCircle()`
- `renderWorkItems()`
- `renderAIReports()`
- `renderAIActionItems()`
- `renderVisualGallery()`
- `updateDashboard()`

## 9) Interaction and Navigation Patterns

- Tabs are switched by `App.switchTab(tabName)` and active state classes.
- Modals are injected at startup and shown/hidden via `.active`.
- Story Circle markers are overlayed in an absolute click layer.
- Timeline list uses title-as-click-target pattern for clarity.
- AI reports/action items provide context-driven navigation suggestions.

## 10) Error Handling Philosophy

- AI calls return explicit errors with provider response details when available.
- Connection test surfaces timeout, CORS-likely, and status-code messages.
- Empty or unsupported AI payloads become user-readable errors.
- UI actions validate required fields (e.g., non-empty names/titles).

## 11) Security and Privacy Notes

- App is local-first; story content persists in browser localStorage.
- External calls only occur when AI features are used.
- API keys for image generation are stored in localStorage as part of settings.
  - This is convenient but not hardened secret storage.
  - For production hardening, move key handling to a backend proxy.

## 12) Current Limitations

- Prompt-based provider assumptions for image generation may need adjustment per vendor.
- Some editing UX remains modal/prompt based rather than fully inline.
- No authentication, multi-user collaboration, or server-side backups.
- localStorage size limits may constrain very large datasets/history.

## 13) Extension Points

Recommended next evolutions:

1. Add provider presets and adapters for image APIs (Grok/Gemini/OpenAI variants).
2. Add export/import for AI reports and visuals.
3. Add rich inline editors for work items and report triage.
4. Add backend sync for collaboration and secure key management.
5. Add testing harness (unit + integration + smoke tests).

## 14) Quick File Responsibility Map

- `index.html`
  - Tabs, containers, and script loading order.
- `css/styles.css`
  - Layout, cards, tabs, modals, AI status/results/action queue, visual gallery.
- `js/storage.js`
  - Default dataset, migration-safe load/save helpers.
- `js/ai-service.js`
  - Text AI and image API calls, connection normalization, response parsing.
- `js/app.js`
  - App controller: state, rendering, CRUD actions, AI orchestration, visualizer flows, modal lifecycle.

---

This document should be updated whenever new tabs, data fields, AI integrations, or major UX flows are introduced.
