'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import {
  CreditCard,
  Package,
  MessageSquare,
  BarChart3,
  Globe,
  Smartphone,
  Bell,
  Users,
  Camera,
  Calendar,
  Receipt,
  TrendingUp,
  CalendarDays,
  Banknote,
  ClipboardList,
  Star,
  ArrowRight,
} from 'lucide-react'

gsap.registerPlugin(ScrollTrigger)

/* ───────────────────── easing ───────────────────── */
const easeSmooth = [0.22, 1, 0.36, 1] as [number, number, number, number]

/* ───────────────────── filter categories ───────────────────── */
const categories = ['All', 'Spaza Shops', 'Traders', 'Artisans', 'Catering'] as const
type Category = (typeof categories)[number]

/* ───────────────────── solution data ───────────────────── */
const spazaFeatures = [
  { icon: CreditCard, title: 'Accept Card Payments', desc: 'Low-cost card reader. Tap, chip, PIN. Instant settlement to your mobile wallet.', color: '#E86A34' },
  { icon: Package, title: 'Track Inventory', desc: 'Know what\'s selling, what\'s running low, and what to reorder — automatically.', color: '#E86A34' },
  { icon: MessageSquare, title: 'WhatsApp Orders', desc: 'Customers order through WhatsApp. You manage everything from one screen.', color: '#E86A34' },
  { icon: BarChart3, title: 'Build Business Credit', desc: 'Every digital transaction builds your formal credit profile.', color: '#E86A34' },
]

const traderFeatures = [
  { icon: Globe, title: 'Digital Catalog', desc: 'Showcase your products to customers across the city — not just those who walk past.', color: '#F5B800' },
  { icon: Smartphone, title: 'Mobile Payments', desc: 'Accept payments by card, instant EFT, or mobile money — no cash required.', color: '#F5B800' },
  { icon: Bell, title: 'Stock Alerts', desc: 'Get notified when popular items are running low so you never miss a sale.', color: '#F5B800' },
  { icon: Users, title: 'Customer Directory', desc: 'Build a list of regular customers. Send them promotions and new stock alerts.', color: '#F5B800' },
]

const artisanFeatures = [
  { icon: Camera, title: 'Portfolio Gallery', desc: 'Upload photos of your work. Create a professional portfolio customers can browse and share.', color: '#0D9488' },
  { icon: Calendar, title: 'Booking System', desc: 'Take commissions and appointments through WhatsApp. Automated reminders reduce no-shows.', color: '#0D9488' },
  { icon: Receipt, title: 'Quote & Invoice', desc: 'Generate professional quotes and invoices. Track payment status for every job.', color: '#0D9488' },
  { icon: TrendingUp, title: 'Track Your Growth', desc: 'Monthly reports show your best-selling pieces, busiest months, and growth trends.', color: '#0D9488' },
]

const cateringFeatures = [
  { icon: CalendarDays, title: 'Event Scheduling', desc: 'Manage bookings, deadlines, and delivery dates. Sync everything to your phone calendar.', color: '#7C2D4E' },
  { icon: Banknote, title: 'Deposit Collection', desc: 'Request and collect deposits through WhatsApp. Automatic reminders for balance payments.', color: '#7C2D4E' },
  { icon: ClipboardList, title: 'Client Management', desc: 'Track every client, their preferences, order history, and communication — all in one place.', color: '#7C2D4E' },
  { icon: Star, title: 'Review Collection', desc: 'Automatically request reviews from satisfied clients. Build your reputation digitally.', color: '#7C2D4E' },
]

/* ───────────────────── GSAP scroll wrapper (isolated) ───────────────────── */
function ScrollReveal({
  children,
  className,
  staggerChildren = 0.12,
}: {
  children: React.ReactNode
  className?: string
  staggerChildren?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!containerRef.current) return
    const items = containerRef.current.querySelectorAll('.reveal-item')
    if (items.length === 0) return

    gsap.fromTo(
      items,
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        stagger: staggerChildren,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top 85%',
          once: true,
        },
      }
    )
  }, { scope: containerRef })

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  )
}

