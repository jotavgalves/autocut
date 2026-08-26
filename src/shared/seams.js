export function numberToLetters(value) {
  if (!Number.isInteger(value) || value < 1) throw new Error("Indice de emenda invalido.");
  let n = value;
  let out = "";
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

export function seamPair(seamIndex) {
  const base = numberToLetters(seamIndex);
  return [`${base}1`, `${base}2`];
}

export function labelsForSlice(sliceIndex, totalSlices, orientation) {
  const labels = { before: null, after: null };
  if (sliceIndex > 1) labels.before = seamPair(sliceIndex - 1);
  if (sliceIndex < totalSlices) labels.after = seamPair(sliceIndex);
  return {
    sliceIndex,
    totalSlices,
    orientation,
    labels
  };
}
