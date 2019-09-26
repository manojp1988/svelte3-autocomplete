(function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function not_equal(a, b) {
        return a != a ? b == b : a !== b;
    }
    function create_slot(definition, ctx, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, fn) {
        return definition[1]
            ? assign({}, assign(ctx.$$scope.ctx, definition[1](fn ? fn(ctx) : {})))
            : ctx.$$scope.ctx;
    }
    function get_slot_changes(definition, ctx, changed, fn) {
        return definition[1]
            ? assign({}, assign(ctx.$$scope.changed || {}, definition[1](fn ? fn(changed) : {})))
            : ctx.$$scope.changed || {};
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function stop_propagation(fn) {
        return function (event) {
            event.stopPropagation();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }
    class HtmlTag {
        constructor(html, anchor = null) {
            this.e = element('div');
            this.a = anchor;
            this.u(html);
        }
        m(target, anchor = null) {
            for (let i = 0; i < this.n.length; i += 1) {
                insert(target, this.n[i], anchor);
            }
            this.t = target;
        }
        u(html) {
            this.e.innerHTML = html;
            this.n = Array.from(this.e.childNodes);
        }
        p(html) {
            this.d();
            this.u(html);
            this.m(this.t, this.a);
        }
        d() {
            this.n.forEach(detach);
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function createEventDispatcher() {
        const component = current_component;
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        if (component.$$.fragment) {
            run_all(component.$$.on_destroy);
            component.$$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            component.$$.on_destroy = component.$$.fragment = null;
            component.$$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal, prop_names) {
        const parent_component = current_component;
        set_current_component(component);
        const props = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props: prop_names,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, props, (key, value) => {
                if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
            })
            : props;
        $$.update();
        ready = true;
        run_all($$.before_update);
        $$.fragment = create_fragment($$.ctx);
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    /* src/Autocomplete.svelte generated by Svelte v3.9.2 */

    const file = "src/Autocomplete.svelte";

    function add_css() {
    	var style = element("style");
    	style.id = 'svelte-1kz7xie-style';
    	style.textContent = ".svelte-1kz7xie{box-sizing:border-box}input.svelte-1kz7xie{height:2rem;width:100%;font-size:1rem;padding:0.25rem 0.5rem;margin:unset}.autocomplete.svelte-1kz7xie{position:relative}.hide-results.svelte-1kz7xie{display:none}.autocomplete-results.svelte-1kz7xie{padding:0;margin:0;border:1px solid #dbdbdb;height:6rem;overflow:auto;width:100%;background-color:white;box-shadow:2px 2px 24px rgba(0, 0, 0, 0.1);position:absolute;z-index:100}.autocomplete-result.svelte-1kz7xie{color:#7a7a7a;list-style:none;text-align:left;height:2rem;padding:0.25rem 0.5rem;cursor:pointer}.autocomplete-result.svelte-1kz7xie>span{background-color:none;color:#242424;font-weight:bold}.autocomplete-result.is-active.svelte-1kz7xie,.autocomplete-result.svelte-1kz7xie:hover{background-color:#dbdbdb}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXV0b2NvbXBsZXRlLnN2ZWx0ZSIsInNvdXJjZXMiOlsiQXV0b2NvbXBsZXRlLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxuICBpbXBvcnQgeyBjcmVhdGVFdmVudERpc3BhdGNoZXIgfSBmcm9tIFwic3ZlbHRlXCI7XG5cbiAgZXhwb3J0IGxldCBuYW1lID0gXCJcIjtcbiAgZXhwb3J0IGxldCBpdGVtcyA9IFtdO1xuICBleHBvcnQgbGV0IGNsYXNzTmFtZSA9IFwiXCI7XG4gIGV4cG9ydCBsZXQgbWluQ2hhciA9IDA7XG4gIGV4cG9ydCBsZXQgaXNBc3luYyA9IGZhbHNlO1xuXG4gIGxldCB2YWx1ZSA9IFwiXCI7XG4gIGxldCBwbGFjZWhvbGRlciA9IFwiXCI7XG4gIGxldCByZXF1aXJlZCA9IGZhbHNlO1xuICBsZXQgZGlzYWJsZWQgPSBmYWxzZTtcbiAgLy8gYXV0b2NvbXBsZXRlIHByb3BzXG4gIGxldCBpc09wZW4gPSBmYWxzZTtcbiAgbGV0IHJlc3VsdHMgPSBbXTtcbiAgbGV0IHNlYXJjaCA9IFwiXCI7XG4gIGxldCBpc0xvYWRpbmcgPSBmYWxzZTtcbiAgbGV0IGFycm93Q291bnRlciA9IDA7XG4gIC8vIG9wdGlvbnNcbiAgbGV0IG1heEl0ZW1zID0gMTA7XG4gIGxldCBmcm9tU3RhcnQgPSB0cnVlO1xuICBsZXQgaW5wdXQsIGxpc3Q7XG4gIGxldCBmaXJlID0gY3JlYXRlRXZlbnREaXNwYXRjaGVyKCk7IC8vIERlZmF1bHQgdHlwZSBhaGVhO1xuXG4gIGNvbnN0IHJlZ0V4cEVzY2FwZSA9IHMgPT4ge1xuICAgIHJldHVybiBzLnJlcGxhY2UoL1stXFxcXF4kKis/LigpfFtcXF17fV0vZywgXCJcXFxcJCZcIik7XG4gIH07XG5cbiAgJDogaWYoaXRlbXMpIHtcbiAgICB1cGRhdGUoaXRlbXMpO1xuICB9XG5cblxuICBhc3luYyBmdW5jdGlvbiBvbkNoYW5nZShldmVudCkge1xuICAgIGZpcmUoXCJpbnB1dFwiLCBzZWFyY2gpO1xuICAgIC8vIElzIHRoZSBkYXRhIGdpdmVuIGJ5IGFuIG91dHNpZGUgYWpheCByZXF1ZXN0P1xuICAgIGlmIChpc0FzeW5jKSB7XG4gICAgICBpc0xvYWRpbmcgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoc2VhcmNoLmxlbmd0aCA+PSBOdW1iZXIobWluQ2hhcikpIHtcbiAgICAgIGZpbHRlclJlc3VsdHMoKTtcbiAgICAgIGlzT3BlbiA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZmlsdGVyUmVzdWx0cygpIHtcbiAgICByZXN1bHRzID0gaXRlbXNcbiAgICAgIC5maWx0ZXIoaXRlbSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgaXRlbSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgIGl0ZW0gPSBpdGVtLmtleSB8fCBcIlwiOyAvLyBTaWxlbnQgZmFpbFxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmcm9tU3RhcnRcbiAgICAgICAgICA/IGl0ZW0udG9VcHBlckNhc2UoKS5zdGFydHNXaXRoKHNlYXJjaC50b1VwcGVyQ2FzZSgpKVxuICAgICAgICAgIDogaXRlbS50b1VwcGVyQ2FzZSgpLmluY2x1ZGVzKHNlYXJjaC50b1VwcGVyQ2FzZSgpKTtcbiAgICAgIH0pXG4gICAgICAubWFwKGl0ZW0gPT4ge1xuICAgICAgICBjb25zdCB0ZXh0ID0gdHlwZW9mIGl0ZW0gIT09IFwic3RyaW5nXCIgPyBpdGVtLmtleSA6IGl0ZW07XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAga2V5OiB0ZXh0LFxuICAgICAgICAgIHZhbHVlOiBpdGVtLnZhbHVlIHx8IGl0ZW0sXG4gICAgICAgICAgbGFiZWw6XG4gICAgICAgICAgICBzZWFyY2gudHJpbSgpID09PSBcIlwiXG4gICAgICAgICAgICAgID8gdGV4dFxuICAgICAgICAgICAgICA6IHRleHQucmVwbGFjZShcbiAgICAgICAgICAgICAgICAgIFJlZ0V4cChyZWdFeHBFc2NhcGUoc2VhcmNoLnRyaW0oKSksIFwiaVwiKSxcbiAgICAgICAgICAgICAgICAgIFwiPHNwYW4+JCY8L3NwYW4+XCJcbiAgICAgICAgICAgICAgICApXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICBjb25zdCBoZWlnaHQgPSByZXN1bHRzLmxlbmd0aCA+IG1heEl0ZW1zID8gbWF4SXRlbXMgOiByZXN1bHRzLmxlbmd0aDtcbiAgICBsaXN0LnN0eWxlLmhlaWdodCA9IGAke2hlaWdodCAqIDIuMjV9cmVtYDtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uS2V5RG93bihldmVudCkge1xuICAgIGlmIChldmVudC5rZXlDb2RlID09PSA0MCAmJiBhcnJvd0NvdW50ZXIgPCByZXN1bHRzLmxlbmd0aCkge1xuICAgICAgLy8gQXJyb3dEb3duXG4gICAgICBhcnJvd0NvdW50ZXIgPSBhcnJvd0NvdW50ZXIgKyAxO1xuICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5Q29kZSA9PT0gMzggJiYgYXJyb3dDb3VudGVyID4gMCkge1xuICAgICAgLy8gQXJyb3dVcFxuICAgICAgYXJyb3dDb3VudGVyID0gYXJyb3dDb3VudGVyIC0gMTtcbiAgICB9IGVsc2UgaWYgKGV2ZW50LmtleUNvZGUgPT09IDEzKSB7XG4gICAgICAvLyBFbnRlclxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGlmIChhcnJvd0NvdW50ZXIgPT09IC0xKSB7XG4gICAgICAgIGFycm93Q291bnRlciA9IDA7IC8vIERlZmF1bHQgc2VsZWN0IGZpcnN0IGl0ZW0gb2YgbGlzdFxuICAgICAgfVxuICAgICAgZmlyZWNsb3NlKGFycm93Q291bnRlcik7XG4gICAgfSBlbHNlIGlmIChldmVudC5rZXlDb2RlID09PSAyNykge1xuICAgICAgLy8gRXNjYXBlXG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZmlyZWNsb3NlKCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xvc2UoaW5kZXggPSAtMSkge1xuICAgIChpc09wZW4gPSBmYWxzZSksIChhcnJvd0NvdW50ZXIgPSAtMSk7XG5cbiAgICBpbnB1dC5ibHVyKCk7XG4gICAgaWYgKGluZGV4ID4gLTEpIHtcbiAgICAgIGNvbnN0IHsga2V5LCB2YWx1ZSB9ID0gcmVzdWx0c1tpbmRleF07XG4gICAgICB2YWx1ZSwgKHNlYXJjaCA9IGtleSk7XG4gICAgICBmaXJlKFwiY2hhbmdlXCIsIHZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKCF2YWx1ZSkge1xuICAgICAgc2VhcmNoID0gXCJcIjtcbiAgICB9XG4gIH1cblxuICBleHBvcnQgZnVuY3Rpb24gdXBkYXRlKGl0ZW1zRSkge1xuICAgIGlmIChpc0FzeW5jICYmIGl0ZW1zRSAmJiBpdGVtc0UubGVuZ3RoKSB7XG4gICAgICBpdGVtcyA9IGl0ZW1zRTtcbiAgICAgIGlzTG9hZGluZyA9IGZhbHNlO1xuICAgICAgaXNPcGVuID0gdHJ1ZTtcbiAgICAgIGZpbHRlclJlc3VsdHMoKTtcbiAgICB9XG4gIH1cbjwvc2NyaXB0PlxuXG48c3R5bGU+XG4gICoge1xuICAgIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG4gIH1cbiAgaW5wdXQge1xuICAgIGhlaWdodDogMnJlbTtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBmb250LXNpemU6IDFyZW07XG4gICAgcGFkZGluZzogMC4yNXJlbSAwLjVyZW07XG4gICAgbWFyZ2luOiB1bnNldDtcbiAgfVxuICAuYXV0b2NvbXBsZXRlIHtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIH1cbiAgLmhpZGUtcmVzdWx0cyB7XG4gICAgZGlzcGxheTogbm9uZTtcbiAgfVxuICAuYXV0b2NvbXBsZXRlLXJlc3VsdHMge1xuICAgIHBhZGRpbmc6IDA7XG4gICAgbWFyZ2luOiAwO1xuICAgIGJvcmRlcjogMXB4IHNvbGlkICNkYmRiZGI7XG4gICAgaGVpZ2h0OiA2cmVtO1xuICAgIG92ZXJmbG93OiBhdXRvO1xuICAgIHdpZHRoOiAxMDAlO1xuICAgIGJhY2tncm91bmQtY29sb3I6IHdoaXRlO1xuICAgIGJveC1zaGFkb3c6IDJweCAycHggMjRweCByZ2JhKDAsIDAsIDAsIDAuMSk7XG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgIHotaW5kZXg6IDEwMDtcbiAgfVxuICAuYXV0b2NvbXBsZXRlLXJlc3VsdCB7XG4gICAgY29sb3I6ICM3YTdhN2E7XG4gICAgbGlzdC1zdHlsZTogbm9uZTtcbiAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgIGhlaWdodDogMnJlbTtcbiAgICBwYWRkaW5nOiAwLjI1cmVtIDAuNXJlbTtcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gIH1cbiAgLmF1dG9jb21wbGV0ZS1yZXN1bHQgPiA6Z2xvYmFsKHNwYW4pIHtcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiBub25lO1xuICAgIGNvbG9yOiAjMjQyNDI0O1xuICAgIGZvbnQtd2VpZ2h0OiBib2xkO1xuICB9XG4gIC5hdXRvY29tcGxldGUtcmVzdWx0LmlzLWFjdGl2ZSxcbiAgLmF1dG9jb21wbGV0ZS1yZXN1bHQ6aG92ZXIge1xuICAgIGJhY2tncm91bmQtY29sb3I6ICNkYmRiZGI7XG4gIH1cbjwvc3R5bGU+XG5cbjxzdmVsdGU6b3B0aW9ucyBhY2Nlc3NvcnM9e3RydWV9IGltbXV0YWJsZT17dHJ1ZX0gLz5cbjxzdmVsdGU6d2luZG93IG9uOmNsaWNrPXtjbG9zZX0gLz5cbjxkaXYgb246Y2xpY2t8c3RvcFByb3BhZ2F0aW9uIGNsYXNzPVwiYXV0b2NvbXBsZXRlXCI+XG4gIDxpbnB1dFxuICAgIHR5cGU9XCJ0ZXh0XCJcbiAgICBjbGFzcz17Y2xhc3NOYW1lfVxuICAgIHtuYW1lfVxuICAgIHtwbGFjZWhvbGRlcn1cbiAgICB7cmVxdWlyZWR9XG4gICAge2Rpc2FibGVkfVxuICAgIHZhbHVlPXt2YWx1ZSB8fCAnJ31cbiAgICBhdXRvY29tcGxldGU9e25hbWV9XG4gICAgYmluZDp2YWx1ZT17c2VhcmNofVxuICAgIG9uOmlucHV0PXtvbkNoYW5nZX1cbiAgICBvbjpmb2N1cz17ZXZlbnQgPT4gZmlyZSgnZm9jdXMnLCBldmVudCl9XG4gICAgb246Ymx1cj17ZXZlbnQgPT4gZmlyZSgnYmx1cicsIGV2ZW50KX1cbiAgICBvbjprZXlkb3duPXtvbktleURvd259XG4gICAgYmluZDp0aGlzPXtpbnB1dH0gLz5cbiAgPHVsXG4gICAgY2xhc3M9XCJhdXRvY29tcGxldGUtcmVzdWx0c3shaXNPcGVuID8gJyBoaWRlLXJlc3VsdHMnIDogJyd9XCJcbiAgICBiaW5kOnRoaXM9e2xpc3R9PlxuICAgIHsjZWFjaCByZXN1bHRzIGFzIHJlc3VsdCwgaX1cbiAgICAgIDxsaVxuICAgICAgICBvbjpjbGljaz17KCkgPT4gY2xvc2UoaSl9XG4gICAgICAgIGNsYXNzPVwiYXV0b2NvbXBsZXRlLXJlc3VsdHtpID09PSBhcnJvd0NvdW50ZXIgPyAnIGlzLWFjdGl2ZScgOiAnJ31cIj5cbiAgICAgICAge0BodG1sIHJlc3VsdC5sYWJlbH1cbiAgICAgIDwvbGk+XG4gICAgey9lYWNofVxuICA8L3VsPlxuICB7I2lmIGlzTG9hZGluZ31cbiAgICA8c2xvdD5cbiAgICAgIDxwIGNsYXNzPVwiZmFsbGJhY2tcIj5Mb2FkaW5nIGRhdGEuLi48L3A+XG4gICAgPC9zbG90PlxuICB7L2lmfVxuPC9kaXY+XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBc0hFLGVBQUUsQ0FBQyxBQUNELFVBQVUsQ0FBRSxVQUFVLEFBQ3hCLENBQUMsQUFDRCxLQUFLLGVBQUMsQ0FBQyxBQUNMLE1BQU0sQ0FBRSxJQUFJLENBQ1osS0FBSyxDQUFFLElBQUksQ0FDWCxTQUFTLENBQUUsSUFBSSxDQUNmLE9BQU8sQ0FBRSxPQUFPLENBQUMsTUFBTSxDQUN2QixNQUFNLENBQUUsS0FBSyxBQUNmLENBQUMsQUFDRCxhQUFhLGVBQUMsQ0FBQyxBQUNiLFFBQVEsQ0FBRSxRQUFRLEFBQ3BCLENBQUMsQUFDRCxhQUFhLGVBQUMsQ0FBQyxBQUNiLE9BQU8sQ0FBRSxJQUFJLEFBQ2YsQ0FBQyxBQUNELHFCQUFxQixlQUFDLENBQUMsQUFDckIsT0FBTyxDQUFFLENBQUMsQ0FDVixNQUFNLENBQUUsQ0FBQyxDQUNULE1BQU0sQ0FBRSxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FDekIsTUFBTSxDQUFFLElBQUksQ0FDWixRQUFRLENBQUUsSUFBSSxDQUNkLEtBQUssQ0FBRSxJQUFJLENBQ1gsZ0JBQWdCLENBQUUsS0FBSyxDQUN2QixVQUFVLENBQUUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FDM0MsUUFBUSxDQUFFLFFBQVEsQ0FDbEIsT0FBTyxDQUFFLEdBQUcsQUFDZCxDQUFDLEFBQ0Qsb0JBQW9CLGVBQUMsQ0FBQyxBQUNwQixLQUFLLENBQUUsT0FBTyxDQUNkLFVBQVUsQ0FBRSxJQUFJLENBQ2hCLFVBQVUsQ0FBRSxJQUFJLENBQ2hCLE1BQU0sQ0FBRSxJQUFJLENBQ1osT0FBTyxDQUFFLE9BQU8sQ0FBQyxNQUFNLENBQ3ZCLE1BQU0sQ0FBRSxPQUFPLEFBQ2pCLENBQUMsQUFDRCxtQ0FBb0IsQ0FBVyxJQUFJLEFBQUUsQ0FBQyxBQUNwQyxnQkFBZ0IsQ0FBRSxJQUFJLENBQ3RCLEtBQUssQ0FBRSxPQUFPLENBQ2QsV0FBVyxDQUFFLElBQUksQUFDbkIsQ0FBQyxBQUNELG9CQUFvQix5QkFBVSxDQUM5QixtQ0FBb0IsTUFBTSxBQUFDLENBQUMsQUFDMUIsZ0JBQWdCLENBQUUsT0FBTyxBQUMzQixDQUFDIn0= */";
    	append(document.head, style);
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.result = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    // (187:4) {#each results as result, i}
    function create_each_block(ctx) {
    	var li, html_tag, raw_value = ctx.result.label + "", t, li_class_value, dispose;

    	function click_handler_1() {
    		return ctx.click_handler_1(ctx);
    	}

    	return {
    		c: function create() {
    			li = element("li");
    			t = space();
    			html_tag = new HtmlTag(raw_value, t);
    			attr(li, "class", li_class_value = "autocomplete-result" + (ctx.i === ctx.arrowCounter ? ' is-active' : '') + " svelte-1kz7xie");
    			add_location(li, file, 187, 6, 4395);
    			dispose = listen(li, "click", click_handler_1);
    		},

    		m: function mount(target, anchor) {
    			insert(target, li, anchor);
    			html_tag.m(li);
    			append(li, t);
    		},

    		p: function update_1(changed, new_ctx) {
    			ctx = new_ctx;
    			if ((changed.results) && raw_value !== (raw_value = ctx.result.label + "")) {
    				html_tag.p(raw_value);
    			}

    			if ((changed.arrowCounter) && li_class_value !== (li_class_value = "autocomplete-result" + (ctx.i === ctx.arrowCounter ? ' is-active' : '') + " svelte-1kz7xie")) {
    				attr(li, "class", li_class_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(li);
    			}

    			dispose();
    		}
    	};
    }

    // (195:2) {#if isLoading}
    function create_if_block(ctx) {
    	var p, current;

    	const default_slot_template = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_template, ctx, null);

    	return {
    		c: function create() {
    			if (!default_slot) {
    				p = element("p");
    				p.textContent = "Loading data...";
    			}

    			if (default_slot) default_slot.c();
    			if (!default_slot) {
    				attr(p, "class", "fallback svelte-1kz7xie");
    				add_location(p, file, 196, 6, 4606);
    			}
    		},

    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(nodes);
    		},

    		m: function mount(target, anchor) {
    			if (!default_slot) {
    				insert(target, p, anchor);
    			}

    			else {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},

    		p: function update_1(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(
    					get_slot_changes(default_slot_template, ctx, changed, null),
    					get_slot_context(default_slot_template, ctx, null)
    				);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (!default_slot) {
    				if (detaching) {
    					detach(p);
    				}
    			}

    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment(ctx) {
    	var div, input_1, input_1_value_value, t0, ul, ul_class_value, t1, current, dispose;

    	var each_value = ctx.results;

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	var if_block = (ctx.isLoading) && create_if_block(ctx);

    	return {
    		c: function create() {
    			div = element("div");
    			input_1 = element("input");
    			t0 = space();
    			ul = element("ul");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = space();
    			if (if_block) if_block.c();
    			attr(input_1, "type", "text");
    			attr(input_1, "class", "" + null_to_empty(ctx.className) + " svelte-1kz7xie");
    			attr(input_1, "name", ctx.name);
    			attr(input_1, "placeholder", placeholder);
    			input_1.required = required;
    			input_1.disabled = disabled;
    			input_1.value = input_1_value_value =  '';
    			attr(input_1, "autocomplete", ctx.name);
    			add_location(input_1, file, 168, 2, 3923);
    			attr(ul, "class", ul_class_value = "autocomplete-results" + (!ctx.isOpen ? ' hide-results' : '') + " svelte-1kz7xie");
    			add_location(ul, file, 183, 2, 4265);
    			attr(div, "class", "autocomplete svelte-1kz7xie");
    			add_location(div, file, 167, 0, 3869);

    			dispose = [
    				listen(window, "click", ctx.close),
    				listen(input_1, "input", ctx.input_1_input_handler),
    				listen(input_1, "input", ctx.onChange),
    				listen(input_1, "focus", ctx.focus_handler),
    				listen(input_1, "blur", ctx.blur_handler),
    				listen(input_1, "keydown", ctx.onKeyDown),
    				listen(div, "click", stop_propagation(ctx.click_handler))
    			];
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, div, anchor);
    			append(div, input_1);

    			set_input_value(input_1, ctx.search);

    			ctx.input_1_binding(input_1);
    			append(div, t0);
    			append(div, ul);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			ctx.ul_binding(ul);
    			append(div, t1);
    			if (if_block) if_block.m(div, null);
    			current = true;
    		},

    		p: function update_1(changed, ctx) {
    			if (changed.search && (input_1.value !== ctx.search)) set_input_value(input_1, ctx.search);

    			if (!current || changed.className) {
    				attr(input_1, "class", "" + null_to_empty(ctx.className) + " svelte-1kz7xie");
    			}

    			if (!current || changed.name) {
    				attr(input_1, "name", ctx.name);
    				attr(input_1, "autocomplete", ctx.name);
    			}

    			if (changed.arrowCounter || changed.results) {
    				each_value = ctx.results;

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}

    			if ((!current || changed.isOpen) && ul_class_value !== (ul_class_value = "autocomplete-results" + (!ctx.isOpen ? ' hide-results' : '') + " svelte-1kz7xie")) {
    				attr(ul, "class", ul_class_value);
    			}

    			if (ctx.isLoading) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				group_outros();
    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});
    				check_outros();
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(div);
    			}

    			ctx.input_1_binding(null);

    			destroy_each(each_blocks, detaching);

    			ctx.ul_binding(null);
    			if (if_block) if_block.d();
    			run_all(dispose);
    		}
    	};
    }

    let placeholder = "";

    let required = false;

    let disabled = false;

    let maxItems = 10;

    function instance($$self, $$props, $$invalidate) {
    	let { name = "", items = [], className = "", minChar = 0, isAsync = false } = $$props;
      // autocomplete props
      let isOpen = false;
      let results = [];
      let search = "";
      let isLoading = false;
      let arrowCounter = 0;
      let input, list;
      let fire = createEventDispatcher(); // Default type ahea;

      const regExpEscape = s => {
        return s.replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&");
      };


      async function onChange(event) {
        fire("input", search);
        // Is the data given by an outside ajax request?
        if (isAsync) {
          $$invalidate('isLoading', isLoading = true);
        } else if (search.length >= Number(minChar)) {
          filterResults();
          $$invalidate('isOpen', isOpen = true);
        }
      }

      function filterResults() {
        $$invalidate('results', results = items
          .filter(item => {
            if (typeof item !== "string") {
              item = item.key || ""; // Silent fail
            }
            return  item.toUpperCase().startsWith(search.toUpperCase())
              ;
          })
          .map(item => {
            const text = typeof item !== "string" ? item.key : item;
            return {
              key: text,
              value: item.value || item,
              label:
                search.trim() === ""
                  ? text
                  : text.replace(
                      RegExp(regExpEscape(search.trim()), "i"),
                      "<span>$&</span>"
                    )
            };
          }));
        const height = results.length > maxItems ? maxItems : results.length;
        list.style.height = `${height * 2.25}rem`; $$invalidate('list', list);
      }

      function onKeyDown(event) {
        if (event.keyCode === 40 && arrowCounter < results.length) {
          // ArrowDown
          $$invalidate('arrowCounter', arrowCounter = arrowCounter + 1);
        } else if (event.keyCode === 38 && arrowCounter > 0) {
          // ArrowUp
          $$invalidate('arrowCounter', arrowCounter = arrowCounter - 1);
        } else if (event.keyCode === 13) {
          // Enter
          event.preventDefault();
          if (arrowCounter === -1) {
            $$invalidate('arrowCounter', arrowCounter = 0); // Default select first item of list
          }
          fireclose(arrowCounter);
        } else if (event.keyCode === 27) {
          // Escape
          event.preventDefault();
          fireclose();
        }
      }

      function close(index = -1) {
        (isOpen = false), (arrowCounter = -1); $$invalidate('isOpen', isOpen); $$invalidate('arrowCounter', arrowCounter);

        input.blur();
        if (index > -1) {
          const { key, value } = results[index];
          (search = key); $$invalidate('search', search);
          fire("change", value);
        } else {
          $$invalidate('search', search = "");
        }
      }

      function update(itemsE) {
        if (isAsync && itemsE && itemsE.length) {
          $$invalidate('items', items = itemsE);
          $$invalidate('isLoading', isLoading = false);
          $$invalidate('isOpen', isOpen = true);
          filterResults();
        }
      }

    	const writable_props = ['name', 'items', 'className', 'minChar', 'isAsync'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Autocomplete> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	function input_1_input_handler() {
    		search = this.value;
    		$$invalidate('search', search);
    	}

    	function input_1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			$$invalidate('input', input = $$value);
    		});
    	}

    	function focus_handler(event) {
    		return fire('focus', event);
    	}

    	function blur_handler(event) {
    		return fire('blur', event);
    	}

    	function click_handler_1({ i }) {
    		return close(i);
    	}

    	function ul_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			$$invalidate('list', list = $$value);
    		});
    	}

    	$$self.$set = $$props => {
    		if ('name' in $$props) $$invalidate('name', name = $$props.name);
    		if ('items' in $$props) $$invalidate('items', items = $$props.items);
    		if ('className' in $$props) $$invalidate('className', className = $$props.className);
    		if ('minChar' in $$props) $$invalidate('minChar', minChar = $$props.minChar);
    		if ('isAsync' in $$props) $$invalidate('isAsync', isAsync = $$props.isAsync);
    		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = ($$dirty = { items: 1 }) => {
    		if ($$dirty.items) { if(items) {
            update(items);
          } }
    	};

    	return {
    		name,
    		items,
    		className,
    		minChar,
    		isAsync,
    		isOpen,
    		results,
    		search,
    		isLoading,
    		arrowCounter,
    		input,
    		list,
    		fire,
    		onChange,
    		onKeyDown,
    		close,
    		update,
    		click_handler,
    		input_1_input_handler,
    		input_1_binding,
    		focus_handler,
    		blur_handler,
    		click_handler_1,
    		ul_binding,
    		$$slots,
    		$$scope
    	};
    }

    class Autocomplete extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-1kz7xie-style")) add_css();
    		init(this, options, instance, create_fragment, not_equal, ["name", "items", "className", "minChar", "isAsync", "update"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.update === undefined && !('update' in props)) {
    			console.warn("<Autocomplete> was created without expected prop 'update'");
    		}
    	}

    	get name() {
    		return this.$$.ctx.name;
    	}

    	set name(name) {
    		this.$set({ name });
    		flush();
    	}

    	get items() {
    		return this.$$.ctx.items;
    	}

    	set items(items) {
    		this.$set({ items });
    		flush();
    	}

    	get className() {
    		return this.$$.ctx.className;
    	}

    	set className(className) {
    		this.$set({ className });
    		flush();
    	}

    	get minChar() {
    		return this.$$.ctx.minChar;
    	}

    	set minChar(minChar) {
    		this.$set({ minChar });
    		flush();
    	}

    	get isAsync() {
    		return this.$$.ctx.isAsync;
    	}

    	set isAsync(isAsync) {
    		this.$set({ isAsync });
    		flush();
    	}

    	get update() {
    		return this.$$.ctx.update;
    	}

    	set update(value) {
    		throw new Error("<Autocomplete>: Cannot set read-only property 'update'");
    	}
    }

    /* dev/App.svelte generated by Svelte v3.9.2 */

    const file$1 = "dev/App.svelte";

    function add_css$1() {
    	var style = element("style");
    	style.id = 'svelte-11j9f6-style';
    	style.textContent = "div.svelte-11j9f6{margin:30px}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXBwLnN2ZWx0ZSIsInNvdXJjZXMiOlsiQXBwLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxuICBpbXBvcnQgQXV0b0NvbXBsZXRlIGZyb20gXCIuLi9zcmMvQXV0b2NvbXBsZXRlLnN2ZWx0ZVwiO1xuICBsZXQgbmFtZXMgPSBbXCJBZGFtXCIsIFwiQW50b255XCIsIFwiQmFieVwiLCBcIkJyaWFuXCIsIFwiTG92ZWx5XCIsIFwiSm9oblwiLCBcIkphY2tvYlwiXTtcblxuICBsZXQgaXNBc3luYyA9IHRydWU7XG4gIGxldCBhdXRvQ29tcGxldGU7XG4gIGxldCBjb3VudHJpZXMgPSBbXTtcblxuICBhc3luYyBmdW5jdGlvbiBsb2FkQXBpRGF0YShldmVudCkge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKFxuICAgICAgXCJodHRwczovL3Jlc3Rjb3VudHJpZXMuZXUvcmVzdC92Mi9hbGw/ZmllbGRzPW5hbWU7YWxwaGEzQ29kZVwiXG4gICAgKTtcblxuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXMuanNvbigpO1xuICAgIGNvdW50cmllcyA9IGRhdGEubWFwKGQgPT4gZC5uYW1lKTtcbiAgfVxuPC9zY3JpcHQ+XG5cbjxzdHlsZT5cbiAgZGl2IHtcbiAgICBtYXJnaW46IDMwcHg7XG4gIH1cbjwvc3R5bGU+XG5cbjxoMT5IZWxsbyBXb3JsZCE8L2gxPlxuXG48ZGl2IHN0eWxlPVwid2lkdGg6IDMwMHB4XCI+XG4gIDxBdXRvQ29tcGxldGUgY2xhc3NOYW1lPVwiaW5wdXRcIiBuYW1lPVwiZnJ1aXRzXCIgaXRlbXM9e25hbWVzfSAvPlxuPC9kaXY+XG5cbjxkaXYgc3R5bGU9XCJ3aWR0aDogMzAwcHhcIj5cbiAgPEF1dG9Db21wbGV0ZVxuICAgIGNsYXNzTmFtZT1cImlucHV0XCJcbiAgICBpdGVtcz17Y291bnRyaWVzfVxuICAgIHtpc0FzeW5jfVxuICAgIG9uOmlucHV0PXtsb2FkQXBpRGF0YX0gLz5cbjwvZGl2PlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQW1CRSxHQUFHLGNBQUMsQ0FBQyxBQUNILE1BQU0sQ0FBRSxJQUFJLEFBQ2QsQ0FBQyJ9 */";
    	append(document.head, style);
    }

    function create_fragment$1(ctx) {
    	var h1, t1, div0, t2, div1, current;

    	var autocomplete0 = new Autocomplete({
    		props: {
    		className: "input",
    		name: "fruits",
    		items: ctx.names
    	},
    		$$inline: true
    	});

    	var autocomplete1 = new Autocomplete({
    		props: {
    		className: "input",
    		items: ctx.countries,
    		isAsync: isAsync
    	},
    		$$inline: true
    	});
    	autocomplete1.$on("input", ctx.loadApiData);

    	return {
    		c: function create() {
    			h1 = element("h1");
    			h1.textContent = "Hello World!";
    			t1 = space();
    			div0 = element("div");
    			autocomplete0.$$.fragment.c();
    			t2 = space();
    			div1 = element("div");
    			autocomplete1.$$.fragment.c();
    			add_location(h1, file$1, 24, 0, 491);
    			set_style(div0, "width", "300px");
    			attr(div0, "class", "svelte-11j9f6");
    			add_location(div0, file$1, 26, 0, 514);
    			set_style(div1, "width", "300px");
    			attr(div1, "class", "svelte-11j9f6");
    			add_location(div1, file$1, 30, 0, 614);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			insert(target, div0, anchor);
    			mount_component(autocomplete0, div0, null);
    			insert(target, t2, anchor);
    			insert(target, div1, anchor);
    			mount_component(autocomplete1, div1, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var autocomplete0_changes = {};
    			if (changed.names) autocomplete0_changes.items = ctx.names;
    			autocomplete0.$set(autocomplete0_changes);

    			var autocomplete1_changes = {};
    			if (changed.countries) autocomplete1_changes.items = ctx.countries;
    			if (changed.isAsync) autocomplete1_changes.isAsync = isAsync;
    			autocomplete1.$set(autocomplete1_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(autocomplete0.$$.fragment, local);

    			transition_in(autocomplete1.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(autocomplete0.$$.fragment, local);
    			transition_out(autocomplete1.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(h1);
    				detach(t1);
    				detach(div0);
    			}

    			destroy_component(autocomplete0);

    			if (detaching) {
    				detach(t2);
    				detach(div1);
    			}

    			destroy_component(autocomplete1);
    		}
    	};
    }

    let isAsync = true;

    function instance$1($$self, $$props, $$invalidate) {
    	let names = ["Adam", "Antony", "Baby", "Brian", "Lovely", "John", "Jackob"];
      let countries = [];

      async function loadApiData(event) {
        const res = await fetch(
          "https://restcountries.eu/rest/v2/all?fields=name;alpha3Code"
        );

        const data = await res.json();
        $$invalidate('countries', countries = data.map(d => d.name));
      }

    	return { names, countries, loadApiData };
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-11j9f6-style")) add_css$1();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, []);
    	}
    }

    const app = new App({
      target: document.body
    });

}());
//# sourceMappingURL=bundle.js.map
