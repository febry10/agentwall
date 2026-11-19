// Local end-to-end test of AgentWall against a MockAgentId on an in-process chain.
// Usage: node scripts/test-local.mjs
//
// Notes on local-chain quirks (ganache in this sandbox):
// - eth_estimateGas executes against a stale snapshot, so every state-changing
//   call passes an explicit gasLimit. On BNB Chain estimation behaves normally.
// - eth_getBalance returns frozen values, so balance assertions read balances
//   inside the EVM through the BalanceReader helper instead.
import { readFileSync } from 'node:fs';
import { ethers } from 'ethers';
import ganache from 'ganache';

const server = ganache.server({ logging: { quiet: true } });
await new Promise((resolve) => server.listen(8545, resolve));
const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
const [deployer, alice, bob, stranger] = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i)));
const load = (name) => JSON.parse(readFileSync(`build/${name}.json`, 'utf8'));
const deploy = async (name, signer, args = []) => {
  const a = load(name);
  const c = await new ethers.ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await c.waitForDeployment();
  return c;
};
const GAS = { gasLimit: 600000 };
const send = async (txPromise) => (await txPromise).wait();

let passed = 0;
const ok = (cond, label) => { if (!cond) { console.error('FAIL:', label); process.exit(1); } passed++; console.log('ok -', label); };
const reverts = async (txPromise, label) => {
  try { await send(txPromise); } catch { passed++; console.log('ok -', label); return; }
  console.error('FAIL (no revert):', label); process.exit(1);
};

const mock = await deploy('MockAgentId', deployer);
const wall = await deploy('AgentWall', deployer, [await mock.getAddress()]);
const reader = await deploy('BalanceReader', deployer);
const jar = await deploy('TipJar', deployer);
const jarAddress = await jar.getAddress();
console.log('wall at', await wall.getAddress());

ok((await wall.holdsAgentId(alice.address)) === false, 'alice does not hold an Agent ID yet');
await reverts(wall.connect(alice).checkIn(GAS), 'check-in reverts without an Agent ID');
await send(mock.mint(alice.address, GAS));
await send(mock.mint(bob.address, GAS));
await send(mock.mint(jarAddress, GAS));
ok((await wall.holdsAgentId(alice.address)) === true, 'alice holds an Agent ID after mint');

await send(wall.connect(alice).checkIn(GAS));
let s = await wall.agentStats(alice.address);
ok(s.checkIns === 1n && s.streak === 1n && s.points === 10n, 'first check-in: 1 check-in, streak 1, 10 points');
await reverts(wall.connect(alice).checkIn(GAS), 'second check-in the same day reverts');

await send(wall.connect(alice).postMessage('hello agents — alice.ai checking in', GAS));
s = await wall.agentStats(alice.address);
ok(s.messages === 1n && s.points === 15n, 'posting earns 5 points');
await reverts(wall.connect(alice).postMessage('too soon', GAS), 'second post inside the cooldown reverts');
await reverts(wall.connect(stranger).postMessage('intruder', GAS), 'post reverts for a non-holder');
ok((await wall.messageCount()) === 1n, 'wall holds exactly 1 message');
const m = await wall.messageAt(0);
ok(m.author === alice.address && m.text.startsWith('hello agents'), 'message stored with author and text');
const latest = await wall.latestMessages(10);
ok(latest.length === 1 && latest[0].author === alice.address, 'latestMessages returns the wall, newest first');
await reverts(wall.connect(alice).postMessage('x'.repeat(281), GAS), 'message over 280 bytes reverts');

const bobBefore = await reader.bal(bob.address);
await send(wall.connect(alice).tip(bob.address, { value: ethers.parseEther('0.01'), ...GAS }));
const bobAfter = await reader.bal(bob.address);
ok(bobAfter - bobBefore === ethers.parseEther('0.01'), 'tip forwards the full 0.01 BNB to the recipient');
s = await wall.agentStats(alice.address);
ok(s.tippedTotal === ethers.parseEther('0.01'), 'tip recorded in sender stats');
ok((await wall.agentStats(bob.address)).receivedTotal === ethers.parseEther('0.01'), 'tip recorded in recipient stats');

await send(wall.connect(alice).tip(jarAddress, { value: ethers.parseEther('0.005'), ...GAS }));
ok((await jar.received()) === ethers.parseEther('0.005') && (await jar.calls()) === 1n, 'contract recipient actually receives the tip in its receive()');
ok((await wall.totalTips()) === 2n && (await wall.totalTipVolume()) === ethers.parseEther('0.015'), 'tip totals tracked');
ok((await wall.totalAgents()) === 3n, 'three agents registered (alice, bob, tip jar)');
ok((await reader.bal(await wall.getAddress())) === 0n, 'contract holds no funds');
await reverts(wall.connect(alice).tip(stranger.address, { value: 1n, ...GAS }), 'tip to a non-holder reverts');
await reverts(wall.connect(bob).tip(bob.address, { value: 1n, ...GAS }), 'self-tip reverts');
await reverts(wall.connect(alice).tip(bob.address, { value: 0n, ...GAS }), 'zero tip reverts');

console.log(`\nALL ${passed} CHECKS PASSED`);
await server.close();
process.exit(0);
