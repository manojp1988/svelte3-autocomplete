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
    	style.textContent = ".svelte-1kz7xie{box-sizing:border-box}input.svelte-1kz7xie{height:2rem;width:100%;font-size:1rem;padding:0.25rem 0.5rem;margin:unset}.autocomplete.svelte-1kz7xie{position:relative}.hide-results.svelte-1kz7xie{display:none}.autocomplete-results.svelte-1kz7xie{padding:0;margin:0;border:1px solid #dbdbdb;height:6rem;overflow:auto;width:100%;background-color:white;box-shadow:2px 2px 24px rgba(0, 0, 0, 0.1);position:absolute;z-index:100}.autocomplete-result.svelte-1kz7xie{color:#7a7a7a;list-style:none;text-align:left;height:2rem;padding:0.25rem 0.5rem;cursor:pointer}.autocomplete-result.svelte-1kz7xie>span{background-color:none;color:#242424;font-weight:bold}.autocomplete-result.is-active.svelte-1kz7xie,.autocomplete-result.svelte-1kz7xie:hover{background-color:#dbdbdb}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXV0b2NvbXBsZXRlLnN2ZWx0ZSIsInNvdXJjZXMiOlsiQXV0b2NvbXBsZXRlLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxuICBpbXBvcnQgeyBjcmVhdGVFdmVudERpc3BhdGNoZXIgfSBmcm9tIFwic3ZlbHRlXCI7XG5cbiAgZXhwb3J0IGxldCBuYW1lID0gXCJcIjtcbiAgZXhwb3J0IGxldCBpdGVtcyA9IFtdO1xuICBleHBvcnQgbGV0IGNsYXNzTmFtZSA9IFwiXCI7XG4gIGV4cG9ydCBsZXQgbWluQ2hhciA9IDA7XG4gIGV4cG9ydCBsZXQgaXNBc3luYyA9IGZhbHNlO1xuXG4gIGxldCB2YWx1ZSA9IFwiXCI7XG4gIGxldCBwbGFjZWhvbGRlciA9IFwiXCI7XG4gIGxldCByZXF1aXJlZCA9IGZhbHNlO1xuICBsZXQgZGlzYWJsZWQgPSBmYWxzZTtcbiAgLy8gYXV0b2NvbXBsZXRlIHByb3BzXG4gIGxldCBpc09wZW4gPSBmYWxzZTtcbiAgbGV0IHJlc3VsdHMgPSBbXTtcbiAgbGV0IHNlYXJjaCA9IFwiXCI7XG4gIGxldCBpc0xvYWRpbmcgPSBmYWxzZTtcbiAgbGV0IGFycm93Q291bnRlciA9IDA7XG4gIC8vIG9wdGlvbnNcbiAgbGV0IG1heEl0ZW1zID0gMTA7XG4gIGxldCBmcm9tU3RhcnQgPSB0cnVlO1xuICBsZXQgaW5wdXQsIGxpc3Q7XG4gIGxldCBmaXJlID0gY3JlYXRlRXZlbnREaXNwYXRjaGVyKCk7IC8vIERlZmF1bHQgdHlwZSBhaGVhO1xuXG4gIGNvbnN0IHJlZ0V4cEVzY2FwZSA9IHMgPT4ge1xuICAgIHJldHVybiBzLnJlcGxhY2UoL1stXFxcXF4kKis/LigpfFtcXF17fV0vZywgXCJcXFxcJCZcIik7XG4gIH07XG5cbiAgYXN5bmMgZnVuY3Rpb24gb25DaGFuZ2UoZXZlbnQpIHtcbiAgICBmaXJlKFwiaW5wdXRcIiwgc2VhcmNoKTtcbiAgICAvLyBJcyB0aGUgZGF0YSBnaXZlbiBieSBhbiBvdXRzaWRlIGFqYXggcmVxdWVzdD9cbiAgICBpZiAoaXNBc3luYykge1xuICAgICAgaXNMb2FkaW5nID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKHNlYXJjaC5sZW5ndGggPj0gTnVtYmVyKG1pbkNoYXIpKSB7XG4gICAgICBmaWx0ZXJSZXN1bHRzKCk7XG4gICAgICBpc09wZW4gPSB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbHRlclJlc3VsdHMoKSB7XG4gICAgcmVzdWx0cyA9IGl0ZW1zXG4gICAgICAuZmlsdGVyKGl0ZW0gPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGl0ZW0gIT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICBpdGVtID0gaXRlbS5rZXkgfHwgXCJcIjsgLy8gU2lsZW50IGZhaWxcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZnJvbVN0YXJ0XG4gICAgICAgICAgPyBpdGVtLnRvVXBwZXJDYXNlKCkuc3RhcnRzV2l0aChzZWFyY2gudG9VcHBlckNhc2UoKSlcbiAgICAgICAgICA6IGl0ZW0udG9VcHBlckNhc2UoKS5pbmNsdWRlcyhzZWFyY2gudG9VcHBlckNhc2UoKSk7XG4gICAgICB9KVxuICAgICAgLm1hcChpdGVtID0+IHtcbiAgICAgICAgY29uc3QgdGV4dCA9IHR5cGVvZiBpdGVtICE9PSBcInN0cmluZ1wiID8gaXRlbS5rZXkgOiBpdGVtO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGtleTogdGV4dCxcbiAgICAgICAgICB2YWx1ZTogaXRlbS52YWx1ZSB8fCBpdGVtLFxuICAgICAgICAgIGxhYmVsOlxuICAgICAgICAgICAgc2VhcmNoLnRyaW0oKSA9PT0gXCJcIlxuICAgICAgICAgICAgICA/IHRleHRcbiAgICAgICAgICAgICAgOiB0ZXh0LnJlcGxhY2UoXG4gICAgICAgICAgICAgICAgICBSZWdFeHAocmVnRXhwRXNjYXBlKHNlYXJjaC50cmltKCkpLCBcImlcIiksXG4gICAgICAgICAgICAgICAgICBcIjxzcGFuPiQmPC9zcGFuPlwiXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgY29uc3QgaGVpZ2h0ID0gcmVzdWx0cy5sZW5ndGggPiBtYXhJdGVtcyA/IG1heEl0ZW1zIDogcmVzdWx0cy5sZW5ndGg7XG4gICAgbGlzdC5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHQgKiAyLjI1fXJlbWA7XG4gIH1cblxuICBmdW5jdGlvbiBvbktleURvd24oZXZlbnQpIHtcbiAgICBpZiAoZXZlbnQua2V5Q29kZSA9PT0gNDAgJiYgYXJyb3dDb3VudGVyIDwgcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgIC8vIEFycm93RG93blxuICAgICAgYXJyb3dDb3VudGVyID0gYXJyb3dDb3VudGVyICsgMTtcbiAgICB9IGVsc2UgaWYgKGV2ZW50LmtleUNvZGUgPT09IDM4ICYmIGFycm93Q291bnRlciA+IDApIHtcbiAgICAgIC8vIEFycm93VXBcbiAgICAgIGFycm93Q291bnRlciA9IGFycm93Q291bnRlciAtIDE7XG4gICAgfSBlbHNlIGlmIChldmVudC5rZXlDb2RlID09PSAxMykge1xuICAgICAgLy8gRW50ZXJcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBpZiAoYXJyb3dDb3VudGVyID09PSAtMSkge1xuICAgICAgICBhcnJvd0NvdW50ZXIgPSAwOyAvLyBEZWZhdWx0IHNlbGVjdCBmaXJzdCBpdGVtIG9mIGxpc3RcbiAgICAgIH1cbiAgICAgIGZpcmVjbG9zZShhcnJvd0NvdW50ZXIpO1xuICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5Q29kZSA9PT0gMjcpIHtcbiAgICAgIC8vIEVzY2FwZVxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGZpcmVjbG9zZSgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsb3NlKGluZGV4ID0gLTEpIHtcbiAgICAoaXNPcGVuID0gZmFsc2UpLCAoYXJyb3dDb3VudGVyID0gLTEpO1xuXG4gICAgaW5wdXQuYmx1cigpO1xuICAgIGlmIChpbmRleCA+IC0xKSB7XG4gICAgICBjb25zdCB7IGtleSwgdmFsdWUgfSA9IHJlc3VsdHNbaW5kZXhdO1xuICAgICAgdmFsdWUsIChzZWFyY2ggPSBrZXkpO1xuICAgICAgZmlyZShcImNoYW5nZVwiLCB2YWx1ZSk7XG4gICAgfSBlbHNlIGlmICghdmFsdWUpIHtcbiAgICAgIHNlYXJjaCA9IFwiXCI7XG4gICAgfVxuICB9XG5cbiAgZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZShpdGVtc0UpIHtcbiAgICBpZiAoaXNBc3luYyAmJiBpdGVtc0UgJiYgaXRlbXNFLmxlbmd0aCkge1xuICAgICAgaXRlbXMgPSBpdGVtc0U7XG4gICAgICBpc0xvYWRpbmcgPSBmYWxzZTtcbiAgICAgIGlzT3BlbiA9IHRydWU7XG4gICAgICBmaWx0ZXJSZXN1bHRzKCk7XG4gICAgfVxuICB9XG48L3NjcmlwdD5cblxuPHN0eWxlPlxuICAqIHtcbiAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuICB9XG4gIGlucHV0IHtcbiAgICBoZWlnaHQ6IDJyZW07XG4gICAgd2lkdGg6IDEwMCU7XG4gICAgZm9udC1zaXplOiAxcmVtO1xuICAgIHBhZGRpbmc6IDAuMjVyZW0gMC41cmVtO1xuICAgIG1hcmdpbjogdW5zZXQ7XG4gIH1cbiAgLmF1dG9jb21wbGV0ZSB7XG4gICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICB9XG4gIC5oaWRlLXJlc3VsdHMge1xuICAgIGRpc3BsYXk6IG5vbmU7XG4gIH1cbiAgLmF1dG9jb21wbGV0ZS1yZXN1bHRzIHtcbiAgICBwYWRkaW5nOiAwO1xuICAgIG1hcmdpbjogMDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjZGJkYmRiO1xuICAgIGhlaWdodDogNnJlbTtcbiAgICBvdmVyZmxvdzogYXV0bztcbiAgICB3aWR0aDogMTAwJTtcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiB3aGl0ZTtcbiAgICBib3gtc2hhZG93OiAycHggMnB4IDI0cHggcmdiYSgwLCAwLCAwLCAwLjEpO1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICB6LWluZGV4OiAxMDA7XG4gIH1cbiAgLmF1dG9jb21wbGV0ZS1yZXN1bHQge1xuICAgIGNvbG9yOiAjN2E3YTdhO1xuICAgIGxpc3Qtc3R5bGU6IG5vbmU7XG4gICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgICBoZWlnaHQ6IDJyZW07XG4gICAgcGFkZGluZzogMC4yNXJlbSAwLjVyZW07XG4gICAgY3Vyc29yOiBwb2ludGVyO1xuICB9XG4gIC5hdXRvY29tcGxldGUtcmVzdWx0ID4gOmdsb2JhbChzcGFuKSB7XG4gICAgYmFja2dyb3VuZC1jb2xvcjogbm9uZTtcbiAgICBjb2xvcjogIzI0MjQyNDtcbiAgICBmb250LXdlaWdodDogYm9sZDtcbiAgfVxuICAuYXV0b2NvbXBsZXRlLXJlc3VsdC5pcy1hY3RpdmUsXG4gIC5hdXRvY29tcGxldGUtcmVzdWx0OmhvdmVyIHtcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZGJkYmRiO1xuICB9XG48L3N0eWxlPlxuXG48c3ZlbHRlOm9wdGlvbnMgYWNjZXNzb3JzPXt0cnVlfSBpbW11dGFibGU9e3RydWV9IC8+XG48c3ZlbHRlOndpbmRvdyBvbjpjbGljaz17Y2xvc2V9IC8+XG48ZGl2IG9uOmNsaWNrfHN0b3BQcm9wYWdhdGlvbiBjbGFzcz1cImF1dG9jb21wbGV0ZVwiPlxuICA8aW5wdXRcbiAgICB0eXBlPVwidGV4dFwiXG4gICAgY2xhc3M9e2NsYXNzTmFtZX1cbiAgICB7bmFtZX1cbiAgICB7cGxhY2Vob2xkZXJ9XG4gICAge3JlcXVpcmVkfVxuICAgIHtkaXNhYmxlZH1cbiAgICB2YWx1ZT17dmFsdWUgfHwgJyd9XG4gICAgYXV0b2NvbXBsZXRlPXtuYW1lfVxuICAgIGJpbmQ6dmFsdWU9e3NlYXJjaH1cbiAgICBvbjppbnB1dD17b25DaGFuZ2V9XG4gICAgb246Zm9jdXM9e2V2ZW50ID0+IGZpcmUoJ2ZvY3VzJywgZXZlbnQpfVxuICAgIG9uOmJsdXI9e2V2ZW50ID0+IGZpcmUoJ2JsdXInLCBldmVudCl9XG4gICAgb246a2V5ZG93bj17b25LZXlEb3dufVxuICAgIGJpbmQ6dGhpcz17aW5wdXR9IC8+XG4gIDx1bFxuICAgIGNsYXNzPVwiYXV0b2NvbXBsZXRlLXJlc3VsdHN7IWlzT3BlbiA/ICcgaGlkZS1yZXN1bHRzJyA6ICcnfVwiXG4gICAgYmluZDp0aGlzPXtsaXN0fT5cbiAgICB7I2VhY2ggcmVzdWx0cyBhcyByZXN1bHQsIGl9XG4gICAgICA8bGlcbiAgICAgICAgb246Y2xpY2s9eygpID0+IGNsb3NlKGkpfVxuICAgICAgICBjbGFzcz1cImF1dG9jb21wbGV0ZS1yZXN1bHR7aSA9PT0gYXJyb3dDb3VudGVyID8gJyBpcy1hY3RpdmUnIDogJyd9XCI+XG4gICAgICAgIHtAaHRtbCByZXN1bHQubGFiZWx9XG4gICAgICA8L2xpPlxuICAgIHsvZWFjaH1cbiAgPC91bD5cbiAgeyNpZiBpc0xvYWRpbmd9XG4gICAgPHNsb3Q+XG4gICAgICA8cCBjbGFzcz1cImZhbGxiYWNrXCI+TG9hZGluZyBkYXRhLi4uPC9wPlxuICAgIDwvc2xvdD5cbiAgey9pZn1cbjwvZGl2PlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQWlIRSxlQUFFLENBQUMsQUFDRCxVQUFVLENBQUUsVUFBVSxBQUN4QixDQUFDLEFBQ0QsS0FBSyxlQUFDLENBQUMsQUFDTCxNQUFNLENBQUUsSUFBSSxDQUNaLEtBQUssQ0FBRSxJQUFJLENBQ1gsU0FBUyxDQUFFLElBQUksQ0FDZixPQUFPLENBQUUsT0FBTyxDQUFDLE1BQU0sQ0FDdkIsTUFBTSxDQUFFLEtBQUssQUFDZixDQUFDLEFBQ0QsYUFBYSxlQUFDLENBQUMsQUFDYixRQUFRLENBQUUsUUFBUSxBQUNwQixDQUFDLEFBQ0QsYUFBYSxlQUFDLENBQUMsQUFDYixPQUFPLENBQUUsSUFBSSxBQUNmLENBQUMsQUFDRCxxQkFBcUIsZUFBQyxDQUFDLEFBQ3JCLE9BQU8sQ0FBRSxDQUFDLENBQ1YsTUFBTSxDQUFFLENBQUMsQ0FDVCxNQUFNLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQ3pCLE1BQU0sQ0FBRSxJQUFJLENBQ1osUUFBUSxDQUFFLElBQUksQ0FDZCxLQUFLLENBQUUsSUFBSSxDQUNYLGdCQUFnQixDQUFFLEtBQUssQ0FDdkIsVUFBVSxDQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQzNDLFFBQVEsQ0FBRSxRQUFRLENBQ2xCLE9BQU8sQ0FBRSxHQUFHLEFBQ2QsQ0FBQyxBQUNELG9CQUFvQixlQUFDLENBQUMsQUFDcEIsS0FBSyxDQUFFLE9BQU8sQ0FDZCxVQUFVLENBQUUsSUFBSSxDQUNoQixVQUFVLENBQUUsSUFBSSxDQUNoQixNQUFNLENBQUUsSUFBSSxDQUNaLE9BQU8sQ0FBRSxPQUFPLENBQUMsTUFBTSxDQUN2QixNQUFNLENBQUUsT0FBTyxBQUNqQixDQUFDLEFBQ0QsbUNBQW9CLENBQVcsSUFBSSxBQUFFLENBQUMsQUFDcEMsZ0JBQWdCLENBQUUsSUFBSSxDQUN0QixLQUFLLENBQUUsT0FBTyxDQUNkLFdBQVcsQ0FBRSxJQUFJLEFBQ25CLENBQUMsQUFDRCxvQkFBb0IseUJBQVUsQ0FDOUIsbUNBQW9CLE1BQU0sQUFBQyxDQUFDLEFBQzFCLGdCQUFnQixDQUFFLE9BQU8sQUFDM0IsQ0FBQyJ9 */";
    	append(document.head, style);
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.result = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    // (182:4) {#each results as result, i}
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
    			add_location(li, file, 182, 6, 4353);
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

    // (190:2) {#if isLoading}
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
    				add_location(p, file, 191, 6, 4564);
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
    			add_location(input_1, file, 163, 2, 3881);
    			attr(ul, "class", ul_class_value = "autocomplete-results" + (!ctx.isOpen ? ' hide-results' : '') + " svelte-1kz7xie");
    			add_location(ul, file, 178, 2, 4223);
    			attr(div, "class", "autocomplete svelte-1kz7xie");
    			add_location(div, file, 162, 0, 3827);

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
    	style.textContent = "div.svelte-11j9f6{margin:30px}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXBwLnN2ZWx0ZSIsInNvdXJjZXMiOlsiQXBwLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0PlxuICBpbXBvcnQgQXV0b0NvbXBsZXRlIGZyb20gXCIuLi9zcmMvQXV0b2NvbXBsZXRlLnN2ZWx0ZVwiO1xuICBsZXQgbmFtZXMgPSBbXCJBZGFtXCIsIFwiQW50b255XCIsIFwiQmFieVwiLCBcIkJyaWFuXCIsIFwiTG92ZWx5XCIsIFwiSm9oblwiLCBcIkphY2tvYlwiXTtcblxuICBsZXQgaXNBc3luYyA9IHRydWU7XG4gIGxldCBhdXRvQ29tcGxldGU7XG5cbiAgYXN5bmMgZnVuY3Rpb24gbG9hZEFwaURhdGEoZXZlbnQpIHtcbiAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChcbiAgICAgIFwiaHR0cHM6Ly9yZXN0Y291bnRyaWVzLmV1L3Jlc3QvdjIvYWxsP2ZpZWxkcz1uYW1lO2FscGhhM0NvZGVcIlxuICAgICk7XG5cbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzLmpzb24oKTtcbiAgICBhdXRvQ29tcGxldGUudXBkYXRlKGRhdGEubWFwKGQgPT4gZC5uYW1lKSk7XG4gIH1cbjwvc2NyaXB0PlxuXG48c3R5bGU+XG4gIGRpdiB7XG4gICAgbWFyZ2luOiAzMHB4O1xuICB9XG48L3N0eWxlPlxuXG48aDE+SGVsbG8gV29ybGQhPC9oMT5cblxuPGRpdiBzdHlsZT1cIndpZHRoOiAzMDBweFwiPlxuICA8QXV0b0NvbXBsZXRlIGNsYXNzTmFtZT1cImlucHV0XCIgbmFtZT1cImZydWl0c1wiIGl0ZW1zPXtuYW1lc30gLz5cbjwvZGl2PlxuXG48ZGl2IHN0eWxlPVwid2lkdGg6IDMwMHB4XCI+XG4gIDxBdXRvQ29tcGxldGVcbiAgICBjbGFzc05hbWU9XCJpbnB1dFwiXG4gICAgaXRlbXM9e25hbWVzfVxuICAgIHtpc0FzeW5jfVxuICAgIGJpbmQ6dGhpcz17YXV0b0NvbXBsZXRlfVxuICAgIG9uOmlucHV0PXtsb2FkQXBpRGF0YX0gLz5cbjwvZGl2PlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQWtCRSxHQUFHLGNBQUMsQ0FBQyxBQUNILE1BQU0sQ0FBRSxJQUFJLEFBQ2QsQ0FBQyJ9 */";
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

    	let autocomplete1_props = {
    		className: "input",
    		items: ctx.names,
    		isAsync: isAsync
    	};
    	var autocomplete1 = new Autocomplete({
    		props: autocomplete1_props,
    		$$inline: true
    	});

    	ctx.autocomplete1_binding(autocomplete1);
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
    			add_location(h1, file$1, 23, 0, 478);
    			set_style(div0, "width", "300px");
    			attr(div0, "class", "svelte-11j9f6");
    			add_location(div0, file$1, 25, 0, 501);
    			set_style(div1, "width", "300px");
    			attr(div1, "class", "svelte-11j9f6");
    			add_location(div1, file$1, 29, 0, 601);
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
    			if (changed.names) autocomplete1_changes.items = ctx.names;
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

    			ctx.autocomplete1_binding(null);

    			destroy_component(autocomplete1);
    		}
    	};
    }

    let isAsync = true;

    function instance$1($$self, $$props, $$invalidate) {
    	let names = ["Adam", "Antony", "Baby", "Brian", "Lovely", "John", "Jackob"];
      let autoComplete;

      async function loadApiData(event) {
        const res = await fetch(
          "https://restcountries.eu/rest/v2/all?fields=name;alpha3Code"
        );

        const data = await res.json();
        autoComplete.update(data.map(d => d.name));
      }

    	function autocomplete1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			$$invalidate('autoComplete', autoComplete = $$value);
    		});
    	}

    	return {
    		names,
    		autoComplete,
    		loadApiData,
    		autocomplete1_binding
    	};
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
