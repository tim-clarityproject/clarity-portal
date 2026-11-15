// The Health Check's eye for someone without an account (M7b "Who can see
// this"; Tim, 14 Nov, 09:49): the shared guest eye, which every guest tool
// uses. Only you, or You and the coach (the default), with the line under
// the choice from `sharingLine` (src/lib/guest/sharing.js).
//
//   coachName: the first name of the coach who sent the link, or nothing
//   shared:    the choice now (true: the coach sees the results)
//   onShare:   (shared) => saves it; may return a promise
export { sharingLine } from '../../lib/guest/sharing';
export { default } from '../../components/design/GuestEye';
