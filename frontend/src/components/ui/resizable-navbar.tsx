import { cn } from '@/lib/utils'
import { IconMenu2, IconX } from '@tabler/icons-react'
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'motion/react'
import React, { useRef, useState } from 'react'
import { Link } from 'react-router-dom'

/*
 * Resizable navbar primitives.
 *
 * At rest the bar is a full-width frosted header grounded by a hairline. Once the
 * page scrolls past ~100px it condenses into a floating, blurred pill that hovers
 * just below the top edge. Themed to the app's dark tokens (panel / edge / soft /
 * txt ramp) rather than the stock light palette.
 */

interface NavbarProps {
  children: React.ReactNode
  className?: string
}

interface NavBodyProps {
  children: React.ReactNode
  className?: string
  visible?: boolean
}

interface NavItemsProps {
  items: { name: string; link: string }[]
  /** Index of the item matching the current route; the resting pill sits here. */
  activeIndex: number
  className?: string
  onItemClick?: () => void
}

interface MobileNavProps {
  children: React.ReactNode
  className?: string
  visible?: boolean
}

interface MobileNavHeaderProps {
  children: React.ReactNode
  className?: string
}

interface MobileNavMenuProps {
  children: React.ReactNode
  className?: string
  isOpen: boolean
  onClose: () => void
}

const SPRING = { type: 'spring', stiffness: 200, damping: 50 } as const

export const Navbar = ({ children, className }: NavbarProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const [visible, setVisible] = useState(false)

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setVisible(latest > 100)
  })

  return (
    <motion.div
      ref={ref}
      animate={{
        backgroundColor: visible ? 'rgba(10,12,16,0)' : 'rgba(10,12,16,0.80)',
        borderBottomColor: visible ? 'rgba(31,36,45,0)' : 'rgba(31,36,45,1)',
        backdropFilter: visible ? 'blur(0px)' : 'blur(12px)',
      }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      style={{ borderBottomWidth: 1, borderBottomStyle: 'solid' }}
      className={cn('sticky inset-x-0 top-0 z-50 w-full', className)}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ visible?: boolean }>, { visible })
          : child,
      )}
    </motion.div>
  )
}

export const NavBody = ({ children, className, visible }: NavBodyProps) => {
  return (
    <motion.div
      animate={{
        backgroundColor: visible ? 'rgba(18,21,27,0.85)' : 'rgba(18,21,27,0)',
        backdropFilter: visible ? 'blur(12px)' : 'blur(0px)',
        boxShadow: visible
          ? '0 8px 32px -12px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.4), 0 0 0 1px rgba(43,49,60,0.7)'
          : '0 0 0 1px rgba(43,49,60,0)',
        width: visible ? '46%' : '100%',
        y: visible ? 12 : 0,
      }}
      transition={SPRING}
      style={{ minWidth: '860px' }}
      className={cn(
        'relative z-[60] mx-auto hidden max-w-[1200px] flex-row items-center justify-between self-start rounded-full px-4 py-2.5 sm:px-6 lg:flex',
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

export const NavItems = ({ items, activeIndex, className, onItemClick }: NavItemsProps) => {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <motion.div
      onMouseLeave={() => setHovered(null)}
      className={cn(
        'absolute inset-0 hidden flex-1 flex-row items-center justify-center gap-1 lg:flex',
        className,
      )}
    >
      {items.map((item, idx) => {
        const active = activeIndex === idx
        // Pill rests on the active item and glides to whatever is hovered.
        const showPill = hovered === idx || (hovered === null && active)
        const lit = active || hovered === idx
        return (
          <Link
            key={`nav-${idx}`}
            to={item.link}
            onMouseEnter={() => setHovered(idx)}
            onClick={onItemClick}
            className={cn(
              'relative rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
              lit ? 'text-txt-hi' : 'text-txt-mid',
            )}
          >
            {showPill && (
              <motion.div
                layoutId="nav-pill"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="absolute inset-0 rounded-full border border-edge bg-soft"
              />
            )}
            <span className="relative z-10">{item.name}</span>
          </Link>
        )
      })}
    </motion.div>
  )
}

export const MobileNav = ({ children, className, visible }: MobileNavProps) => {
  return (
    <motion.div
      animate={{
        backgroundColor: visible ? 'rgba(18,21,27,0.90)' : 'rgba(18,21,27,0)',
        backdropFilter: visible ? 'blur(12px)' : 'blur(0px)',
        boxShadow: visible
          ? '0 8px 32px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(43,49,60,0.7)'
          : '0 0 0 1px rgba(43,49,60,0)',
        width: visible ? '92%' : '100%',
        borderRadius: visible ? 16 : 0,
        y: visible ? 12 : 0,
      }}
      transition={SPRING}
      className={cn(
        'relative z-50 mx-auto flex w-full max-w-[calc(100vw-1rem)] flex-col items-center justify-between px-4 py-2.5 lg:hidden',
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

export const MobileNavHeader = ({ children, className }: MobileNavHeaderProps) => {
  return (
    <div className={cn('flex w-full flex-row items-center justify-between', className)}>{children}</div>
  )
}

export const MobileNavMenu = ({ children, className, isOpen }: MobileNavMenuProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={cn(
            'absolute inset-x-2 top-full mt-2 z-50 flex w-auto flex-col items-stretch justify-start gap-1 rounded-2xl border border-edge bg-panel p-2 shadow-overlay',
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export const MobileNavToggle = ({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? 'Close menu' : 'Open menu'}
      aria-expanded={isOpen}
      className="icon-btn"
    >
      {isOpen ? <IconX className="h-5 w-5" stroke={1.75} /> : <IconMenu2 className="h-5 w-5" stroke={1.75} />}
    </button>
  )
}
