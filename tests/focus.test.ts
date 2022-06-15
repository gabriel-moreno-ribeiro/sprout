import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installTestDom, TestEvent } from '../src/testdom.js';
import { flushSync, h, render } from '../src/sprout.js';
import {
  BREAK_SECONDS, FOCUS_SECONDS, FocusApp, dayOfYear, formatTime, greeting, initialPomodoro, memoryStore,
  pomodoroReducer, quoteForDay, todosReducer, type Pomodoro, type Todo,
} from '../src/focus.js';

test('pomodoro counts down, switches to a break and counts completions', () => {
  let s: Pomodoro = initialPomodoro;
  assert.equal(pomodoroReducer(s, { type: 'tick' }), s, 'no change while paused');
  s = pomodoroReducer(s, { type: 'start' });
  s = pomodoroReducer(s, { type: 'tick', seconds: FOCUS_SECONDS - 1 });
  assert.equal(s.remaining, 1);
  s = pomodoroReducer(s, { type: 'tick' });
  assert.equal(s.mode, 'break');
  assert.equal(s.remaining, BREAK_SECONDS);
  assert.equal(s.completed, 1);
  s = pomodoroReducer(s, { type: 'skip' });
  assert.equal(s.mode, 'focus');
  assert.equal(s.completed, 1, 'skipping a break is not a completed pomodoro');
  s = pomodoroReducer(pomodoroReducer(s, { type: 'tick', seconds: 100 }), { type: 'reset' });
  assert.equal(s.remaining, FOCUS_SECONDS);
  assert.equal(s.running, false);
  assert.equal(formatTime(FOCUS_SECONDS), '25:00');
  assert.equal(formatTime(65), '01:05');
});

test('todo reducer', () => {
  let todos: Todo[] = [];
  todos = todosReducer(todos, { type: 'add', text: '  learn zig ', id: 1 });
  todos = todosReducer(todos, { type: 'add', text: '   ', id: 2 });
  todos = todosReducer(todos, { type: 'add', text: 'ship it', id: 3 });
  assert.deepEqual(todos.map((t) => t.text), ['learn zig', 'ship it']);
  todos = todosReducer(todos, { type: 'toggle', id: 1 });
  assert.equal(todos[0].done, true);
  todos = todosReducer(todos, { type: 'clearDone' });
  assert.deepEqual(todos.map((t) => t.id), [3]);
  todos = todosReducer(todos, { type: 'remove', id: 3 });
  assert.equal(todos.length, 0);
});

test('greeting and quotes', () => {
  assert.equal(greeting(3), 'Still up');
  assert.equal(greeting(9, 'Ana'), 'Good morning, Ana');
  assert.equal(greeting(15), 'Good afternoon');
  assert.equal(greeting(22, 'Bo'), 'Good evening, Bo');
  assert.equal(dayOfYear(new Date(2022, 0, 1)), 0);
  assert.equal(dayOfYear(new Date(2022, 11, 31)), 364);
  assert.equal(quoteForDay(0), quoteForDay(6));
  assert.notEqual(quoteForDay(0), quoteForDay(1));
});

test('the new tab page renders, adds todos and persists them', () => {
  const doc = installTestDom();
  const root = doc.createElement('div');
  const store = memoryStore({ todos: [{ id: 1, text: 'water the plants', done: false }], name: 'Gabriel', links: [], completed: 2 });
  const fixed = () => new Date(2022, 8, 5, 9, 30);
  render(h(FocusApp, { store, now: fixed, tickMs: 0 }), root as unknown as Node);

  assert.match(root.innerHTML, /09:30/);
  assert.match(root.innerHTML, /Good morning, Gabriel/);
  assert.match(root.innerHTML, /water the plants/);
  assert.match(root.innerHTML, /2 pomodoros done/);
  assert.match(root.innerHTML, /25:00/);

  // with a saved name there is no name form, so the first input is the todo box
  const input = root.querySelectorAll('input')[0];
  input.value = 'write the readme';
  input.dispatchEvent(new TestEvent('input'));
  flushSync(); // in a browser the re-render happens between the two events
  root.querySelectorAll('form')[0].dispatchEvent(new TestEvent('submit'));
  flushSync();
  assert.match(root.innerHTML, /write the readme/);
  assert.match(root.innerHTML, /2 left/);
  assert.equal(store.load()!.todos.length, 2, 'saved to the store');

  // the first button on the page is the pomodoro start
  root.querySelectorAll('button')[0].dispatchEvent(new TestEvent('click'));
  flushSync();
  assert.match(root.innerHTML, />pause</);
  assert.match(root.innerHTML, /focus/);
});
