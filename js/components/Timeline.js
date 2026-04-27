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
      <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Structure</div>
      <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">Dan Harmon's Story Circle</h2>
      <p class="mb-4 mt-2 text-sm text-zinc-500">Click on events to view and edit details.</p>
      <div class="story-circle">
        <svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
          <circle cx="300" cy="300" r="280" fill="none" stroke="rgb(63 63 70 / 0.55)" stroke-width="2"/>
          <line x1="20" y1="300" x2="580" y2="300" stroke="rgb(63 63 70 / 0.45)" stroke-width="2"/>
          <line x1="300" y1="20" x2="300" y2="580" stroke="rgb(63 63 70 / 0.45)" stroke-width="2"/>
          <circle cx="300" cy="300" r="100" fill="rgb(24 24 27 / 0.35)" stroke="rgb(63 63 70 / 0.55)" stroke-width="2"/>
          <text x="300" y="285" class="story-beat-label" font-size="18" font-weight="bold">Order</text>
          <text x="300" y="320" class="story-beat-label" font-size="18" font-weight="bold">Chaos</text>
          <path d="M 300 30 A 270 270 0 0 0 109.81 109.81" fill="#fef08a" stroke="#eab308" stroke-width="2"/>
          <text x="160" y="65" class="story-beat-label" font-size="14">1. You</text>
          <text x="160" y="85" class="story-beat-description">(establish protagonist)</text>
          <path d="M 109.81 109.81 A 270 270 0 0 0 30 300" fill="#a5f3fc" stroke="#06b6d4" stroke-width="2"/>
          <text x="70" y="200" class="story-beat-label" font-size="14">2. Need</text>
          <text x="70" y="220" class="story-beat-description">(something isn't right)</text>
          <path d="M 30 300 A 270 270 0 0 0 109.81 490.19" fill="#a5f3fc" stroke="#06b6d4" stroke-width="2"/>
          <text x="70" y="380" class="story-beat-label" font-size="14">3. Go!</text>
          <text x="70" y="400" class="story-beat-description">(crossing threshold)</text>
          <path d="M 109.81 490.19 A 270 270 0 0 0 300 570" fill="#fed7aa" stroke="#fb923c" stroke-width="2"/>
          <text x="170" y="520" class="story-beat-label" font-size="14">4. Search</text>
          <text x="170" y="540" class="story-beat-description">(road of trials)</text>
          <path d="M 300 570 A 270 270 0 0 0 490.19 490.19" fill="#fef08a" stroke="#eab308" stroke-width="2"/>
          <text x="420" y="540" class="story-beat-label" font-size="14">5. Find</text>
          <text x="420" y="560" class="story-beat-description">(meeting goddess)</text>
          <path d="M 490.19 490.19 A 270 270 0 0 0 570 300" fill="#2dd4bf" stroke="#14b8a6" stroke-width="2"/>
          <text x="510" y="400" class="story-beat-label" font-size="14">6. Take</text>
          <text x="510" y="420" class="story-beat-description">(paying the price)</text>
          <path d="M 570 300 A 270 270 0 0 0 490.19 109.81" fill="#2dd4bf" stroke="#14b8a6" stroke-width="2"/>
          <text x="510" y="200" class="story-beat-label" font-size="14">7. Return</text>
          <text x="510" y="220" class="story-beat-description">(bringing it home)</text>
          <path d="M 490.19 109.81 A 270 270 0 0 0 300 30" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/>
          <text x="380" y="65" class="story-beat-label" font-size="14">8. Change</text>
          <text x="380" y="85" class="story-beat-description">(master of both)</text>
        </svg>
        <div id="eventsOnCircle"></div>
      </div>
    </div>

    <div class="mt-4 rounded-2xl border border-zinc-200/50 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Alternate</div>
          <h2 class="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">🧭 Hero’s Journey</h2>
        </div>
      </div>
      <p class="mb-4 mt-2 text-sm text-zinc-500">Use this structure if you prefer it over Dan Harmon’s circle.</p>
      <div class="rounded-2xl border border-zinc-200/50 bg-zinc-950/20 p-4 dark:border-zinc-800 dark:bg-zinc-950/35">
        <div class="mb-3 text-sm text-zinc-500">
          Classic 12-step map (Campbell/Vogler). Use this as a checklist to sanity-check your beats.
        </div>
        <ol class="grid gap-2 pl-5 text-sm text-zinc-200">
          <li><strong class="text-zinc-50">Ordinary World</strong> — establish baseline, relationships, and longing.</li>
          <li><strong class="text-zinc-50">Call to Adventure</strong> — disruption arrives; a problem can’t be ignored.</li>
          <li><strong class="text-zinc-50">Refusal of the Call</strong> — fear, duty, or denial delays the leap.</li>
          <li><strong class="text-zinc-50">Meeting the Mentor</strong> — guidance, tool, ally, or new worldview appears.</li>
          <li><strong class="text-zinc-50">Crossing the Threshold</strong> — irreversible commitment into a new world.</li>
          <li><strong class="text-zinc-50">Tests, Allies, Enemies</strong> — learn rules; form bonds; identify threats.</li>
          <li><strong class="text-zinc-50">Approach to the Inmost Cave</strong> — plan, doubt, and tightening stakes.</li>
          <li><strong class="text-zinc-50">Ordeal</strong> — the central crisis; symbolic “death” and rebirth.</li>
          <li><strong class="text-zinc-50">Reward</strong> — insight, prize, or relationship shift after surviving.</li>
          <li><strong class="text-zinc-50">The Road Back</strong> — consequences; pursuit; no easy return.</li>
          <li><strong class="text-zinc-50">Resurrection</strong> — final test; the hero proves transformation.</li>
          <li><strong class="text-zinc-50">Return with the Elixir</strong> — bring back change that heals the world.</li>
        </ol>
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
          <label class="mb-2 block text-xs font-extrabold uppercase tracking-wide text-zinc-500">Description</label>
          <textarea id="newEventDescription" class="w-full rounded-2xl border border-zinc-200/60 bg-white/90 px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none ring-indigo-500/30 placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-4 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100" placeholder="Event details..." rows="2"></textarea>
        </div>
      </div>
      <button onclick="App.addEvent()" class="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/10 hover:brightness-105 md:w-auto">+ Add event</button>
    </div>

    <div id="timelineContainer"></div>
  `;
}

