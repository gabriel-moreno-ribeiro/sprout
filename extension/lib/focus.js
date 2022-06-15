// "Focus", a new-tab page built with sprout itself: clock, greeting, todo list,
// a pomodoro timer and quick links. The state logic is plain functions so the
// tests can drive it without a browser; the component is rendered with the
// test DOM too.
import { Fragment, h, useEffect, useReducer, useState } from './sprout.js';
// ---------------------------------------------------------------- pomodoro --
export const FOCUS_SECONDS = 25 * 60;
export const BREAK_SECONDS = 5 * 60;
export const initialPomodoro = { mode: 'focus', remaining: FOCUS_SECONDS, running: false, completed: 0 };
export function pomodoroReducer(state, action) {
    switch (action.type) {
        case 'start':
            return { ...state, running: true };
        case 'pause':
            return { ...state, running: false };
        case 'reset':
            return { ...state, running: false, remaining: state.mode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS };
        case 'skip':
            return switchMode(state);
        case 'tick': {
            if (!state.running)
                return state;
            const remaining = state.remaining - (action.seconds ?? 1);
            if (remaining > 0)
                return { ...state, remaining };
            return switchMode(state);
        }
    }
}
function switchMode(state) {
    if (state.mode === 'focus') {
        return { mode: 'break', remaining: BREAK_SECONDS, running: state.running, completed: state.completed + 1 };
    }
    return { mode: 'focus', remaining: FOCUS_SECONDS, running: state.running, completed: state.completed };
}
export function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export function todosReducer(todos, action) {
    switch (action.type) {
        case 'add': {
            const text = action.text.trim();
            if (!text)
                return todos;
            return [...todos, { id: action.id ?? Date.now(), text, done: false }];
        }
        case 'toggle':
            return todos.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t));
        case 'remove':
            return todos.filter((t) => t.id !== action.id);
        case 'clearDone':
            return todos.filter((t) => !t.done);
    }
}
// ---------------------------------------------------------------- helpers --
export function greeting(hour, name) {
    const part = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return name ? `${part}, ${name}` : part;
}
export const QUOTES = [
    'Make it work, make it right, make it fast.',
    'The best way to learn a language is to build something silly in it.',
    'Small steps every day.',
    'Done is better than perfect.',
    'Read the error message. Then read it again.',
    'You do not need permission to start.',
];
/** Deterministic pick: the same day always shows the same quote. */
export function quoteForDay(dayOfYear) {
    return QUOTES[((dayOfYear % QUOTES.length) + QUOTES.length) % QUOTES.length];
}
export function dayOfYear(date) {
    const start = Date.UTC(date.getFullYear(), 0, 1);
    return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86_400_000);
}
export const DEFAULT_LINKS = [
    { label: 'GitHub', url: 'https://github.com' },
    { label: 'YouTube', url: 'https://youtube.com' },
    { label: 'Gmail', url: 'https://mail.google.com' },
];
/** In-memory store, used by the tests and as a fallback when storage is unavailable. */
export function memoryStore(initial = null) {
    let saved = initial;
    return { load: () => saved, save: (s) => { saved = s; } };
}
export function FocusApp({ store, now = () => new Date(), tickMs = 1000 }) {
    const saved = store.load();
    const [todos, dispatchTodos] = useReducer(todosReducer, saved?.todos ?? []);
    const [name, setName] = useState(saved?.name ?? '');
    const [links] = useState(saved?.links ?? DEFAULT_LINKS);
    const [pomodoro, dispatchPomodoro] = useReducer(pomodoroReducer, { ...initialPomodoro, completed: saved?.completed ?? 0 });
    const [text, setText] = useState('');
    const [time, setTime] = useState(now());
    const [editingName, setEditingName] = useState(!saved?.name);
    useEffect(() => {
        store.save({ todos, name, links, completed: pomodoro.completed });
    }, [todos, name, links, pomodoro.completed]);
    useEffect(() => {
        if (!tickMs)
            return;
        const id = setInterval(() => {
            setTime(now());
            dispatchPomodoro({ type: 'tick' });
        }, tickMs);
        return () => clearInterval(id);
    }, [tickMs]);
    const hh = String(time.getHours()).padStart(2, '0');
    const mm = String(time.getMinutes()).padStart(2, '0');
    const open = todos.filter((t) => !t.done).length;
    return h('div', { className: 'focus' }, h('header', null, h('div', { className: 'clock' }, `${hh}:${mm}`), editingName
        ? h('form', { className: 'name', onSubmit: (e) => { e.preventDefault(); setEditingName(false); } }, h('input', { placeholder: 'your name', value: name, onInput: (e) => setName(e.target.value), autofocus: true }), h('button', null, 'ok'))
        : h('h1', { onClick: () => setEditingName(true), title: 'click to change' }, greeting(time.getHours(), name)), h('p', { className: 'quote' }, quoteForDay(dayOfYear(time)))), h('section', { className: 'pomodoro ' + pomodoro.mode }, h('div', { className: 'mode' }, pomodoro.mode === 'focus' ? 'focus' : 'break'), h('div', { className: 'timer' }, formatTime(pomodoro.remaining)), h('div', { className: 'controls' }, h('button', { onClick: () => dispatchPomodoro({ type: pomodoro.running ? 'pause' : 'start' }) }, pomodoro.running ? 'pause' : 'start'), h('button', { onClick: () => dispatchPomodoro({ type: 'reset' }) }, 'reset'), h('button', { onClick: () => dispatchPomodoro({ type: 'skip' }) }, 'skip')), h('div', { className: 'completed' }, `${pomodoro.completed} pomodoro${pomodoro.completed === 1 ? '' : 's'} done`)), h('section', { className: 'todos' }, h('form', { onSubmit: (e) => { e.preventDefault(); dispatchTodos({ type: 'add', text }); setText(''); } }, h('input', { placeholder: 'what needs doing today?', value: text, onInput: (e) => setText(e.target.value) }), h('button', null, 'add')), h('ul', null, todos.map((t) => h('li', { key: t.id, className: t.done ? 'done' : '' }, h('input', { type: 'checkbox', checked: t.done, onChange: () => dispatchTodos({ type: 'toggle', id: t.id }) }), h('span', { onClick: () => dispatchTodos({ type: 'toggle', id: t.id }) }, t.text), h('button', { className: 'remove', onClick: () => dispatchTodos({ type: 'remove', id: t.id }) }, '×')))), h('p', { className: 'summary' }, open === 0 ? 'nothing left, nice' : `${open} left`, todos.some((t) => t.done) ? h(Fragment, null, ' · ', h('a', { href: '#', onClick: (e) => { e.preventDefault(); dispatchTodos({ type: 'clearDone' }); } }, 'clear done')) : null)), h('nav', { className: 'links' }, links.map((l) => h('a', { key: l.url, href: l.url }, l.label))));
}
