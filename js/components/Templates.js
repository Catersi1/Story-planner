export function renderTemplates() {
  return `
    <div class="rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Library</div>
          <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">✨ Templates</h2>
        </div>
      </div>
      <p class="mb-4 mt-2 text-sm text-zinc-500">Includes the <strong class="text-zinc-700 dark:text-zinc-200">Ghost Border — The Disgraced Grandson</strong> canon pack (Feng, Prince Yu, Tang logistics beats). Other rows are trope starters. Applying a template replaces your current story data (with a confirmation prompt).</p>
      <div id="templatesContainer"></div>
    </div>
  `;
}

