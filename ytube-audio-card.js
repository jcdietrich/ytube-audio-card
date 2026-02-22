/**
 * ytube-audio Queue Card for Home Assistant
 * A custom Lovelace card for managing the ytube-audio queue
 */

console.log('[ytube-audio] Card script loading...');

class YtubeAudioCard extends HTMLElement {
  constructor() {
    super();
    console.log('[ytube-audio] Card constructor called');
    this._queue = [];
    this._currentIndex = -1;
    this._entityPickerInitialized = false;
    this._shadowRoot = this.attachShadow({ mode: 'open' });
  }
  
  get shadowRoot() {
    return this._shadowRoot;
  }

  set hass(hass) {
    const firstSet = !this._hass;
    this._hass = hass;
    
    // Update entity picker's hass if it exists
    const entityPicker = this.shadowRoot?.querySelector('ha-entity-picker');
    if (entityPicker) {
      entityPicker.hass = hass;
    }
    
    // Track previous state to detect changes
    const prevState = this._mediaState;
    const prevTitle = this._mediaTitle;
    const prevImage = this._mediaImage;
    
    this._updateQueue();
    
    // Re-render if media state/title/image changed, or first set, or not initialized
    const stateChanged = prevState !== this._mediaState || prevTitle !== this._mediaTitle || prevImage !== this._mediaImage;
    
    if (firstSet || !this._entityPickerInitialized || stateChanged) {
      this._render();
    } else {
      this._updateDynamicContent();
    }
    
    // Subscribe to queue update events on first hass set
    if (firstSet && hass.connection) {
      this._subscribeToEvents();
    }
  }

  _subscribeToEvents() {
    // Subscribe to ytube_audio_queue_updated events
    this._hass.connection.subscribeEvents((event) => {
      if (event.data.entity_id === this._config.entity) {
        this._queue = event.data.items || [];
        this._currentIndex = event.data.current_index ?? -1;
        this._render();
      }
    }, 'ytube_audio_queue_updated');
  }

  setConfig(config) {
    this._config = {
      entity: config.entity || null,
      name: config.name || 'ytube-audio',
      max_visible: config.max_visible || 5,
      show_thumbnail: config.show_thumbnail !== false,
      show_seek: config.show_seek !== false,
      show_format: config.show_format || false,
      ...config
    };
    this._selectedEntity = config.entity || null;
    this._mediaPosition = 0;
    this._mediaDuration = 0;
    this._mediaVolume = 1;
    this._seeking = false;
    this._volumeChanging = false;
    this._selectedFormat = 'mp3';
    this._lastPosition = 0;  // For resuming on player switch
    this._lastMediaContentId = null;  // For resuming on player switch
  }

  _updateQueue() {
    // Get queue from service response or sensor
    if (!this._hass || !this._selectedEntity) return;
    
    // Try to get queue sensor if it exists
    const sensorId = `sensor.ytube_audio_queue_${this._selectedEntity.replace('media_player.', '')}`;
    const sensor = this._hass.states[sensorId];
    
    if (sensor && sensor.attributes) {
      this._queue = sensor.attributes.items || [];
      this._currentIndex = sensor.attributes.current_index || -1;
    }

    // Get media player position/duration/volume/artwork
    const playerState = this._hass.states[this._selectedEntity];
    if (playerState) {
      if (!this._seeking) {
        this._mediaPosition = playerState.attributes.media_position || 0;
        this._mediaDuration = playerState.attributes.media_duration || 0;
        this._mediaState = playerState.state;
        this._mediaContentId = playerState.attributes.media_content_id || null;
        this._mediaTitle = playerState.attributes.media_title || null;
        this._mediaArtist = playerState.attributes.media_artist || null;
        this._mediaImage = playerState.attributes.entity_picture || null;
        
        // Update position based on time elapsed since last update
        if (playerState.state === 'playing' && playerState.attributes.media_position_updated_at) {
          const lastUpdate = new Date(playerState.attributes.media_position_updated_at).getTime();
          const elapsed = (Date.now() - lastUpdate) / 1000;
          this._mediaPosition = Math.min(
            this._mediaPosition + elapsed,
            this._mediaDuration
          );
        }
      }
      if (!this._volumeChanging) {
        this._mediaVolume = playerState.attributes.volume_level || 1;
      }
    }
  }

