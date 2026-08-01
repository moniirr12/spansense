// Author's Report View/Export screens (and the narrative/conclusions
// summary helpers that only they used) are gone now that reviewing and
// generating a report happens on inspection.html itself - all that's left
// here is the one date-formatting helper Setup's own review card and
// inspection-date dropdown still use.
function fmtDate(d){
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
