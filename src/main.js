import './style.css';
import { Game } from './game/Game.js';
import { ShareManager } from './ShareManager.js';

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
      MULTIPLAYER (ONLINE)
    </button>
    `}
    <button id="shareMenuBtn" class="btn btn-secondary">
      SHARE APP
    </button>
  </div>

  <div id="share-modal" class="modal-overlay">
    <div class="modal-content">
      <button class="modal-close" id="closeShareBtn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      <h2 class="modal-title" id="shareTitle">SHARE POLYPONGON</h2>
      
      <div class="share-qr">
        <canvas id="shareQRCanvas"></canvas>
      </div>

      <div class="share-options">
        <div class="copy-area">
          <input type="text" id="shareUrlInput" class="copy-input" readonly>
          <button id="copyBtn" class="btn btn-primary btn-copy">COPY</button>
        </div>
        
        <div class="social-links">
          <a id="shareTwitter" class="social-btn" title="Share on Twitter" target="_blank">
            <svg viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
          </a>
          <a id="shareBluesky" class="social-btn" title="Share on Bluesky" target="_blank">
            <svg viewBox="0 0 24 24"><path d="M12 10.8c-1.32-2.34-4.22-5.4-6.68-6.12A3.33 3.33 0 001.32 7.08c0 .24.03.48.1.72 1.3 4.41 4.71 8.85 9.4 10.51 1.09.38 2.27.38 3.36 0 4.69-1.66 8.1-6.1 9.4-10.51.07-.24.1-.48.1-.72A3.33 3.33 0 0018.68 4.68c-2.46.72-5.36 3.78-6.68 6.12z"/></svg>
          </a>
          <a id="shareFacebook" class="social-btn" title="Share on Facebook" target="_blank">
            <svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </a>
          <a id="shareWhatsapp" class="social-btn" title="Share on WhatsApp" target="_blank">
            <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
          </a>
          <button id="webShareBtn" class="social-btn" title="More options">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
`;

const canvas = document.querySelector('#gameCanvas');
const game = new Game(canvas);
const shareManager = new ShareManager();
window.game = game;

// Auto-close modal when game starts
game.onStateChange = (state) => {
  if (state === 'COUNTDOWN' || state === 'PLAYING') {
    closeShareModal();
  }
};

game.start();

const modal = document.getElementById('share-modal');
const shareTitle = document.getElementById('shareTitle');
const shareUrlInput = document.getElementById('shareUrlInput');
const qrCanvas = document.getElementById('shareQRCanvas');

function openShareModal(url, isInvite = false) {
  shareTitle.innerText = isInvite ? 'INVITE TO GAME' : 'SHARE POLYPONGON';
  shareUrlInput.value = url;
  shareManager.renderQRCode(qrCanvas, url);

  // Update social links
  const links = shareManager.getSocialLinks(url, isInvite);
  document.getElementById('shareTwitter').href = links.twitter;
  document.getElementById('shareBluesky').href = links.bluesky;
  document.getElementById('shareFacebook').href = links.facebook;
  document.getElementById('shareWhatsapp').href = links.whatsapp;

  modal.classList.add('visible');

  // Push state to history for back button support
  window.history.pushState({ modal: 'share' }, '');
}

function closeShareModal() {
  if (modal.classList.contains('visible')) {
    modal.classList.remove('visible');
    // If we have a modal state in history, go back
    if (window.history.state?.modal === 'share') {
      window.history.back();
    }
  }
}

// Event Listeners for Modal
document.getElementById('closeShareBtn').addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeShareModal();
});

// Close on background click
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    closeShareModal();
  }
});

// Close on Escape key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeShareModal();
  }
});

// Close on back button
window.addEventListener('popstate', (e) => {
  if (modal.classList.contains('visible') && (!e.state || e.state.modal !== 'share')) {
    modal.classList.remove('visible');
  }
});

const shareMenuBtn = document.getElementById('shareMenuBtn');
shareMenuBtn.addEventListener('click', () => {
  if (game.mode === 'online') {
    openShareModal(window.location.href, true);
  } else {
    openShareModal(window.location.origin, false);
  }
});

document.getElementById('copyBtn').addEventListener('click', async () => {
  const success = await shareManager.copyToClipboard(shareUrlInput.value);
  if (success) {
    const btn = document.getElementById('copyBtn');
    const originalText = btn.innerText;
    btn.innerText = 'COPIED!';
    setTimeout(() => btn.innerText = originalText, 2000);
  }
});

document.getElementById('webShareBtn').addEventListener('click', () => {
  const isInvite = shareTitle.innerText.includes('INVITE');
  shareManager.share(shareUrlInput.value, isInvite);
});

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
  if (btn) btn.innerText = 'OFFLINE (SINGLE PLAYER)';
  const shareBtn = document.getElementById('shareMenuBtn');
  if (shareBtn) shareBtn.innerText = 'INVITE OTHERS';
  game.startMultiplayer(roomFromUrl, instanceFromUrl);
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

      // Update Buttons
      onlineBtn.innerText = 'MULTIPLAYER (ONLINE)';
      shareMenuBtn.innerText = 'SHARE APP';
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
      const fullUrl = `${window.location.origin}${newUrl}`;
      window.history.pushState({ path: newUrl }, '', newUrl);

      game.startMultiplayer(roomId, instanceId);

      // Show Share/Invite Modal
      openShareModal(fullUrl, true);

      onlineBtn.innerText = 'OFFLINE (SINGLE PLAYER)';
      shareMenuBtn.innerText = 'INVITE OTHERS';
    }
  });
}
