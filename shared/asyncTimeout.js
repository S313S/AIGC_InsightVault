export const withTimeout = async (promise, timeoutMs, fallbackValue) => {
  let timerId;

  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timerId = setTimeout(() => resolve(fallbackValue), timeoutMs);
      }),
    ]);
  } catch {
    return fallbackValue;
  } finally {
    if (timerId) clearTimeout(timerId);
  }
};
