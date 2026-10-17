// /setup has no screen of its own: it opens Setup step 1 (the four steps replaced the old
// one-page form), so old links keep working. The screen lives in src/screens/ so route files
// stay thin.
export { default } from '../../screens/SetupScreen';
