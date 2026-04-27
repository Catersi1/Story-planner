import { renderDashboard } from './Dashboard.js';
import { renderTemplates } from './Templates.js';
import { renderCharacters } from './Characters.js';
import { renderTimeline } from './Timeline.js';
import { renderPlot } from './Plot.js';
import { renderPolitics } from './Politics.js';
import { renderWorkItems } from './WorkItems.js';
import { renderMasterDocument } from './MasterDocument.js';
import { renderVisualizer } from './Visualizer.js';
import { renderAIActions } from './AIActions.js';
import { renderAISettings } from './AISettings.js';
import { renderAIQueue } from './AIQueue.js';

export const TAB_RENDERERS = {
  dashboard: renderDashboard,
  templates: renderTemplates,
  characters: renderCharacters,
  timeline: renderTimeline,
  plot: renderPlot,
  politics: renderPolitics,
  workitems: renderWorkItems,
  'master-document': renderMasterDocument,
  visualizer: renderVisualizer,
  'ai-actions': renderAIActions,
  'ai-queue': renderAIQueue,
  'ai-settings': renderAISettings
};

