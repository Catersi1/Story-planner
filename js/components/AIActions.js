export function renderAIActions() {
  return `
    <div class="rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">AI</div>
          <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">🚨 AI action items</h2>
        </div>
        <button class="rounded-xl border border-zinc-200/60 bg-white/70 px-3 py-2 text-xs font-extrabold text-zinc-900 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:hover:bg-zinc-950" onclick="App.switchTab('dashboard')">Back to dashboard</button>
      </div>
      <p class="mb-4 mt-2 text-sm text-zinc-500">Priority lines extracted from AI reports. On the Dashboard, use <strong class="text-zinc-600 dark:text-zinc-300">Suggest fixes &amp; builds from issues</strong> to turn findings into structured timeline / task / arc suggestions, then apply them from the checklist below.</p>
      <div id="aiActionItemsContainer"></div>
    </div>
  `;
}

