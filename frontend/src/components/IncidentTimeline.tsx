import { CircleCheck, Radio } from 'lucide-react'
import type { Incident } from '../types'
import { ERROR_TYPE, fmtUtcTime, formatDowntime } from '../lib/format'

/** Downtime incident history — one row per detected outage, newest first.
 *  Mirrors the SLA Reports table styling. Incident timestamps are epoch
 *  SECONDS (checks use ms), so multiply by 1000 for display. */
export default function IncidentTimeline({ incidents }: { incidents: Incident[] }) {
  return (
    <div className="panel-flush animate-fade-up" style={{ animationDelay: '300ms' }}>
      <div className="panel-head">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-txt-hi">Incident Log</span>
          <span className="font-mono text-[11px] text-txt-dim">[{incidents.length}]</span>
        </div>
      </div>

      {incidents.length === 0 ? (
        <div className="px-4 py-12 text-center font-mono text-[12px] text-txt-dim">
          No incidents in this window — every failure run shorter than the threshold is ignored.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Started', 'Duration', 'Cause', 'Status'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 font-mono text-[9px] font-bold uppercase tracking-wider text-txt-dim ${
                      i === 0 ? 'text-left' : i === 3 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => {
                const cause = inc.cause ? ERROR_TYPE[inc.cause] : null
                return (
                  <tr
                    key={inc.start_time}
                    className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 text-left font-mono text-[12px] font-semibold text-txt-hi">
                      {fmtUtcTime(inc.start_time * 1000)}
                    </td>
                    <td className="px-4 py-3 text-left data text-[12px] text-txt-mid">
                      {inc.resolved && inc.duration_seconds != null ? (
                        formatDowntime(inc.duration_seconds)
                      ) : (
                        <span className="text-crit">Ongoing</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-left">
                      {cause ? (
                        <span
                          className="inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                          style={{ color: cause.color, borderColor: `${cause.color}40`, background: `${cause.color}14` }}
                        >
                          {cause.label}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-txt-dim">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inc.resolved ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-ok">
                          <CircleCheck className="h-3 w-3" strokeWidth={2} />
                          Resolved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-crit">
                          <Radio className="h-3 w-3 animate-pulse" strokeWidth={2} />
                          Ongoing
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
