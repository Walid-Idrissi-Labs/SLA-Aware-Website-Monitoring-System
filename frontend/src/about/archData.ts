import type { LucideIcon } from 'lucide-react'
import {
  AppWindow,
  Archive,
  BookOpen,
  CalendarClock,
  Database,
  FileClock,
  Globe,
  KeyRound,
  Lock,
  Mail,
  Network,
  PencilLine,
  Radar,
  ScrollText,
  Timer,
  Triangle,
  UserRoundCheck,
} from 'lucide-react'
import proofs from './archProof.json' with { type: 'json' }

/**
 * The architecture as drawn on the About page (board #12). Every box, line and
 * grant here was read off the Terraform and the handlers, not the original
 * design notes. Geometry is hand-placed on a fixed canvas; the viewport scales it.
 */

export const REPO = 'https://github.com/Walid-Idrissi-Labs/SLA-Aware-Website-Monitoring-System'

export type LayerId = 'signin' | 'api' | 'pipeline' | 'reports' | 'logs'

export const LAYERS: { id: LayerId | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'signin', label: 'Sign-in' },
  { id: 'api', label: 'Dashboard & API' },
  { id: 'pipeline', label: 'Check pipeline' },
  { id: 'reports', label: 'Reports' },
  { id: 'logs', label: 'Logs' },
]

export const TABLES = ['Users', 'Projects', 'Checks', 'Incidents', 'Reports'] as const
export type Table = (typeof TABLES)[number]

export interface Proof {
  path: string
  symbol: string
  label: string
}

export type Group = 'outside' | 'edge' | 'functions' | 'state'

export interface ArchNode {
  id: string
  title: string
  /** Mono subtitle under the title. */
  sub: string
  icon: LucideIcon
  x: number
  y: number
  w: number
  h: number
  group: Group
  /** Not ours: drawn dashed, outside the AWS frame. */
  external?: boolean
  /** Layers that light this box even without a lit line (logs have no lines). */
  layers?: LayerId[]
  what: string
  trigger?: string
  /** IAM actions actually granted, per resource. */
  grants?: string[]
  routes?: { method: string; path: string }[]
  proof?: Proof[]
}

export interface ArchEdge {
  id: string
  from: string
  to: string
  /** Short label on the canvas. */
  label: string
  /** The full sentence, for the detail panel and the list view. */
  detail: string
  /** Conditional: only on a transition, on demand, or when something is missing. */
  dashed?: boolean
  layers: LayerId[]
  points: [number, number][]
  labelAt?: [number, number]
  tables?: Table[]
}

export interface Step {
  title: string
  body: string
  edges: string[]
  nodes: string[]
}

// ── Canvas ──────────────────────────────────────────────────────────────────
export const W = 1560
export const H = 636
export const FRAME = { x: 36, y: 116, w: 1264, h: 496 }

const N = 56 // node height
const W1 = 164 // top row and first band
const W2 = 184 // functions
const Y0 = 24
const Y1 = 160
const Y2 = 300
const Y3 = 440
const Y4 = 540

const box = (x: number, y: number, w: number, h = N) => ({ x, y, w, h })

const node = (n: Omit<ArchNode, 'proof'>): ArchNode => ({
  ...n,
  proof: (proofs as Record<string, Proof[]>)[n.id],
})

const LAMBDA_LOGS: LayerId[] = ['logs']

