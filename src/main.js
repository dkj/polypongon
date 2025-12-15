import './style.css';
import { Game } from './game/Game.js';
import QRCode from 'qrcode';

document.querySelector('#app').innerHTML = `
  <canvas id="gameCanvas"></canvas>
  <div class="ui-layer">
    <h1 style="margin: 0; font-weight: 600;">POLYPONGON</h1>
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
window.game = game; // Expose for testing
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

});
