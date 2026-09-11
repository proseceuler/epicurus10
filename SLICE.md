# Arrodes slices

Work lives on `slice-6-complete` (on top of `slice-5-voice`). `main` is older.

## 0 Spine
Action catalog, undo stack, tool dispatch, `epicure-data-changed`.

## 1 RAG
`search_epicure` with Pinecone + local keyword fallback. Settings reindex. New notes ingest into the notes namespace when Pinecone is configured.

## 2 Tasks + habits
Add / complete / edit tasks. Mark habits. Habit stats. Instant apply + page refresh.

## 3 School
Calendar add, kanban add/move, Class Hub fields + links, attend/skip, grades list/add.

## 4 Notes / flashcards / baon / focus
Add note, add flashcard, start focus. Baon summary. Money writes stay Confirm-gated (expense, allowance, savings goal).

## 5 Voice
Mic to pause detect to Groq Whisper Turbo to the same thread to Fish Audio or browser voice. Type and speak share history. Mic pauses while thinking/speaking.

## 6 Gaps closed
- Flashcard update + delete from chat (CRUD)
- Add habit from chat
- Calendar refreshes after chat writes
- Task edit undo restores the previous row
- New notes try to ingest into Pinecone
- Click mic while Arrodes is speaking to interrupt without turning voice off

Money writes still wait for Confirm. Voice is a cascade, not full-duplex.
