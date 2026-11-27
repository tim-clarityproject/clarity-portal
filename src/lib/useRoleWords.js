import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from './supabase';
import { readCache, writeCache } from './pageCache';
import { roleWords, withRoleWords } from './roleWords';

// The person's words for their role and country (Polish 1, Stage D item 3;
// src/lib/roleWords.js), for a page or tool: read once from their own
// person_settings row (describes_you, country, time_zone), the device's copy
// first so a tool opened offline still speaks their words. Until it has
// loaded, the device's time zone decides the region and the role is
// business, the table's first column.
//
//   const { words, fill } = useRoleWords();
//   words.board          'board', 'board or owners', 'owners or front office'
//   fill('Who in [team] will own it?')

const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
};

export default function useRoleWords() {
  const { user } = useContext(AuthContext) || {};
  const userId = user?.id || null;
  const [person, setPerson] = useState(() => (userId && readCache(userId, 'role-words')?.v) || { timeZone: deviceZone() });

  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    supabase.from('person_settings').select('describes_you, country, time_zone').eq('user_id', userId).limit(1)
      .then(({ data, error }) => {
        if (!live || error) return;
        const row = data?.[0] || {};
        const next = { role: row.describes_you || null, country: row.country || null, timeZone: row.time_zone || deviceZone() };
        writeCache(userId, 'role-words', next);
        setPerson(next);
      }, () => {});
    return () => { live = false; };
  }, [userId]);

  return { person, words: roleWords(person), fill: (text) => withRoleWords(text, person) };
}
