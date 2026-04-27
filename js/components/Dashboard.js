export function renderDashboard() {
  return `
    <div class="dashboard-page -mx-5 -mt-1 min-w-0 space-y-8 bg-zinc-950 px-5 pb-14 pt-8 text-zinc-100 sm:-mx-6 sm:px-6">
      <!-- Top: Canon + Search -->
      <div class="dashboard-panel rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-5 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-white/[0.04] sm:p-7">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-5">
            <button
              id="canonStatusIndicator"
              type="button"
              class="flex w-full items-center gap-3 rounded-3xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-left shadow-lg transition hover:border-zinc-700 hover:bg-zinc-950/90 lg:w-auto lg:min-w-[320px]"
              onclick="App.goToDraftsReview()"
              title="Click to review drafts"
            >
              <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-400/50 bg-amber-400/10 text-lg text-amber-400 shadow-inner" aria-hidden="true">🛡️</span>
              <span id="canonStatusIndicatorText" class="min-w-0 flex-1 text-sm font-extrabold leading-snug text-zinc-400">Canon status loading…</span>
            </button>

            <div class="relative min-w-0 flex-1">
              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-violet-500/80">⌕</div>
              <input
                id="globalSearchInput"
                class="w-full rounded-3xl border border-zinc-700 bg-zinc-900 py-3 pl-11 pr-4 text-sm font-semibold text-zinc-100 shadow-inner outline-none ring-2 ring-transparent placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-violet-500/25"
                placeholder="Search characters, timeline, tasks, relationships…"
                oninput="App.onGlobalSearchQuery(this.value)"
              >
            </div>

            <div class="flex flex-wrap justify-end gap-2">
              <button type="button" class="rounded-xl border border-zinc-700/90 bg-zinc-950 px-4 py-2.5 text-sm font-extrabold text-zinc-200 shadow-md ring-1 ring-inset ring-white/[0.03] transition hover:border-violet-500/40 hover:text-white hover:shadow-[0_0_24px_-4px_rgba(139,92,246,0.2)]" onclick="App.exportStory()">Export</button>
              <button type="button" class="rounded-xl border border-zinc-700/90 bg-zinc-950 px-4 py-2.5 text-sm font-extrabold text-zinc-200 shadow-md ring-1 ring-inset ring-white/[0.03] transition hover:border-violet-500/40 hover:text-white hover:shadow-[0_0_24px_-4px_rgba(139,92,246,0.2)]" onclick="App.openImportStoryPicker()">Import</button>
              <input id="importStoryFileInput" type="file" accept="application/json,.json" class="hidden" onchange="App.importStoryFromFile(this.files?.[0] || null)">
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 border-t border-zinc-800/90 pt-5">
            <div class="mr-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500">Filters</div>
            <button type="button" id="chipTypeFriendly" onclick="App.toggleGlobalChip('characterType','friendly')">Friendly</button>
            <button type="button" id="chipTypeAntagonist" onclick="App.toggleGlobalChip('characterType','antagonist')">Antagonist</button>
            <button type="button" id="chipTypeGray" onclick="App.toggleGlobalChip('characterType','gray')">Gray</button>
            <span class="mx-1 text-zinc-600">|</span>
            <button type="button" id="chipBeat1" onclick="App.toggleGlobalChip('beat','1')">Beat 1</button>
            <button type="button" id="chipBeat2" onclick="App.toggleGlobalChip('beat','2')">Beat 2</button>
            <button type="button" id="chipBeat3" onclick="App.toggleGlobalChip('beat','3')">Beat 3</button>
            <button type="button" id="chipBeat4" onclick="App.toggleGlobalChip('beat','4')">Beat 4</button>
            <button type="button" id="chipBeat5" onclick="App.toggleGlobalChip('beat','5')">Beat 5</button>
            <button type="button" id="chipBeat6" onclick="App.toggleGlobalChip('beat','6')">Beat 6</button>
            <button type="button" id="chipBeat7" onclick="App.toggleGlobalChip('beat','7')">Beat 7</button>
            <button type="button" id="chipBeat8" onclick="App.toggleGlobalChip('beat','8')">Beat 8</button>
          </div>
        </div>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-2 gap-5 lg:grid-cols-3">
        <div class="dashboard-stat-card group rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-white/[0.03] transition duration-200 hover:border-violet-500/35 hover:shadow-[0_0_40px_-8px_rgba(139,92,246,0.28)]">
          <div class="flex items-center gap-5">
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-400/35 bg-violet-600/20 text-lg text-violet-300 shadow-[0_0_28px_rgba(139,92,246,0.2)] transition group-hover:border-violet-400/50 group-hover:text-violet-200 group-hover:shadow-[0_0_32px_rgba(139,92,246,0.35)]">👥</div>
            <div class="min-w-0">
              <div id="character-count" class="text-3xl font-black tabular-nums tracking-tight text-violet-400 sm:text-4xl">0</div>
              <div class="mt-0.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-500">Characters</div>
            </div>
          </div>
        </div>
        <div class="dashboard-stat-card group rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-white/[0.03] transition duration-200 hover:border-violet-500/35 hover:shadow-[0_0_40px_-8px_rgba(139,92,246,0.28)]">
          <div class="flex items-center gap-5">
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-400/35 bg-violet-600/20 text-lg text-violet-300 shadow-[0_0_28px_rgba(139,92,246,0.2)] transition group-hover:border-violet-400/50 group-hover:text-violet-200 group-hover:shadow-[0_0_32px_rgba(139,92,246,0.35)]">🗓️</div>
            <div class="min-w-0">
              <div id="event-count" class="text-3xl font-black tabular-nums tracking-tight text-violet-400 sm:text-4xl">0</div>
              <div class="mt-0.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-500">Timeline</div>
            </div>
          </div>
        </div>
        <div class="dashboard-stat-card group rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-white/[0.03] transition duration-200 hover:border-violet-500/35 hover:shadow-[0_0_40px_-8px_rgba(139,92,246,0.28)]">
          <div class="flex items-center gap-5">
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-400/35 bg-violet-600/20 text-lg text-violet-300 shadow-[0_0_28px_rgba(139,92,246,0.2)] transition group-hover:border-violet-400/50 group-hover:text-violet-200 group-hover:shadow-[0_0_32px_rgba(139,92,246,0.35)]">✅</div>
            <div class="min-w-0">
              <div id="task-count" class="text-3xl font-black tabular-nums tracking-tight text-violet-400 sm:text-4xl">0</div>
              <div class="mt-0.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-500">Open tasks</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Character type cards -->
      <div class="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div class="dashboard-panel rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-emerald-500/15">
          <div class="flex items-center justify-between">
            <div class="text-sm font-black tracking-tight text-emerald-400">Friendly</div>
            <div class="text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-500">Cast</div>
          </div>
          <div id="friendly-count" class="mt-4 text-4xl font-black tabular-nums tracking-tight text-zinc-50 sm:text-5xl">0</div>
        </div>
        <div class="dashboard-panel rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-rose-500/15">
          <div class="flex items-center justify-between">
            <div class="text-sm font-black tracking-tight text-rose-400">Antagonist</div>
            <div class="text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-500">Pressure</div>
          </div>
          <div id="antagonist-count" class="mt-4 text-4xl font-black tabular-nums tracking-tight text-zinc-50 sm:text-5xl">0</div>
        </div>
        <div class="dashboard-panel rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-zinc-600/25">
          <div class="flex items-center justify-between">
            <div class="text-sm font-black tracking-tight text-zinc-300">Gray</div>
            <div class="text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-500">Complexity</div>
          </div>
          <div id="gray-count" class="mt-4 text-4xl font-black tabular-nums tracking-tight text-zinc-50 sm:text-5xl">0</div>
        </div>
      </div>

      <!-- Momentum ring + Quick actions -->
      <div class="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
        <div class="dashboard-panel rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-white/[0.04] sm:p-8 lg:col-span-2">
          <div class="flex flex-col items-center justify-center gap-1 py-2">
            <div class="text-center">
              <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-zinc-500">Story Momentum</div>
              <div class="mt-1.5 text-sm font-medium text-zinc-400">Work items completed</div>
            </div>

            <div class="relative mx-auto mt-4 flex h-72 w-72 items-center justify-center sm:h-80 sm:w-80">
              <svg class="dashboard-momentum-svg h-full w-full -rotate-90 drop-shadow-[0_0_48px_rgba(139,92,246,0.35)]" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="54" stroke="#27272a" stroke-width="12" fill="none"></circle>
                <circle
                  id="momentumRing"
                  class="progress-ring__circle"
                  cx="60"
                  cy="60"
                  r="54"
                  stroke="url(#momentumGradient)"
                  stroke-width="12"
                  fill="none"
                  stroke-linecap="round"
                  stroke-dasharray="339.292"
                  stroke-dashoffset="339.292"
                ></circle>
                <defs>
                  <linearGradient id="momentumGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#a78bfa"></stop>
                    <stop offset="45%" stop-color="#8b5cf6"></stop>
                    <stop offset="100%" stop-color="#6d28d9"></stop>
                  </linearGradient>
                </defs>
              </svg>
              <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div class="flex items-baseline gap-1">
                  <span id="completion-percentage-value" class="text-6xl font-black tracking-tighter text-white tabular-nums sm:text-7xl">0</span>
                  <span class="text-4xl font-black text-violet-400 sm:text-5xl">%</span>
                </div>
                <div class="mt-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-300/95">done</div>
              </div>
            </div>

            <div class="hidden">
              <div id="completion-bar" style="width:0%"></div>
            </div>
          </div>
        </div>

        <div class="dashboard-panel rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-white/[0.04] sm:p-7">
          <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-zinc-500">Quick actions</div>
          <div class="mt-5 grid gap-3">
            <button type="button" class="dashboard-qa-btn rounded-xl bg-violet-600 px-4 py-3.5 text-left text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.openImportNotesModal()">Import notes</button>
            <button type="button" class="dashboard-qa-btn rounded-xl bg-violet-600 px-4 py-3.5 text-left text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.switchTab('templates')">Templates</button>
            <button type="button" class="dashboard-qa-btn rounded-xl bg-violet-600 px-4 py-3.5 text-left text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.switchTab('characters')">New character</button>
            <button type="button" class="dashboard-qa-btn rounded-xl bg-violet-600 px-4 py-3.5 text-left text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.switchTab('timeline')">New event</button>
            <button type="button" class="dashboard-qa-btn rounded-xl bg-violet-600 px-4 py-3.5 text-left text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.switchTab('workitems')">New task</button>
          </div>
          <div class="mt-6 border-t border-zinc-800/90 pt-6">
            <div id="aiStatusIndicator" class="min-h-[44px] text-sm text-zinc-400"></div>
          </div>
        </div>
      </div>

      <!-- Story Locations Overview (same data as Visualizer; updates with timeline) -->
      <section class="dashboard-panel rounded-[1.35rem] border border-zinc-800/90 bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-900 p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-violet-500/[0.12] sm:p-8">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div class="min-w-0">
            <div class="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-400/90">Story geography</div>
            <h2 class="mt-2 font-serif text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Story Locations Overview</h2>
            <p class="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">Where your beats live, in story order. Click a line to open the Timeline on that moment.</p>
          </div>
        </div>
        <div id="storyLocationsOverviewDashboard" class="story-locations-overview-root mt-8"></div>
      </section>

      <!-- Notes import -->
      <div class="dashboard-panel rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-white/[0.04] sm:p-8">
        <div class="flex flex-col gap-3">
          <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-zinc-500">Notes</div>
          <div class="text-2xl font-black tracking-tight text-zinc-50 sm:text-3xl">Auto‑structure raw notes</div>
          <div class="max-w-2xl text-sm leading-relaxed text-zinc-400">Paste messy ideas. Review extracted drafts before promoting anything to canon.</div>
        </div>
        <div class="mt-7">
          <textarea id="dashboardRawNotes" class="w-full rounded-2xl border border-zinc-700/90 bg-zinc-950 p-5 text-sm font-semibold leading-relaxed text-zinc-100 shadow-inner shadow-black/40 outline-none ring-2 ring-transparent placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-violet-500/25" rows="8" placeholder="Paste your full story notes here..."></textarea>
          <div class="mt-5 flex flex-wrap gap-3">
            <button type="button" class="dashboard-qa-btn rounded-xl bg-violet-600 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.analyzeAndImportDashboardNotes()">Analyze & import</button>
            <button type="button" class="rounded-xl border border-zinc-700/90 bg-zinc-950 px-6 py-3 text-sm font-extrabold text-zinc-300 shadow-md ring-1 ring-inset ring-white/[0.03] transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-white" onclick="document.getElementById('dashboardRawNotes').value=''">Clear</button>
          </div>
          <div id="dashboardImportStatus" class="mt-5 text-sm text-zinc-400"></div>
        </div>
      </div>

      <!-- Mini timeline preview -->
      <div class="dashboard-panel rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-white/[0.04] sm:p-8">
        <div class="flex flex-wrap items-end justify-between gap-6">
          <div class="min-w-0">
            <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-zinc-500">At a glance</div>
            <h3 class="mt-2 text-2xl font-black tracking-tight text-zinc-50 sm:text-3xl">Story Timeline Preview</h3>
            <p class="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">Scroll through beats in story order. Click a card to open the full timeline with that moment highlighted.</p>
          </div>
          <button type="button" class="dashboard-qa-btn shrink-0 rounded-xl bg-violet-600 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.switchTab('timeline')">Open timeline</button>
        </div>
        <div class="dashboard-mini-timeline relative mt-10 rounded-2xl border border-zinc-800/60 bg-zinc-950/60 p-5 ring-1 ring-inset ring-violet-500/[0.06] sm:p-6">
          <div class="pointer-events-none absolute inset-x-8 top-[2.65rem] z-0 h-[3px] rounded-full bg-gradient-to-r from-violet-950/20 via-violet-500/55 to-violet-950/20 shadow-[0_0_20px_rgba(139,92,246,0.35)] sm:top-[2.85rem]" aria-hidden="true"></div>
          <div class="pointer-events-none absolute inset-x-10 top-[2.75rem] z-0 h-px bg-violet-400/25 sm:top-[2.95rem]" aria-hidden="true"></div>
          <div id="dashboardMiniTimelineStrip" class="dashboard-mini-strip relative z-10 flex items-stretch gap-0 overflow-x-auto pb-2 pt-1 [-webkit-overflow-scrolling:touch] [scrollbar-color:rgba(139,92,246,0.45)_transparent] [scrollbar-width:thin]">
            <div class="flex min-w-full items-center justify-center rounded-2xl border border-dashed border-zinc-700/80 bg-zinc-900 px-6 py-12 text-center text-sm text-zinc-500">Loading beats…</div>
          </div>
        </div>
      </div>

      <!-- Drafts -->
      <div class="dashboard-panel rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-white/[0.04] sm:p-8">
        <div class="flex flex-wrap items-start justify-between gap-6">
          <div class="min-w-0">
            <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-zinc-500">Drafts</div>
            <div class="mt-2 text-2xl font-black tracking-tight text-zinc-50 sm:text-3xl">Review drafts</div>
            <div class="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">Promote intentionally, merge into canon, or delete safely.</div>
          </div>
          <button type="button" class="dashboard-qa-btn rounded-xl bg-violet-600 px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.goToDraftsReview()">Open panel</button>
        </div>
        <div class="mt-7">
          <div id="draftsReviewContainer"></div>
        </div>
      </div>

      <!-- AI (collapsible) -->
      <details id="dashboardAISection" class="dashboard-panel rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-white/[0.04] open:border-violet-500/25 open:ring-violet-500/10 sm:p-8">
        <summary class="flex cursor-pointer list-none items-center justify-between gap-4 select-none [&::-webkit-details-marker]:hidden">
          <div class="min-w-0">
            <div class="text-[11px] font-extrabold uppercase tracking-[0.18em] text-zinc-500">AI</div>
            <div class="mt-2 text-2xl font-black tracking-tight text-zinc-50 sm:text-3xl">Story analysis</div>
            <div class="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">Run deep passes on structure, continuity, and cast—collapsed by default.</div>
          </div>
          <div class="shrink-0 rounded-full border border-violet-500/35 bg-violet-950/60 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-violet-100 shadow-[0_0_20px_rgba(139,92,246,0.15)]">Toggle</div>
        </summary>

        <div class="mt-8 border-t border-zinc-800/90 pt-8">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button type="button" class="dashboard-qa-btn rounded-xl bg-violet-600 px-4 py-3.5 text-left text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.analyzeStory()">Full story analysis</button>
            <button type="button" class="dashboard-qa-btn rounded-xl bg-violet-600 px-4 py-3.5 text-left text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.analyzeContinuity()">Continuity</button>
            <button type="button" class="dashboard-qa-btn rounded-xl bg-violet-600 px-4 py-3.5 text-left text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.analyzeCharacters()">Characters</button>
            <button type="button" class="dashboard-qa-btn rounded-xl bg-violet-600 px-4 py-3.5 text-left text-sm font-extrabold text-white shadow-lg shadow-violet-950/40 ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:shadow-[0_0_28px_-4px_rgba(139,92,246,0.55)] active:scale-[0.99]" onclick="App.analyzePlot()">Plot</button>
            <button type="button" class="dashboard-qa-btn rounded-xl border border-amber-400/30 bg-zinc-950/80 px-4 py-3.5 text-left text-sm font-extrabold text-amber-100 shadow-md ring-1 ring-inset ring-amber-400/15 transition hover:border-amber-400/50 hover:bg-zinc-900 md:col-span-2" onclick="App.analyzeHistoricalAccuracy()">Historical accuracy <span class="mt-0.5 block text-[11px] font-semibold leading-snug text-zinc-400">Era, ranks, material culture, geography — not character arcs</span></button>
          </div>

          <div class="mt-4">
            <button type="button" class="dashboard-qa-btn w-full rounded-xl border border-violet-400/35 bg-gradient-to-br from-violet-950/80 to-zinc-950 px-5 py-4 text-left shadow-lg shadow-violet-950/30 ring-1 ring-inset ring-violet-500/20 transition hover:border-violet-400/55 hover:from-violet-900/70 hover:shadow-[0_0_32px_-6px_rgba(139,92,246,0.45)] active:scale-[0.99]" onclick="App.suggestStoryBuildFromIssues()">
              <span class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-violet-300/90">Issue → build</span>
              <span class="mt-1.5 block text-base font-black tracking-tight text-white">Suggest fixes &amp; builds from issues</span>
              <span class="mt-2 block text-xs font-semibold leading-relaxed text-zinc-400">Runs after continuity / character / plot passes: merges recent reports + your story into <strong class="text-zinc-300">structured actions</strong> you can apply as new beats, tasks, or character notes.</span>
            </button>
          </div>

          <div class="mt-8">
            <div id="aiRunStatus"></div>
            <div id="aiSuggestedActions"></div>
            <div id="aiActionQueue"></div>
            <div class="mt-8 flex items-center justify-between gap-4 border-t border-zinc-800/80 pt-8">
              <h3 class="m-0 text-lg font-black tracking-tight text-zinc-100">Saved reports</h3>
              <button type="button" onclick="App.clearAIReports()" class="rounded-xl border border-zinc-700/90 bg-zinc-950 px-4 py-2.5 text-sm font-extrabold text-zinc-300 ring-1 ring-inset ring-white/[0.03] transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-white">Clear</button>
            </div>
            <div id="aiResultsContainer" class="mt-4"></div>
          </div>
        </div>
      </details>

      <button
        type="button"
        class="fixed bottom-5 right-5 z-50 rounded-full bg-violet-600 px-6 py-4 text-sm font-black text-white shadow-2xl shadow-violet-950/50 ring-2 ring-violet-400/20 transition hover:bg-violet-500 hover:shadow-[0_0_36px_-4px_rgba(139,92,246,0.55)] hover:ring-violet-400/35 md:bottom-6 md:right-6"
        onclick="document.getElementById('dashboardAISection')?.setAttribute('open',''); document.getElementById('dashboardAISection')?.scrollIntoView({behavior:'smooth', block:'start'});"
        title="Open AI analysis"
      >
        AI
      </button>
    </div>
  `;
}
