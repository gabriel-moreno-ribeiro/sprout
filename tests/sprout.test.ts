import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installTestDom, TestElement, TestEvent } from '../src/testdom.js';
import {
  h, render as renderRaw, unmountAt as unmountRaw, flushSync,
  useState, useEffect, useMemo, useRef, useReducer, Fragment, type VNode,
} from '../src/sprout.js';

const doc = installTestDom();

// the fake DOM is structurally compatible with what sprout needs
const render = (vnode: VNode | null, root: TestElement) => renderRaw(vnode, root as unknown as Node);
const unmountAt = (root: TestElement) => unmountRaw(root as unknown as Node);

function container(): TestElement {
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  return el;
}

const click = (el: TestElement) => el.dispatchEvent(new TestEvent('click'));
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('renders elements, text and attributes', () => {
  const root = container();
  render(h('ul', { className: 'list', id: 'main' }, h('li', null, 'one'), h('li', { title: 'two' }, 2)), root);
  assert.equal(root.innerHTML, '<ul class="list" id="main"><li>one</li><li title="two">2</li></ul>');
});

test('skips null, undefined and boolean children, flattens arrays', () => {
  const root = container();
  render(h('p', null, null, undefined, false, ['a', ['b', true], 'c']), root);
  assert.equal(root.innerHTML, '<p>abc</p>');
});

test('updates text and attributes in place', () => {
  const root = container();
  render(h('a', { href: '/x', hidden: true }, 'old'), root);
  const anchor = root.firstChild as TestElement;
  render(h('a', { href: '/y' }, 'new'), root);
  assert.equal(root.firstChild, anchor, 'element reused');
  assert.equal(root.innerHTML, '<a href="/y">new</a>');
});

test('replaces node when the type changes', () => {
  const root = container();
  render(h('span', null, 'x'), root);
  render(h('b', null, 'x'), root);
  assert.equal(root.innerHTML, '<b>x</b>');
  render(null, root);
  assert.equal(root.innerHTML, '');
});

test('style objects and boolean attributes', () => {
  const root = container();
  render(h('div', { style: { color: 'red', fontSize: '12px' }, disabled: true }), root);
  assert.equal(root.innerHTML, '<div disabled style="color:red;font-size:12px"></div>');
  render(h('div', { style: { color: 'blue' }, disabled: false }), root);
  assert.equal(root.innerHTML, '<div style="color:blue"></div>');
});

test('keyed children are reordered without recreating nodes', () => {
  const root = container();
  const list = (keys: string[]) => h('ul', null, keys.map((k) => h('li', { key: k }, k)));
  render(list(['a', 'b', 'c']), root);
  const ul = root.firstChild as TestElement;
  const [a, b, c] = ul.childNodes;
  render(list(['c', 'a', 'b']), root);
  assert.equal(ul.innerHTML, '<li>c</li><li>a</li><li>b</li>');
  assert.deepEqual(ul.childNodes, [c, a, b], 'same DOM nodes, moved');
  render(list(['b', 'd']), root);
  assert.equal(ul.innerHTML, '<li>b</li><li>d</li>');
  assert.equal(ul.childNodes[0], b);
});

test('unkeyed children are matched by position', () => {
  const root = container();
  render(h('div', null, h('span', null, '1'), h('span', null, '2')), root);
  const first = (root.firstChild as TestElement).firstChild;
  render(h('div', null, h('span', null, 'one')), root);
  assert.equal(root.innerHTML, '<div><span>one</span></div>');
  assert.equal((root.firstChild as TestElement).firstChild, first);
});

test('event listeners are attached, swapped and removed', () => {
  const root = container();
  const calls: string[] = [];
  render(h('button', { onClick: () => calls.push('a') }), root);
  const button = root.firstChild as TestElement;
  click(button);
  render(h('button', { onClick: () => calls.push('b') }), root);
  click(button);
  render(h('button', null), root);
  click(button);
  assert.deepEqual(calls, ['a', 'b']);
});

test('function components receive props and children', () => {
  const root = container();
  const Greeting = (props: { name: string; children?: unknown }) => h('p', null, 'Hi ', props.name, '! ', props.children as never);
  render(h(Greeting, { name: 'Ana' }, h('b', null, 'welcome')), root);
  assert.equal(root.innerHTML, '<p>Hi Ana! <b>welcome</b></p>');
});

test('useState re-renders the component and batches updates', async () => {
  const root = container();
  let renders = 0;
  const Counter = () => {
    renders++;
    const [count, setCount] = useState(0);
    return h('button', { onClick: () => { setCount((c) => c + 1); setCount((c) => c + 1); } }, String(count));
  };
  render(h(Counter, null), root);
  const button = root.firstChild as TestElement;
  click(button);
  assert.equal(root.innerHTML, '<button>0</button>', 'not re-rendered synchronously');
  await tick();
  assert.equal(root.innerHTML, '<button>2</button>');
  assert.equal(renders, 2, 'two setState calls produced one re-render');
  assert.equal(root.firstChild, button, 'button element reused');
});

