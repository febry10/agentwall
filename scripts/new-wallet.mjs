// Generate the deployer wallet once and store its key in deployer.json (mode 600).
// Prints only the public address. Never print or share the key file's contents.
import { writeFileSync, existsSync } from 'node:fs';
import { ethers } from 'ethers';

if (existsSync('deployer.json')) { console.error('deployer.json already exists — refusing to overwrite'); process.exit(1); }
const wallet = ethers.Wallet.createRandom();
writeFileSync('deployer.json', JSON.stringify({ address: wallet.address, privateKey: wallet.privateKey }, null, 2), { mode: 0o600 });
console.log('deployer address:', wallet.address);
