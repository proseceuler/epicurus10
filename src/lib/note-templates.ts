export type NoteTemplate = {
  id: string;
  name: string;
  description: string;
  title: string;
  content: string;
  folder?: string;
};

/** Kepano-style defaults: few folders, YAML properties, plural categories as [[links]]. */
export const VAULT_FOLDERS = ['Notes', 'Daily', 'Categories', 'Templates', 'References', 'Clippings'] as const;

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'evergreen',
    name: 'Evergreen',
    description: 'Idea note \u2014 properties + links',
    title: '',
    folder: 'Notes',
    content: `---\ncreated: {{date}}\ncategories:\n  - \"[[Ideas]]\"\ntags:\n  - evergreen\n---\n\n# {{title}}\n\nLink the first mention of anything: [[]]\n`,
  },
  {
    id: 'daily',
    name: 'Daily note',
    description: 'YYYY-MM-DD hub (link here, write elsewhere)',
    title: '',
    folder: 'Daily',
    content: `---\ncreated: {{date}}\ntags:\n  - daily\n---\n\n## Notes\n\n- Linked from today\n`,
  },
  {
    id: 'category',
    name: 'Category',
    description: 'Map of content for one plural category',
    title: '',
    folder: 'Categories',
    content: `---\ntags:\n  - category\n---\n\n# {{title}}\n\nNotes in this category:\n\n- \n`,
  },
  {
    id: 'person',
    name: 'Person',
    description: 'Someone you study with or cite',
    title: '',
    folder: 'References',
    content: `---\ncategories:\n  - \"[[People]]\"\ncreated: {{date}}\ntags: []\n---\n\n# {{title}}\n\n## Context\n\n## Notes\n`,
  },
  {
    id: 'book',
    name: 'Book',
    description: 'Reference with rating (1\u20137 like Kepano)',
    title: '',
    folder: 'References',
    content: `---\ncategories:\n  - \"[[Books]]\"\nauthor: []\nyear:\nrating:\ntopics: []\ncreated: {{date}}\ntags:\n  - to-read\n---\n\n# {{title}}\n\n## Notes\n`,
  },
  {
    id: 'lecture',
    name: 'Class / lecture',
    description: 'One session, linked to a subject',
    title: 'Lecture \u2014 ',
    folder: 'Notes',
    content: `---\ncategories:\n  - \"[[Classes]]\"\ncreated: {{date}}\nsubject:\ntags: []\n---\n\n**Subject:**  \n**Date:** {{date}}\n\n## Objectives\n- \n\n## Key ideas\n1. \n\n## Questions\n- \n`,
  },
  {
    id: 'cornell',
    name: 'Cornell notes',
    description: 'Cues \u00b7 Notes \u00b7 Summary',
    title: 'Cornell \u2014 ',
    folder: 'Notes',
    content: `---\ncategories:\n  - \"[[Classes]]\"\ncreated: {{date}}\n---\n\n## Cues\n- \n\n## Notes\n\n\n## Summary\n`,
  },
  {
    id: 'clipping',
    name: 'Clipping',
    description: 'Saved article or excerpt',
    title: '',
    folder: 'Clippings',
    content: `---\ncategories:\n  - \"[[Clippings]]\"\ncreated: {{date}}\nurl:\nvia:\ntags: []\n---\n\n# {{title}}\n\n> Quote\n\n## Why it matters\n`,
  },
  {
    id: 'quick',
    name: 'Quick capture',
    description: 'Inbox fragment \u2014 promote later',
    title: 'Capture',
    folder: 'Notes',
    content: `---\ncreated: {{date}}\ntags:\n  - inbox\n---\n\n- \n`,
  },
];

export function fillTemplate(content: string, title = '') {
  const date = new Date().toISOString().slice(0, 10);
  return content.replaceAll('{{date}}', date).replaceAll('{{title}}', title);
}
