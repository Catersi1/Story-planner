export function renderWorkItems() {
  return `
    <div class="rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Tasks</div>
          <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">Add work item</h2>
        </div>
        <button class="rounded-xl border border-zinc-200/60 bg-white/70 px-4 py-2 text-sm font-extrabold text-zinc-900 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:hover:bg-zinc-950" onclick="App.toggleCanonOnly('workitems')">Canon filter</button>
      </div>
      <div class="mb-4 mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <input type="text" id="newWorkTitle" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="Task title...">
        <select id="newWorkCategory" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100">
          <option value="Historical Research">Historical Research</option>
          <option value="Character Development">Character Development</option>
          <option value="Plot Holes">Plot Holes</option>
          <option value="Worldbuilding">Worldbuilding</option>
          <option value="Dialogue">Dialogue</option>
          <option value="Scene Planning">Scene Planning</option>
        </select>
      </div>
      <button onclick="App.addWorkItem()" class="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105 md:w-auto">+ Add work item</button>
    </div>
    <div id="workitemsContainer"></div>
  `;
}

