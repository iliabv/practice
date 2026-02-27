# Dutch Language Learning App

A simple static website for learning Dutch through interactive text and pronunciation practice.

## Core Concept

On first load, the page displays an empty input box. You paste in Dutch text (one sentence or multiple paragraphs), hit "start", and the client-side logic parses it into an interactive two-column layout:

- **Left column:** The original Dutch text
- **Right column:** Contextual information (initially empty)

## Sentence Interaction

When you click on any sentence in the left column, the right side shows a large **play button**

## Pronunciation Practice Loop

1. **First press:** Plays the dutch pronunciation of the selected sentence, then beeps once and starts recording.
2. **During recording:** The play button turns into a stop button. Click it when you're done recording your version.
3. **After recording:** The button turns back to "play".
4. **Subsequent presses:** Plays your recorded version first, then the original dutch pronunciation after a pause, then beeps and enters recording mode again. Click to stop.

This loop can be repeated as many times as you want.

## Progress Indicators

After each loop completes:

- Show a **counter** or visual indicator (e.g., a new segment on the button, a color change, or all of the above)
- **Highlight the sentence** background (in the left column), starting at orange and gradually transitioning to green (fully green after 5 loops)

The user can do this with any sentence in the text.

## Progress State
Store progress state in local strorage, so when the user reloads the bebsite it should see the most recent text it entered, with all the sentences higlighted appropriately, depending on how many times the user made the "loop" for them.

Entering new text in the input box resets the state.


## API
Use elevenlabs API and their @elevenlabs/elevenlabs-js package
At the top of the website there shuild be another input where a user can type their eleven labs API key. Error out if the user click on "start" or "play", but the api key is not there.