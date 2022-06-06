# sprout

A small React-like UI library written from scratch in TypeScript: a virtual
DOM, a diffing reconciler with keyed children, function components and hooks
(`useState`, `useReducer`, `useEffect`, `useMemo`, `useCallback`, `useRef`),
batched re-renders and fragments. About 450 lines, zero runtime dependencies.

I built it to understand what React does under the hood: how a tree of plain
objects is turned into DOM nodes, how a second render is reconciled against
the first without rebuilding everything, and how hooks can work with nothing
more than a per-component array and a global "currently rendering" pointer.

## Example

```js
import { h, render, useState, useEffect } from './dist/src/sprout.js';

function Counter({ step }) {
  const [count, setCount] = useState(0);
  useEffect(() => { document.title = `count: ${count}`; }, [count]);
  return h('button', { onClick: () => setCount((c) => c + step) }, `Clicked ${count} times`);
}

render(h(Counter, { step: 2 }), document.getElementById('app'));
```

`h(type, props, ...children)` works as a JSX factory too (`jsxFactory: "h"`).
Open `demo/index.html` after `npm run build` for a todo app that persists to
`localStorage`.

## How it works

- **Virtual DOM** (`h`): builds plain `{ type, props, key }` objects; strings
  and numbers become text vnodes, arrays are flattened, `null`/booleans are
  skipped.
- **Mount / diff / unmount**: `render()` keeps the previous tree per container
  and calls `diff()`. Same type means patch in place (attributes, event
  listeners, style objects, `value`/`checked` properties); different type means
  mount the new node and unmount the old one.
- **Keyed reconciliation** (`diffChildren`): old children are matched by key
  (or by position when unkeyed); unmatched nodes are removed first, then
  matched nodes are moved with `insertBefore` only when they are out of order.
- **Components and hooks**: each component vnode owns an *instance* holding a
  hook array. While a component function runs, `currentInstance` points at it,
  and each hook call reads the next slot. `useState` is `useReducer` with a
  trivial reducer; updates are queued on the hook and applied on the next
  render.
- **Batching**: `setState` marks the instance dirty and schedules one flush
  with `queueMicrotask`, so many updates in the same tick cause one re-render.
  `flushSync()` forces it (used by the tests).
- **Effects**: run after the component's DOM has been committed; cleanups run
  before the effect re-runs and on unmount. `setState` after unmount is a no-op.

## Tests

The test-suite runs in Node against a tiny purpose-built DOM
(`src/testdom.ts`) that implements just the parts of the DOM the library uses,
including event bubbling and an `innerHTML` serializer.

```sh
npm install
npm test
```

## License

MIT
