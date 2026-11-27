/** The About page's views. Its own small module, so ⌘K can list them without loading the page. */
export const ABOUT_VIEWS = [
  {
    value: 'architecture',
    label: 'Architecture',
    path: '/about',
    blurb: 'Every service it runs on, and what crosses each line. Select a box for its job, its permissions and its code.',
  },
  {
    value: 'check',
    label: 'Life of a check',
    path: '/about/check',
    blurb: 'One check, from the minute tick to the incident record, in eight steps.',
  },
  {
    value: 'verdicts',
    label: 'Verdicts',
    path: '/about/verdicts',
    blurb: 'How one answer becomes up, down or no evidence, and when a run of failures becomes an incident.',
  },
  {
    value: 'coverage',
    label: 'Coverage',
    path: '/about/coverage',
    blurb: 'The same uptime can rest on very different amounts of evidence. Coverage says how much.',
  },
] as const