  _getMediaPlayers() {
    if (!this._hass) return [];
    return Object.keys(this._hass.states)
      .filter(id => id.startsWith('media_player.'))
      .map(id => ({
        id,
        name: this._hass.states[id].attributes.friendly_name || id.replace('media_player.', '')
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  _updateDynamicContent() {
    // Update only dynamic parts without full re-render
    const seekSlider = this.shadowRoot.getElementById('seekSlider');
    const seekTimeStart = this.shadowRoot.querySelector('.seek-time:not(.end)');
    const seekTimeEnd = this.shadowRoot.querySelector('.seek-time.end');
    const queueTitle = this.shadowRoot.querySelector('.queue-title');
    
    if (seekSlider && !this._seeking) {
      seekSlider.max = this._mediaDuration || 100;
      seekSlider.value = this._mediaPosition;
    }
    if (seekTimeStart && !this._seeking) {
      seekTimeStart.textContent = this._formatTime(this._mediaPosition);
    }
    if (seekTimeEnd) {
      seekTimeEnd.textContent = this._formatTime(this._mediaDuration);
    }
    if (queueTitle) {
      queueTitle.textContent = `Queue (${this._queue.length} items)`;
    }
  }

  _render() {
    if (!this._config || !this._hass) return;

    const maxVisible = this._config.max_visible;
    const hasEntity = !!this._selectedEntity;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --card-bg: var(--ha-card-background, var(--card-background-color, #fff));
          --primary-color: var(--primary-color, #03a9f4);
          --text-primary: var(--primary-text-color, #212121);
          --text-secondary: var(--secondary-text-color, #727272);
          --divider: var(--divider-color, rgba(0,0,0,0.12));
        }
        
        ha-card {
          padding: 16px;
          background: var(--card-bg);
        }
        
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        
        .title {
          font-size: 1.1em;
          font-weight: 500;
          color: var(--text-primary);
        }
        
        .entity-selector {
          margin-bottom: 16px;
        }
        
        ha-entity-picker {
          display: block;
          width: 100%;
        }
        
        .format-section {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }
        
        .format-label {
          font-size: 12px;
          color: var(--text-secondary);
          white-space: nowrap;
        }
        
        .format-select {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid var(--divider);
          border-radius: 8px;
          font-size: 14px;
          background: var(--card-bg);
          color: var(--text-primary);
          outline: none;
          cursor: pointer;
        }
        
        .format-select:focus {
          border-color: var(--primary-color);
        }
        
        .input-section {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }
        
        .url-input {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid var(--divider);
          border-radius: 8px;
          font-size: 14px;
          background: var(--card-bg);
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.2s;
        }
        
        .url-input:focus {
          border-color: var(--primary-color);
        }
        
        .url-input::placeholder {
          color: var(--text-secondary);
        }
        
        .btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          background: var(--primary-color);
          color: white;
        }
        
        .btn:hover {
          opacity: 0.85;
          transform: scale(1.05);
        }
        
        .btn:active {
          transform: scale(0.95);
        }
        
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        
        .btn-secondary {
          background: var(--divider);
          color: var(--text-primary);
        }
        
        .btn ha-icon {
          --mdc-icon-size: 20px;
        }
        
        .queue-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid var(--divider);
          margin-bottom: 8px;
        }
        
        .queue-title {
          font-size: 0.9em;
          font-weight: 500;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .queue-controls {
          display: flex;
          gap: 4px;
        }
        
        .queue-controls .btn {
          width: 32px;
          height: 32px;
          background: transparent;
          color: var(--text-secondary);
        }
        
        .queue-controls .btn:hover:not(:disabled) {
          color: var(--primary-color);
          background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.1);
        }
        
        .queue-list {
          max-height: ${maxVisible * 56}px;
          overflow-y: auto;
          scrollbar-width: thin;
        }
        
        .queue-list::-webkit-scrollbar {
          width: 4px;
        }
        
        .queue-list::-webkit-scrollbar-thumb {
          background: var(--divider);
          border-radius: 2px;
        }
        
        .queue-item {
          display: flex;
          align-items: center;
          padding: 8px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
          gap: 12px;
        }
        
        .queue-item:hover {
          background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
        }
        
        .queue-item.active {
          background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
        }
        
        .queue-item-index {
          width: 24px;
          text-align: center;
          font-size: 12px;
          color: var(--text-secondary);
        }
        
        .queue-item.active .queue-item-index {
          color: var(--primary-color);
        }
        
        .queue-item-info {
          flex: 1;
          min-width: 0;
        }
        
        .queue-item-title {
          font-size: 14px;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .queue-item-url {
          font-size: 11px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .queue-item-remove {
          opacity: 0;
          transition: opacity 0.2s;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
        }
        
        .queue-item:hover .queue-item-remove {
          opacity: 1;
        }
        
        .queue-item-remove:hover {
          color: #f44336;
          background: rgba(244, 67, 54, 0.1);
        }
        
        .empty-queue {
          text-align: center;
          padding: 24px;
          color: var(--text-secondary);
          font-size: 14px;
        }
        
        .empty-queue ha-icon {
          --mdc-icon-size: 48px;
          opacity: 0.3;
          margin-bottom: 8px;
        }
        
        .no-entity {
          text-align: center;
          padding: 16px;
          color: var(--text-secondary);
        }
        
        .seek-section {
          margin-bottom: 16px;
          padding: 0 4px;
        }
        
        .seek-slider-container {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .seek-time {
          font-size: 11px;
          color: var(--text-secondary);
          min-width: 40px;
          font-variant-numeric: tabular-nums;
        }
        
        .seek-time.end {
          text-align: right;
        }
        
        .seek-slider {
          flex: 1;
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 2px;
          background: var(--divider);
          outline: none;
          cursor: pointer;
        }
        
        .seek-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--primary-color);
          cursor: pointer;
          transition: transform 0.1s;
        }
        
        .seek-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        
        .seek-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--primary-color);
          cursor: pointer;
          border: none;
        }
        
        .seek-slider:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .seek-slider:disabled::-webkit-slider-thumb {
          cursor: not-allowed;
        }
        
        .player-section {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
          padding: 12px;
          background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
          border-radius: 12px;
        }
        
        .player-artwork {
          width: 100px;
          height: 100px;
          border-radius: 8px;
          object-fit: cover;
          background: var(--divider);
          flex-shrink: 0;
        }
        
        .player-artwork.placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
        }
        
        .player-artwork.placeholder ha-icon {
          --mdc-icon-size: 48px;
          opacity: 0.5;
        }
        
        .player-controls-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
        }
        
        .player-info {
          margin-bottom: 8px;
        }
        
        .player-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 2px;
        }
        
        .player-artist {
          font-size: 12px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .playback-controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          margin-bottom: 8px;
        }
        
        .playback-controls .btn {
          width: 36px;
          height: 36px;
          background: transparent;
          color: var(--text-primary);
        }
        
        .playback-controls .btn:hover {
          color: var(--primary-color);
          background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.1);
        }
        
        .playback-controls .btn.large {
          width: 44px;
          height: 44px;
          background: var(--primary-color);
          color: white;
        }
        
        .playback-controls .btn.large:hover {
          background: var(--primary-color);
          opacity: 0.85;
        }
        
        .slider-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        
        .slider-row:last-child {
          margin-bottom: 0;
        }
        
        .slider-icon {
          color: var(--text-secondary);
          cursor: pointer;
          flex-shrink: 0;
        }
        
        .slider-icon:hover {
          color: var(--primary-color);
        }
        
        .slider-icon ha-icon {
          --mdc-icon-size: 20px;
        }
        
        .slider-container {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          overflow: hidden;
        }
        
        .slider-time {
          font-size: 10px;
          color: var(--text-secondary);
          min-width: 32px;
          font-variant-numeric: tabular-nums;
        }
        
        .slider-time.end {
          text-align: right;
        }
        
        .player-slider {
          flex: 1;
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 2px;
          background: var(--divider);
          outline: none;
          cursor: pointer;
        }
        
        .player-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--primary-color);
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          transition: transform 0.1s;
        }
        
