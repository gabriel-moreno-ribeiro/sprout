/**
 * sprout - a small React-like UI library written from scratch in TypeScript.
 *
 *   h()          builds a virtual DOM tree (works as a JSX factory)
 *   render()     mounts a tree into a real DOM container
 *   diff/patch   reconciles a new tree against the old one, touching the
 *                real DOM as little as possible (keyed children supported)
 *   hooks        useState, useReducer, useEffect, useMemo, useCallback, useRef
 *
 * State updates are batched: every setState inside the same tick results in a
 * single re-render, scheduled with queueMicrotask.
 */
// ---------------------------------------------------------------------------
// Virtual DOM construction
// ---------------------------------------------------------------------------
export function h(type, props, ...children) {
    const normalized = [];
    const flatten = (c) => {
        if (Array.isArray(c))
            c.forEach(flatten);
        else if (c === null || c === undefined || typeof c === 'boolean')
            return;
        else if (typeof c === 'string' || typeof c === 'number')
            normalized.push(text(String(c)));
        else
            normalized.push(c);
    };
    const propChildren = props && props.children !== undefined ? props.children : undefined;
    children.forEach(flatten);
    if (children.length === 0 && propChildren !== undefined)
        flatten(propChildren);
    const { key, ...rest } = props ?? {};
    return { type, props: { ...rest, children: normalized }, key };
}
/** Explicit fragment support: children are rendered into the parent directly. */
export const Fragment = (props) => h('#fragment', null, props.children);
function text(value) {
    return { type: '#text', props: { children: [] }, key: undefined, text: value };
}
function childrenOf(vnode) {
    return vnode.props.children;
}
// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
let currentInstance = null;
function nextHook() {
    if (!currentInstance)
        throw new Error('hooks can only be called inside a component');
    const hooks = currentInstance.hooks;
    const index = currentInstance.hookIndex++;
    if (!hooks[index])
        hooks[index] = {};
    return hooks[index];
}
function depsChanged(prev, next) {
    if (!prev || !next)
        return true;
    if (prev.length !== next.length)
        return true;
    return prev.some((v, i) => !Object.is(v, next[i]));
}
export function useReducer(reducer, initial) {
    const instance = currentInstance;
    const hook = nextHook();
    if (!('state' in hook)) {
        hook.state = typeof initial === 'function' ? initial() : initial;
        hook.queue = [];
    }
    // apply queued updates
    for (const update of hook.queue)
        hook.state = update(hook.state);
    hook.queue = [];
    const dispatch = (action) => {
        if (instance.unmounted)
            return;
        hook.queue.push((prev) => reducer(prev, action));
        scheduleRender(instance);
    };
    return [hook.state, dispatch];
}
export function useState(initial) {
    return useReducer((state, action) => (typeof action === 'function' ? action(state) : action), initial);
}
export function useEffect(effect, deps) {
    const instance = currentInstance;
    const hook = nextHook();
    if (depsChanged(hook.deps, deps)) {
        hook.deps = deps;
        hook.effect = effect;
        instance.pendingEffects.push(hook);
    }
}
export function useMemo(factory, deps) {
    const hook = nextHook();
    if (depsChanged(hook.deps, deps)) {
        hook.deps = deps;
        hook.memo = factory();
    }
    return hook.memo;
}
export function useCallback(fn, deps) {
    return useMemo(() => fn, deps);
}
export function useRef(initial) {
    const hook = nextHook();
    if (!hook.ref)
        hook.ref = { current: initial };
    return hook.ref;
}
// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------
const dirtyInstances = new Set();
let flushScheduled = false;
function scheduleRender(instance) {
    instance.dirty = true;
    dirtyInstances.add(instance);
    if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
    }
}
function flush() {
    flushScheduled = false;
    const pending = Array.from(dirtyInstances);
    dirtyInstances.clear();
    for (const instance of pending) {
        if (instance.dirty && !instance.unmounted)
            rerender(instance);
    }
}
/** Force all pending re-renders to happen now (handy in tests). */
export function flushSync() {
    flush();
}
function rerender(instance) {
    const vnode = instance.vnode;
    const oldRendered = vnode.rendered ?? null;
    const rendered = runComponent(instance, vnode);
    const anchor = oldRendered ? domOf(oldRendered) : null;
    const next = anchor ? anchor.nextSibling : null;
    vnode.rendered = diff(instance.parentDom, rendered, oldRendered, next);
    runEffects(instance);
}
function runComponent(instance, vnode) {
    instance.dirty = false;
    instance.hookIndex = 0;
    const previous = currentInstance;
    currentInstance = instance;
    try {
        const out = vnode.type(vnode.props);
        return out === null || out === undefined ? null : out;
    }
    finally {
        currentInstance = previous;
    }
}
function runEffects(instance) {
    const effects = instance.pendingEffects;
    instance.pendingEffects = [];
    for (const hook of effects) {
        if (hook.cleanup)
            hook.cleanup();
        hook.cleanup = hook.effect();
    }
}
// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------
function domOf(vnode) {
    if (vnode.dom)
        return vnode.dom;
    if (vnode.rendered)
        return domOf(vnode.rendered);
    return null;
}
/** Reconcile newVNode against oldVNode inside parentDom. Returns the mounted vnode. */
function diff(parentDom, newVNode, oldVNode, nextSibling) {
    if (newVNode === null) {
        if (oldVNode)
            unmount(oldVNode, parentDom);
        return null;
    }
    if (oldVNode === null || oldVNode.type !== newVNode.type) {
        mount(parentDom, newVNode, nextSibling);
        if (oldVNode)
            unmount(oldVNode, parentDom);
        return newVNode;
    }
    if (newVNode.type === '#text') {
        newVNode.dom = oldVNode.dom;
        if (oldVNode.text !== newVNode.text)
            newVNode.dom.data = newVNode.text;
        return newVNode;
    }
    if (typeof newVNode.type === 'function') {
        const instance = oldVNode.instance;
        instance.vnode = newVNode;
        newVNode.instance = instance;
        const rendered = runComponent(instance, newVNode);
        newVNode.rendered = diff(parentDom, rendered, oldVNode.rendered ?? null, nextSibling);
        runEffects(instance);
        return newVNode;
    }
    if (newVNode.type === '#fragment') {
        newVNode.dom = undefined;
        diffChildren(parentDom, childrenOf(newVNode), childrenOf(oldVNode), nextSibling);
        return newVNode;
    }
    const dom = oldVNode.dom;
    newVNode.dom = dom;
    patchProps(dom, oldVNode.props, newVNode.props);
    diffChildren(dom, childrenOf(newVNode), childrenOf(oldVNode), null);
    return newVNode;
}
function mount(parentDom, vnode, nextSibling) {
    if (vnode.type === '#text') {
        vnode.dom = document.createTextNode(vnode.text);
        parentDom.insertBefore(vnode.dom, nextSibling);
        return;
    }
    if (typeof vnode.type === 'function') {
        const instance = {
            vnode,
            hooks: [],
            hookIndex: 0,
            parentDom,
            dirty: false,
            pendingEffects: [],
            unmounted: false,
        };
        vnode.instance = instance;
        const rendered = runComponent(instance, vnode);
        vnode.rendered = diff(parentDom, rendered, null, nextSibling);
        runEffects(instance);
        return;
    }
    if (vnode.type === '#fragment') {
        for (const child of childrenOf(vnode))
            mount(parentDom, child, nextSibling);
        return;
    }
    const dom = document.createElement(vnode.type);
    vnode.dom = dom;
    patchProps(dom, {}, vnode.props);
    for (const child of childrenOf(vnode))
        mount(dom, child, null);
    parentDom.insertBefore(dom, nextSibling);
}
function unmount(vnode, parentDom) {
    if (typeof vnode.type === 'function') {
        const instance = vnode.instance;
        instance.unmounted = true;
        dirtyInstances.delete(instance);
        for (const hook of instance.hooks) {
            if (hook.cleanup)
                hook.cleanup();
            hook.cleanup = undefined;
        }
        if (vnode.rendered)
            unmount(vnode.rendered, parentDom);
        return;
    }
    if (vnode.type === '#fragment') {
        for (const child of childrenOf(vnode))
            unmount(child, parentDom);
        return;
    }
    // unmount nested components so their effects are cleaned up
    if (vnode.type !== '#text') {
        for (const child of childrenOf(vnode)) {
            if (typeof child.type === 'function' || child.type === '#fragment')
                unmount(child, vnode.dom);
            else if (child.type !== '#text')
                unmountDescendants(child);
        }
    }
    if (vnode.dom && vnode.dom.parentNode === parentDom)
        parentDom.removeChild(vnode.dom);
}
function unmountDescendants(vnode) {
    for (const child of childrenOf(vnode)) {
        if (typeof child.type === 'function' || child.type === '#fragment')
            unmount(child, vnode.dom);
        else if (child.type !== '#text')
            unmountDescendants(child);
    }
}
/** Keyed children reconciliation. Unkeyed children are matched by index. */
function diffChildren(parentDom, newChildren, oldChildren, nextSibling) {
    const oldKeyed = new Map();
    const oldUnkeyed = [];
    for (const child of oldChildren) {
        if (child.key !== undefined && child.key !== null)
            oldKeyed.set(child.key, child);
        else
            oldUnkeyed.push(child);
    }
    const used = new Set();
    let unkeyedIndex = 0;
    for (const newChild of newChildren) {
        let match;
        if (newChild.key !== undefined && newChild.key !== null) {
            match = oldKeyed.get(newChild.key);
            if (match && match.type !== newChild.type)
                match = undefined;
        }
        else {
            // take the next unused unkeyed old child of the same type
            while (unkeyedIndex < oldUnkeyed.length && oldUnkeyed[unkeyedIndex] === undefined)
                unkeyedIndex++;
            const candidate = oldUnkeyed[unkeyedIndex];
            if (candidate && candidate.type === newChild.type) {
                match = candidate;
                oldUnkeyed[unkeyedIndex] = undefined;
            }
        }
        if (match)
            used.add(match);
    }
    // remove old children that are not reused, before inserting, so the
    // positions we compute below are stable
    for (const child of oldChildren) {
        if (!used.has(child))
            unmount(child, parentDom);
    }
    // second pass: diff/mount in order, moving DOM nodes when needed
    const oldKeyedRemaining = new Map(oldKeyed);
    let unkeyedPos = 0;
    const reusableUnkeyed = oldChildren.filter((c) => used.has(c) && (c.key === undefined || c.key === null));
    let cursor = firstDomOf(oldChildren.filter((c) => used.has(c))) ?? nextSibling;
    for (const newChild of newChildren) {
        let match = null;
        if (newChild.key !== undefined && newChild.key !== null) {
            const m = oldKeyedRemaining.get(newChild.key);
            if (m && used.has(m)) {
                match = m;
                oldKeyedRemaining.delete(newChild.key);
            }
        }
        else if (unkeyedPos < reusableUnkeyed.length) {
            match = reusableUnkeyed[unkeyedPos++];
        }
        if (match) {
            const matchDom = domOf(match);
            // move the existing node in front of the cursor if it is not already there
            if (matchDom && matchDom !== cursor) {
                moveVNode(parentDom, match, cursor);
            }
            diff(parentDom, newChild, match, cursor && cursor !== matchDom ? cursor : nextSiblingOf(match));
            const newDom = domOf(newChild);
            cursor = newDom ? newDom.nextSibling : cursor;
        }
        else {
            mount(parentDom, newChild, cursor);
        }
    }
}
function firstDomOf(vnodes) {
    for (const v of vnodes) {
        const d = domOf(v);
        if (d)
            return d;
    }
    return null;
}
function nextSiblingOf(vnode) {
    const d = lastDomOf(vnode);
    return d ? d.nextSibling : null;
}
function lastDomOf(vnode) {
    if (vnode.dom)
        return vnode.dom;
    if (vnode.rendered)
        return lastDomOf(vnode.rendered);
    if (vnode.type === '#fragment') {
        const children = childrenOf(vnode);
        for (let i = children.length - 1; i >= 0; i--) {
            const d = lastDomOf(children[i]);
            if (d)
                return d;
        }
    }
    return null;
}
function moveVNode(parentDom, vnode, before) {
    if (vnode.dom) {
        parentDom.insertBefore(vnode.dom, before);
    }
    else if (vnode.rendered) {
        moveVNode(parentDom, vnode.rendered, before);
    }
    else if (vnode.type === '#fragment') {
        for (const child of childrenOf(vnode))
            moveVNode(parentDom, child, before);
    }
}
// ---------------------------------------------------------------------------
// Props / attributes / events
// ---------------------------------------------------------------------------
function patchProps(dom, oldProps, newProps) {
    for (const name of Object.keys(oldProps)) {
        if (name === 'children' || name === 'key')
            continue;
        if (!(name in newProps))
            setProp(dom, name, oldProps[name], undefined);
    }
    for (const name of Object.keys(newProps)) {
        if (name === 'children' || name === 'key')
            continue;
        if (oldProps[name] !== newProps[name])
            setProp(dom, name, oldProps[name], newProps[name]);
    }
}
function setProp(dom, name, oldValue, newValue) {
    if (name.startsWith('on') && (typeof newValue === 'function' || typeof oldValue === 'function')) {
        const event = name.slice(2).toLowerCase();
        if (typeof oldValue === 'function')
            dom.removeEventListener(event, oldValue);
        if (typeof newValue === 'function')
            dom.addEventListener(event, newValue);
        return;
    }
    if (name === 'style') {
        const style = dom.style;
        const oldStyle = (oldValue ?? {});
        const newStyle = (newValue ?? {});
        if (typeof newValue === 'string') {
            dom.setAttribute('style', newValue);
            return;
        }
        for (const k of Object.keys(oldStyle))
            if (!(k in newStyle))
                style[k] = '';
        for (const k of Object.keys(newStyle))
            if (oldStyle[k] !== newStyle[k])
                style[k] = newStyle[k];
        return;
    }
    if (name === 'className')
        name = 'class';
    if (name === 'ref' && newValue && typeof newValue === 'object') {
        newValue.current = dom;
        return;
    }
    if (name === 'dangerouslySetInnerHTML') {
        dom.innerHTML = newValue?.__html ?? '';
        return;
    }
    // properties that must be set as JS properties, not attributes
    if ((name === 'value' || name === 'checked' || name === 'selected') && name in dom) {
        dom[name] = newValue ?? (name === 'value' ? '' : false);
        return;
    }
    if (newValue === null || newValue === undefined || newValue === false) {
        dom.removeAttribute(name);
    }
    else if (newValue === true) {
        dom.setAttribute(name, '');
    }
    else {
        dom.setAttribute(name, String(newValue));
    }
}
// ---------------------------------------------------------------------------
// Public render API
// ---------------------------------------------------------------------------
const roots = new WeakMap();
/** Render (or update) a tree into a container. Calling it again diffs against the previous render. */
export function render(vnode, container) {
    const old = roots.get(container) ?? null;
    roots.set(container, diff(container, vnode, old, null));
}
/** Unmount whatever is rendered in a container, running effect cleanups. */
export function unmountAt(container) {
    const old = roots.get(container);
    if (old)
        unmount(old, container);
    roots.delete(container);
}
