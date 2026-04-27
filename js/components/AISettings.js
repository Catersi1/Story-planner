export function renderAISettings() {
  return `
    <div class="rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">AI</div>
          <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">⚙️ AI settings</h2>
        </div>
        <button class="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-extrabold text-indigo-100 hover:bg-indigo-500/15" onclick="App.openAISettings()">⚙️ Settings</button>
      </div>
      <div id="aiStatusIndicatorSettings" class="mt-3"></div>
      <p class="mb-4 mt-2 text-sm text-zinc-500">Configure LM Studio or Ollama connection details and models.</p>
      <button class="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.openAISettings()">Open AI configuration</button>
    </div>
  `;
}

