# Setup Instructions for Cursor

## Getting Started

1. **Open in Cursor**
   ```bash
   # Option A: Command line
   cursor story-planner-app

   # Option B: Open folder in Cursor UI
   # File → Open Folder → Select story-planner-app
   ```

2. **Install Dependencies (optional for running locally)**
   ```bash
   npm install
   ```

3. **Run Development Server**
   ```bash
   # Start HTTP server on port 8080
   npm run dev
   
   # Or use:
   npx http-server -p 8080
   ```

4. **Open in Browser**
   ```
   http://localhost:8080
   ```

## Project Structure

```
story-planner-app/
├── index.html              # Main HTML file
├── css/
│   └── styles.css         # All styling (extracted from HTML)
├── js/
│   ├── storage.js         # LocalStorage management
│   ├── ai-service.js      # AI integration service
│   └── app.js             # Main application logic
├── package.json           # NPM configuration
├── README.md             # Feature overview
└── SETUP.md             # This file
```

## Development in Cursor

### Key Features
- **Clean separation of concerns**: Each module has a specific responsibility
- **Modular JavaScript**: Easy to test and extend
- **CSS extracted**: Makes styling changes easier
- **No build step**: Just open index.html or run http-server

### Making Changes
1. Edit CSS in `css/styles.css` for visual changes
2. Edit `js/app.js` for UI logic and component rendering
3. Edit `js/ai-service.js` to modify AI integration
4. Edit `js/storage.js` to change data persistence

### Debugging
- Open browser DevTools (F12 or Cmd+Option+I)
- Check Console tab for errors
- Use `App.storyData` in console to inspect data
- Use `AIService.connected` to check AI connection status

## Making Settings More Robust

The current `openAISettings()` function creates a modal. To improve robustness, consider:

1. **Add validation**
   ```javascript
   // In app.js - validate port number
   if (isNaN(port) || port < 1 || port > 65535) {
       alert('Port must be between 1 and 65535');
       return;
   }
   ```

2. **Add error handling**
   ```javascript
   // Better error messages for connection failures
   const success = await AIService.testConnection(host, port, platform);
   if (!success) {
       // Provide specific error details
   }
   ```

3. **Add configuration validation**
   - Check if host is reachable before saving
   - Validate model selection before saving
   - Show warnings for non-standard ports

4. **Persist connection state**
   - Save last successful connection
   - Auto-reconnect on app start
   - Show connection history

## Next Development Steps

### Easy Wins
- [ ] Add export/import story data as JSON
- [ ] Add keyboard shortcuts for common actions
- [ ] Add dark mode toggle
- [ ] Add character avatar colors

### Medium Complexity
- [ ] Add undo/redo system
- [ ] Add drag-and-drop for event reordering
- [ ] Create character relationship visualization
- [ ] Add story statistics dashboard

### Advanced Features
- [ ] Build Node.js backend for multi-user support
- [ ] Add PDF export functionality
- [ ] Create collaborative editing features
- [ ] Add automatic backups to cloud storage

## Tips for Cursor Development

1. **Use Cursor's AI features** to refactor code while maintaining functionality
2. **Ask Cursor to improve** specific sections (e.g., "Make the AI settings validation more robust")
3. **Use the integrated terminal** to run tests or development server
4. **Leverage the outline view** to navigate between functions and sections
5. **Use keyboard shortcuts** for quick navigation and editing

## Troubleshooting

### App Won't Load
- Check browser console for JavaScript errors
- Make sure all script files are loading (Network tab)
- Clear browser cache

### AI Connection Fails
- Verify LM Studio/Ollama is running
- Check host and port are correct
- Try the "Test Connection" button
- Check firewall settings

### Settings Not Saving
- Check browser console for errors
- Verify localStorage is enabled
- Try in a different browser
- Check available storage space

## Further Help

- Refer to README.md for feature overview
- Check comments in individual JS files
- Ask Cursor to explain code sections
- Review browser console errors
