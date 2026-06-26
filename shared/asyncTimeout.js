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
