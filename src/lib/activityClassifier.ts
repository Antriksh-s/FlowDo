export type ActivityClassification = 'Physical Exhaustion' | 'Mindful Recovery' | 'High Cognitive Load' | 'Routine/Buffer';

export function classifyActivity(title: string, description?: string): ActivityClassification {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  // Mindful Recovery keywords
  if (
    text.includes('yoga') ||
    text.includes('meditat') ||
    text.includes('breath') ||
    text.includes('nap') ||
    text.includes('stretch') ||
    text.includes('relax') ||
    text.includes('massage') ||
    text.includes('chill') ||
    text.includes('mindful') ||
    text.includes('recovery') ||
    text.includes('spa') ||
    text.includes('recharge')
  ) {
    return 'Mindful Recovery';
  }
  
  // Physical Exhaustion keywords
  if (
    text.includes('gym') ||
    text.includes('workout') ||
    text.includes('exercise') ||
    text.includes('lift') ||
    text.includes('cardio') ||
    text.includes('run') ||
    text.includes('running') ||
    text.includes('fitness') ||
    text.includes('exhaust') ||
    text.includes('heavy workout') ||
    text.includes('sport') ||
    text.includes('swim') ||
    text.includes('cycling') ||
    text.includes('training')
  ) {
    return 'Physical Exhaustion';
  }
  
  // High Cognitive Load keywords
  if (
    text.includes('code') ||
    text.includes('program') ||
    text.includes('architect') ||
    text.includes('plan') ||
    text.includes('client') ||
    text.includes('pitch') ||
    text.includes('interview') ||
    text.includes('debug') ||
    text.includes('review') ||
    text.includes('meeting') ||
    text.includes('study') ||
    text.includes('analy') ||
    text.includes('design') ||
    text.includes('writing') ||
    text.includes('math') ||
    text.includes('exam') ||
    text.includes('present') ||
    text.includes('strategy') ||
    text.includes('development') ||
    text.includes('bug')
  ) {
    return 'High Cognitive Load';
  }
  
  return 'Routine/Buffer';
}

export function getCategoryStyles(category: ActivityClassification): { bg: string; text: string; border: string; badge: string } {
  switch (category) {
    case 'Physical Exhaustion':
      return {
        bg: 'bg-amber-50/90',
        text: 'text-amber-800',
        border: 'border-amber-300',
        badge: 'bg-amber-100 text-amber-800 border-amber-200'
      };
    case 'Mindful Recovery':
      return {
        bg: 'bg-emerald-50/90',
        text: 'text-emerald-800',
        border: 'border-emerald-300',
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200'
      };
    case 'High Cognitive Load':
      return {
        bg: 'bg-indigo-50/90',
        text: 'text-indigo-800',
        border: 'border-indigo-300',
        badge: 'bg-indigo-100 text-indigo-800 border-indigo-200'
      };
    default:
      return {
        bg: 'bg-slate-50/90',
        text: 'text-slate-800',
        border: 'border-slate-300',
        badge: 'bg-slate-100 text-slate-800 border-slate-200'
      };
  }
}
