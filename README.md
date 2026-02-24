# Play by Text 🎭

Great plays delivered line by line via Telegram.

## How it works

Users find 'Play by Text' on Telegram via username or direct link.. They choose a play, then receive it one line at a time — like reading a text conversation. Each line has optional annotations explaining unobvious language, context, or other significance.

### Buttons

| Button | Function |
|--------|----------|
| ▽ | Advance to next line |
| 🔍 | Show annotation for current line |
| ⏸ | Manual mode — tap ▽ yourself |
| 🕯️ | Ambient mode — next line arrives in 10–60 min |
|  ▶ | Active mode — next line arrives in ~20 sec |

Tapping the mode button cycles through all three. Replying `?` to any past line also retrieves its annotation.

### Commands

- `/start` — Choose a play
- `/plays` — List available plays
- `/help` — Show help

## Adding new plays

Create a JSON file in the `/plays` folder named `{play-id}.json`.

### Structure

```json
{
  "id": "play-id",
  "title": "Play Title",
  "author": "Author Name",
  "emoji": "🎭",
  "description": "Brief description shown before play starts.",
  "image": "https://url-to-cover-image.jpg",
  "introAnnotation": "Historical context, no spoilers. Shown when user taps 🔍 on the description.",
  "characters": {
    "Stage": "📍",
    "Character Name": "🎭",
    "Another Character": "👑"
  },
  "lines": [
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

### Tips for preparing plays

- **type**: `"stage"` for stage directions (rendered in italics), `"character"` for dialogue
- **characters**: Define each speaker's emoji once here — no need to repeat on every line. Any sender not in the map gets a generic 🎭 fallback.
- **annotation**: Explain archaic words, context, or significance. Optional per line, but valuable.
- **introAnnotation**: Brief, spoiler-free intro — historical context, themes, relevance today. Shows before the first line.
- **image**: Optional cover image URL, shown when the play is selected.
- Keep lines reasonably short — this is messaging, not a book.
- Split long speeches into multiple messages.
- Stage directions like "Exit" or "Enter Mariners" are worth keeping — they give rhythm and breathing room between dialogue.

## Hosting & architecture

### Current setup

- **Platform**: Render (free tier web service)
- **Runtime**: Node.js
- **Webhook**: Telegram webhook, set automatically on startup via `RENDER_EXTERNAL_URL`
- **Keep-alive**: UptimeRobot pings the `/health` endpoint to prevent Render free tier spindown (otherwise the service sleeps after 15 min of inactivity, causing a 30–60 sec cold start on next button press)

### Environment variables

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `RENDER_EXTERNAL_URL` | Public URL of the Render service (e.g. `https://play-by-text-bot.onrender.com`) |

### Key files

- `bot.js` — All bot logic (single file)
- `plays/*.json` — Play data, one file per play
- `images/` — Cover images (referenced by URL in play JSON)

### State & persistence

All user state is held in memory — there is no database. This means state resets on every redeploy or Render restart (including free tier spindowns). However, because each ▽ button embeds the play ID and line index directly in its callback data, the bot doesn't need to remember where a user is — Telegram does.

**Works fine after a restart:**
- Tapping ▽ on any existing message still delivers the correct next line
- Starting a new play works normally

**Resets or breaks after a restart:**
- Delivery mode reverts to manual — users need to toggle back to ambient/active
- Active timers are lost — auto-delivery stops until the user taps ▽ or re-selects a mode
- Replying ? to messages sent before the restart won't retrieve annotations (message map is lost)
- Old message buttons won't get cleaned up on the next advance (previous line keeps its buttons visible)

Database persistence would fix all of the above but isn't necessary at the current scale

## More Ideas

- [ ] User progress persistence (database)
- [ ] Multiple languages
- [ ] Audio for each line (speaker button next to 🔍)
- [ ] Pictures/illustrations at key moments
- [ ] More plays!
- [ ] Visual spacing between messages
- [ ] Explore other Telegram features (polls, reactions, etc.)

## License

Bot code: MIT.

Play texts: Public domain (Shakespeare etc.). Check copyright status before adding modern plays.