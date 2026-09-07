export type NoteTemplate = {
  id: string;
  name: string;
  description: string;
  title: string;
  content: string;
  folder?: string;
};

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'cornell',
    name: 'Cornell notes',
    description: 'Cues · Notes · Summary',
    title: 'Cornell — ',
    folder: 'Lectures',
    content: `## Cues
- 

## Notes


## Summary
`,
  },
  {
    id: 'quick',
    name: 'Quick capture',
    description: 'Fast inbox note',
    title: 'Capture',
    folder: 'Inbox',
    content: `- `,
  },
  {
    id: 'lecture',
    name: 'Lecture',
    description: 'Class session outline',
    title: 'Lecture — ',
    folder: 'Lectures',
    content: `**Subject:**  
**Date:**  

## Objectives
- 

## Key ideas
1. 

## Examples


## Questions
- 
`,
  },
  {
    id: 'review',
    name: 'Exam review',
    description: 'Topics + weak spots',
    title: 'Review — ',
    folder: 'Exam prep',
    content: `## Topics
- [ ] 

## Weak spots
- 

## Practice
- 
`,
  },
  {
    id: 'reflection',
    name: 'Daily reflection',
    description: 'Wins / friction / tomorrow',
    title: '',
    folder: 'Journal',
    content: `## Wins
- 

## Friction
- 

## Tomorrow
- 
`,
  },
];
