// Desktop tables (D-033): the row's one link covers the whole row, so a click anywhere on it opens
// the row, while keyboard and screen-reader users still meet one link per row. Put `rowClass` on
// the <tr> and `rowLinkClass` on its link.
export const rowClass = "relative hover:bg-muted/40";
export const rowLinkClass =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset";
