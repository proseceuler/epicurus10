# Remix of Remix of Study Buddy Hub

Add a new Study Assistant page to this existing project.

Create src/pages/StudyAssistantPage.tsx with a clean chat interface that supports multiple AI modes:

Modes (user can switch between them):

1. Study Assistant – general academic help for Grade 10 subjects

2. Coding Agent – help with code, debugging, explanations, and small projects

3. Writing Helper – essays, paragraphs, grammar, and improving writing

4. Math Solver – step-by-step solutions and explanations

5. Summarizer – summarize notes, lessons, or long text

6. Flashcard Generator – turn topics or notes into flashcards

Technical requirements:

- Use OpenRouter API key + selected model from localStorage (already stored in Settings)

- Support these free models:

  - nvidia/nemotron-3-ultra-550b-a55b:free

  - nvidia/nemotron-3.5-lightning:free

  - poolside/laguna-s-2.1:free

  - google/gemma-4-31b-it:free (vision)

  - nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free (multimodal)

- Allow image upload when a vision model is selected

- Streaming responses + stop button

- Different system prompts for each mode

- Keep chat history per mode

- Add the page to App.tsx and to the sidebar in AppLayout under Academic (use Bot or MessageSquare icon)

- Optional: add a quick “Ask AI” button in the GlobalDock

Keep the existing glass UI style. Do not break any current features.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/03928e6c-6b92-405a-b155-f54617cd11b1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
