// Global Vitest setup for the frontend.
// fake-indexeddb/auto installs a working `indexedDB` into the global scope so
// the offline engine's idb code runs in tests (node + jsdom).
import 'fake-indexeddb/auto';
