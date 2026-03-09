export const createHistoryStore = (maxDepth = 100) => {
  const state = {
    past: [],
    future: []
  };

  const cloneScene = (objects) =>
    objects.map((item) => ({
      ...item,
      dims_cm: { ...item.dims_cm },
      pose: { ...item.pose },
      attach: item.attach ? { ...item.attach } : undefined
    }));

  const push = (objects) => {
    state.past.push(cloneScene(objects));
    if (state.past.length > maxDepth) {
      state.past.shift();
    }
    state.future = [];
  };

  const undo = (current) => {
    if (!state.past.length) return null;
    const snapshot = state.past.pop();
    state.future.push(cloneScene(current));
    return cloneScene(snapshot);
  };

  const redo = (current) => {
    if (!state.future.length) return null;
    const snapshot = state.future.pop();
    state.past.push(cloneScene(current));
    return cloneScene(snapshot);
  };

  const canUndo = () => state.past.length > 0;
  const canRedo = () => state.future.length > 0;

  const reset = () => {
    state.past = [];
    state.future = [];
  };

  return {
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    reset
  };
};
