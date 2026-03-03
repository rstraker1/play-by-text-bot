# Play by Text 🎭

Great plays delivered line by line via Telegram.

## How it works

Users find 'Play by Text' on Telegram via username or direct link. They choose a play, then receive it one line at a time — like reading a text conversation. Each line has optional annotations explaining difficult language, context, or other significance.

### Buttons

| Button | Function |
|--------|----------|
| ▽ | Advance to next line |
| 🔍 | Show annotation for current line |
| ⏸ | Manual mode — tap ▽ yourself |
| 🕯️ | Ambient mode — next line arrives in 10–60 min |
| ▶ | Active mode — next line arrives at ~reading pace with pause every 15 lines |

Tapping the mode button cycles through all three modes. Replying `?` to any past line retrieves its annotation.

### Audio narration

Type `/audio` to toggle narration on or off. When on, each line is delivered with a voice message alongside the text. A dedicated narrator voice announces the character name, then the character's own voice reads the line. Stage directions are read entirely by the narrator.

Audio works in all delivery modes. In ambient mode, voice messages accumulate with the text — opening the app to several unread lines will play them back in sequence.

### Commands

| Command | Function |
|---------|----------|
| `/start` | Front page |
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
- **annotation**: Most lines won't need one. Annotate when something would genuinely escape a modern reader: gloss difficult words, explain historical context, identify who's who, or flag structural significance (a callback, a real-world source). Keep it factual and specific. Don't tell readers what to feel about it. Stage directions that belong in the text (e.g. a character kneeling mid-scene) should be their own `"stage"` entry, not buried in an annotation.
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

Example play excerpt:

{
  "id": "tempest",
  "title": "The Tempest",
  "author": "William Shakespeare",
  "emoji": "🌊",
  "description": "magic, shipwreck, and revenge on a remote island",
  "image": "https://raw.githubusercontent.com/rstraker1/play-by-text-bot/master/images/tempest-1-opening-storm.jpg",
  "introAnnotation": "Written around 1610–11, The Tempest is believed to be the last play Shakespeare wrote on his own. It was partly inspired by real accounts of the Sea Venture, an English ship wrecked on Bermuda in 1609 while sailing to the Virginia colony. The play explores power, forgiveness, colonialism, and the nature of art itself — themes that feel remarkably current four centuries later. Unusually for Shakespeare, the plot appears to be entirely original rather than adapted from an existing source.",
  "narrator": "en-GB-ThomasNeural",
  "defaultVoice": "en-GB-RyanNeural",
  "dramatis": [
    "Prospero — the rightful Duke of Milan, exiled to a remote island",
    "Miranda — his daughter, raised on the island",
    "Ariel — a spirit bound to serve Prospero",
    "Caliban — a native of the island, enslaved by Prospero",
    "Alonso — King of Naples",
    "Ferdinand — his son",
    "Sebastian — Alonso's brother",
    "Antonio — Prospero's brother, usurper of his dukedom",
    "Gonzalo — an honest old counselor",
    "Adrian & Francisco — lords attending the King",
    "Trinculo — a jester",
    "Stephano — a drunken butler",
    "Shipmaster — captain of the ship",
    "Boatswain — officer in charge of the deck crew",
    "Iris, Ceres, Juno — spirits appearing in a masque"
  ],
  "characters": {
    "Stage": {
      "emoji": "📜",
      "voice": null
    },
    "Prospero": {
      "emoji": "📖",
      "voice": "en-GB-ElliotNeural"
    },
    "Miranda": {
      "emoji": "✨",
      "voice": "en-GB-LibbyNeural"
    },
    "Ariel": {
      "emoji": "🌬️",
      "voice": "en-GB-SoniaNeural"
    },
    "Caliban": {
      "emoji": "🪨",
      "voice": "en-AU-DarrenNeural"
    },
    "Alonso": {
      "emoji": "👑",
      "voice": "en-GB-RyanNeural"
    },
    "Ferdinand": {
      "emoji": "🪵",
      "voice": "en-US-AndrewNeural"
    },
    "Sebastian": {
      "emoji": "🗡️",
      "voice": "en-US-ChristopherNeural"
    },
    "Antonio": {
      "emoji": "🎭",
      "voice": "en-US-GuyNeural"
    },
    "Gonzalo": {
      "emoji": "🧓",
      "voice": "en-GB-OliverNeural"
    },
    "Adrian": {
      "emoji": "🏛️",
      "voice": "en-US-BrandonNeural"
    },
    "Francisco": {
      "emoji": "🏛️",
      "voice": "en-US-DavisNeural"
    },
    "Trinculo": {
      "emoji": "🃏",
      "voice": "en-IE-ConnorNeural"
    },
    "Stephano": {
      "emoji": "🍷",
      "voice": "en-AU-WilliamNeural"
    },
    "Shipmaster": {
      "emoji": "🚢",
      "voice": "en-AU-WilliamNeural"
    },
    "Boatswain": {
      "emoji": "⚓",
      "voice": "en-GB-AlfieNeural"
    },
    "Iris": {
      "emoji": "🌈",
      "voice": "en-US-JennyNeural"
    },
    "Ceres": {
      "emoji": "🌾",
      "voice": "en-US-AriaNeural"
    },
    "Juno": {
      "emoji": "🕊️",
      "voice": "en-GB-MaisieNeural"
    },
    "Mariners": {
      "emoji": "⛵",
      "voice": "en-GB-AlfieNeural"
    }
  },
  "lines": [
    {
      "type": "stage",
      "sender": "Stage",
      "text": "Act I, Scene 1 — A ship at sea. A tempestuous noise of thunder and lightning heard.",
      "annotation": "The play opens in medias res — in the middle of the action."
    },
    {
      "type": "character",
      "sender": "Shipmaster",
      "text": "Boatswain!",
      "annotation": "Boatswain (pronounced 'BOH-sun'), the officer in charge of the deck crew and rigging."
    },
    {
      "type": "character",
      "sender": "Boatswain",
      "text": "Here, master. What cheer?",
      "annotation": "'What cheer?' means 'What's the situation?' or 'What are your orders?' — a common sailor's greeting."
    },
    {
      "type": "character",
      "sender": "Shipmaster",
      "text": "Good, speak to the mariners. Fall to't yarely, or we run ourselves aground. Bestir, bestir!",
      "annotation": "'Yarely' means quickly, nimbly. 'Bestir' means hurry, get moving."
    },