        .player-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        
        .player-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--primary-color);
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        
        .player-slider:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .player-slider:disabled::-webkit-slider-thumb {
          cursor: not-allowed;
        }
      </style>
      
      <ha-card>
        <div class="header">
          <span class="title">${this._config.name}</span>
        </div>
        
        <div class="entity-selector" id="entitySelectorContainer">
        </div>
        
        ${this._config.show_format ? `
          <div class="format-section">
            <span class="format-label">Format:</span>
            <select class="format-select" id="formatSelect">
              <option value="mp3" ${this._selectedFormat === 'mp3' ? 'selected' : ''}>MP3</option>
              <option value="m4a" ${this._selectedFormat === 'm4a' ? 'selected' : ''}>M4A (AAC)</option>
              <option value="opus" ${this._selectedFormat === 'opus' ? 'selected' : ''}>Opus</option>
              <option value="best" ${this._selectedFormat === 'best' ? 'selected' : ''}>Best</option>
            </select>
            <button class="btn btn-secondary" id="setFormatBtn" title="Set as default">
              <ha-icon icon="mdi:content-save"></ha-icon>
            </button>
          </div>
        ` : ''}
        
        <div class="input-section">
          <input 
            type="text" 
            class="url-input" 
            placeholder="Paste URL or playlist..."
            id="urlInput"
            ${!hasEntity ? 'disabled' : ''}
          >
          <button class="btn btn-secondary" id="addBtn" title="Add to queue" ${!hasEntity ? 'disabled' : ''}>
            <ha-icon icon="mdi:playlist-plus"></ha-icon>
          </button>
          <button class="btn" id="playBtn" title="Play now" ${!hasEntity ? 'disabled' : ''}>
            <ha-icon icon="mdi:play"></ha-icon>
          </button>
        </div>
        
        ${hasEntity ? `
          <div class="player-section">
            ${this._mediaImage ? `
              <img class="player-artwork" src="${this._mediaImage}" alt="Album art">
            ` : `
              <div class="player-artwork placeholder">
                <ha-icon icon="mdi:music"></ha-icon>
              </div>
            `}
            <div class="player-controls-container">
              ${this._mediaTitle ? `
                <div class="player-info">
                  <div class="player-title">${this._mediaTitle}</div>
                  ${this._mediaArtist ? `<div class="player-artist">${this._mediaArtist}</div>` : ''}
                </div>
              ` : ''}
              
              <div class="playback-controls">
                <button class="btn" id="prevBtn" title="Previous">
                  <ha-icon icon="mdi:skip-previous"></ha-icon>
                </button>
                <button class="btn" id="stopBtn" title="Stop">
                  <ha-icon icon="mdi:stop"></ha-icon>
                </button>
                <button class="btn large" id="playPauseBtn" title="${this._mediaState === 'playing' ? 'Pause' : 'Play'}">
                  <ha-icon icon="mdi:${this._mediaState === 'playing' ? 'pause' : 'play'}"></ha-icon>
                </button>
                <button class="btn" id="nextBtn" title="Next">
                  <ha-icon icon="mdi:skip-next"></ha-icon>
                </button>
              </div>
              
              ${this._config.show_seek ? `
                <div class="slider-row">
                  <span class="slider-icon">
                    <ha-icon icon="mdi:progress-clock"></ha-icon>
                  </span>
                  <div class="slider-container">
                    <span class="slider-time">${this._formatTime(this._mediaPosition)}</span>
                    <input 
                      type="range" 
                      class="player-slider" 
                      id="seekSlider"
                      min="0" 
                      max="${this._mediaDuration || 100}" 
                      value="${this._mediaPosition}"
                      ${!this._mediaDuration ? 'disabled' : ''}
                    >
                    <span class="slider-time end">${this._formatTime(this._mediaDuration)}</span>
                  </div>
                </div>
              ` : ''}
              
              <div class="slider-row">
                <span class="slider-icon" id="volumeIcon">
                  <ha-icon icon="mdi:${this._mediaVolume === 0 ? 'volume-off' : this._mediaVolume < 0.5 ? 'volume-medium' : 'volume-high'}"></ha-icon>
                </span>
                <div class="slider-container">
                  <input 
                    type="range" 
                    class="player-slider" 
                    id="volumeSlider"
                    min="0" 
                    max="1" 
                    step="0.01"
                    value="${this._mediaVolume}"
                  >
                </div>
              </div>
            </div>
          </div>
          
          <div class="queue-header">
            <span class="queue-title">Queue (${this._queue.length} items)</span>
            <div class="queue-controls">
              <button class="btn" id="clearBtn" title="Clear queue">
                <ha-icon icon="mdi:playlist-remove"></ha-icon>
              </button>
            </div>
          </div>
          
          <div class="queue-list">
            ${this._queue.length === 0 ? `
              <div class="empty-queue">
                <ha-icon icon="mdi:playlist-music"></ha-icon>
                <div>Queue is empty</div>
                <div>Add a URL above to get started</div>
              </div>
            ` : this._queue.map((item, index) => `
              <div class="queue-item ${index === this._currentIndex ? 'active' : ''}" data-index="${index}">
                <span class="queue-item-index">${index === this._currentIndex ? '▶' : index + 1}</span>
                <div class="queue-item-info">
                  <div class="queue-item-title">${item.title || 'Unknown'}</div>
                  <div class="queue-item-url">${this._truncateUrl(item.url)}</div>
                </div>
                <button class="queue-item-remove" data-index="${index}">
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="no-entity">
            Select a media player above to manage the queue
          </div>
        `}
      </ha-card>
    `;

    this._attachEventListeners();
    this._initializeEntityPicker();
  }

  async _initializeEntityPicker() {
    const container = this.shadowRoot.getElementById('entitySelectorContainer');
    if (!container || this._entityPickerInitialized) return;
    
    // Wait for ha-entity-picker to be defined
    if (!customElements.get('ha-entity-picker')) {
      // Load the entity picker by creating a temporary element that triggers the import
      await customElements.whenDefined('ha-panel-lovelace');
      // Try loading via partial-panel-resolver
      const helpers = await window.loadCardHelpers?.();
      if (helpers) {
        await helpers.createCardElement({ type: 'entities', entities: [] });
      }
      // Wait a bit more for the picker to register
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Check again if it's defined now
    if (!customElements.get('ha-entity-picker')) {
      // Fallback to a simple select dropdown
      this._renderFallbackSelector(container);
      return;
    }
    
    // Create ha-entity-picker element
    const picker = document.createElement('ha-entity-picker');
    picker.hass = this._hass;
    picker.value = this._selectedEntity || '';
    picker.label = 'Media Player';
    picker.includeDomains = ['media_player'];
    picker.allowCustomEntity = true;
    
    picker.addEventListener('value-changed', (e) => {
      this._handlePlayerSwitch(e.detail.value || null);
    });
    
    container.appendChild(picker);
    this._entityPickerInitialized = true;
  }

  _renderFallbackSelector(container) {
    // Fallback to native select if ha-entity-picker isn't available
    const mediaPlayers = this._getMediaPlayers();
    container.innerHTML = `
      <select class="fallback-select" style="width:100%;padding:10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);">
        <option value="">Select a media player...</option>
        ${mediaPlayers.map(p => `
          <option value="${p.id}" ${this._selectedEntity === p.id ? 'selected' : ''}>
            ${p.name}
          </option>
        `).join('')}
      </select>
    `;
    
    container.querySelector('select')?.addEventListener('change', (e) => {
      this._handlePlayerSwitch(e.target.value || null);
    });
    
    this._entityPickerInitialized = true;
  }

  async _handlePlayerSwitch(newEntity) {
    const oldEntity = this._selectedEntity;
    
    // Save current position and media content before switching
    if (oldEntity && this._mediaContentId && (this._mediaState === 'playing' || this._mediaState === 'paused')) {
      this._lastPosition = this._mediaPosition;
      this._lastMediaContentId = this._mediaContentId;
      
      // Stop the old player
      await this._hass.callService('media_player', 'media_stop', {
        entity_id: oldEntity
      });
    }
    
    this._selectedEntity = newEntity;
    this._queue = [];
    this._currentIndex = -1;
    this._entityPickerInitialized = false;
    
    // If we have saved position and new entity, resume playback
    if (newEntity && this._lastMediaContentId && this._lastPosition > 0) {
      // Small delay to let the stop complete
      setTimeout(async () => {
        // Play the same media on the new player
        await this._hass.callService('media_player', 'play_media', {
          entity_id: newEntity,
          media_content_id: this._lastMediaContentId,
          media_content_type: 'music'
        });
        
        // Wait for playback to start, then seek to position
        setTimeout(async () => {
          await this._hass.callService('media_player', 'media_seek', {
            entity_id: newEntity,
            seek_position: this._lastPosition
          });
          // Clear saved state
          this._lastPosition = 0;
          this._lastMediaContentId = null;
        }, 1000);
      }, 500);
    }
    
    this._render();
  }

  _truncateUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return parsed.hostname + parsed.pathname.substring(0, 30) + '...';
    } catch {
      return url.substring(0, 40) + '...';
    }
  }

  _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  _attachEventListeners() {
    const urlInput = this.shadowRoot.getElementById('urlInput');
    const addBtn = this.shadowRoot.getElementById('addBtn');
    const playBtn = this.shadowRoot.getElementById('playBtn');
    const prevBtn = this.shadowRoot.getElementById('prevBtn');
    const nextBtn = this.shadowRoot.getElementById('nextBtn');
    const clearBtn = this.shadowRoot.getElementById('clearBtn');
    const seekSlider = this.shadowRoot.getElementById('seekSlider');
    const stopBtn = this.shadowRoot.getElementById('stopBtn');
    const playPauseBtn = this.shadowRoot.getElementById('playPauseBtn');
    const volumeSlider = this.shadowRoot.getElementById('volumeSlider');
    const volumeIcon = this.shadowRoot.getElementById('volumeIcon');

    // Stop button
    stopBtn?.addEventListener('click', () => {
      if (this._selectedEntity) {
        this._hass.callService('media_player', 'media_stop', {
          entity_id: this._selectedEntity
        });
      }
    });

    // Play/Pause button
    playPauseBtn?.addEventListener('click', () => {
      if (this._selectedEntity) {
        this._hass.callService('media_player', 'media_play_pause', {
          entity_id: this._selectedEntity
        });
      }
    });

    // Volume slider handlers
    volumeSlider?.addEventListener('input', (e) => {
      this._volumeChanging = true;
      this._mediaVolume = parseFloat(e.target.value);
      // Update volume icon
      if (volumeIcon) {
        volumeIcon.icon = this._mediaVolume === 0 ? 'mdi:volume-off' : this._mediaVolume < 0.5 ? 'mdi:volume-medium' : 'mdi:volume-high';
      }
    });

    volumeSlider?.addEventListener('change', (e) => {
      const volume = parseFloat(e.target.value);
      this._volumeChanging = false;
      
      if (this._selectedEntity) {
        this._hass.callService('media_player', 'volume_set', {
          entity_id: this._selectedEntity,
          volume_level: volume
        });
      }
    });

    // Volume icon click to mute/unmute
    volumeIcon?.addEventListener('click', () => {
      if (this._selectedEntity) {
        this._hass.callService('media_player', 'volume_mute', {
          entity_id: this._selectedEntity,
          is_volume_muted: this._mediaVolume > 0
        });
      }
    });

    // Seek slider handlers
    seekSlider?.addEventListener('input', (e) => {
      this._seeking = true;
      this._mediaPosition = parseFloat(e.target.value);
      // Update time display without full re-render
      const timeDisplay = this.shadowRoot.querySelector('.seek-time');
      if (timeDisplay) {
        timeDisplay.textContent = this._formatTime(this._mediaPosition);
      }
    });

    seekSlider?.addEventListener('change', (e) => {
      const position = parseFloat(e.target.value);
      this._seeking = false;
      
      if (this._selectedEntity) {
        this._hass.callService('ytube_audio', 'seek', {
          media_player: this._selectedEntity,
          timestamp: position
        });
      }
    });

    const addToQueue = (playNow) => {
      const url = urlInput.value.trim();
      if (!url || !this._selectedEntity) return;
      
      this._hass.callService('ytube_audio', 'add_to_queue', {
        url: url,
        media_player: this._selectedEntity,
        play_now: playNow
      });
      urlInput.value = '';
    };

    addBtn?.addEventListener('click', () => addToQueue(false));
    playBtn?.addEventListener('click', () => addToQueue(true));
    urlInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addToQueue(true);
    });

    prevBtn?.addEventListener('click', () => {
      if (!this._selectedEntity) return;
      this._hass.callService('ytube_audio', 'previous_track', {
        media_player: this._selectedEntity
      });
    });

    nextBtn?.addEventListener('click', () => {
      if (!this._selectedEntity) return;
      this._hass.callService('ytube_audio', 'next_track', {
        media_player: this._selectedEntity
      });
    });

    clearBtn?.addEventListener('click', () => {
      if (!this._selectedEntity) return;
      this._hass.callService('ytube_audio', 'clear_queue', {
        media_player: this._selectedEntity
      });
    });

    // Format selector handlers
    const formatSelect = this.shadowRoot.getElementById('formatSelect');
    const setFormatBtn = this.shadowRoot.getElementById('setFormatBtn');
    
    formatSelect?.addEventListener('change', (e) => {
      this._selectedFormat = e.target.value;
    });
    
    setFormatBtn?.addEventListener('click', () => {
      this._hass.callService('ytube_audio', 'set_default_format', {
        format: this._selectedFormat
      });
    });

    // Queue item click handlers
    this.shadowRoot.querySelectorAll('.queue-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this._selectedEntity) return;
        const index = parseInt(btn.dataset.index);
        this._hass.callService('ytube_audio', 'remove_from_queue', {
          media_player: this._selectedEntity,
          index: index
        });
      });
    });
  }

  getCardSize() {
    return 3;
  }

  static getConfigElement() {
    return document.createElement('ytube-audio-card-editor');
  }

  static getStubConfig() {
    return {
      entity: 'media_player.example',
      name: 'ytube-audio',
      max_visible: 5
    };
  }
}

