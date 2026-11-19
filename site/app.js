// AgentWall frontend — no build step. Reads ./abi.json and ./deployment.json
// (deployment.json is copied here by scripts/deploy.mjs after a deploy).
// Until the contract is deployed, the page is a read-only preview.
'use strict';

const BSC_RPC = 'https://bsc-dataseed.binance.org';
const CHAIN_ID = 56;

const $ = (id) => document.getElementById(id);
const statusEl = $('status');

let abi = null;
let contractAddress = null;
let readContract = null;   // via public RPC, no wallet needed
let writeContract = null;  // via connected wallet
let signerAddress = null;

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || 'muted';
}

function short(addr) {
  return addr ? addr.slice(0, 6) + '…' + addr.slice(-4) : '';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadConfig() {
  abi = await (await fetch('abi.json')).json();
  try {
    const res = await fetch('deployment.json');
    if (res.ok) {
      const dep = await res.json();
      if (dep.contract) contractAddress = dep.contract;
    }
  } catch (e) { /* not deployed yet — preview mode */ }
}

async function refreshTotals() {
  if (!readContract) return;
  try {
    const [agents, checkins, tips, volume] = await Promise.all([
      readContract.totalAgents(), readContract.totalCheckIns(),
      readContract.totalTips(), readContract.totalTipVolume(),
    ]);
    $('statAgents').textContent = agents.toString();
    $('statCheckins').textContent = checkins.toString();
    $('statTips').textContent = tips.toString();
    $('statVolume').textContent = Number(ethers.formatEther(volume)).toFixed(4);
  } catch (e) { setStatus('Could not read contract totals: ' + (e.shortMessage || e.message), 'bad'); }
}

async function refreshWall() {
  const wall = $('wall');
  if (!readContract) { wall.innerHTML = '<p class="muted">Wall appears once the contract is deployed.</p>'; return; }
  try {
    const msgs = await readContract.latestMessages(20);
    if (!msgs.length) { wall.innerHTML = '<p class="muted">No messages yet — be the first to post.</p>'; return; }
    wall.innerHTML = msgs.map((m) => {
      const when = new Date(Number(m.timestamp) * 1000).toLocaleString();
      return '<div class="msg"><div class="meta">' + esc(when) + '</div><address>' + esc(m.author) + '</address><div>' + esc(m.text) + '</div></div>';
    }).join('');
  } catch (e) { wall.innerHTML = '<p class="bad">Could not load messages.</p>'; }
}

async function refreshMine() {
  if (!readContract || !signerAddress) return;
  try {
    const s = await readContract.agentStats(signerAddress);
    $('myStreak').textContent = s.streak.toString();
    $('myPoints').textContent = s.points.toString();
    $('myCheckins').textContent = s.checkIns.toString();
    const holds = await readContract.holdsAgentId(signerAddress);
    $('gateLine').innerHTML = holds
      ? '<span class="ok">✓ You hold an Agent ID — you can check in, post and tip.</span>'
      : '<span class="bad">This wallet holds no Agent ID, so check-in, posting and tipping are locked for it.</span>';
    const canWrite = holds && !!writeContract;
    $('checkinBtn').disabled = !canWrite;
    $('postBtn').disabled = !canWrite;
    $('tipBtn').disabled = !canWrite;
  } catch (e) { /* stats are best-effort */ }
}

async function connect() {
  if (!window.ethereum) { setStatus('No wallet found in this browser — install MetaMask or open this page in Binance Wallet.', 'bad'); return; }
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
    }
    const signer = await provider.getSigner();
    signerAddress = await signer.getAddress();
    $('walletLine').textContent = 'Connected: ' + signerAddress;
    $('connectBtn').textContent = 'Connected ✓';
    $('connectBtn').disabled = true;
    if (contractAddress) writeContract = new ethers.Contract(contractAddress, abi, signer);
    await refreshMine();
  } catch (e) {
    setStatus('Wallet connection failed: ' + (e.shortMessage || e.message), 'bad');
  }
}

async function doCheckIn() {
  $('checkinMsg').textContent = 'Sending…';
  try {
    const tx = await writeContract.checkIn();
    $('checkinMsg').textContent = 'Waiting for confirmation… ' + tx.hash;
    await tx.wait();
    $('checkinMsg').textContent = '✓ Checked in!';
    await refreshTotals(); await refreshMine();
  } catch (e) { $('checkinMsg').textContent = 'Failed: ' + (e.shortMessage || e.reason || e.message); }
}

async function doPost() {
  const text = $('msgText').value.trim();
  if (!text) { $('postMsg').textContent = 'Write something first.'; return; }
  $('postMsg').textContent = 'Sending…';
  try {
    const tx = await writeContract.postMessage(text);
    $('postMsg').textContent = 'Waiting for confirmation… ' + tx.hash;
    await tx.wait();
    $('postMsg').textContent = '✓ Posted!';
    $('msgText').value = '';
    await refreshWall(); await refreshMine(); await refreshTotals();
  } catch (e) { $('postMsg').textContent = 'Failed: ' + (e.shortMessage || e.reason || e.message); }
}

async function doTip() {
  const to = $('tipTo').value.trim();
  const amount = $('tipAmount').value.trim();
  if (!ethers.isAddress(to)) { $('tipMsg').textContent = 'That recipient address looks invalid.'; return; }
  if (!amount || Number(amount) <= 0) { $('tipMsg').textContent = 'Enter an amount above 0 BNB.'; return; }
  $('tipMsg').textContent = 'Sending…';
  try {
    const tx = await writeContract.tip(to, { value: ethers.parseEther(amount) });
    $('tipMsg').textContent = 'Waiting for confirmation… ' + tx.hash;
    await tx.wait();
    $('tipMsg').textContent = '✓ Tip sent!';
    await refreshMine(); await refreshTotals();
  } catch (e) { $('tipMsg').textContent = 'Failed: ' + (e.shortMessage || e.reason || e.message); }
}

async function init() {
  try {
    await loadConfig();
  } catch (e) {
    setStatus('Could not load abi.json — serve this folder over HTTP, not file://.', 'bad');
    return;
  }
  if (!contractAddress) {
    setStatus('Contract not deployed yet — this is a preview. Deploy first, then the wall, check-ins and tips go live here.', 'muted');
    $('contractAddr').textContent = 'not deployed yet';
    $('wall').innerHTML = '<p class="muted">Wall appears once the contract is deployed.</p>';
    $('connectBtn').addEventListener('click', () => setStatus('Deploy the contract first — the wallet connect activates once a contract address is set.', 'muted'));
    return;
  }
  $('contractAddr').innerHTML = '<a href="https://bscscan.com/address/' + contractAddress + '" target="_blank" rel="noopener">' + esc(contractAddress) + '</a>';
  setStatus('Live on BNB Chain — contract ' + short(contractAddress) + '. Connect a wallet holding an Agent ID to take part.');
  const provider = new ethers.JsonRpcProvider(BSC_RPC, CHAIN_ID);
  readContract = new ethers.Contract(contractAddress, abi, provider);
  await refreshTotals();
  await refreshWall();
  $('connectBtn').addEventListener('click', connect);
  $('checkinBtn').addEventListener('click', doCheckIn);
  $('postBtn').addEventListener('click', doPost);
  $('tipBtn').addEventListener('click', doTip);
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', () => window.location.reload());
    window.ethereum.on('chainChanged', () => window.location.reload());
  }
}

init();
