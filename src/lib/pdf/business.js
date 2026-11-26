// The business's facts for a PDF made in the browser (the 25 Nov PDFs' footer: the company's name and number and its
// website): business_facts() (068), which gives anyone signed in those four facts and never the bank details. Asked
// once a visit; offline, signed out or before 068 has run, null, and the footer shows the company's name alone. It
// never holds a PDF up for more than a moment.
import { supabase } from '../supabase';

let kept = null;
export function businessFacts({ wait = 1500 } = {}) {
  if (!kept) {
    kept = Promise.race([
      supabase.rpc('business_facts').then(({ data, error }) => (error || !data || typeof data !== 'object' ? null : data)),
      new Promise((resolve) => { setTimeout(() => resolve(null), wait); }),
    ]).catch(() => null).then((facts) => {
      if (!facts) kept = null; // asked again next time
      return facts;
    });
  }
  return kept;
}
