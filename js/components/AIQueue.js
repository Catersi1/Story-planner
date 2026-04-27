export function renderAIQueue() {
  return `
    <div class="rounded-2xl border border-zinc-200/50 bg-white/80 p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70 sm:p-8">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500">Command center</div>
          <h2 class="mt-1 text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">🧠 AI Story Tasks &amp; Expansion Queue</h2>
          <p class="mb-0 mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">Clean, numbered prompts to copy into your phone Notes app. Generated after AI checks and voice memos. Persist until done or dismissed.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-violet-950/30 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 active:scale-[0.99]" onclick="App.copyAllQueueQuestions()">Copy All Questions</button>
          <button type="button" class="rounded-xl border border-zinc-200/60 bg-white/70 px-4 py-2.5 text-sm font-extrabold text-zinc-900 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:hover:bg-zinc-950" onclick="App.openVoiceMemoModal()">🎙️ Process New Voice Memo</button>
          <button type="button" class="rounded-xl border border-zinc-200/60 bg-white/70 px-4 py-2.5 text-sm font-extrabold text-zinc-900 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:hover:bg-zinc-950" onclick="App.clearExpansionQueueDismissed()">Clear dismissed</button>
        </div>
      </div>

      <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap gap-2">
          <button class="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] font-extrabold text-violet-100 hover:bg-violet-500/15" onclick="App.setExpansionQueueFilter('open')">Open</button>
          <button class="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-extrabold text-emerald-100 hover:bg-emerald-500/15" onclick="App.setExpansionQueueFilter('done')">Done</button>
          <button class="rounded-full border border-zinc-400/25 bg-zinc-400/10 px-3 py-1 text-[11px] font-extrabold text-zinc-100 hover:bg-zinc-400/15" onclick="App.setExpansionQueueFilter('dismissed')">Dismissed</button>
          <button class="rounded-full border border-zinc-600/60 bg-zinc-950/40 px-3 py-1 text-[11px] font-extrabold text-zinc-200 hover:bg-zinc-900/60" onclick="App.setExpansionQueueFilter('all')">All</button>
        </div>
        <input id="aiQueueSearch" class="form-input w-full sm:w-80" placeholder="Search queue…" oninput="App.setExpansionQueueQuery(this.value)" />
      </div>

      <div id="aiQueueStatus" class="mt-4"></div>
      <div id="aiQueueList" class="mt-4"></div>
    </div>
  `;
}