/* ───────────────────── image scroll reveal (isolated GSAP) ───────────────────── */
function ImageReveal({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const imgRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!imgRef.current) return
    gsap.fromTo(
      imgRef.current,
      { scale: 1.05, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: imgRef.current,
          start: 'top 85%',
          once: true,
        },
      }
    )
  }, { scope: imgRef })

  return (
    <div ref={imgRef} className={`overflow-hidden rounded-[20px] ${className}`}>
      <img src={src} alt={alt} className="w-full h-full object-cover" />
    </div>
  )
}

/* ───────────────────── Feature list item (Framer Motion) ───────────────────── */
function FeatureItem({
  icon: Icon,
  title,
  desc,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  title: string
  desc: string
  color: string
}) {
  return (
    <motion.div
      className="flex gap-4 py-5"
      style={{ borderBottom: '1px solid #E7E5E4' }}
      whileHover={{ x: 4 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
        <Icon className="w-9 h-9" style={{ color }} />
      </div>
      <div>
        <h4 className="text-[18px] font-semibold text-text-primary leading-tight">{title}</h4>
        <p className="mt-1 text-[15px] leading-relaxed text-text-secondary">{desc}</p>
      </div>
    </motion.div>
  )
}

/* ───────────────────── Solution Section component ───────────────────── */
interface SolutionSectionProps {
  badge: string
  badgeColor: string
  badgeBg: string
  heading: string
  paragraph: string
  features: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; title: string; desc: string; color: string }[]
  imageSrc: string
  imageAlt: string
  ctaText: string
  ctaColor: string
  imagePosition: 'left' | 'right'
  bgColor: string
  sectionId: string
}

function SolutionSection({
  badge,
  badgeColor,
  badgeBg,
  heading,
  paragraph,
  features,
  imageSrc,
  imageAlt,
  ctaText,
  ctaColor,
  imagePosition,
  bgColor,
}: SolutionSectionProps) {
  const content = (
    <ScrollReveal staggerChildren={0.1} className="flex flex-col justify-center">
      <div className="reveal-item">
        <span
          className="inline-block text-[13px] font-medium tracking-[0.08em] uppercase rounded-lg px-3.5 py-1.5 border border-border-light"
          style={{ backgroundColor: badgeBg, color: badgeColor }}
        >
          {badge}
        </span>
      </div>
      <h2 className="reveal-item mt-6 text-[36px] md:text-[48px] font-bold text-text-primary leading-tight tracking-[-0.02em]">
        {heading}
      </h2>
      <p className="reveal-item mt-4 text-[16px] md:text-[18px] leading-relaxed text-text-secondary max-w-[520px]">
        {paragraph}
      </p>
      <div className="reveal-item mt-8">
        {features.map((f) => (
          <FeatureItem key={f.title} icon={f.icon} title={f.title} desc={f.desc} color={f.color} />
        ))}
      </div>
      <div className="reveal-item mt-6">
        <Link href="/platform"
          className="inline-flex items-center gap-2 text-[15px] font-semibold transition-all duration-200 hover:gap-3"
          style={{ color: ctaColor }}
        >
          {ctaText}
          <ArrowRight size={18} />
        </Link>
      </div>
    </ScrollReveal>
  )

  const image = (
    <ImageReveal
      src={imageSrc}
      alt={imageAlt}
      className="w-full h-[400px] md:h-full md:min-h-[500px]"
    />
  )

  return (
    <section style={{ backgroundColor: bgColor, padding: '96px 0' }} className="md:py-[128px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
          {imagePosition === 'left' ? (
            <>
              {image}
              {content}
            </>
          ) : (
            <>
              {content}
              {image}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════ MAIN SOLUTIONS PAGE ═══════════════════════ */
export default function Solutions() {
  const [activeFilter, setActiveFilter] = useState<Category>('All')
  const heroRef = useRef<HTMLDivElement>(null)

  /* hero entrance - GSAP isolated */
  useGSAP(() => {
    if (!heroRef.current) return
    const tl = gsap.timeline()
    tl.fromTo('.hero-overline', { opacity: 0 }, { opacity: 1, duration: 0.4 })
      .fromTo('.hero-headline', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0.2)
      .fromTo('.hero-sub', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0.4)
      .fromTo('.hero-tab', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: 'power3.out' }, 0.6)
  }, { scope: heroRef })

  const filterMap: Record<string, Category[]> = {
    'spaza': ['All', 'Spaza Shops'],
    'trader': ['All', 'Traders'],
    'artisan': ['All', 'Artisans'],
    'catering': ['All', 'Catering'],
  }

  const isVisible = (sectionKey: string) => filterMap[sectionKey]?.includes(activeFilter)

  return (
    <div>
      {/* ─────────────── Section 1: Hero ─────────────── */}
      <section
        ref={heroRef}
        className="pt-[120px] md:pt-[160px] pb-[80px] md:pb-[96px]"
        style={{ backgroundColor: '#F6F2EC' }}
      >
        <div className="max-w-[900px] mx-auto px-6 text-center">
          <p
            className="hero-overline text-[13px] font-medium tracking-[0.1em] uppercase"
            style={{ color: '#E86A34' }}
          >
            SOLUTIONS FOR EVERY BUSINESS
          </p>
          <h1 className="hero-headline mt-5 text-[36px] md:text-[64px] font-extrabold text-text-primary leading-tight tracking-[-0.03em]">
            Built for the Business You Actually Run
          </h1>
          <p className="hero-sub mt-5 text-[16px] md:text-[20px] leading-relaxed text-text-secondary max-w-[640px] mx-auto">
            Whether you stock shelves, arrange flowers, shape wood, or cook for events — Inyuku Digital adapts to your workflow, not the other way around.
          </p>

          {/* Filter tabs — Framer Motion for hover, React state for active */}
          <div className="mt-10 md:mt-12 flex flex-wrap items-center justify-center gap-2">
            {categories.map((cat) => (
              <motion.button
                key={cat}
                className="hero-tab px-5 py-2.5 rounded-full text-[14px] font-medium transition-colors duration-200"
                style={{
                  backgroundColor: activeFilter === cat ? '#1A1A1A' : '#E7E5E4',
                  color: activeFilter === cat ? '#FFFFFF' : '#444444',
                }}
                onClick={() => setActiveFilter(cat)}
                whileHover={activeFilter !== cat ? { backgroundColor: '#D6D3D1' } : {}}
                whileTap={{ scale: 0.97 }}
              >
                {cat}
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── Solution Sections with AnimatePresence ─────────────── */}
      <AnimatePresence mode="wait">
        {/* Section 2: Spaza Shop */}
        {isVisible('spaza') && (
          <motion.div
            key="spaza-section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: easeSmooth }}
          >
            <SolutionSection
              sectionId="spaza"
              badge="SPAZA SHOPS"
              badgeColor="#E86A34"
              badgeBg="#F6F2EC"
              heading="From Cash-Only to Card-Ready"
              paragraph="South Africa's 100,000+ spaza shops are the backbone of township economies. Yet most operate with no digital payments, no inventory tracking, and no way to build a credit history. Inyuku Digital changes that."
              features={spazaFeatures}
              imageSrc="/solutions-spaza.jpg"
              imageAlt="Well-organized spaza shop interior with stocked shelves"
              ctaText="See Spaza Shop Features"
              ctaColor="#E86A34"
              imagePosition="left"
              bgColor="#FFFFFF"
            />
          </motion.div>
        )}

        {/* Section 3: Trader */}
        {isVisible('trader') && (
          <motion.div
            key="trader-section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: easeSmooth }}
          >
            <SolutionSection
              sectionId="trader"
              badge="TRADERS"
              badgeColor="#F5B800"
              badgeBg="#FFFFFF"
              heading="Reach Customers Beyond Your Street"
              paragraph="Market traders and street vendors serve their communities but are limited by geography and cash dependency. Inyuku Digital expands your reach and simplifies your sales — all through your phone."
              features={traderFeatures}
              imageSrc="/solutions-trader.jpg"
              imageAlt="Street trader arranging colorful textiles"
              ctaText="See Trader Features"
              ctaColor="#F5B800"
              imagePosition="right"
              bgColor="#F6F2EC"
            />
          </motion.div>
        )}

        {/* Section 4: Artisan */}
        {isVisible('artisan') && (
          <motion.div
            key="artisan-section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: easeSmooth }}
          >
            <SolutionSection
              sectionId="artisan"
              badge="ARTISANS"
              badgeColor="#0D9488"
              badgeBg="#F6F2EC"
              heading="Showcase Your Craft to the Whole Country"
              paragraph="From furniture makers to jewelers, artisans in Alexandra, Soweto, and Khayelitsha create exceptional work — but are often invisible beyond their immediate neighborhoods. Digital tools change that equation."
              features={artisanFeatures}
              imageSrc="/solutions-artisan.jpg"
              imageAlt="Furniture maker in workshop with tools and raw wood"
              ctaText="See Artisan Features"
              ctaColor="#0D9488"
              imagePosition="left"
              bgColor="#FFFFFF"
            />
          </motion.div>
        )}

        {/* Section 5: Catering */}
        {isVisible('catering') && (
          <motion.div
            key="catering-section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: easeSmooth }}
          >
            <SolutionSection
              sectionId="catering"
              badge="CATERING & SERVICES"
              badgeColor="#7C2D4E"
              badgeBg="#FFFFFF"
              heading="Run Your Service Business Like a Pro"
              paragraph="Catering businesses, cleaning services, transport providers — service businesses face unique challenges: scheduling, deposits, client management. Inyuku Digital handles the operations so you can focus on delivery."
              features={cateringFeatures}
              imageSrc="/solutions-catering.jpg"
              imageAlt="Catering business with arranged food trays"
              ctaText="See Service Features"
              ctaColor="#7C2D4E"
              imagePosition="right"
              bgColor="#F6F2EC"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─────────────── Section 6: CTA ─────────────── */}
      <CtaSection />
    </div>
  )
}

/* ───────────────────── CTA Section (GSAP isolated) ───────────────────── */
function CtaSection() {
  const ctaRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!ctaRef.current) return
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: ctaRef.current,
        start: 'top 85%',
        once: true,
      },
    })
    tl.fromTo('.cta-heading', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' })
      .fromTo('.cta-text', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0.15)
      .fromTo('.cta-btn', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.15, ease: 'power3.out' }, 0.4)
  }, { scope: ctaRef })

  return (
    <section
      ref={ctaRef}
      className="py-[80px] md:py-[96px]"
      style={{ background: 'linear-gradient(135deg, #E86A34 0%, #D15A28 100%)' }}
    >
      <div className="max-w-[800px] mx-auto px-6 text-center">
        <h2 className="cta-heading text-[32px] md:text-[48px] font-extrabold text-white leading-tight tracking-[-0.03em]">
          No Matter What Business You Run — We've Got You
        </h2>
        <p className="cta-text mt-4 text-[16px] md:text-[20px] leading-relaxed max-w-[640px] mx-auto" style={{ color: 'rgba(255,255,255,0.9)' }}>
          Inyuku Digital adapts to your specific business type, workflow, and language. Set up takes 5 minutes, and the core features are free forever.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/platform"
            className="cta-btn px-8 py-4 rounded-lg text-[15px] font-bold transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: '#FFFFFF', color: '#E86A34' }}
          >
            Get Started Free
          </Link>
          <Link href="/platform"
            className="cta-btn px-8 py-4 rounded-lg text-[15px] font-semibold text-white transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
            style={{ border: '1.5px solid rgba(255,255,255,0.4)', backgroundColor: 'transparent' }}
          >
            Compare All Features
          </Link>
        </div>
      </div>
    </section>
  )
}