export const NODES: ArchNode[] = [
  // Outside AWS
  node({
    id: 'browser',
    title: 'Browser',
    sub: 'React app',
    icon: AppWindow,
    ...box(268, Y0, W1),
    group: 'outside',
    external: true,
    what: 'The dashboard you are using: a React single-page app. It signs you in, then sends your ID token with every API call.',
  }),
  node({
    id: 'google',
    title: 'Google',
    sub: 'OIDC provider',
    icon: UserRoundCheck,
    ...box(60, Y0, W1),
    group: 'outside',
    external: true,
    what: 'An optional way to sign in. Cognito federates it, so a Google account becomes a Cognito user with the same kind of token.',
  }),
  node({
    id: 'vercel',
    title: 'Vercel',
    sub: 'static hosting',
    icon: Triangle,
    ...box(476, Y0, W1),
    group: 'outside',
    external: true,
    what: 'Serves the built app, its HTML, JavaScript and CSS, from its edge network. It holds no data and runs no server code of ours.',
  }),
  node({
    id: 'sites',
    title: 'Monitored websites',
    sub: 'your endpoints',
    icon: Globe,
    ...box(1336, Y2, 200),
    group: 'outside',
    external: true,
    what: 'The endpoints you add, anywhere on the internet. Each one gets a GET every minute and a TLS certificate check every six hours.',
  }),

  // First band: the front door, files, the clock and mail
  node({
    id: 'cognito',
    title: 'Cognito',
    sub: 'user pool',
    icon: KeyRound,
    ...box(60, Y1, W1),
    group: 'edge',
    what: 'Owns accounts and issues the signed ID tokens. Password sign-in uses SRP, so signing in never sends the password itself; Google sign-in uses the code flow with PKCE.',
    trigger: 'Sign-in and sign-up from the app',
  }),
  node({
    id: 'apigw',
    title: 'API Gateway',
    sub: '14 routes',
    icon: Network,
    ...box(268, Y1, W1),
    group: 'edge',
    layers: ['logs'],
    what: 'The front door. A JWT authorizer checks every token against Cognito’s public keys before any function runs; only GET /health is public. It also writes an access log.',
    trigger: 'Every API call from the app',
  }),
  node({
    id: 's3',
    title: 'S3',
    sub: 'report files',
    icon: Archive,
    ...box(476, Y1, W1),
    group: 'state',
    what: 'Holds every report as HTML and JSON. The bucket is private: downloads use a link signed for five minutes.',
  }),
  node({
    id: 'eventbridge',
    title: 'EventBridge',
    sub: '3 schedules',
    icon: CalendarClock,
    ...box(684, Y1, W1),
    group: 'edge',
    what: 'The clock: one rule every minute, one at the top of every hour, one on Mondays at 08:00 UTC. Each invokes its function directly, with no queue in between.',
  }),
  node({
    id: 'ssm',
    title: 'Parameter Store',
    sub: 'config',
    icon: Lock,
    ...box(888, Y1, 176),
    group: 'state',
    what: 'Holds the address the emails are sent from. The two functions that send mail read it at run time, so it never sits in code.',
  }),
  node({
    id: 'ses',
    title: 'SES',
    sub: 'email',
    icon: Mail,
    ...box(1100, Y1, W1),
    group: 'state',
    what: 'Sends the DOWN and UP alerts, and the weekly report to each endpoint’s owner.',
  }),

  // Functions
  node({
    id: 'pm',
    title: 'Project Manager',
    sub: 'Lambda · writes',
    icon: PencilLine,
    ...box(60, Y2, W2),
    group: 'functions',
    layers: LAMBDA_LOGS,
    what: 'Handles every write: creating, editing and pausing endpoints, your profile, and on-demand reports. It validates every field before anything is written.',
    trigger: '6 write routes, through API Gateway',
    grants: [
      'Users: GetItem, PutItem, UpdateItem',
      'Projects: GetItem, PutItem, UpdateItem',
      'Report Generator: InvokeFunction',
    ],
    routes: [
      { method: 'POST', path: '/me' },
      { method: 'PUT', path: '/me' },
      { method: 'POST', path: '/projects' },
      { method: 'PUT', path: '/projects/{id}' },
      { method: 'DELETE', path: '/projects/{id}' },
      { method: 'POST', path: '/projects/{id}/reports' },
    ],
  }),
  node({
    id: 'api',
    title: 'API',
    sub: 'Lambda · reads',
    icon: BookOpen,
    ...box(315, Y2, W2),
    group: 'functions',
    layers: LAMBDA_LOGS,
    what: 'Serves every read: your profile, endpoints, checks, incidents and reports. It signs report downloads, and rebuilds a report file that has gone missing.',
    trigger: '8 read routes, through API Gateway',
    grants: [
      'Users: GetItem',
      'Projects: GetItem, Query (+ user index)',
      'Checks, Incidents: Query',
      'Reports: GetItem, Query',
      'S3 reports/: GetObject, ListBucket',
      'Report Generator: InvokeFunction',
    ],
    routes: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/me' },
      { method: 'GET', path: '/projects' },
      { method: 'GET', path: '/projects/{id}' },
      { method: 'GET', path: '/projects/{id}/status' },
      { method: 'GET', path: '/projects/{id}/incidents' },
      { method: 'GET', path: '/projects/{id}/reports' },
      { method: 'GET', path: '/projects/{id}/reports/{report_id}/download' },
    ],
  }),
  node({
    id: 'reporter',
    title: 'Report Generator',
    sub: 'Lambda · reports',
    icon: FileClock,
    ...box(570, Y2, W2),
    group: 'functions',
    layers: LAMBDA_LOGS,
    what: 'Builds SLA reports: uptime, latency percentiles, incidents, evidence coverage and the verdict against your targets. Weekly for every active endpoint, emailed to its owner; on demand for 1, 7 or 30 days; and as a rebuild when a file is missing.',
    trigger: 'Mondays 08:00 UTC, or invoked by the API and the Project Manager',
    grants: [
      'Projects: Scan, GetItem',
      'Checks, Incidents: Query',
      'Reports: PutItem, GetItem',
      'S3 reports/: PutObject',
      'SES: SendEmail',
      'Parameter Store: GetParameter',
    ],
  }),
  node({
    id: 'processor',
    title: 'SLA Processor',
    sub: 'Lambda · hourly',
    icon: Timer,
    ...box(825, Y2, W2),
    group: 'functions',
    layers: LAMBDA_LOGS,
    what: 'Turns failure runs into incident records. It reads the last two hours of checks, opens an incident when a run reaches the threshold, and closes it at the first passing check.',
    trigger: 'Every hour at :00 UTC',
    grants: ['Projects: Scan', 'Checks: Query', 'Incidents: Query, PutItem, UpdateItem'],
  }),
  node({
    id: 'monitor',
    title: 'Monitor',
    sub: 'Lambda · every min',
    icon: Radar,
    ...box(1080, Y2, W2),
    group: 'functions',
    layers: LAMBDA_LOGS,
    what: 'Probes every active endpoint in parallel and calls each answer up, down or no evidence. When enough checks fail in a row it emails the owner, and again when the endpoint recovers.',
    trigger: 'Every minute',
    grants: [
      'Projects: Scan, UpdateItem',
      'Checks: PutItem, Query',
      'SES: SendEmail',
      'Parameter Store: GetParameter',
    ],
  }),

  // State
  node({
    id: 'dynamo',
    title: 'DynamoDB',
    sub: '5 tables · on demand',
    icon: Database,
    ...box(60, Y3, 1204, 72),
    group: 'state',
    what: 'All state lives here: users, endpoints, checks, incidents and reports. Checks expire after 90 days; everything else is kept.',
  }),
  node({
    id: 'logs',
    title: 'CloudWatch Logs',
    sub: 'every function + API access log',
    icon: ScrollText,
    ...box(60, Y4, 1204, 44),
    group: 'state',
    layers: LAMBDA_LOGS,
    what: 'Every function logs here, and API Gateway writes an access log. Each log group has its own retention, so nothing piles up.',
  }),
]

