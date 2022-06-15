# sprout

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

**EN:** a React-like UI library in ~450 lines of TypeScript (virtual DOM, keyed reconciliation, function components, hooks, batched updates, fragments) and a Chrome new-tab extension built on it ("Focus": clock, todos, pomodoro, quick links). `npm run build:extension` prepares `extension/` for loading unpacked. Tests run in Node against a purpose-built fake DOM. MIT.
