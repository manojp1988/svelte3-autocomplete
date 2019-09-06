import svelte from 'rollup-plugin-svelte';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

import pkg from './package.json';

export default [
  {
    input: 'dev/main.js',
    output: {
      sourcemap: true,
      format: 'iife',
      name: 'app',
      file: 'dev/public/bundle.js'
    },
    plugins: [svelte({ dev: true }), commonjs(), resolve()]
  }
];
