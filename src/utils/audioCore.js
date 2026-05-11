// src/utils/audioCore.js

let bgmInstance = null;
let typingInstance = null;
let globalMuted = false;

const applyMuteState = () => {
  if (bgmInstance) {
    bgmInstance.volume = globalMuted ? 0 : 0.4;
    bgmInstance.muted = globalMuted;
  }

  if (typingInstance) {
    typingInstance.volume = globalMuted ? 0 : 0.6;
    typingInstance.muted = globalMuted;
  }
};

const resolveAudioPath = (soundPath) => {
  // 1. Desktop / Electron Path
  if (window.electronDistPath?.distPath) {
    const dist = window.electronDistPath.distPath.replace(/\/$/, '');
    return `file:///${dist.replace(/^\//, '')}${soundPath}`;
  }
  
  // 2. Web / Tailscale Path (The Fix)
  // Strips the leading slash (e.g., turns '/sounds/bgm.mp3' into 'sounds/bgm.mp3')
  return soundPath.startsWith('/') ? soundPath.substring(1) : soundPath;
};

export const AudioCore = {
  playBGM: () => {
    if (!bgmInstance) {
      bgmInstance = new Audio(resolveAudioPath('/sounds/bgm.mp3'));
      bgmInstance.loop = true;
      bgmInstance.volume = 0.4;
    }
    applyMuteState();
    bgmInstance.play().catch(e => console.warn('◈ BGM BLOCKED:', e));
  },

  stopBGM: () => {
    if (bgmInstance) {
      bgmInstance.pause();
      bgmInstance.currentTime = 0;
    }
  },

  startTyping: () => {
    if (!typingInstance) {
      typingInstance = new Audio(resolveAudioPath('/sounds/typing.mp3'));
      typingInstance.loop = true;
      typingInstance.volume = 0.6;
    }
    applyMuteState();
    typingInstance.play().catch(e => console.warn('◈ TYPING BLOCKED:', e));
  },

  stopTyping: () => {
    if (typingInstance) {
      typingInstance.pause();
      typingInstance.currentTime = 0;
    }
  },

  playSFX: (soundName, volume = 0.6) => {
    if (globalMuted) return;
    const sfx = new Audio(resolveAudioPath(`/sounds/${soundName}.mp3`));
    sfx.volume = volume;
    sfx.play().catch(e => console.warn(`◈ SFX [${soundName}] BLOCKED:`, e));
  },

  toggleMute: () => {
    globalMuted = !globalMuted;
    applyMuteState();
    return globalMuted;
  },

  setMuted: (state) => {
    globalMuted = Boolean(state);
    applyMuteState();
    return globalMuted;
  },

  isMuted: () => globalMuted
};