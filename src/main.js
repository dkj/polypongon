import './style.css';
import { Game } from './game/Game.js';
import QRCode from 'qrcode';

document.querySelector('#app').innerHTML = `
  <canvas id="gameCanvas"></canvas>
  <div class="ui-layer">
    <h1 style="margin: 0; font-weight: 600;">POLYPONG</h1>
    <button id="onlineBtn" style="margin-top: 10px; padding: 10px 20px; background: #38bdf8; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
      PLAY ONLINE
    </button>
  </div>
  <div id="qr-container" style="position: absolute; top: 20px; right: 20px; display: none;">
    <canvas id="qrCanvas"></canvas>
  </div>
`;

const canvas = document.querySelector('#gameCanvas');
const game = new Game(canvas);
game.start();

function showQRCode(url) {
  const container = document.getElementById('qr-container');
  const canvas = document.getElementById('qrCanvas');

  QRCode.toCanvas(canvas, url, { width: 180, margin: 4 }, function (error) {
    if (error) console.error(error);
    container.style.display = 'block';
  });
}

const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');

// If room in URL, auto-join
if (roomFromUrl) {
  console.log('Auto-joining room:', roomFromUrl);
  document.getElementById('onlineBtn').style.display = 'none';
  game.startMultiplayer(roomFromUrl);
  showQRCode(window.location.href);
}

document.getElementById('onlineBtn').addEventListener('click', () => {
  const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
  console.log('Online button clicked! Created room:', roomId);

  // Update URL without reload
  const newUrl = `${window.location.pathname}?room=${roomId}`;
  window.history.pushState({ path: newUrl }, '', newUrl);

  game.startMultiplayer(roomId);
  showQRCode(window.location.href);

  const btn = document.getElementById('onlineBtn');
  btn.style.display = 'none';

  // Show Share UI
  const shareContainer = document.createElement('div');
  shareContainer.style.cssText = "margin-top: 15px; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: auto;";

  const label = document.createElement('div');
  label.innerText = "Invite a Friend:";
  label.style.cssText = "color: #e2e8f0; font-size: 14px;";
  shareContainer.appendChild(label);

  const row = document.createElement('div');
  row.style.cssText = "display: flex; gap: 8px; align-items: center;";

  const input = document.createElement('input');
  input.type = "text";
  input.value = window.location.href;
  input.readOnly = true;
  input.style.cssText = "padding: 8px 12px; border-radius: 6px; border: 1px solid #38bdf8; background: rgba(15, 23, 42, 0.9); color: #38bdf8; width: 200px; font-family: monospace; outline: none;";
  input.onclick = () => input.select();
  row.appendChild(input);

  const copyBtn = document.createElement('button');
  copyBtn.innerText = "Copy";
  copyBtn.style.cssText = "padding: 8px 12px; background: #38bdf8; border: none; border-radius: 6px; cursor: pointer; color: #0f172a; font-weight: 600; transition: background 0.2s;";
  copyBtn.onmouseover = () => copyBtn.style.background = "#0ea5e9";
  copyBtn.onmouseout = () => copyBtn.style.background = "#38bdf8";

  copyBtn.onclick = () => {
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
      const originalText = copyBtn.innerText;
      copyBtn.innerText = "Copied!";
      copyBtn.style.background = "#22c55e"; // Green 500
      setTimeout(() => {
        copyBtn.innerText = originalText;
        copyBtn.style.background = "#38bdf8";
      }, 2000);
    });
  };
  row.appendChild(copyBtn);

  shareContainer.appendChild(row);
  document.querySelector('.ui-layer').appendChild(shareContainer);
});
