export function renderVisualizer() {
  return `
    <section class="story-ghost-border-map mt-0 w-full rounded-[1.35rem] border border-zinc-800/90 bg-zinc-900 p-6 shadow-[0_28px_70px_-22px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-violet-500/[0.14] sm:p-8">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div class="min-w-0">
          <div class="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-400/95">Realm atlas</div>
          <h2 class="mt-1 text-2xl font-black tracking-tight text-zinc-50 sm:text-3xl">Story World Map – Ghost Border Region (Tang Dynasty)</h2>
          <p class="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">Interactive Ghost Border atlas: pins and paths follow your Timeline (locations + order). Legend is on the map. Generate a rich Grok Imagine prompt below, or fetch an image via your configured API.</p>
        </div>
      </div>

      <div id="ghostBorderStoryMapWrap" class="story-ghost-border-map__frame relative mt-6 overflow-hidden rounded-2xl border border-zinc-800/90 bg-[#0a0a0c] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-inset ring-black/40">
        <svg id="ghostBorderStoryMapSvg" width="100%" height="620" viewBox="0 0 1200 620" xmlns="http://www.w3.org/2000/svg" style="background: #0f0f0f; border-radius: 16px; display:block; max-width:100%;">
          <defs>
            <filter id="ghostBorderRouteGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="ghostBorderPinGlow" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="4" result="g"/>
              <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <g id="ghostBorderMapBackground" pointer-events="none">
          <!-- Mountains -->
          <path d="M100 420 Q280 180 480 420 Q680 140 880 420 Q1080 220 1200 420" fill="none" stroke="#223333" stroke-width="130"/>
          <path d="M0 470 Q220 280 420 470 Q620 320 820 470 Q1020 350 1200 500" fill="none" stroke="#1a2a2a" stroke-width="90"/>

          <!-- River -->
          <path d="M120 540 Q320 500 460 560 Q640 500 810 550 Q1050 510 1180 540" fill="none" stroke="#1e4a5a" stroke-width="48" opacity="0.75"/>

          <!-- Time Portal Cave -->
          <circle cx="210" cy="170" r="32" fill="#3a2a1a" stroke="#d4af77" stroke-width="8"/>
          <text x="210" y="205" text-anchor="middle" fill="#e8d5b8" font-size="19" font-family="serif">⛰️ Time Portal</text>

          <!-- Disgraced Manor -->
          <rect x="340" y="340" width="110" height="85" rx="10" fill="#3a2a1a" stroke="#d4af77" stroke-width="7"/>
          <text x="395" y="390" text-anchor="middle" fill="#e8d5b8" font-size="17">Disgraced Manor</text>

          <!-- Forbidden Garden -->
          <circle cx="520" cy="230" r="34" fill="#2a4a2a" stroke="#a3d977" stroke-width="7"/>
          <text x="520" y="272" text-anchor="middle" fill="#e8d5b8" font-size="17">Forbidden Garden</text>

          <!-- Imperial Market Square -->
          <circle cx="710" cy="390" r="38" fill="#5a3a2a" stroke="#d4af77" stroke-width="7"/>
          <text x="710" y="432" text-anchor="middle" fill="#e8d5b8" font-size="17">Imperial Market</text>

          <!-- Grey Dragon Road -->
          <path d="M400 390 Q590 410 830 310" fill="none" stroke="#a3a3a3" stroke-width="22" stroke-dasharray="12 18"/>
          <text x="610" y="355" fill="#e8d5b8" font-size="15" font-family="serif">Grey Dragon Road</text>

          <!-- Daming Palace / Capital -->
          <rect x="860" y="150" width="160" height="105" rx="14" fill="#4a2a3a" stroke="#d4af77" stroke-width="9"/>
          <text x="940" y="210" text-anchor="middle" fill="#e8d5b8" font-size="19">Daming Palace</text>

          <!-- Secret Metropolis -->
          <rect x="980" y="390" width="130" height="95" rx="10" fill="#3a4a4a" stroke="#a3d977" stroke-width="7"/>
          <text x="1045" y="440" text-anchor="middle" fill="#e8d5b8" font-size="17">Secret Metropolis</text>

          <!-- Title -->
          <text x="600" y="45" text-anchor="middle" fill="#d4af77" font-size="29" font-family="serif" font-weight="bold">Ghost Border Region • Tang Dynasty</text>
          </g>
          <g id="ghostBorderMapOverlay" pointer-events="auto"></g>
        </svg>
      </div>

      <div class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between sm:gap-6">
        <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <button type="button" class="inline-flex w-full items-center justify-center rounded-xl border border-zinc-600/90 bg-zinc-950/40 px-6 py-3 text-sm font-extrabold text-zinc-300 shadow-sm ring-1 ring-inset ring-white/[0.04] transition hover:border-zinc-500 hover:bg-zinc-900/70 hover:text-white sm:w-auto sm:min-w-[11rem]" onclick="App.refreshStoryWorldMap()">Refresh Map</button>
          <button type="button" class="inline-flex w-full flex-1 items-center justify-center rounded-xl bg-violet-600 px-6 py-3.5 text-sm font-extrabold tracking-tight text-white shadow-[0_12px_40px_-8px_rgba(91,33,182,0.65)] ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 hover:brightness-105 active:scale-[0.99] sm:min-h-[3.25rem] sm:flex-1 sm:px-8 sm:text-[0.95rem]" onclick="App.openStoryWorldMapGrokModal()">Generate New Map with Grok Imagine</button>
        </div>
      </div>

      <div id="storyWorldMapAiStatus" class="mt-5 min-h-0 text-sm"></div>

      <div class="mt-8 border-t border-zinc-800/80 pt-8">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-violet-300/90">Saved map images</div>
            <p class="mb-0 mt-2 max-w-2xl text-xs leading-relaxed text-zinc-500">Save your finished map here after generating it elsewhere: upload the PNG/JPG you downloaded, or paste an image URL. (API renders also land here.)</p>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" class="shrink-0 rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-2.5 text-xs font-extrabold text-zinc-200 shadow-sm ring-1 ring-inset ring-white/[0.04] transition hover:border-zinc-500 hover:bg-zinc-900/70" onclick="App.openStoryWorldMapGalleryUpload()">Upload image</button>
            <button type="button" class="shrink-0 rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-2.5 text-xs font-extrabold text-zinc-200 shadow-sm ring-1 ring-inset ring-white/[0.04] transition hover:border-zinc-500 hover:bg-zinc-900/70" onclick="App.addStoryWorldMapGalleryByUrl()">Add image URL</button>
            <button type="button" class="shrink-0 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs font-extrabold text-amber-100 shadow-sm ring-1 ring-inset ring-amber-400/15 transition hover:bg-amber-400/18" onclick="App.generateStoryWorldMapAI()">Fetch via image API</button>
          </div>
        </div>
        <div id="storyWorldMapGallery" class="mt-5"></div>
      </div>
      <div id="storyWorldMapAiPanel" class="story-world-map-ai-panel mt-6 hidden rounded-2xl border border-violet-500/25 bg-zinc-950/80 p-4 ring-1 ring-inset ring-amber-400/10"></div>
    </section>

    <section class="relationship-network mt-4 w-full rounded-[1.35rem] border border-zinc-800/90 bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-900 p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-violet-500/[0.12] sm:p-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div class="min-w-0">
          <div class="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-400/95">Intrigue</div>
          <h2 class="mt-1 text-2xl font-black tracking-tight text-zinc-50 sm:text-3xl">Relationship Network</h2>
          <p class="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">Hover a node to spotlight alliances, rivalries, bloodlines, and secrets. Click a character to open details.</p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button type="button" class="inline-flex items-center justify-center rounded-xl border border-zinc-600/90 bg-zinc-950/50 px-4 py-2.5 text-xs font-extrabold text-zinc-200 shadow-sm ring-1 ring-inset ring-white/[0.04] transition hover:border-zinc-500 hover:bg-zinc-900/70" onclick="App.autoLayoutRelationshipNetwork()">Auto-Layout</button>
          <button type="button" class="inline-flex items-center justify-center rounded-xl border border-zinc-600/90 bg-zinc-950/50 px-4 py-2.5 text-xs font-extrabold text-zinc-200 shadow-sm ring-1 ring-inset ring-white/[0.04] transition hover:border-zinc-500 hover:bg-zinc-900/70" onclick="App.resetRelationshipNetworkPositions()">Reset Positions</button>
          <button type="button" class="inline-flex items-center justify-center rounded-xl border border-zinc-600/90 bg-zinc-950/50 px-4 py-2.5 text-xs font-extrabold text-zinc-200 shadow-sm ring-1 ring-inset ring-white/[0.04] transition hover:border-zinc-500 hover:bg-zinc-900/70" onclick="App.refreshRelationshipNetworkGraph()">Refresh</button>
        </div>
      </div>

      <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] font-extrabold text-violet-100 hover:bg-violet-500/15" onclick="App.setRelationshipGraphFilter('all')">All</button>
          <button type="button" class="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-extrabold text-emerald-100 hover:bg-emerald-400/15" onclick="App.setRelationshipGraphFilter('alliance')">Alliances</button>
          <button type="button" class="rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1 text-[11px] font-extrabold text-rose-100 hover:bg-rose-400/15" onclick="App.setRelationshipGraphFilter('rivalry')">Rivalries</button>
          <button type="button" class="rounded-full border border-fuchsia-400/25 bg-fuchsia-400/10 px-3 py-1 text-[11px] font-extrabold text-fuchsia-100 hover:bg-fuchsia-400/15" onclick="App.setRelationshipGraphFilter('romance')">Romance</button>
          <button type="button" class="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[11px] font-extrabold text-amber-100 hover:bg-amber-400/15" onclick="App.setRelationshipGraphFilter('bloodline')">Bloodline</button>
          <button type="button" class="rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-1 text-[11px] font-extrabold text-violet-100 hover:bg-violet-400/15" onclick="App.setRelationshipGraphFilter('secret')">Secret</button>
          <button type="button" class="rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-[11px] font-extrabold text-sky-100 hover:bg-sky-400/15" onclick="App.setRelationshipGraphFilter('military')">Military</button>
        </div>
        <div class="flex min-w-0 items-center gap-2">
          <input id="relationshipGraphSearch" class="form-input w-full sm:w-72" placeholder="Search character…" oninput="App.setRelationshipGraphQuery(this.value)" />
        </div>
      </div>

      <div class="relative mt-3 overflow-hidden rounded-2xl border border-zinc-800/90 bg-[#0a0a0c] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-inset ring-black/40">
        <svg id="relationshipNetworkSvg" width="100%" height="520" viewBox="0 0 1200 520" xmlns="http://www.w3.org/2000/svg" aria-label="Relationship network graph" style="display:block; max-width:100%; background: radial-gradient(120% 100% at 50% 90%, rgba(124,58,237,0.14) 0%, rgba(9,9,11,0.96) 52%, rgba(9,9,11,0.98) 100%);">
          <defs>
            <filter id="relLinkGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="relNodeGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="g"/>
              <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <g id="relationshipNetworkLinks"></g>
          <g id="relationshipNetworkLabels"></g>
          <g id="relationshipNetworkNodes"></g>
        </svg>

        <button type="button"
          class="absolute bottom-4 right-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-xl font-black text-white shadow-[0_18px_60px_-14px_rgba(91,33,182,0.85)] ring-1 ring-inset ring-white/10 transition hover:bg-violet-500 active:scale-[0.99]"
          title="Add New Relationship"
          onclick="App.openAddRelationshipModal()"
        >+</button>
      </div>

      <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div class="rounded-2xl border border-zinc-800/80 bg-zinc-950/55 p-4">
          <div class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-zinc-500">Legend</div>
          <div class="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-zinc-300">
            <span class="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1"><span class="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>Friendly</span>
            <span class="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1"><span class="h-2.5 w-2.5 rounded-full bg-rose-400"></span>Antagonist</span>
            <span class="inline-flex items-center gap-2 rounded-full border border-zinc-400/25 bg-zinc-400/10 px-3 py-1"><span class="h-2.5 w-2.5 rounded-full bg-zinc-300"></span>Gray</span>
            <span class="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1"><span class="h-2.5 w-2.5 rounded-full bg-amber-300"></span>Canon emphasis</span>
          </div>
          <div class="mt-3 text-xs text-zinc-500">Thicker/glowing lines = stronger tie. Dashed = secret/hidden.</div>
        </div>
        <div id="relationshipNetworkStatus" class="rounded-2xl border border-zinc-800/80 bg-zinc-950/55 p-4 text-xs font-semibold text-zinc-400">Loading relationships…</div>
      </div>
    </section>

    <section class="character-arc-tracker mt-4 w-full rounded-[1.35rem] border border-zinc-800/90 bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-900 p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-violet-500/[0.12] sm:p-8">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div class="min-w-0">
          <div class="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-400/95">Arcs</div>
          <h2 class="mt-1 text-2xl font-black tracking-tight text-zinc-50 sm:text-3xl">Character Arc Progress</h2>
          <p class="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">At-a-glance progression: arc stage, current motivational shift, and beat appearances. Click any beat chip to jump to that scene.</p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button type="button" class="inline-flex items-center justify-center rounded-xl border border-zinc-600/90 bg-zinc-950/50 px-4 py-2.5 text-xs font-extrabold text-zinc-200 shadow-sm ring-1 ring-inset ring-white/[0.04] transition hover:border-zinc-500 hover:bg-zinc-900/70" onclick="App.refreshCharacterArcTracker()">Refresh</button>
        </div>
      </div>

      <div id="characterArcTracker" class="mt-6"></div>
    </section>

    <div class="mt-4 rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Storyboard</div>
          <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">🧩 Visual storyboard builder</h2>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105" onclick="App.syncStoryboardFromTimeline()">Sync</button>
          <button class="rounded-xl border border-zinc-200/60 bg-white/70 px-3 py-2 text-xs font-extrabold text-zinc-900 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:hover:bg-zinc-950" onclick="App.clearStoryboard()">Clear</button>
        </div>
      </div>
      <p class="mb-4 mt-2 text-sm text-zinc-500">
        Generates one prompt per Timeline event for external image generators. Paste image URLs or paste/upload images back into each scene.
      </p>
      <div id="storyboardStatus"></div>
      <div id="storyboardContainer"></div>
    </div>

    <section class="story-locations-overview-section mt-4 rounded-[1.35rem] border border-zinc-800/90 bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-900 p-6 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-violet-500/[0.12] sm:p-8">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <div class="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-400/90">Story geography</div>
          <h2 class="mt-2 font-serif text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Story Locations Overview</h2>
          <p class="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">Where your beats live, in story order. Each bar is the share of your timeline at that place. Click a beat to jump to the Timeline.</p>
        </div>
      </div>
      <div id="storyLocationsOverview" class="story-locations-overview-root mt-8"></div>
    </section>

    <div class="mt-4 rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Visualizer</div>
      <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">🎬 Story visualizer</h2>
      <p class="mb-4 mt-2 text-sm text-zinc-500">Generate scene images from timeline events, plot outline, or both to preview your story visually.</p>
      <div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Source</label>
          <select id="visualSource" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100">
            <option value="both">Timeline + Plot</option>
            <option value="timeline">Timeline Only</option>
            <option value="plot">Plot Only</option>
          </select>
        </div>
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Scene count</label>
          <select id="visualCount" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100">
            <option value="3">3 scenes</option>
            <option value="4" selected>4 scenes</option>
            <option value="6">6 scenes</option>
            <option value="8">8 scenes</option>
          </select>
        </div>
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Visual style</label>
          <input id="visualStyle" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="cinematic, Tang Dynasty, dramatic lighting">
        </div>
      </div>
      <button class="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105 md:w-auto" onclick="App.generateStoryVisuals()">🖼️ Generate visual storyboard</button>
      <div id="visualizerStatus" class="mt-4"></div>
    </div>

    <div class="mt-4 rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="m-0 text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">Generated visual scenes</h3>
        <button onclick="App.clearVisuals()" class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-extrabold text-rose-100 hover:bg-rose-500/15">Clear visuals</button>
      </div>
      <div id="visualGallery"></div>
    </div>
  `;
}
