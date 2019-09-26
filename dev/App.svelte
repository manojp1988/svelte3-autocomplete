<script>
  import AutoComplete from "../src/Autocomplete.svelte";
  let names = ["Adam", "Antony", "Baby", "Brian", "Lovely", "John", "Jackob"];

  let isAsync = true;
  let autoComplete;
  let countries = [];

  async function loadApiData(event) {
    const res = await fetch(
      "https://restcountries.eu/rest/v2/all?fields=name;alpha3Code"
    );

    const data = await res.json();
    countries = data.map(d => d.name);
  }
</script>

<style>
  div {
    margin: 30px;
  }
</style>

<h1>Hello World!</h1>

<div style="width: 300px">
  <AutoComplete className="input" name="fruits" items={names} />
</div>

<div style="width: 300px">
  <AutoComplete
    className="input"
    items={countries}
    {isAsync}
    on:input={loadApiData} />
</div>
