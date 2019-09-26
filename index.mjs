function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
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

/* src/Autocomplete.svelte generated by Svelte v3.9.2 */

function add_css() {
	var style = element("style");
	style.id = 'svelte-1kz7xie-style';
	style.textContent = ".svelte-1kz7xie{box-sizing:border-box}input.svelte-1kz7xie{height:2rem;width:100%;font-size:1rem;padding:0.25rem 0.5rem;margin:unset}.autocomplete.svelte-1kz7xie{position:relative}.hide-results.svelte-1kz7xie{display:none}.autocomplete-results.svelte-1kz7xie{padding:0;margin:0;border:1px solid #dbdbdb;height:6rem;overflow:auto;width:100%;background-color:white;box-shadow:2px 2px 24px rgba(0, 0, 0, 0.1);position:absolute;z-index:100}.autocomplete-result.svelte-1kz7xie{color:#7a7a7a;list-style:none;text-align:left;height:2rem;padding:0.25rem 0.5rem;cursor:pointer}.autocomplete-result.svelte-1kz7xie>span{background-color:none;color:#242424;font-weight:bold}.autocomplete-result.is-active.svelte-1kz7xie,.autocomplete-result.svelte-1kz7xie:hover{background-color:#dbdbdb}";
	append(document.head, style);
}

function get_each_context(ctx, list, i) {
	const child_ctx = Object.create(ctx);
	child_ctx.result = list[i];
	child_ctx.i = i;
	return child_ctx;
}

// (188:4) {#each results as result, i}
function create_each_block(ctx) {
	var li, html_tag, raw_value = ctx.result.label + "", t, li_class_value, dispose;

	function click_handler_1() {
		return ctx.click_handler_1(ctx);
	}

	return {
		c() {
			li = element("li");
			t = space();
			html_tag = new HtmlTag(raw_value, t);
			attr(li, "class", li_class_value = "autocomplete-result" + (ctx.i === ctx.arrowCounter ? ' is-active' : '') + " svelte-1kz7xie");
			dispose = listen(li, "click", click_handler_1);
		},

		m(target, anchor) {
			insert(target, li, anchor);
			html_tag.m(li);
			append(li, t);
		},

		p(changed, new_ctx) {
			ctx = new_ctx;
			if ((changed.results) && raw_value !== (raw_value = ctx.result.label + "")) {
				html_tag.p(raw_value);
			}

			if ((changed.arrowCounter) && li_class_value !== (li_class_value = "autocomplete-result" + (ctx.i === ctx.arrowCounter ? ' is-active' : '') + " svelte-1kz7xie")) {
				attr(li, "class", li_class_value);
			}
		},

		d(detaching) {
			if (detaching) {
				detach(li);
			}

			dispose();
		}
	};
}

// (196:2) {#if isLoading}
function create_if_block(ctx) {
	var p, current;

	const default_slot_template = ctx.$$slots.default;
	const default_slot = create_slot(default_slot_template, ctx, null);

	return {
		c() {
			if (!default_slot) {
				p = element("p");
				p.textContent = "Loading data...";
			}

			if (default_slot) default_slot.c();
			if (!default_slot) {
				attr(p, "class", "fallback svelte-1kz7xie");
			}
		},

		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},

		m(target, anchor) {
			if (!default_slot) {
				insert(target, p, anchor);
			}

			else {
				default_slot.m(target, anchor);
			}

			current = true;
		},

		p(changed, ctx) {
			if (default_slot && default_slot.p && changed.$$scope) {
				default_slot.p(
					get_slot_changes(default_slot_template, ctx, changed, null),
					get_slot_context(default_slot_template, ctx, null)
				);
			}
		},

		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},

		o(local) {
			transition_out(default_slot, local);
			current = false;
		},

		d(detaching) {
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
		c() {
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
			attr(ul, "class", ul_class_value = "autocomplete-results" + (!ctx.isOpen ? ' hide-results' : '') + " svelte-1kz7xie");
			attr(div, "class", "autocomplete svelte-1kz7xie");

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

		m(target, anchor) {
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

		p(changed, ctx) {
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

		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},

		o(local) {
			transition_out(if_block);
			current = false;
		},

		d(detaching) {
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
        console.log(items);
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

class Autocomplete extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-1kz7xie-style")) add_css();
		init(this, options, instance, create_fragment, not_equal, ["name", "items", "className", "minChar", "isAsync", "update"]);
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
}

export default Autocomplete;
