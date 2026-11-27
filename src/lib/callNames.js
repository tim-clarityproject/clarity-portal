// A call type's name as people read it (the capitals rule, Tim, 27 Nov 2026;
// Stage D item 6, follow-up). The second call every coach starts with is the
// "Connection call", like the "Discovery call". 051 and 066 still save the old
// default, 'Connection Call', in coach_call_types.name, and older bookings,
// links and timeline lines carry it, so it is read through here: display
// only, the saved value is never changed. A name the coach typed is shown as
// typed.
const OLD_DEFAULTS = [
  [/^\s*Connection Call(s?)\s*$/, 'Connection call$1'],
  [/^\s*Chemistry Call(s?)\s*$/, 'Discovery call$1'],
];

/** "Connection Call" reads "Connection call"; anything else as it is. */
export function shownCallName(name) {
  if (typeof name !== 'string') return name;
  const old = OLD_DEFAULTS.find(([re]) => re.test(name));
  return old ? name.replace(old[0], old[1]) : name;
}

/** The same inside a saved line: "Booked a Connection Call" reads "Booked a Connection call". */
export function shownCallWords(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/\bConnection Call(s?)\b/g, 'Connection call$1').replace(/\bChemistry Call(s?)\b/g, 'Discovery call$1');
}
