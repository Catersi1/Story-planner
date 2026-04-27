export function renderMasterDocument() {
  return `
    <div class="rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Output</div>
          <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">📜 Master document</h2>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.regenerateMasterDocument()">Regenerate</button>
          <button class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-extrabold text-emerald-100 hover:bg-emerald-500/15" onclick="App.copyMasterDocument()">Copy</button>
          <button class="rounded-xl border border-zinc-200/60 bg-white/70 px-3 py-2 text-xs font-extrabold text-zinc-900 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:hover:bg-zinc-950" onclick="App.downloadMasterDocument()">Download .md</button>
        </div>
      </div>
      <p class="mb-4 mt-2 text-sm text-zinc-500">
        This is an auto-updated master script that tracks your story architecture (characters, beats, outline, politics)
        and progress (work items + gaps). It updates whenever you save changes.
      </p>
      <div id="masterDocumentMeta" class="mb-3 text-sm text-zinc-500"></div>
      <textarea id="masterDocumentText" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 p-4 font-mono text-xs leading-relaxed text-zinc-900 shadow-sm outline-none ring-indigo-500/30 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" rows="26" readonly style="white-space: pre;"></textarea>
      <div id="masterDocumentStatus" class="mt-3"></div>
    </div>
  `;
}

