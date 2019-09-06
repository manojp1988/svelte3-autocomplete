# svelte3-autocomplete

This is a svelte3 library to create autocomplete text fields with both static and async support

To try this library, please run below commands in sequence.

```bash
npm install
npm run build:dev
```

Above commands build the app, to run the app, please install [http-server](https://www.npmjs.com/package/http-server) from npm.

```bash
   http-server dev/public/.
```

Then open the app at [localhost:8080](localhost:8080)

## Usage

Install the dependencies...

```html
<AutoComplete className="input" name="fruits" items="{names}" />
```

```html
<AutoComplete
  className="input"
  items="{names}"
  {isAsync}
  bind:this="{autoComplete}"
  on:input="{loadApiData}"
/>
```

In async case, you need to call this method to send data to the component.

```javascript
autoComplete.update(data.map(d => d.name));
```
