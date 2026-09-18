export const withTimeoutResult = async (promise, timeoutMs, fallbackValue) => {
  let timerId;
  const timeoutMarker = Symbol('timeout');

  try {
    const result = await Promise.race([
      promise,
      new Promise((resolve) => {
        timerId = setTimeout(() => resolve(timeoutMarker), timeoutMs);
      }),
    ]);

    if (result === timeoutMarker) {
      return { ok: false, value: fallbackValue, reason: 'timeout' };
    }

    return { ok: true, value: result, reason: null };
  } catch (error) {
    return { ok: false, value: fallbackValue, reason: error };
  } finally {
    if (timerId) clearTimeout(timerId);
  }
};

export const withTimeout = async (promise, timeoutMs, fallbackValue) => {
  const result = await withTimeoutResult(promise, timeoutMs, fallbackValue);
  return result.value;
};

export const withTimeoutRetryResult = async (
  operation,
  { attemptTimeouts = [], retryDelayMs = 0, signal } = {},
  fallbackValue
) => {
  const startedAt = Date.now();
  let lastReason = null;
  let attempts = 0;
  const abortedResult = () => ({
    ok: false,
    value: fallbackValue,
    reason: 'aborted',
    attempts,
    elapsedMs: Date.now() - startedAt,
  });

  for (const timeoutMs of attemptTimeouts) {
    if (signal?.aborted) return abortedResult();

    attempts += 1;
    const controller = new AbortController();
    const timeoutMarker = Symbol('timeout');
    const parentAbortMarker = Symbol('parent-abort');
    let timerId;
    let resolveParentAbort;
    const handleParentAbort = () => {
      controller.abort();
      resolveParentAbort?.(parentAbortMarker);
    };
    signal?.addEventListener('abort', handleParentAbort, { once: true });

    try {
      const result = await Promise.race([
        Promise.resolve().then(() => operation(controller.signal, attempts)),
        new Promise((resolve) => {
          timerId = setTimeout(() => {
            controller.abort();
            resolve(timeoutMarker);
          }, timeoutMs);
        }),
        new Promise((resolve) => {
          resolveParentAbort = resolve;
        }),
      ]);

      if (result === parentAbortMarker) return abortedResult();

      if (result !== timeoutMarker) {
        return {
          ok: true,
          value: result,
          reason: null,
          attempts,
          elapsedMs: Date.now() - startedAt,
        };
      }

      lastReason = 'timeout';
    } catch (error) {
      lastReason = error;
    } finally {
      if (timerId) clearTimeout(timerId);
      signal?.removeEventListener('abort', handleParentAbort);
    }

    if (attempts < attemptTimeouts.length && retryDelayMs > 0) {
      const shouldContinue = await new Promise((resolve) => {
        let delayId;
        const handleDelayAbort = () => {
          if (delayId) clearTimeout(delayId);
          signal?.removeEventListener('abort', handleDelayAbort);
          resolve(false);
        };

        if (signal?.aborted) {
          resolve(false);
          return;
        }

        signal?.addEventListener('abort', handleDelayAbort, { once: true });
        delayId = setTimeout(() => {
          signal?.removeEventListener('abort', handleDelayAbort);
          resolve(true);
        }, retryDelayMs);
      });

      if (!shouldContinue) return abortedResult();
    }
  }

  return {
    ok: false,
    value: fallbackValue,
    reason: lastReason,
    attempts,
    elapsedMs: Date.now() - startedAt,
  };
};
