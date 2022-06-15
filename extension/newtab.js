// Entry point of the new-tab page. lib/ is copied from the library build by
// `npm run build:extension`.
import { h, render } from './lib/sprout.js';
import { FocusApp } from './lib/focus.js';

const KEY = 'focus-state';

const store = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      return null;
    }
  },
  save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // storage can be disabled; the page still works for this session
    }
  },
};

render(h(FocusApp, { store }), document.getElementById('app'));
