<script>
  import { createEventDispatcher } from "svelte";

  export let name = "";
  export let items = [];
  export let className = "";
  export let minChar = 0;
  export let isAsync = false;

  let value = "";
  let placeholder = "";
  let required = false;
  let disabled = false;
  // autocomplete props
  let isOpen = false;
  let results = [];
  let search = "";
  let isLoading = false;
  let arrowCounter = 0;
  // options
  let maxItems = 10;
  let fromStart = true;
  let input, list;
  let fire = createEventDispatcher(); // Default type ahea;

  const regExpEscape = s => {
    return s.replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&");
  };

  $: if (items) {
    update(items);
  }

  async function onChange(event) {
    fire("input", search);
    // Is the data given by an outside ajax request?
    if (isAsync) {
      isLoading = true;
    } else if (search.length >= Number(minChar)) {
      filterResults();
      isOpen = true;
    }
  }

  function filterResults() {
    results = items
      .filter(item => {
        if (typeof item !== "string") {
          item = item.key || ""; // Silent fail
        }
        return fromStart
          ? item.toUpperCase().startsWith(search.toUpperCase())
          : item.toUpperCase().includes(search.toUpperCase());
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
      });
    const height = results.length > maxItems ? maxItems : results.length;
    list.style.height = `${height * 2.25}rem`;
  }

  function onKeyDown(event) {
    if (event.keyCode === 40 && arrowCounter < results.length) {
      // ArrowDown
      arrowCounter = arrowCounter + 1;
    } else if (event.keyCode === 38 && arrowCounter > 0) {
      // ArrowUp
      arrowCounter = arrowCounter - 1;
    } else if (event.keyCode === 13) {
      // Enter
      event.preventDefault();
      if (arrowCounter === -1) {
        arrowCounter = 0; // Default select first item of list
      }
      close(arrowCounter);
    } else if (event.keyCode === 27) {
      // Escape
      event.preventDefault();
      close();
    }
  }

  function close(index = -1) {
    (isOpen = false), (arrowCounter = -1);

    input.blur();
    if (index > -1) {
      const { key, value } = results[index];
      value, (search = key);
      fire("change", value);
    } else if (!value) {
      search = "";
    }
  }

  export function update(itemsE) {
    if (isAsync && itemsE && itemsE.length) {
      items = itemsE;
      isLoading = false;
      isOpen = true;
      filterResults();
    }
  }
</script>

<style>
  * {
    box-sizing: border-box;
  }
  input {
    height: 2rem;
    width: 100%;
    font-size: 1rem;
    padding: 0.25rem 0.5rem;
    margin: unset;
  }
  .autocomplete {
    position: relative;
  }
  .hide-results {
    display: none;
  }
  .autocomplete-results {
    padding: 0;
    margin: 0;
    border: 1px solid #dbdbdb;
    height: 6rem;
    overflow: auto;
    width: 100%;
    background-color: white;
    box-shadow: 2px 2px 24px rgba(0, 0, 0, 0.1);
    position: absolute;
    z-index: 100;
  }
  .autocomplete-result {
    color: #7a7a7a;
    list-style: none;
    text-align: left;
    height: 2rem;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
  }
  .autocomplete-result > :global(span) {
    background-color: none;
    color: #242424;
    font-weight: bold;
  }
  .autocomplete-result.is-active,
  .autocomplete-result:hover {
    background-color: #dbdbdb;
  }
</style>

<svelte:options accessors={true} immutable={true} />
<svelte:window on:click={close} />
<div on:click|stopPropagation class="autocomplete">
  <input
    type="text"
    class={className}
    {name}
    {placeholder}
    {required}
    {disabled}
    value={value || ''}
    autocomplete={name}
    bind:value={search}
    on:input={onChange}
    on:focus={event => fire('focus', event)}
    on:blur={event => fire('blur', event)}
    on:keydown={onKeyDown}
    bind:this={input} />
  <ul
    class="autocomplete-results{!isOpen ? ' hide-results' : ''}"
    bind:this={list}>
    {#each results as result, i}
      <li
        on:click={() => close(i)}
        class="autocomplete-result{i === arrowCounter ? ' is-active' : ''}">
        {@html result.label}
      </li>
    {/each}
  </ul>
  {#if isLoading}
    <slot>
      <p class="fallback">Loading data...</p>
    </slot>
  {/if}
</div>
