# sprout

> 🇺🇸 [English version below](#english)

Uma biblioteca de UI estilo React, em TypeScript, com umas 450 linhas e zero dependências: virtual DOM, reconciliação com chaves, componentes de função, hooks (`useState`, `useReducer`, `useEffect`, `useMemo`, `useCallback`, `useRef`), re-render em lote e fragments.

E, pra provar que ela serve pra alguma coisa, uma **extensão do Chrome** feita com ela: a "Focus", uma página de nova aba com relógio, lista de tarefas, timer pomodoro e atalhos. Uso todo dia.

## A extensão

```sh
npm install
npm run build:extension      # compila e monta a pasta extension/
```

Depois abre `chrome://extensions`, liga o modo desenvolvedor, "Carregar sem compactação" e aponta pra pasta `extension/`. Abre uma aba nova e pronto. Os dados ficam no `localStorage` da própria página, nada sai do seu computador.

O componente inteiro está em `src/focus.ts` (é um arquivo só, dá pra ler em dez minutos). A lógica do pomodoro e das tarefas são reducers puros, testados sem navegador.

## A biblioteca

```js
import { h, render, useState, useEffect } from './dist/src/sprout.js';

function Counter({ step }) {
  const [count, setCount] = useState(0);
  useEffect(() => { document.title = `count: ${count}`; }, [count]);
  return h('button', { onClick: () => setCount((c) => c + step) }, `Clicked ${count} times`);
}
render(h(Counter, { step: 2 }), document.getElementById('app'));
```

`h(type, props, ...children)` também serve de fábrica pra JSX (`jsxFactory: "h"`). Tem um todo app em `demo/index.html`.

Como funciona, em ordem:

- `h` monta objetos `{ type, props, key }`; strings viram nós de texto, arrays são achatados, `null`/booleanos somem.
- `render()` guarda a árvore anterior por container e chama `diff()`: mesmo tipo = patch no lugar (atributos, listeners, `style`, `value`/`checked`); tipo diferente = monta o novo, desmonta o velho.
- Filhos com `key` são casados por chave; os que sobraram são removidos primeiro e os demais só se movem (`insertBefore`) quando estão fora de ordem.
- Cada componente tem uma *instância* com um array de hooks. Enquanto a função roda, `currentInstance` aponta pra ela e cada hook lê o próximo slot. Foi aqui que caiu a ficha de por que hooks não podem ficar dentro de `if`.
- `setState` marca a instância como suja e agenda um flush com `queueMicrotask`, então dez updates no mesmo tick viram um render. `flushSync()` força.
- Efeitos rodam depois do commit; cleanups rodam antes do efeito rodar de novo e no unmount.

## Testes

`npm test` roda em Node contra um DOM de mentira (`src/testdom.ts`) que implementa só o que a biblioteca usa, com bubbling de eventos e um serializador de `innerHTML`. Cobre a biblioteca e a página Focus (renderiza, adiciona tarefa, salva, inicia o pomodoro). O CI ainda confere que a build commitada em `extension/lib` está atualizada.

---

## English

A React-style UI library, in TypeScript, in about 450 lines and zero dependencies: virtual DOM, keyed reconciliation, function components, hooks (`useState`, `useReducer`, `useEffect`, `useMemo`, `useCallback`, `useRef`), batched re-renders and fragments.

And, to prove it's good for something, a **Chrome extension** made with it: "Focus", a new-tab page with a clock, a todo list, a pomodoro timer and shortcuts. I use it every day.

## The extension

```sh
npm install
npm run build:extension      # compiles and assembles the extension/ folder
```

Then open `chrome://extensions`, turn on developer mode, "Load unpacked" and point it at the `extension/` folder. Open a new tab and that's it. Data stays in the page's own `localStorage`, nothing leaves your computer.

The whole component lives in `src/focus.ts` (it's a single file, you can read it in ten minutes). The pomodoro and todo logic are pure reducers, tested without a browser.

## The library

```js
import { h, render, useState, useEffect } from './dist/src/sprout.js';

function Counter({ step }) {
  const [count, setCount] = useState(0);
  useEffect(() => { document.title = `count: ${count}`; }, [count]);
  return h('button', { onClick: () => setCount((c) => c + step) }, `Clicked ${count} times`);
}
render(h(Counter, { step: 2 }), document.getElementById('app'));
```

`h(type, props, ...children)` also works as a JSX factory (`jsxFactory: "h"`). There's a todo app in `demo/index.html`.

How it works, in order:

- `h` builds `{ type, props, key }` objects; strings become text nodes, arrays are flattened, `null`/booleans disappear.
- `render()` keeps the previous tree per container and calls `diff()`: same type = patch in place (attributes, listeners, `style`, `value`/`checked`); different type = mount the new one, unmount the old one.
- Children with a `key` are matched by key; the leftovers are removed first and the rest only move (`insertBefore`) when they're out of order.
- Each component has an *instance* with an array of hooks. While the function runs, `currentInstance` points at it and each hook reads the next slot. This is where it clicked for me why hooks can't live inside an `if`.
- `setState` marks the instance dirty and schedules a flush with `queueMicrotask`, so ten updates in the same tick become one render. `flushSync()` forces it.
- Effects run after the commit; cleanups run before the effect runs again and on unmount.

## Tests

`npm test` runs in Node against a fake DOM (`src/testdom.ts`) that implements only what the library uses, with event bubbling and an `innerHTML` serializer. It covers the library and the Focus page (renders, adds a task, saves, starts the pomodoro). CI also checks that the build committed in `extension/lib` is up to date.

MIT.
