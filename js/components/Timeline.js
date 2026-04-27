import { TIMELINE_LOCATION_OTHER, TIMELINE_LOCATION_PRESETS } from '../storage.js';

export function renderTimeline() {
  const newEventLocationOptions = [
    '<option value="">— None (optional) —</option>',
    ...TIMELINE_LOCATION_PRESETS.map(
      (p) => `<option value="${p.replace(/"/g, '&quot;')}">${p.replace(/</g, '')}</option>`
    ),
    `<option value="${TIMELINE_LOCATION_OTHER}">Other (custom)</option>`
  ].join('');

  return `
    <div class="rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Flow</div>
      <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">Story order</h2>
      <p class="mb-4 mt-2 text-sm text-zinc-500">Each icon is one event in timeline order (same as the list below). Shapes repeat in a simple pattern. Click to edit.</p>
      <div class="timeline-shapes-map">
        <div id="eventsOnCircle" class="timeline-events-shape-host" role="list" aria-label="Timeline events in story order"></div>
      </div>
    </div>

    <div class="mt-4 rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Alternate</div>
          <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">🧭 Hero’s Journey</h2>
        </div>
      </div>
      <p class="mb-4 mt-2 text-sm text-zinc-500">Twelve stages in journey order. Assign a step to each event in <strong class="text-zinc-700 dark:text-zinc-300">Details</strong> (or when adding an event). Events appear as chips under the matching shape.</p>
      <div class="timeline-shapes-map">
        <div id="heroJourneyShapeHost" class="timeline-hero-journey-host" role="list" aria-label="Hero's Journey stages and matching events"></div>
      </div>
    </div>

    <div class="mt-4 rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Events</div>
          <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">Timeline events</h2>
        </div>
        <button class="rounded-xl border border-zinc-200/60 bg-white/70 px-4 py-2 text-sm font-extrabold text-zinc-900 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 dark:hover:bg-zinc-950" onclick="App.toggleCanonOnly('timeline')">Canon filter</button>
      </div>
      <div class="mb-6 mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Event title</label>
          <input type="text" id="newEventTitle" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="e.g., Time Travel">
        </div>
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Period / act</label>
          <input type="text" id="newEventPeriod" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="e.g., Act 1">
        </div>
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Location</label>
          <select id="newEventLocationPreset" onchange="App.syncTimelineLocationFormVisibility('newEvent')" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100">
            ${newEventLocationOptions}
          </select>
        </div>
        <div id="newEventLocationCustomWrap" class="md:col-span-2" style="display:none">
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Custom location</label>
          <input type="text" id="newEventLocationCustom" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="Describe the setting…">
        </div>
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Story circle beat (optional)</label>
          <select id="newEventBeat" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100">
            <option value="">-- No beat assigned --</option>
            <option value="1">1. You (establish protagonist)</option>
            <option value="2">2. Need (something isn't right)</option>
            <option value="3">3. Go! (crossing the threshold)</option>
            <option value="4">4. Search (road of trials)</option>
            <option value="5">5. Find (meeting the goddess)</option>
            <option value="6">6. Take (paying the price)</option>
            <option value="7">7. Return (bringing it home)</option>
            <option value="8">8. Change (master of both worlds)</option>
          </select>
        </div>
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Hero's Journey step (optional)</label>
          <select id="newEventHeroJourney" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100">
            <option value="">— None —</option>
            <option value="1">1 · Ordinary World</option>
            <option value="2">2 · Call to Adventure</option>
            <option value="3">3 · Refusal of the Call</option>
            <option value="4">4 · Meeting the Mentor</option>
            <option value="5">5 · Crossing the Threshold</option>
            <option value="6">6 · Tests, Allies, Enemies</option>
            <option value="7">7 · Approach to the Inmost Cave</option>
            <option value="8">8 · Ordeal</option>
            <option value="9">9 · Reward</option>
            <option value="10">10 · The Road Back</option>
            <option value="11">11 · Resurrection</option>
            <option value="12">12 · Return with the Elixir</option>
          </select>
        </div>
        <div>
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Description</label>
          <textarea id="newEventDescription" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="Event details..." rows="2"></textarea>
        </div>
      </div>
      <button onclick="App.addEvent()" class="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105 md:w-auto">+ Add event</button>
    </div>

    <div id="timelineContainer"></div>
  `;
}

