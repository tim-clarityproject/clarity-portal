// The examples behind a guided question's "See an example" (Stage D,
// question rules 9 and 10, Tim, 27 Nov: never one example that assumes who
// they are). A string is one example; an array, or an object by role
// ({ ceo, coach, leader }), gives all of its two or three different
// examples, shown together on tap. Never more than three.
export function examplesOf(example) {
  if (!example) return [];
  if (typeof example === 'string') return example.trim() ? [example] : [];
  const list = Array.isArray(example) ? example : (typeof example === 'object' ? Object.values(example) : []);
  return [...new Set(list.filter((x) => typeof x === 'string' && x.trim()))].slice(0, 3);
}