// Card Editor
class YtubeAudioCardEditor extends HTMLElement {
  constructor() {
    super();
    console.log('[ytube-audio] Editor constructor called');
    this.attachShadow({ mode: 'open' });
    this._initialized = false;
  }

  set hass(hass) {
    this._hass = hass;
    // Update entity picker's hass if it exists
    const entityPicker = this.shadowRoot?.querySelector('ha-entity-picker');
    if (entityPicker) {
      entityPicker.hass = hass;
    }
    if (!this._initialized && this._config) {
      this._render();
    }
  }

  setConfig(config) {
    this._config = { ...config };
    if (this._hass) {
      this._render();
    }
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        .form-row {
          margin-bottom: 16px;
        }
        .form-row label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .form-row input[type="text"],
        .form-row input[type="number"] {
          width: 100%;
          padding: 8px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          box-sizing: border-box;
        }
        .form-row input[type="checkbox"] {
          width: auto;
          margin-right: 8px;
        }
        .checkbox-row {
          display: flex;
          align-items: center;
        }
        ha-entity-picker {
          display: block;
          width: 100%;
        }
      </style>
      
      <div class="form-row" id="entityPickerContainer">
      </div>
      
      <div class="form-row">
        <label>Card Name</label>
        <input type="text" id="name" value="${this._config.name || 'ytube-audio'}">
      </div>
      
      <div class="form-row">
        <label>Max Visible Queue Items</label>
        <input type="number" id="max_visible" min="3" max="15" value="${this._config.max_visible || 5}">
      </div>
      
      <div class="form-row">
        <label class="checkbox-row">
          <input type="checkbox" id="show_seek" ${this._config.show_seek !== false ? 'checked' : ''}>
          Show Seek Slider
        </label>
      </div>
      
      <div class="form-row">
        <label class="checkbox-row">
          <input type="checkbox" id="show_format" ${this._config.show_format ? 'checked' : ''}>
          Show Format Selector
        </label>
      </div>
    `;

    // Initialize entity picker
    this._initializeEntityPicker();

    // Add event listeners for other inputs
    this.shadowRoot.getElementById('name')?.addEventListener('change', () => this._valueChanged());
    this.shadowRoot.getElementById('max_visible')?.addEventListener('change', () => this._valueChanged());
    this.shadowRoot.getElementById('show_seek')?.addEventListener('change', () => this._valueChanged());
    this.shadowRoot.getElementById('show_format')?.addEventListener('change', () => this._valueChanged());
    
    this._initialized = true;
  }

  _initializeEntityPicker() {
    const container = this.shadowRoot.getElementById('entityPickerContainer');
    if (!container) {
      console.log('[ytube-audio] Editor: entityPickerContainer not found');
      return;
    }
    
    if (!this._hass || !this._hass.states) {
      console.log('[ytube-audio] Editor: hass not available yet');
      container.innerHTML = `<p style="color:var(--secondary-text-color);">Loading media players...</p>`;
      return;
    }
    
    // Get all media players for a native select dropdown
    const mediaPlayers = Object.keys(this._hass.states)
      .filter(id => id.startsWith('media_player.'))
      .map(id => ({
        id,
        name: this._hass.states[id].attributes.friendly_name || id.replace('media_player.', '')
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    console.log('[ytube-audio] Editor: Found', mediaPlayers.length, 'media players');
    
    container.innerHTML = `
      <label style="display:block;margin-bottom:4px;font-weight:500;color:var(--primary-text-color);">Media Player Entity (optional)</label>
      <select id="entitySelect" style="width:100%;padding:10px;border:1px solid var(--divider-color);border-radius:4px;background:var(--card-background-color);color:var(--primary-text-color);font-size:14px;">
        <option value="">None (select on card)</option>
        ${mediaPlayers.map(p => `
          <option value="${p.id}" ${this._config.entity === p.id ? 'selected' : ''}>
            ${p.name}
          </option>
        `).join('')}
      </select>
    `;
    
    container.querySelector('#entitySelect')?.addEventListener('change', (e) => {
      this._config = { ...this._config, entity: e.target.value || '' };
      this._fireConfigChanged();
    });
  }

  _valueChanged() {
    this._config = {
      ...this._config,
      name: this.shadowRoot.getElementById('name').value,
      max_visible: parseInt(this.shadowRoot.getElementById('max_visible').value) || 5,
      show_seek: this.shadowRoot.getElementById('show_seek').checked,
      show_format: this.shadowRoot.getElementById('show_format').checked
    };
    this._fireConfigChanged();
  }

  _fireConfigChanged() {
    const event = new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }
}

// Register custom elements
// Use direct customElements.define (not window.customElements) for card-mod compatibility
if (!customElements.get('ytube-audio-card')) {
  customElements.define('ytube-audio-card', YtubeAudioCard);
  console.log('[ytube-audio] Registered ytube-audio-card');
}
if (!customElements.get('ytube-audio-card-editor')) {
  customElements.define('ytube-audio-card-editor', YtubeAudioCardEditor);
  console.log('[ytube-audio] Registered ytube-audio-card-editor');
}

window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'ytube-audio-card')) {
  window.customCards.push({
    type: 'ytube-audio-card',
    name: 'ytube-audio Card',
    description: 'A card for managing the ytube-audio queue with URL input, playback controls, and album art',
    preview: false,
    documentationURL: 'https://github.com/jcdietrich/ytube-audio-card'
  });
}

console.info('%c ytube-audio Card %c v2.1.2 ', 
  'background: #03a9f4; color: white; font-weight: bold;',
  'background: #333; color: white;'
);
