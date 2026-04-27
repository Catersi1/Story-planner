export function renderCharacters() {
  return `
    <div class="rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Create</div>
      <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">Add new character</h2>
      <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Character name</label>
          <input type="text" id="newCharName" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="e.g., Li Wei">
        </div>
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Age</label>
          <input type="number" id="newCharAge" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="e.g., 28">
        </div>
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Role</label>
          <input type="text" id="newCharRole" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="e.g., Scientist, Prince">
        </div>
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Character type</label>
          <select id="newCharType" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100">
            <option value="friendly">🟢 Friendly</option>
            <option value="antagonist">🔴 Antagonist</option>
            <option value="gray">⚪ Gray Area</option>
          </select>
        </div>
        <div class="md:col-span-2">
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Background</label>
          <textarea id="newCharBackground" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="Character's backstory..." rows="2"></textarea>
        </div>
        <div class="md:col-span-2">
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Personality</label>
          <textarea id="newCharPersonality" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="Key personality traits..." rows="2"></textarea>
        </div>
        <div class="md:col-span-2">
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Notes</label>
          <textarea id="newCharNotes" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="Additional notes..." rows="2"></textarea>
        </div>
      </div>
      <button onclick="App.addCharacter()" class="mt-4 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105 md:w-auto">+ Add character</button>
    </div>

    <div class="mt-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input type="text" id="characterSearch" class="w-full min-w-[240px] flex-1 rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="Search characters...">
        <button class="rounded-xl border border-zinc-200/60 bg-white/70 px-4 py-2 text-sm font-extrabold text-zinc-900 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:hover:bg-zinc-950" onclick="App.toggleCanonOnly('characters')">Canon filter</button>
      </div>
      <div id="charactersContainer"></div>
    </div>
  `;
}