export const EDGES: ArchEdge[] = [
  // Sign-in
  {
    id: 'browser-cognito',
    from: 'browser',
    to: 'cognito',
    label: 'sign in',
    detail: 'Password sign-in over SRP, or Google through Cognito with the code flow and PKCE.',
    layers: ['signin'],
    points: [[268, 64], [246, 64], [246, 180], [224, 180]],
    labelAt: [246, 98],
  },
  {
    id: 'google-cognito',
    from: 'google',
    to: 'cognito',
    label: 'federation',
    detail: 'Cognito federates Google sign-in and issues its own tokens.',
    dashed: true,
    layers: ['signin'],
    points: [[142, 80], [142, 160]],
    labelAt: [142, 98],
  },
  {
    id: 'apigw-cognito',
    from: 'apigw',
    to: 'cognito',
    label: 'JWT',
    detail: 'The authorizer checks each token’s signature against Cognito’s public keys, and its issuer, audience and expiry, before any function runs.',
    layers: ['signin', 'api'],
    points: [[268, 200], [224, 200]],
  },

  // Dashboard & API
  {
    id: 'browser-vercel',
    from: 'browser',
    to: 'vercel',
    label: 'app',
    detail: 'Loads the app itself: HTML, JavaScript and CSS.',
    layers: ['api'],
    points: [[432, 52], [476, 52]],
  },
  {
    id: 'browser-apigw',
    from: 'browser',
    to: 'apigw',
    label: 'HTTPS + token',
    detail: 'Every API call carries the Cognito ID token as a Bearer header.',
    layers: ['api'],
    points: [[340, 80], [340, 160]],
    labelAt: [340, 98],
  },
  {
    id: 'apigw-api',
    from: 'apigw',
    to: 'api',
    label: '8 read routes',
    detail: 'Eight GET routes go to the API function.',
    layers: ['api'],
    points: [[400, 216], [400, 300]],
  },
  {
    id: 'apigw-pm',
    from: 'apigw',
    to: 'pm',
    label: '6 write routes',
    detail: 'Six POST, PUT and DELETE routes go to the Project Manager.',
    layers: ['api'],
    points: [[290, 216], [290, 258], [152, 258], [152, 300]],
  },
  {
    id: 'api-dynamo',
    from: 'api',
    to: 'dynamo',
    label: 'read',
    detail: 'Reads Users, Projects (through the per-user index), Checks, Incidents and Reports.',
    layers: ['api'],
    points: [[407, 356], [407, 440]],
    tables: ['Users', 'Projects', 'Checks', 'Incidents', 'Reports'],
  },
  {
    id: 'pm-dynamo',
    from: 'pm',
    to: 'dynamo',
    label: 'write',
    detail: 'Writes Users and Projects. Deleting an endpoint only marks it inactive; its history stays.',
    layers: ['api'],
    points: [[152, 356], [152, 440]],
    tables: ['Users', 'Projects'],
  },

  // Reports
  {
    id: 'api-s3',
    from: 'api',
    to: 's3',
    label: 'presign',
    detail: 'Checks the report file exists, then signs a download link valid for five minutes.',
    dashed: true,
    layers: ['reports'],
    points: [[480, 300], [480, 216]],
    labelAt: [480, 246],
  },
  {
    id: 'browser-s3',
    from: 'browser',
    to: 's3',
    label: 'download',
    detail: 'The browser fetches the file straight from S3 with the signed link.',
    dashed: true,
    layers: ['reports'],
    points: [[420, 80], [420, 100], [540, 100], [540, 160]],
  },
  {
    id: 'api-reporter',
    from: 'api',
    to: 'reporter',
    label: 'rebuild',
    detail: 'When a report file is missing, the API invokes the Report Generator and waits for it to rebuild the file.',
    dashed: true,
    layers: ['reports'],
    points: [[499, 328], [570, 328]],
  },
  {
    id: 'pm-reporter',
    from: 'pm',
    to: 'reporter',
    label: 'on demand',
    detail: 'Generate report: the Project Manager invokes the Report Generator and waits, for the last 1, 7 or 30 days.',
    dashed: true,
    layers: ['reports'],
    points: [[230, 356], [230, 392], [620, 392], [620, 356]],
    labelAt: [520, 392],
  },
  {
    id: 'eventbridge-reporter',
    from: 'eventbridge',
    to: 'reporter',
    label: 'Mon 08:00',
    detail: 'cron(0 8 ? * MON *): the weekly reports, emailed.',
    layers: ['reports'],
    points: [[720, 216], [720, 300]],
    labelAt: [720, 266],
  },
  {
    id: 'reporter-s3',
    from: 'reporter',
    to: 's3',
    label: 'HTML + JSON',
    detail: 'Writes each report file in both formats.',
    layers: ['reports'],
    points: [[600, 300], [600, 216]],
    labelAt: [600, 246],
  },
  {
    id: 'reporter-dynamo',
    from: 'reporter',
    to: 'dynamo',
    label: 'report rows',
    detail: 'Reads the checks, the incidents and the previous week’s report; writes the report row.',
    layers: ['reports'],
    points: [[662, 356], [662, 440]],
    tables: ['Projects', 'Checks', 'Incidents', 'Reports'],
  },
  {
    id: 'reporter-ses',
    from: 'reporter',
    to: 'ses',
    label: 'weekly email',
    detail: 'Emails each weekly report to its endpoint’s owner.',
    dashed: true,
    layers: ['reports'],
    points: [[745, 300], [745, 236], [1130, 236], [1130, 216]],
    labelAt: [1060, 236],
  },
  {
    id: 'reporter-ssm',
    from: 'reporter',
    to: 'ssm',
    label: 'sender',
    detail: 'Reads the sender address before sending the weekly email.',
    dashed: true,
    layers: ['reports'],
    points: [[745, 300], [745, 236], [960, 236], [960, 216]],
  },

  // Check pipeline
  {
    id: 'eventbridge-monitor',
    from: 'eventbridge',
    to: 'monitor',
    label: 'every minute',
    detail: 'rate(1 minute): every minute, around the clock.',
    layers: ['pipeline'],
    points: [[766, 160], [766, 134], [1290, 134], [1290, 320], [1264, 320]],
    labelAt: [1030, 134],
  },
  {
    id: 'eventbridge-processor',
    from: 'eventbridge',
    to: 'processor',
    label: 'hourly',
    detail: 'cron(0 * * * ? *): at :00 every hour.',
    layers: ['pipeline'],
    points: [[838, 216], [838, 300]],
    labelAt: [838, 266],
  },
  {
    id: 'monitor-sites',
    from: 'monitor',
    to: 'sites',
    label: 'GET + TLS',
    detail: 'One GET per endpoint per minute, with a 10-second timeout and up to three redirects, plus a TLS certificate check every six hours.',
    layers: ['pipeline'],
    points: [[1264, 340], [1336, 340]],
  },
  {
    id: 'monitor-dynamo',
    from: 'monitor',
    to: 'dynamo',
    label: 'checks',
    detail: 'Scans the active projects; writes each check (kept 90 days) and the day’s tally; reads the recent streak; caches the TLS certificate.',
    layers: ['pipeline'],
    points: [[1172, 356], [1172, 440]],
    tables: ['Projects', 'Checks'],
  },
  {
    id: 'monitor-ses',
    from: 'monitor',
    to: 'ses',
    label: 'DOWN / UP',
    detail: 'Emails the owner when N checks in a row fail, and again on the first passing check after.',
    dashed: true,
    layers: ['pipeline'],
    points: [[1200, 300], [1200, 216]],
    labelAt: [1200, 266],
  },
  {
    id: 'monitor-ssm',
    from: 'monitor',
    to: 'ssm',
    label: 'sender',
    detail: 'Reads the sender address before sending an alert.',
    dashed: true,
    layers: ['pipeline'],
    points: [[1110, 300], [1110, 258], [1000, 258], [1000, 216]],
  },
  {
    id: 'processor-dynamo',
    from: 'processor',
    to: 'dynamo',
    label: 'incidents',
    detail: 'Reads the last two hours of checks; opens and closes the incident records.',
    layers: ['pipeline'],
    points: [[917, 356], [917, 440]],
    tables: ['Projects', 'Checks', 'Incidents'],
  },
]

