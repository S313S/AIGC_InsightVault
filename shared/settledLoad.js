export const getSettledValue = (result, fallbackValue, label, logger = console.error) => {
  if (result?.status === 'fulfilled') {
    return result.value;
  }

  if (result?.status === 'rejected') {
    logger(`${label} failed:`, result.reason);
  } else {
    logger(`${label} returned an unknown result state:`, result);
  }

  return fallbackValue;
};
