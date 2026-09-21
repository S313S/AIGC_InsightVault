import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTopicFeedbackChoice,
  beginTopicFeedbackRead,
  buildTopicFeedbackKey,
  createTopicFeedbackRequestRegistry,
  createTopicFeedbackState,
  mergeTopicFeedbackRead,
  recordTopicFeedbackMutation,
  resolveOwnerTopicFeedbackSnapshot,
  resolveTopicFeedbackSettlement,
  settleTopicFeedbackMutation,
} from '../shared/topicFeedbackState.js';

const topic = (feedback = []) => ({
  id: 'topic-1',
  ownerId: 'owner-1',
  feedback,
});

const snapshotFor = (ownerId, feedback = []) => ({
  cards: [],
  trending: [],
  topics: [{ ...topic(feedback), ownerId }],
  collections: [],
  tasks: [],
});

test('a topic read cannot overwrite feedback mutated after that read started', () => {
  const initial = createTopicFeedbackState();
  const read = beginTopicFeedbackRead(initial, 'owner-1');
  const recorded = recordTopicFeedbackMutation(initial, {
    ownerId: 'owner-1',
    topicId: 'topic-1',
    action: 'saved',
    enabled: true,
  });

  const merged = mergeTopicFeedbackRead(recorded.state, {
    ownerId: 'owner-1',
    readRevision: read.revision,
    topics: [topic([])],
  });

  assert.deepEqual(merged.topics[0].feedback, ['saved']);
  assert.equal(merged.state, recorded.state, 'pending overlay must remain until settlement');
});

test('a successful overlay stays until a later read actually confirms it', () => {
  const recorded = recordTopicFeedbackMutation(createTopicFeedbackState(), {
    ownerId: 'owner-1',
    topicId: 'topic-1',
    action: 'published',
    enabled: true,
  });
  const succeeded = settleTopicFeedbackMutation(recorded.state, recorded.mutation, true);

  const staleRead = beginTopicFeedbackRead(succeeded, 'owner-1');
  const stillOverlaid = mergeTopicFeedbackRead(succeeded, {
    ownerId: 'owner-1',
    readRevision: staleRead.revision,
    topics: [topic([])],
  });
  assert.deepEqual(stillOverlaid.topics[0].feedback, ['published']);

  const confirmingRead = beginTopicFeedbackRead(stillOverlaid.state, 'owner-1');
  const confirmed = mergeTopicFeedbackRead(stillOverlaid.state, {
    ownerId: 'owner-1',
    readRevision: confirmingRead.revision,
    topics: [topic(['published'])],
  });
  assert.deepEqual(confirmed.topics[0].feedback, ['published']);
  assert.notEqual(confirmed.state, stillOverlaid.state, 'confirmed overlay should be retired');
});

test('a read started before mutation success cannot retire the successful overlay', () => {
  const recorded = recordTopicFeedbackMutation(createTopicFeedbackState(), {
    ownerId: 'owner-1',
    topicId: 'topic-1',
    action: 'saved',
    enabled: true,
  });
  const inFlightRead = beginTopicFeedbackRead(recorded.state, 'owner-1');
  const succeeded = settleTopicFeedbackMutation(recorded.state, recorded.mutation, true);

  const staleConfirmation = mergeTopicFeedbackRead(succeeded, {
    ownerId: 'owner-1',
    readRevision: inFlightRead.revision,
    topics: [topic(['saved'])],
  });
  const laterRead = beginTopicFeedbackRead(staleConfirmation.state, 'owner-1');
  const confirmed = mergeTopicFeedbackRead(staleConfirmation.state, {
    ownerId: 'owner-1',
    readRevision: laterRead.revision,
    topics: [topic(['saved'])],
  });

  assert.equal(staleConfirmation.state, succeeded, 'pre-success read must retain overlay');
  assert.notEqual(confirmed.state, staleConfirmation.state, 'post-success read may retire overlay');
});

test('failed mutation removes only its overlay and rollback preserves other feedback', () => {
  const recorded = recordTopicFeedbackMutation(createTopicFeedbackState(), {
    ownerId: 'owner-1',
    topicId: 'topic-1',
    action: 'ignored',
    enabled: true,
  });
  const failed = settleTopicFeedbackMutation(recorded.state, recorded.mutation, false);
  const rollback = applyTopicFeedbackChoice([topic(['saved', 'ignored'])], 'topic-1', 'ignored', false);
  const merged = mergeTopicFeedbackRead(failed, {
    ownerId: 'owner-1',
    readRevision: 0,
    topics: rollback,
  });

  assert.deepEqual(merged.topics[0].feedback, ['saved']);
});

test('a failed reversal restores the earlier successful overlay until server confirmation', () => {
  const initial = createTopicFeedbackState();
  const staleRead = beginTopicFeedbackRead(initial, 'owner-1');
  const saved = recordTopicFeedbackMutation(initial, {
    ownerId: 'owner-1',
    topicId: 'topic-1',
    action: 'saved',
    enabled: true,
  });
  const saveSucceeded = settleTopicFeedbackMutation(saved.state, saved.mutation, true);
  const removed = recordTopicFeedbackMutation(saveSucceeded, {
    ownerId: 'owner-1',
    topicId: 'topic-1',
    action: 'saved',
    enabled: false,
  });
  const removeFailed = settleTopicFeedbackMutation(removed.state, removed.mutation, false);
  const merged = mergeTopicFeedbackRead(removeFailed, {
    ownerId: 'owner-1',
    readRevision: staleRead.revision,
    topics: [topic([])],
  });

  assert.deepEqual(merged.topics[0].feedback, ['saved']);
});

