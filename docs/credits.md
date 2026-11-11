# Credits

What The Clarity Portal uses from other people, where their licence asks for a credit. This list is also the source for the help page's footer, when the help page is built (decisions part 5, 11 Nov 2026, 08:25).

## Public holiday dates

The booking helpers flag a call that falls on a public holiday in the client's country ("That’s Thanksgiving in the US."). The dates come from the **date-holidays** package by commenthol and its contributors, version 3.39.1 (pinned in `package.json`).

- Source: https://github.com/commenthol/date-holidays
- The package's code is under the ISC licence.
- Its holiday data is under the Creative Commons Attribution-ShareAlike 4.0 licence (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/ (the package's `package.json` and `LICENSE` file; its README still says 3.0). Most of the data comes from Wikipedia articles, and the package's `LICENSE` file lists each one.
- The portal uses the data as it is, loaded only when a booking is checked. One change is made to the words shown: a holiday moved because it falls on a weekend reads "(observed)" where the package says "(substitute day)" (`holidayName` in `src/lib/time/holidays.js`).

**The line for the help page's footer** (`HOLIDAY_DATA_CREDIT` in `src/lib/time/holidays.js`, so the page and this file never differ):

> Public holiday dates come from date-holidays by commenthol and its contributors, used under the Creative Commons Attribution-ShareAlike 4.0 licence.

with "date-holidays" linked to its source and the licence's name linked to the licence.

**Share-alike, in plain words (not legal advice):** if the holiday data itself is ever changed and passed on, the changed data must carry the same licence. The portal doesn't change or pass on the data, so the credit above is what the licence asks for. Decided as fine for this use on 11 Nov 2026.
