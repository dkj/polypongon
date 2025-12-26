import './style.css';
import { Game } from './game/Game.js';
import QRCode from 'qrcode';

document.querySelector('#app').innerHTML = `
  <canvas id="gameCanvas"></canvas>
  <div class="ui-layer">
    <h1>POLYPONGON</h1>
  </div>
  
  <div id="game-menu" class="menu-container">
    <button id="restartBtn" class="btn btn-primary">
      START GAME
    </button>
    ${import.meta.env.VITE_STATIC_BUILD === 'true' ? '' : `
    <button id="onlineBtn" class="btn btn-secondary">
      MULTIPLAYER (GO ONLINE)
    </button>
    `}
  </div>

  <div id="qr-container">
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
    container.classList.add('visible');
  });
}

// Helper function to fetch instance info from server
async function getInstanceInfo() {
  try {
    const response = await fetch('/api/instance');
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch instance info:', error);
    return { instanceId: null, isFlyInstance: false };
  }
}

const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
const instanceFromUrl = urlParams.get('instance');

// If room in URL, auto-join
if (roomFromUrl) {
  console.log('Auto-joining room:', roomFromUrl, 'on instance:', instanceFromUrl || 'default');
  const btn = document.getElementById('onlineBtn');
  if (btn) btn.innerText = 'go offline (single player)';
  game.startMultiplayer(roomFromUrl, instanceFromUrl);
  showQRCode(window.location.href);
}

const onlineBtn = document.getElementById('onlineBtn');
if (onlineBtn) {
  onlineBtn.addEventListener('click', async () => {
    if (game.mode === 'online') {
      // Switch to Offline
      console.log('Switching to Offline Mode');
      game.stopMultiplayer();

      // Clear URL
      const newUrl = window.location.pathname;
      window.history.pushState({ path: newUrl }, '', newUrl);

      // Hide QR
      const container = document.getElementById('qr-container');
      container.classList.remove('visible');

      // Update Button
      onlineBtn.innerText = 'MULTIPLAYER (GO ONLINE)';
    } else {
      // Switch to Online
      const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
      console.log('Online button clicked! Creating room:', roomId);

      // Get instance info from server
      const instanceInfo = await getInstanceInfo();
      const instanceId = instanceInfo.instanceId;

      console.log('Room will be hosted on instance:', instanceId);

      // Update URL with both room and instance
      let newUrl = `${window.location.pathname}?room=${roomId}`;
      if (instanceId && instanceInfo.isFlyInstance) {
        newUrl += `&instance=${instanceId}`;
      }
      window.history.pushState({ path: newUrl }, '', newUrl);

      game.startMultiplayer(roomId, instanceId);
      showQRCode(window.location.href);

      onlineBtn.innerText = 'GO OFFLINE (SINGLE PLAYER)';
    }
  });
}
