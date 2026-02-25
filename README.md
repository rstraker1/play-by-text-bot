# Play by Text 🎭

Great plays delivered line by line via Telegram.

## How it works

Users find 'Play by Text' on Telegram via username or direct link. They choose a play, then receive it one line at a time — like reading a text conversation. Each line has optional annotations explaining unobvious language, context, or other significance.

### Buttons

| Button | Function |
|--------|----------|
| ▽ | Advance to next line |
| 🔍 | Show annotation for current line |
| ⏸ | Manual mode — tap ▽ yourself |
| 🕯️ | Ambient mode — next line arrives in 10–60 min |
| ▶ | Active mode — next line arrives at ~reading pace |

Tapping the mode button cycles through all three modes. Replying `?` to any past line retrieves its annotation.

### Audio narration

Type `/audio` to toggle narration on or off. When on, each line is delivered with a voice message alongside the text. A dedicated narrator voice announces the character name, then the character's own voice reads the line. Stage directions are read entirely by the narrator.

Audio works in all delivery modes. In ambient mode, voice messages accumulate with the text — opening the app to several unread lines will play them back in sequence.

### Commands

| Command | Function |
|---------|----------|
| `/start` | Choose a play |
| `/plays` | List available plays |
| `/cast` | Show cast of current play |
| `/scenes` | Jump to a scene |
| `/audio` | Toggle audio narration on/off |
| `/help` | Show help |

## Adding new plays

Create a JSON file in the `/plays` folder named `{play-id}.json`.

### Structure

```json
{
  "id": "play-id",
  "title": "Play Title",
  "author": "Author Name",
  "emoji": "🎭",
  "description": "A general pitch for the play — shown when the user selects it.",
  "image": "https://url-to-cover-image.jpg",
  "introAnnotation": "Brief, spoiler free intro. Notes of interest, historical context, current relevance, etc.",
  "narrator": "en-GB-ThomasNeural",
  "defaultVoice": "en-GB-RyanNeural",
  "characters": {
    "Stage": { "emoji": "📜" },
    "Character Name": { "emoji": "🎭", "voice": "en-GB-RyanNeural" },
    "Another Character": { "emoji": "👑", "voice": "en-US-GuyNeural" }
  },
  "lines": [
    {
      "type": "stage",
      "sender": "Stage",
      "text": "Act I, Scene 1 — A brief location description."
    },
    {
      "type": "stage",
      "sender": "Stage",
      "text": "Stage direction in italics.",
      "annotation": "Explanation of this stage direction."
    },
    {
      "type": "character",
      "sender": "Character Name",
      "text": "The character's line.",
      "annotation": "Explanation of this line."
    }
  ]
}
```

### Scene headings

Each scene should begin with a stage direction line starting with "Act" — e.g. `"Act I, Scene 1 — A ship at sea."` or `"Act II — The nursery. Dawn."` for plays without scene divisions. The bot scans for these at load time to build the `/scenes` navigation index automatically. No extra metadata needed — just follow the convention and it works.

### Voice configuration

Audio uses [Microsoft Edge TTS](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts) via the `node-edge-tts` package — free, no API key required.

| Field | Purpose |
|-------|---------|
| `narrator` | Voice for name announcements and stage directions (default: `en-GB-ThomasNeural`) |
| `defaultVoice` | Fallback voice for characters without a specific voice (default: `en-GB-RyanNeural`) |
| `characters.{name}.voice` | Character-specific voice |

Choose voices from [Microsoft's neural voice list](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts). Pick voices with distinct accents, genders, or ages so characters are distinguishable. The narrator should sound different from all characters.

The characters map also accepts plain emoji strings (`"Boatswain": "⚓"`) for backward compatibility — these characters will use `defaultVoice` for audio.

### Tips for preparing plays

- **type**: `"stage"` for stage directions (rendered in italics), `"character"` for dialogue.
- **characters**: Define each speaker's emoji and voice once here — no need to repeat on every line.
- **annotation**: Explain archaic words, context, or significance. Optional per line, but valuable. Lines without annotations simply won't show the 🔍 button.
- **image**: Optional cover image URL, shown when the play is selected.
- Keep lines reasonably short — this is messaging, not a book.
- Split long speeches into multiple messages.
- Stage directions like "Exit" or "Enter Mariners" are worth keeping — they give rhythm and breathing room.

## Hosting & architecture

### Current setup

- **Platform**: Render (free tier web service)
- **Runtime**: Node.js
- **Webhook**: Telegram webhook, set automatically on startup via `RENDER_EXTERNAL_URL`
- **Keep-alive**: UptimeRobot pings the `/health` endpoint to prevent Render free tier spindown

### Environment variables

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `RENDER_EXTERNAL_URL` | Public URL of the Render service |

### Key files

- `bot.js` — All bot logic (single file)
- `plays/*.json` — Play data, one file per play
- `images/` — Cover images (referenced by URL in play JSON)

### State & persistence

All user state is held in memory — no database. State resets on redeploy or restart. However, each ▽ button embeds the play ID and line index in its callback data, so Telegram remembers where the user is even after a restart.

TTS audio is cached by Telegram file_id after first generation — subsequent sends of the same line (to any user) are instant.

**Works fine after a restart:**
- Tapping ▽ on any existing message still delivers the correct next line
- Starting a new play works normally
- Audio preference resets to off (default)