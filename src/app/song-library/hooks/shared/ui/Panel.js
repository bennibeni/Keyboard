"use client";

import { isPanelEnabled } from "../config/panelFlags";

// Thin gate around a single panel: renders `children` only if this
// panel's flag is on (see shared/config/panelFlags.js). Replaces the
// earlier {panelRegistry}.filter().map() array-of-objects dance in
// Page.js with plain JSX - same "hide a panel with one flag flip"
// behavior, expressed the way the rest of Page.js already reads.
//
// No key prop needed on <Panel> usages - these are static JSX siblings,
// not items generated from an array via .map(), so React doesn't require
// one here.
export function Panel({ id, children }) {
  if (!isPanelEnabled(id)) return null;
  return children;
}

export default Panel;
