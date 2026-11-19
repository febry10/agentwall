// Deploy AgentWall to BNB Chain mainnet from the local deployer wallet.
// Usage: node scripts/deploy.mjs [--dry-run]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ethers } from 'ethers';

const RPC = process.env.BSC_RPC ?? 'https://bsc-dataseed.binance.org';
const keyFile = 'deployer.json';
if (!existsSync(keyFile)) { console.error('no deployer.json — run scripts/new-wallet.mjs first'); process.exit(1); }
const { privateKey } = JSON.parse(readFileSync(keyFile, 'utf8'));

const provider = new ethers.JsonRpcProvider(RPC, 56);
const wallet = new ethers.Wallet(privateKey, provider);
const balance = await provider.getBalance(wallet.address);
console.log('deployer:', wallet.address);
console.log('balance :', ethers.formatEther(balance), 'BNB');
if (balance === 0n) { console.error('balance is 0 — fund the deployer first'); process.exit(1); }

const artifact = JSON.parse(readFileSync('build/AgentWall.json', 'utf8'));
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
const AGENT_ID_CONTRACT = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
const gas = await factory.getDeployTransaction(AGENT_ID_CONTRACT).then((tx) => provider.estimateGas({ ...tx, from: wallet.address }));
console.log('estimated deploy gas:', gas.toString());
if (process.argv.includes('--dry-run')) { console.log('dry run — not deploying'); process.exit(0); }

const contract = await factory.deploy(AGENT_ID_CONTRACT);
console.log('deploy tx:', contract.deploymentTransaction().hash);
await contract.waitForDeployment();
const address = await contract.getAddress();
console.log('AgentWall deployed at:', address);
const agentId = await contract.AGENT_ID();
const totalAgents = await contract.totalAgents();
console.log('gated on Agent ID contract:', agentId, '| totalAgents:', totalAgents.toString());
writeFileSync('deployment.json', JSON.stringify({ network: 'bsc-mainnet', chainId: 56, contract: address, deployTx: contract.deploymentTransaction().hash, deployer: wallet.address, deployedAt: new Date().toISOString() }, null, 2));
console.log('wrote deployment.json');
// Keep the frontend in sync: it reads ./deployment.json next to index.html.
writeFileSync('site/deployment.json', JSON.stringify({ network: 'bsc-mainnet', chainId: 56, contract: address, deployTx: contract.deploymentTransaction().hash, deployer: wallet.address, deployedAt: new Date().toISOString() }, null, 2));
console.log('wrote site/deployment.json');
