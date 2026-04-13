export const normalizeCollectionName = (value) => String(value || '').trim();

export const shouldSubmitCollectionName = ({ key, isComposing }) =>
  key === 'Enter' && !isComposing;
