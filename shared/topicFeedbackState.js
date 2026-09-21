const emptyState = () => ({ owners: {} });

const ownerState = (state, ownerId) => state?.owners?.[ownerId] || {
  revision: 0,
  overlays: {},
};

const overlayKey = (topicId, action) => `${topicId}\u0000${action}`;

const replaceOwnerState = (state, ownerId, nextOwner) => {
  const owners = { ...state.owners };
  if (Object.keys(nextOwner.overlays).length === 0) delete owners[ownerId];
  else owners[ownerId] = nextOwner;
  return { ...state, owners };
};

export const buildTopicFeedbackKey = (ownerId, topicId, action) =>
  JSON.stringify([ownerId || '', topicId || '', action || '']);

export const createTopicFeedbackState = () => emptyState();

export const clearTopicFeedbackOwner = (state, ownerId) => {
  const currentState = state || emptyState();
  const currentOwner = currentState.owners[ownerId];
  if (!currentOwner || Object.keys(currentOwner.overlays).length > 0) return currentState;
  const owners = { ...currentState.owners };
  delete owners[ownerId];
  return { ...currentState, owners };
};

export const beginTopicFeedbackRead = (state, ownerId) => ({
  ownerId,
  revision: ownerState(state, ownerId).revision,
});

export const applyTopicFeedbackChoice = (topics, topicId, action, enabled) =>
  (Array.isArray(topics) ? topics : []).map((topic) => {
    if (topic?.id !== topicId) return topic;
    const feedback = new Set(Array.isArray(topic.feedback) ? topic.feedback : []);
    if (enabled) feedback.add(action);
    else feedback.delete(action);
    return { ...topic, feedback: [...feedback] };
  });

export const resolveOwnerTopicFeedbackSnapshot = ({
  ownerId,
  currentOwnerId,
  loadedOwnerId,
  currentSnapshot,
  storedSnapshot,
  topicId,
  action,
  enabled,
}) => {
  const updatesCurrentOwner = ownerId === currentOwnerId && ownerId === loadedOwnerId;
  const baseSnapshot = updatesCurrentOwner ? currentSnapshot : storedSnapshot;
  if (!baseSnapshot) return null;
  return {
    updatesCurrentOwner,
    snapshot: {
      ...baseSnapshot,
      topics: applyTopicFeedbackChoice(baseSnapshot.topics, topicId, action, enabled),
    },
  };
};

export const recordTopicFeedbackMutation = (state, {
  ownerId,
  topicId,
  action,
  enabled,
}) => {
  const currentState = state || emptyState();
  const currentOwner = ownerState(currentState, ownerId);
  const revision = currentOwner.revision + 1;
  const key = overlayKey(topicId, action);
  const mutation = {
    ownerId,
    topicId,
    action,
    enabled: Boolean(enabled),
    revision,
    previousOverlay: currentOwner.overlays[key] || null,
  };
  const nextOwner = {
    revision,
    overlays: {
      ...currentOwner.overlays,
      [key]: {
        ownerId,
        topicId,
        action,
        enabled: Boolean(enabled),
        revision,
        status: 'pending',
      },
    },
  };
  return {
    mutation,
    state: {
      ...currentState,
      owners: { ...currentState.owners, [ownerId]: nextOwner },
    },
  };
};

export const settleTopicFeedbackMutation = (state, mutation, succeeded) => {
  const currentState = state || emptyState();
  const currentOwner = ownerState(currentState, mutation.ownerId);
  const key = overlayKey(mutation.topicId, mutation.action);
  const currentOverlay = currentOwner.overlays[key];
  if (!currentOverlay || currentOverlay.revision !== mutation.revision) return currentState;

  let overlays = { ...currentOwner.overlays };
  const revision = succeeded ? currentOwner.revision + 1 : currentOwner.revision;
  if (succeeded) {
    overlays[key] = {
      ...currentOverlay,
      status: 'succeeded',
      confirmAfterRevision: revision,
    };
  }
  else if (mutation.previousOverlay) overlays[key] = mutation.previousOverlay;
  else delete overlays[key];
  return replaceOwnerState(currentState, mutation.ownerId, {
    ...currentOwner,
    revision,
    overlays,
  });
};

export const resolveTopicFeedbackSettlement = ({
  state,
  mutation,
  succeeded,
  previousEnabled,
  currentOwnerId,
  loadedOwnerId,
  currentSnapshot,
  storedSnapshot,
}) => ({
  state: settleTopicFeedbackMutation(state, mutation, succeeded),
  update: resolveOwnerTopicFeedbackSnapshot({
    ownerId: mutation.ownerId,
    currentOwnerId,
    loadedOwnerId,
    currentSnapshot,
    storedSnapshot,
    topicId: mutation.topicId,
    action: mutation.action,
    enabled: succeeded ? mutation.enabled : previousEnabled,
  }),
});

export const mergeTopicFeedbackRead = (state, {
  ownerId,
  readRevision,
  topics,
}) => {
  const currentState = state || emptyState();
  const currentOwner = ownerState(currentState, ownerId);
  const overlays = Object.values(currentOwner.overlays)
    .sort((left, right) => left.revision - right.revision);
  if (overlays.length === 0) {
    return { state: currentState, topics: Array.isArray(topics) ? topics : [] };
  }

  let nextTopics = Array.isArray(topics) ? topics : [];
  let nextOverlays = currentOwner.overlays;
  let removedConfirmedOverlay = false;
  for (const overlay of overlays) {
    const topic = nextTopics.find((candidate) => candidate?.id === overlay.topicId);
    const serverEnabled = topic?.feedback?.includes(overlay.action) ?? false;
    const readCanConfirm = overlay.status === 'succeeded' &&
      readRevision >= overlay.confirmAfterRevision &&
      (topic === undefined || serverEnabled === overlay.enabled);
    const confirmed = readCanConfirm;
    if (confirmed) {
      if (!removedConfirmedOverlay) nextOverlays = { ...nextOverlays };
      removedConfirmedOverlay = true;
      delete nextOverlays[overlayKey(overlay.topicId, overlay.action)];
      continue;
    }
    nextTopics = applyTopicFeedbackChoice(
      nextTopics,
      overlay.topicId,
      overlay.action,
      overlay.enabled
    );
  }

  if (!removedConfirmedOverlay) return { state: currentState, topics: nextTopics };
  return {
    topics: nextTopics,
    state: replaceOwnerState(currentState, ownerId, { ...currentOwner, overlays: nextOverlays }),
  };
};

export const createTopicFeedbackRequestRegistry = (onPendingChange = () => {}) => {
  const requests = new Map();
  const notify = () => onPendingChange(new Set(requests.keys()));
  return {
    run(key, operation) {
      const existing = requests.get(key);
      if (existing) return existing;
      let result;
      try {
        result = operation();
      } catch (error) {
        result = Promise.reject(error);
      }
      const promise = Promise.resolve(result).finally(() => {
        if (requests.get(key) !== promise) return;
        requests.delete(key);
        notify();
      });
      requests.set(key, promise);
      notify();
      return promise;
    },
    has(key) {
      return requests.has(key);
    },
    get(key) {
      return requests.get(key) || null;
    },
    keys() {
      return new Set(requests.keys());
    },
  };
};