export const STEPS: Step[] = [
  {
    title: 'The minute tick',
    body: 'EventBridge invokes the Monitor once a minute. There is no queue: the schedule calls the function directly.',
    edges: ['eventbridge-monitor'],
    nodes: ['eventbridge', 'monitor'],
  },
  {
    title: 'Load the endpoints',
    body: 'The Monitor scans the projects table for active endpoints, with each one’s accepted statuses and failure threshold.',
    edges: ['monitor-dynamo'],
    nodes: ['monitor', 'dynamo'],
  },
  {
    title: 'Probe every site',
    body: 'One GET per endpoint, eight at a time, with a 10-second timeout and up to three redirects. Every six hours it also reads the TLS certificate.',
    edges: ['monitor-sites'],
    nodes: ['monitor', 'sites'],
  },
  {
    title: 'Call the verdict',
    body: 'An accepted status is up. A bot-challenge page is no evidence, not down. Any other status, a timeout, or a DNS, connection or TLS error is down.',
    edges: ['monitor-sites'],
    nodes: ['monitor'],
  },
  {
    title: 'Store the evidence',
    body: 'Each check is written with the accepted statuses of that moment, so changing them later never rewrites history, and with when its run and its probe started. The day’s tally is updated too.',
    edges: ['monitor-dynamo'],
    nodes: ['monitor', 'dynamo'],
  },
  {
    title: 'Alert on a change',
    body: 'The Monitor reads the recent streak. Three failures in a row (the default threshold) send a DOWN email; the first passing check after sends UP. A no-evidence check breaks the run.',
    edges: ['monitor-dynamo', 'monitor-ssm', 'monitor-ses'],
    nodes: ['monitor', 'ssm', 'ses'],
  },
  {
    title: 'Record the incident',
    body: 'At the top of the hour the SLA Processor reads the last two hours of checks and opens or closes the incident record.',
    edges: ['eventbridge-processor', 'processor-dynamo'],
    nodes: ['eventbridge', 'processor', 'dynamo'],
  },
  {
    title: 'Show it',
    body: 'The dashboard reads it all through API Gateway, which checks your token first.',
    edges: ['browser-apigw', 'apigw-cognito', 'apigw-api', 'api-dynamo'],
    nodes: ['browser', 'apigw', 'api', 'dynamo'],
  },
]

export const nodeById = new Map(NODES.map((n) => [n.id, n]))
