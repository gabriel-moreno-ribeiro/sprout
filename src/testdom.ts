/**
 * A deliberately small DOM implementation used to run the test-suite under
 * Node without a browser. It covers exactly the surface sprout touches:
 * createElement / createTextNode, insertBefore / removeChild, attributes,
 * style, event listeners with dispatchEvent, and an innerHTML serializer
 * so tests can assert on the rendered markup.
 */

export class TestEvent {
  type: string;
  target: TestNode | null = null;
  defaultPrevented = false;
  constructor(type: string) {
    this.type = type;
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

export class TestNode {
  nodeType: number;
  parentNode: TestNode | null = null;
  childNodes: TestNode[] = [];
  listeners = new Map<string, Set<(e: TestEvent) => void>>();

  constructor(nodeType: number) {
    this.nodeType = nodeType;
  }

  get firstChild(): TestNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): TestNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling(): TestNode | null {
    if (!this.parentNode) return null;
    const i = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[i + 1] ?? null;
  }

  appendChild(node: TestNode): TestNode {
    return this.insertBefore(node, null);
  }

  insertBefore(node: TestNode, ref: TestNode | null): TestNode {
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = ref ? this.childNodes.indexOf(ref) : -1;
    if (ref && index === -1) throw new Error('reference node is not a child');
    if (index === -1) this.childNodes.push(node);
    else this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }

  removeChild(node: TestNode): TestNode {
    const index = this.childNodes.indexOf(node);
    if (index === -1) throw new Error('node is not a child');
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  addEventListener(type: string, fn: (e: TestEvent) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: (e: TestEvent) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  dispatchEvent(event: TestEvent): boolean {
    event.target = this;
    // bubble up
    let node: TestNode | null = this;
    while (node) {
      for (const fn of node.listeners.get(event.type) ?? []) fn(event);
      node = node.parentNode;
    }
    return !event.defaultPrevented;
  }

  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join('');
  }
}

export class TestText extends TestNode {
  data: string;
  constructor(data: string) {
    super(3);
    this.data = data;
  }
  get textContent(): string {
    return this.data;
  }
}

export class TestElement extends TestNode {
  tagName: string;
  attributes = new Map<string, string>();
  style: Record<string, string> = {};
  value = '';
  checked = false;

  constructor(tagName: string) {
    super(1);
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  get className(): string {
    return this.attributes.get('class') ?? '';
  }

  get id(): string {
    return this.attributes.get('id') ?? '';
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): TestElement[] {
    const out: TestElement[] = [];
    const matches = (el: TestElement): boolean => {
      if (selector.startsWith('#')) return el.id === selector.slice(1);
      if (selector.startsWith('.')) return el.className.split(/\s+/).includes(selector.slice(1));
      return el.tagName === selector.toUpperCase();
    };
    const walk = (node: TestNode): void => {
      for (const child of node.childNodes) {
        if (child instanceof TestElement) {
          if (matches(child)) out.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return out;
  }

  get innerHTML(): string {
    return this.childNodes.map(serialize).join('');
  }

  set innerHTML(html: string) {
    this.childNodes.forEach((c) => (c.parentNode = null));
    this.childNodes = [];
    if (html) this.appendChild(new TestText(html));
  }

  get outerHTML(): string {
    return serialize(this);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function serialize(node: TestNode): string {
  if (node instanceof TestText) return escapeHtml(node.data);
  const el = node as TestElement;
  const tag = el.tagName.toLowerCase();
  const attrs = Array.from(el.attributes.entries())
    .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v.replace(/"/g, '&quot;')}"`))
    .join('');
  const style = Object.entries(el.style)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`)
    .join(';');
  const styleAttr = style && !el.attributes.has('style') ? ` style="${style}"` : '';
  return `<${tag}${attrs}${styleAttr}>${el.childNodes.map(serialize).join('')}</${tag}>`;
}

export class TestDocument {
  body = new TestElement('body');
  createElement(tag: string): TestElement {
    return new TestElement(tag);
  }
  createTextNode(data: string): TestText {
    return new TestText(data);
  }
}

/** Install the fake document as a global so sprout can use it. */
export function installTestDom(): TestDocument {
  const doc = new TestDocument();
  (globalThis as unknown as { document: TestDocument }).document = doc;
  return doc;
}
