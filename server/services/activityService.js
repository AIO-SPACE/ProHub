export function pushActivity(state, type, text) {
  state.activities = [
    { id: `act-${Date.now()}`, type, text, time: 'just now', createdAt: new Date().toISOString() },
    ...(state.activities || []).slice(0, 49),
  ];
}
