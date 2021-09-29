"use strict";

import clear from 'rollup-plugin-clear';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from "rollup-plugin-typescript2";

let cfg;
const i = process.argv.indexOf("--dest") + 1;
if (i === 0) {
  console.log("No destination specified - code will be compiled but not uploaded");
} else if (i >= process.argv.length || (cfg = require("./screeps")[process.argv[i]]) == null) {
  throw new Error("Invalid upload destination");
}

export default {
  input: "src/index.ts",
  output: {
    file: "bin/creep-tasks.js",
    format: "cjs",
    sourcemap: false,
  },

  plugins: [
    clear({ targets: ["dist"] }),
    resolve(),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json" })
  ],
}
