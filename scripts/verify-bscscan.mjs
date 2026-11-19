// Submit AgentWall source verification to BscScan (V2 API, chainid 56).
// Needs BSCSCAN_API_KEY in the environment.
import { readFileSync } from 'node:fs';

const apiKey = process.env.BSCSCAN_API_KEY;
if (!apiKey) { console.error('BSCSCAN_API_KEY not set'); process.exit(1); }
const ADDRESS = '0xC12F4CFB17618D2B87ae53a7FC573fD00f76D68E';
const src = readFileSync('contracts/AgentWall.sol', 'utf8');

const params = new URLSearchParams({
  chainid: '56', module: 'contract', action: 'verifysourcecode', apikey: apiKey,
  contractaddress: ADDRESS, sourceCode: src, codeformat: 'solidity-single-file',
  contractname: 'AgentWall', compilerversion: 'v0.8.26+commit.8a97fa7a',
  optimizationUsed: '1', runs: '200', evmversion: 'shanghai', licenseType: '3',
  constructorArguements: '00000000000000000000000060b9262456de011f7d15a54cdd8c48baaa8b022f',
});
const r = await fetch('https://api.etherscan.io/v2/api', { method: 'POST', body: params });
const j = await r.json();
console.log('submit:', JSON.stringify(j));
if (j.status === '1') {
  const guid = j.result;
  for (let i = 0; i < 10; i++) {
    await new Promise((res) => setTimeout(res, 6000));
    const q = new URLSearchParams({ chainid: '56', module: 'contract', action: 'checkverifystatus', guid, apikey: apiKey });
    const s = await (await fetch('https://api.etherscan.io/v2/api?' + q)).json();
    console.log('status:', s.result);
    if (!/pending/i.test(String(s.result))) break;
  }
}
