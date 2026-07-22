import type { ReactNode } from 'react'
import {
  KeyRound,
  Network,
  Zap,
  Database,
  CalendarClock,
  Mail,
  Globe,
  Lock,
  ScrollText,
  ShieldCheck,
  Layers,
  Radar,
  Timer,
  FileClock,
} from 'lucide-react'
import Shell from '../components/Shell'

interface Service {
  name: string
  tag?: string
  icon: ReactNode
  desc: string
}

const STACK: Service[] = [
  {
    name: 'Cognito',
    tag: 'Auth',
    icon: <KeyRound className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'Handles sign-up, login, and Google sign-in. Every request to the API carries a Cognito token that gets checked before any code runs.',
  },
  {
    name: 'API Gateway',
    tag: 'HTTP API',
    icon: <Network className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'The front door for the API. It validates the token, and only then routes the request to the function that owns that route.',
  },
  {
    name: 'Lambda',
    tag: '5 functions',
    icon: <Zap className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'All of the logic, split into five functions with one job each: checking sites, detecting incidents, writing reports, reads, and writes.',
  },
  {
    name: 'DynamoDB',
    tag: '5 tables',
    icon: <Database className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'Where the state lives: users, projects, checks, incidents, and reports. On-demand billing, so there is no capacity to tune.',
  },
  {
    name: 'EventBridge',
    tag: 'Scheduler',
    icon: <CalendarClock className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'The clock behind the automation. It fires the monitor every minute, the processor every hour, and the reporter every Monday.',
  },
  {
    name: 'SES',
    tag: 'Email',
    icon: <Mail className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'Sends the downtime and recovery alerts and the weekly SLA report, straight from Lambda to your inbox.',
  },
  {
    name: 'S3 + CloudFront',
    tag: 'Delivery',
    icon: <Globe className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'S3 stores this dashboard and the generated report files. CloudFront serves the front end over HTTPS from the edge.',
  },
  {
    name: 'SSM Parameter Store',
    tag: 'Config',
    icon: <Lock className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'Keeps the sender email address out of the source and out of plain-text environment variables.',
  },
  {
    name: 'CloudWatch Logs',
    tag: 'Observability',
    icon: <ScrollText className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'Every function logs here as structured JSON, with retention set per group so the logs never pile up forever.',
  },
  {
    name: 'IAM',
    tag: 'Access',
    icon: <ShieldCheck className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'One role per function, each scoped to exactly the tables and actions it needs. Nothing shares a role.',
  },
  {
    name: 'Terraform',
    tag: 'Infra as code',
    icon: <Layers className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'The whole system is defined as code. A single apply builds every resource above from nothing, and can tear it back down.',
  },
]

interface Job {
  cadence: string
  title: string
  icon: ReactNode
  desc: string
}

const JOBS: Job[] = [
  {
    cadence: 'every minute',
    title: 'Monitor',
    icon: <Radar className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'Sends an HTTP check to every active endpoint, records the status and latency, and emails you the moment a site goes down or comes back.',
  },
  {
    cadence: 'every hour',
    title: 'SLA Processor',
    icon: <Timer className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'Reads the recent checks, groups runs of failures into incidents, and closes them out again once the site recovers.',
  },
  {
    cadence: 'every Monday, 08:00 UTC',
    title: 'Report Generator',
    icon: <FileClock className="h-4 w-4" strokeWidth={1.75} />,
    desc: 'Rolls the past seven days into one SLA report with uptime, average and p95 latency, incident count, and total downtime, then emails it.',
  },
]

const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: 'Fully serverless',
    body: 'No EC2, no containers, no database to keep alive. It scales down to nothing when idle and costs close to nothing at rest.',
  },
  {
    title: 'One job per function',
    body: 'The function that checks sites never writes reports, so a problem in one path cannot quietly corrupt another.',
  },
  {
    title: 'Least privilege',
    body: 'Each function can only reach the exact tables and actions it uses. A leaked role gives away as little as possible.',
  },
  {
    title: 'Reproducible',
    body: 'Terraform is the one source of truth for the infrastructure, so the environment can be rebuilt the same way every time.',
  },
]

function SpecChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 font-mono text-[10px] font-semibold text-txt-mid">
      {children}
    </span>
  )
}

function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-txt-hi">{children}</span>
      <div className="hr-accent mt-3" />
    </>
  )
}

export default function About() {
  return (
    <Shell>
      <div className="mx-auto w-full max-w-5xl">
        {/* Header */}
        <div className="animate-fade-up">
          <p className="kicker mb-1.5">System</p>
          <h1 className="text-sheen font-display text-[26px] font-bold tracking-tight">About this project</h1>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-txt-lo">
            A serverless uptime and SLA monitor, built on AWS end to end. Here is what it does and how the pieces fit
            together.
          </p>
        </div>

        {/* Spec row */}
        <div className="mt-4 flex flex-wrap gap-2 animate-fade-up" style={{ animationDelay: '60ms' }}>
          <SpecChip>10 AWS services</SpecChip>
          <SpecChip>5 Lambda functions</SpecChip>
          <SpecChip>5 DynamoDB tables</SpecChip>
          <SpecChip>1 region</SpecChip>
          <SpecChip>100% Terraform</SpecChip>
        </div>

        {/* What it does */}
        <div className="panel mt-5 animate-fade-up p-5" style={{ animationDelay: '100ms' }}>
          <PanelTitle>What it does</PanelTitle>
          <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-txt-mid">
            <p>
              SLA Monitor watches the websites you care about and tells you the moment one breaks. Every minute it runs
              an HTTP check against each endpoint you register, measures how long the response took, and keeps a full
              history of the results. When a site goes down you get an email within about a minute, and when it recovers
              you get another.
            </p>
            <p>
              Once a week it rolls all of that into an SLA report: uptime percentage, average and p95 latency, how many
              incidents happened, and total downtime measured against your own thresholds. The report is stored, saved
              to S3, and sent to your inbox. None of it needs a server running in the background, and none of it needs
              you to be watching.
            </p>
          </div>
        </div>

        {/* The AWS stack */}
        <div className="panel mt-3 animate-fade-up p-5" style={{ animationDelay: '140ms' }}>
          <PanelTitle>The AWS stack</PanelTitle>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STACK.map((s) => (
              <div
                key={s.name}
                className="group rounded-lg border border-white/[0.06] bg-ink-950/50 p-4 transition-colors hover:border-accent/30 hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-white/[0.02] text-accent transition-colors group-hover:border-accent/30 group-hover:bg-accent/[0.08]">
                    {s.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-[13px] font-semibold text-txt-hi">{s.name}</p>
                    {s.tag && (
                      <p className="font-mono text-[9px] uppercase tracking-wider text-txt-lo">{s.tag}</p>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-txt-mid">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How the pipeline runs */}
        <div className="panel mt-3 animate-fade-up p-5" style={{ animationDelay: '180ms' }}>
          <PanelTitle>How the pipeline runs</PanelTitle>
          <p className="mt-4 text-[12px] leading-relaxed text-txt-lo">
            Three scheduled jobs do the work on their own. EventBridge is the trigger for each one.
          </p>
          <div className="mt-4 space-y-3">
            {JOBS.map((j) => (
              <div
                key={j.title}
                className="flex gap-3 rounded-lg border border-white/[0.06] bg-ink-950/50 p-4"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent/[0.08] text-accent">
                  {j.icon}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-[13px] font-semibold text-txt-hi">{j.title}</p>
                    <span className="rounded border border-accent/25 bg-accent/[0.07] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-accent">
                      {j.cadence}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-txt-mid">{j.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-white/[0.06] pt-4 text-[12px] leading-relaxed text-txt-mid">
            Everything you see here is the on-demand side. When you open the dashboard, the browser calls API Gateway
            with your token. Read requests go to one function and writes go to another, and both talk only to DynamoDB.
          </p>
        </div>

        {/* Principles */}
        <div className="panel mt-3 mb-2 animate-fade-up p-5" style={{ animationDelay: '220ms' }}>
          <PanelTitle>Why it's built this way</PanelTitle>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="rounded-lg border border-white/[0.06] bg-ink-950/50 p-4">
                <p className="font-display text-[13px] font-semibold text-txt-hi">{p.title}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-txt-mid">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  )
}