test('request registry returns one shared promise and exposes pending keys', async () => {
  const pendingSnapshots = [];
  const registry = createTopicFeedbackRequestRegistry((keys) => {
    pendingSnapshots.push([...keys]);
  });
  const key = buildTopicFeedbackKey('owner-1', 'topic-1', 'saved');
  let resolveRequest;
  let writes = 0;
  const operation = () => {
    writes += 1;
    return new Promise((resolve) => { resolveRequest = resolve; });
  };

  const first = registry.run(key, operation);
  const duplicate = registry.run(key, operation);
  assert.equal(first, duplicate);
  assert.equal(writes, 1);
  assert.equal(registry.has(key), true);
  assert.equal(registry.get(key), first);
  assert.deepEqual(pendingSnapshots.at(-1), [key]);

  resolveRequest(true);
  assert.equal(await first, true);
  assert.equal(registry.has(key), false);
  assert.equal(registry.get(key), null);
  assert.deepEqual(pendingSnapshots.at(-1), []);
});

test('owner overlays never cross account boundaries', () => {
  const recorded = recordTopicFeedbackMutation(createTopicFeedbackState(), {
    ownerId: 'owner-1',
    topicId: 'topic-1',
    action: 'saved',
    enabled: true,
  });
  const ownerTwo = mergeTopicFeedbackRead(recorded.state, {
    ownerId: 'owner-2',
    readRevision: 0,
    topics: [{ ...topic([]), ownerId: 'owner-2' }],
  });

  assert.deepEqual(ownerTwo.topics[0].feedback, []);
});

test('failure after an owner switch rolls back only the original owner snapshot', () => {
  const ownerOneSnapshot = {
    cards: [],
    trending: [],
    topics: [topic(['saved'])],
    collections: [],
    tasks: [],
  };
  const ownerTwoSnapshot = {
    ...ownerOneSnapshot,
    topics: [{ ...topic(['published']), ownerId: 'owner-2' }],
  };

  const rollback = resolveOwnerTopicFeedbackSnapshot({
    ownerId: 'owner-1',
    currentOwnerId: 'owner-2',
    loadedOwnerId: 'owner-2',
    currentSnapshot: ownerTwoSnapshot,
    storedSnapshot: ownerOneSnapshot,
    topicId: 'topic-1',
    action: 'saved',
    enabled: false,
  });

  assert.equal(rollback.updatesCurrentOwner, false);
  assert.deepEqual(rollback.snapshot.topics[0].feedback, []);
  assert.deepEqual(ownerTwoSnapshot.topics[0].feedback, ['published']);
});

test('successful settlement after an owner switch updates only the original owner snapshot', () => {
  const recorded = recordTopicFeedbackMutation(createTopicFeedbackState(), {
    ownerId: 'owner-1',
    topicId: 'topic-1',
    action: 'saved',
    enabled: true,
  });
  const ownerOneOptimistic = snapshotFor('owner-1', ['saved']);
  const ownerTwoCurrent = snapshotFor('owner-2', ['published']);

  const completed = resolveTopicFeedbackSettlement({
    state: recorded.state,
    mutation: recorded.mutation,
    succeeded: true,
    previousEnabled: false,
    currentOwnerId: 'owner-2',
    loadedOwnerId: 'owner-2',
    currentSnapshot: ownerTwoCurrent,
    storedSnapshot: ownerOneOptimistic,
  });

  assert.equal(completed.update.updatesCurrentOwner, false);
  assert.deepEqual(completed.update.snapshot.topics[0].feedback, ['saved']);
  assert.equal(completed.state.owners['owner-1'].overlays['topic-1\0saved'].status, 'succeeded');
  assert.deepEqual(ownerTwoCurrent.topics[0].feedback, ['published']);
});

test('failed settlement after an owner switch rolls back only the original owner snapshot', () => {
  const recorded = recordTopicFeedbackMutation(createTopicFeedbackState(), {
    ownerId: 'owner-1',
    topicId: 'topic-1',
    action: 'saved',
    enabled: true,
  });
  const ownerOneOptimistic = snapshotFor('owner-1', ['saved']);
  const ownerTwoCurrent = snapshotFor('owner-2', ['published']);

  const completed = resolveTopicFeedbackSettlement({
    state: recorded.state,
    mutation: recorded.mutation,
    succeeded: false,
    previousEnabled: false,
    currentOwnerId: 'owner-2',
    loadedOwnerId: 'owner-2',
    currentSnapshot: ownerTwoCurrent,
    storedSnapshot: ownerOneOptimistic,
  });

  assert.equal(completed.update.updatesCurrentOwner, false);
  assert.deepEqual(completed.update.snapshot.topics[0].feedback, []);
  assert.deepEqual(completed.state.owners['owner-1'].overlays, {});
  assert.deepEqual(ownerTwoCurrent.topics[0].feedback, ['published']);
});