test('useReducer', async () => {
  const root = container();
  const reducer = (s: number, a: 'inc' | 'dec') => (a === 'inc' ? s + 1 : s - 1);
  const C = () => {
    const [n, dispatch] = useReducer(reducer, 5);
    return h('div', { onClick: () => dispatch('dec') }, String(n));
  };
  render(h(C, null), root);
  click(root.firstChild as TestElement);
  flushSync();
  assert.equal(root.innerHTML, '<div>4</div>');
});

test('useEffect runs after mount, on dependency change, and cleans up on unmount', async () => {
  const root = container();
  const log: string[] = [];
  const Comp = (props: { id: number }) => {
    useEffect(() => {
      log.push(`effect ${props.id}`);
      return () => log.push(`cleanup ${props.id}`);
    }, [props.id]);
    useEffect(() => {
      log.push('once');
    }, []);
    return h('i', null, String(props.id));
  };
  render(h(Comp, { id: 1 }), root);
  assert.deepEqual(log, ['effect 1', 'once']);
  render(h(Comp, { id: 1 }), root);
  assert.deepEqual(log, ['effect 1', 'once'], 'unchanged deps do not re-run');
  render(h(Comp, { id: 2 }), root);
  assert.deepEqual(log, ['effect 1', 'once', 'cleanup 1', 'effect 2']);
  unmountAt(root);
  assert.deepEqual(log, ['effect 1', 'once', 'cleanup 1', 'effect 2', 'cleanup 2']);
  assert.equal(root.innerHTML, '');
});

test('useMemo and useRef keep values across renders', async () => {
  const root = container();
  let computed = 0;
  const refs: unknown[] = [];
  const Comp = (props: { n: number }) => {
    const doubled = useMemo(() => { computed++; return props.n * 2; }, [props.n]);
    const ref = useRef<{ tag: string } | null>(null);
    refs.push(ref);
    return h('div', { ref }, String(doubled));
  };
  render(h(Comp, { n: 2 }), root);
  render(h(Comp, { n: 2 }), root);
  render(h(Comp, { n: 3 }), root);
  assert.equal(root.innerHTML, '<div>6</div>');
  assert.equal(computed, 2);
  assert.equal(refs[0], refs[1], 'same ref object each render');
  assert.equal((refs[0] as { current: unknown }).current, root.firstChild, 'ref points to the DOM node');
});

test('conditional rendering and nested components', async () => {
  const root = container();
  const Child = (props: { label: string }) => h('span', null, props.label);
  const Parent = () => {
    const [open, setOpen] = useState(false);
    return h('div', { onClick: () => setOpen((o) => !o) }, open ? h(Child, { label: 'open' }) : 'closed');
  };
  render(h(Parent, null), root);
  assert.equal(root.innerHTML, '<div>closed</div>');
  click(root.firstChild as TestElement);
  flushSync();
  assert.equal(root.innerHTML, '<div><span>open</span></div>');
  click(root.firstChild as TestElement);
  flushSync();
  assert.equal(root.innerHTML, '<div>closed</div>');
});

test('setState after unmount is ignored', async () => {
  const root = container();
  let set: ((n: number) => void) | null = null;
  const C = () => {
    const [n, setN] = useState(0);
    set = setN;
    return h('b', null, String(n));
  };
  render(h(C, null), root);
  unmountAt(root);
  set!(5);
  await tick();
  assert.equal(root.innerHTML, '');
});

test('fragments render children directly into the parent', () => {
  const root = container();
  render(h('div', null, h(Fragment, null, h('a', null), h('b', null)), h('c', null)), root);
  assert.equal(root.innerHTML, '<div><a></a><b></b><c></c></div>');
});

test('todo app: add, toggle and remove items', async () => {
  const root = container();
  type Todo = { id: number; text: string; done: boolean };
  const App = () => {
    const [todos, setTodos] = useState<Todo[]>([{ id: 1, text: 'write tests', done: false }]);
    const [next, setNext] = useState(2);
    return h('div', null,
      h('button', { id: 'add', onClick: () => { setTodos((t) => [...t, { id: next, text: `todo ${next}`, done: false }]); setNext((n) => n + 1); } }, 'add'),
      h('ul', null, todos.map((t) =>
        h('li', { key: t.id, className: t.done ? 'done' : '' },
          h('span', { onClick: () => setTodos((all) => all.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x))) }, t.text),
          h('button', { className: 'rm', onClick: () => setTodos((all) => all.filter((x) => x.id !== t.id)) }, 'x')))));
  };
  render(h(App, null), root);
  click(root.querySelector('#add')!);
  flushSync();
  click(root.querySelector('#add')!);
  flushSync();
  assert.equal(root.querySelectorAll('li').length, 3);
  click(root.querySelectorAll('span')[1]);
  flushSync();
  assert.equal(root.querySelectorAll('li')[1].className, 'done');
  click(root.querySelectorAll('.rm')[0]);
  flushSync();
  assert.deepEqual(root.querySelectorAll('span').map((s) => s.textContent), ['todo 2', 'todo 3']);
  assert.equal(root.querySelectorAll('li')[0].className, 'done');
});
