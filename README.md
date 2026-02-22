# ytube-audio Card

A custom Lovelace card for the [ytube-audio](https://github.com/jcdietrich/ytube-audio) Home Assistant integration.

## Features

- Play audio from YouTube and 1000+ other sites
- Queue management with drag-and-drop reordering
- Now playing display with album art/thumbnail
- Playback controls (play/pause, stop, previous, next)
- Volume slider with mute toggle
- Seek slider for position control
- Format selection (MP3, M4A, Opus, Best)
- Media player selector with handoff support

## Installation

### HACS (Recommended)

1. Open HACS in Home Assistant
2. Go to **Frontend** (or **Lovelace**)
3. Click **+ Explore & Download Repositories**
4. Search for "ytube-audio Card"
5. Click **Download**
6. Restart Home Assistant

### Manual Installation

1. Download `ytube-audio-card.js` from the [latest release](https://github.com/jcdietrich/ytube-audio-card/releases)
2. Copy it to your `www` folder (create if it doesn't exist)
3. Add the resource in Lovelace:
   - Go to **Settings → Dashboards → Resources**
   - Click **Add Resource**
   - URL: `/local/ytube-audio-card.js`
   - Type: JavaScript Module

## Usage

Add the card to your dashboard:

```yaml
type: custom:ytube-audio-card
name: YouTube Audio
show_format: true
show_seek: true
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | - | Media player entity ID (optional, shows selector if not set) |
| `name` | string | "ytube-audio" | Card title |
| `show_format` | boolean | false | Show format selector |
| `show_seek` | boolean | true | Show seek slider |
| `max_visible` | number | 5 | Maximum visible queue items |

### With a specific media player

```yaml
type: custom:ytube-audio-card
entity: media_player.living_room_speaker
name: Living Room Audio
show_format: true
show_seek: true
```

## Requirements

- [ytube-audio integration](https://github.com/jcdietrich/ytube-audio) must be installed and configured

## License

MIT
