import { useEffect, useState } from 'react';
import { readOrbStyle, saveOrbStyle, watchOrbStyle } from '../../lib/breathOrb';

// The person's orb choice: Rings (the starting choice) or Level. On this
// device for now (src/lib/breathOrb.js); Step 7 of Phase 4 decides where
// it lives in the account.
export function useOrbStyle() {
  const [style, setStyle] = useState(readOrbStyle);
  useEffect(() => watchOrbStyle(setStyle), []);
  return [style, saveOrbStyle];
}
