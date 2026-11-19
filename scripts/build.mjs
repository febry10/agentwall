// Compile contracts/*.sol with solc into build/<Name>.json (abi + bytecode + metadata).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import solc from 'solc';

const sources = {};
for (const f of readdirSync('contracts')) {
  if (f.endsWith('.sol')) sources[f] = { content: readFileSync(`contracts/${f}`, 'utf8') };
}
const input = {
  language: 'Solidity',
  sources,
  settings: {
    // Shanghai: newest EVM version both BNB Chain and the local test chain
    // fully support (solc's Cancun default emits MCOPY, which breaks local
    // tests and adds nothing this contract needs).
    evmVersion: 'shanghai',
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'metadata'] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors) {
  for (const e of out.errors) {
    console.log(e.severity.toUpperCase(), e.formattedMessage.trim());
    if (e.severity === 'error') process.exitCode = 1;
  }
}
if (process.exitCode) process.exit(1);
mkdirSync('build', { recursive: true });
for (const [file, contracts] of Object.entries(out.contracts)) {
  for (const [name, c] of Object.entries(contracts)) {
    writeFileSync(`build/${name}.json`, JSON.stringify({ contractName: name, sourceFile: file, abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, metadata: c.metadata }, null, 2));
    console.log(`built ${name} (${file}): bytecode ${(c.evm.bytecode.object.length / 2).toLocaleString()} bytes`);
  }
}
