import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { motion } from 'framer-motion'
import { WhatsAppIcon, CardIcon, AIIcon, CheckmarkIcon } from '@/components/icons'

gsap.registerPlugin(ScrollTrigger)

/* ──────────────────────── Easing Token ──────────────────────── */
const easeOutArray = [0.22, 1, 0.36, 1] as [number, number, number, number]

/* ──────────────────────── Framer Motion Variants ──────────────────────── */
const fadeUpStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

const fadeUpChild = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: easeOutArray } },
}

const cardStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15 },
  },
}

const cardChild = {
  hidden: { opacity: 0, y: 60 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: easeOutArray } },
}

/* ──────────────────────── Count-Up Hook ──────────────────────── */
function useCountUp(end: number, duration: number = 1.5, start: boolean = false) {
  const [count, setCount] = useState(0)
  const countRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!start) return
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / (duration * 1000), 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      countRef.current = Math.floor(eased * end)
      setCount(countRef.current)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [start, end, duration])

  return count
}

/* ──────────────────────── Stat Card ──────────────────────── */
function StatCard({ value, suffix, label, trigger }: { value: number; suffix: string; label: string; trigger: boolean }) {
  const count = useCountUp(value, 1.5, trigger)

  return (
    <div className="bg-white rounded-[20px] px-10 py-12 shadow-[0_4px_24px_rgba(0,0,0,0.06)] text-center">
      <div className="text-[64px] md:text-[80px] font-black leading-none tracking-[-0.04em] text-accent-orange">
        {count}{suffix}
      </div>
      <p className="mt-4 text-[16px] leading-relaxed text-text-secondary">{label}</p>
    </div>
  )
}

/* ═══════════════════════════ HOME PAGE ═══════════════════════════ */
export default function Home() {
  return (
    <>
      <HeroSection />
      <ProblemSection />
      <OpportunitySection />
      <PlatformSection />
      <ProofPointsSection />
      <CaseStudySection />
      <PartnersSection />
      <CTASection />
    </>
  )
}

/* ═══════════════════════════ SECTION 1: HERO ═══════════════════════════ */
function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const overlineRef = useRef<HTMLDivElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const subRef = useRef<HTMLParagraphElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    // Background scale
    gsap.from(bgRef.current, {
      scale: 1.08,
      duration: 2.5,
      ease: 'power2.out',
    })

    // Overline
    gsap.from(overlineRef.current, {
      opacity: 0,
      duration: 0.8,
      delay: 0.2,
      ease: 'power2.out',
    })

    // Headline
    gsap.from(headlineRef.current, {
      opacity: 0,
      y: 50,
      duration: 1.0,
      delay: 0.3,
      ease: 'power2.out',
    })

    // Subheadline
    gsap.from(subRef.current, {
      opacity: 0,
      y: 30,
      duration: 0.8,
      delay: 0.6,
      ease: 'power2.out',
    })

    // CTA group
    gsap.from(ctaRef.current, {
      opacity: 0,
      y: 20,
      duration: 0.8,
      delay: 0.9,
      ease: 'power2.out',
    })

    // Scroll indicator
    gsap.from(scrollRef.current, {
      opacity: 0,
      duration: 0.8,
      delay: 1.5,
      ease: 'power2.out',
    })
  }, { scope: sectionRef })

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden"
    >
      {/* Background Image */}
      <div
        ref={bgRef}
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: 'url(/hero-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 35%',
          backgroundAttachment: 'fixed',
        }}
      />

      {/* Dark Overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background: 'linear-gradient(180deg, rgba(26,26,26,0.55) 0%, rgba(26,26,26,0.7) 100%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-[900px] mx-auto px-6 text-center pt-20 pb-32">
        <div
          ref={overlineRef}
          className="text-[13px] font-medium uppercase tracking-[0.12em] mb-6"
          style={{ color: 'rgba(255,255,255,0.7)' }}
        >
          Digitizing South Africa's Informal Economy
        </div>

        <h1
          ref={headlineRef}
          className="text-[48px] sm:text-[64px] md:text-[96px] lg:text-[120px] font-black leading-[0.9] tracking-[-0.04em] text-white"
        >
          910,000 Businesses. One Platform.
        </h1>

        <p
          ref={subRef}
          className="mt-6 text-[16px] md:text-[20px] leading-relaxed max-w-[680px] mx-auto"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          Inyuku Digital transforms South Africa's SME and informal economy — from WhatsApp storefronts to AI-powered business management. Because every spaza shop deserves a digital future.
        </p>

        <div ref={ctaRef} className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/platform"
            className="px-8 py-4 rounded-lg text-[15px] font-semibold transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: '#FFFFFF',
              color: '#E86A34',
            }}
          >
            Explore the Platform
          </Link>
          <Link
            to="/impact"
            className="px-8 py-4 rounded-lg text-[15px] font-semibold text-white transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              border: '1.5px solid rgba(255,255,255,0.4)',
              backgroundColor: 'transparent',
            }}
          >
            Read Our Impact
          </Link>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div ref={scrollRef} className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        <div className="w-px h-12 bg-white/50 relative overflow-hidden">
          <div
            className="absolute top-0 left-0 w-full bg-white"
            style={{
              height: '50%',
              animation: 'scrollPulse 2s ease-in-out infinite',
            }}
          />
        </div>
        <style>{`
          @keyframes scrollPulse {
            0% { transform: translateY(-100%); }
            50% { transform: translateY(200%); }
            100% { transform: translateY(-100%); }
          }
        `}</style>
      </div>
    </section>
  )
}

/* ═══════════════════════════ SECTION 2: PROBLEM ═══════════════════════════ */
function ProblemSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [triggerStats, setTriggerStats] = useState(false)

  useGSAP(() => {
    ScrollTrigger.create({
      trigger: sectionRef.current,
      start: 'top 85%',
      once: true,
      onEnter: () => setTriggerStats(true),
    })

    gsap.from('.problem-label', {
      opacity: 0,
      duration: 0.6,
      scrollTrigger: {
        trigger: sectionRef.current,
        start: 'top 85%',
        once: true,
      },
    })

    gsap.from('.problem-heading', {
      opacity: 0,
      y: 40,
      duration: 0.8,
      scrollTrigger: {
        trigger: sectionRef.current,
        start: 'top 85%',
        once: true,
      },
      delay: 0.1,
    })

    gsap.from('.problem-paragraph', {
      opacity: 0,
      y: 24,
      duration: 0.8,
      scrollTrigger: {
        trigger: sectionRef.current,
        start: 'top 85%',
        once: true,
      },
      delay: 0.25,
    })

    gsap.from('.stat-card-item', {
      opacity: 0,
      y: 60,
      duration: 0.8,
      stagger: 0.15,
      scrollTrigger: {
        trigger: '.stat-grid',
        start: 'top 85%',
        once: true,
      },
    })
  }, { scope: sectionRef })

  return (
    <section ref={sectionRef} className="bg-cream" style={{ padding: '128px 24px' }}>
      <div className="max-w-[800px] mx-auto text-center">
        <div className="problem-label text-[13px] font-medium uppercase tracking-[0.1em] text-accent-orange mb-4">
          The Challenge
        </div>
        <h2 className="problem-heading text-[36px] md:text-[64px] font-extrabold text-text-primary leading-tight tracking-[-0.03em]">
          Two Economies. One Digital Divide.
        </h2>
        <p className="problem-paragraph mt-6 text-[16px] md:text-[20px] leading-relaxed text-text-secondary">
          South Africa's economy is sharply divided. On one side, a formal corporate sector with sophisticated digital capabilities. On the other, a vast SME and informal economy — spaza shops, traders, artisans — that remains largely cash-based, offline, and disconnected from the tools that could transform their businesses.
        </p>
      </div>

      <div className="stat-grid max-w-[1100px] mx-auto mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="stat-card-item">
          <StatCard value={90} suffix="%" label="of informal enterprises still run as cash-only businesses" trigger={triggerStats} />
        </div>
        <div className="stat-card-item">
          <StatCard value={51} suffix="%" label="of informal businesses report strong customer demand for card payments" trigger={triggerStats} />
        </div>
        <div className="stat-card-item">
          <StatCard value={910} suffix="K" label="South African SMEs using Meta platforms as digital storefronts" trigger={triggerStats} />
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════ SECTION 3: OPPORTUNITY ═══════════════════════════ */
function OpportunitySection() {
  const sectionRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.from('.opp-label', {
      opacity: 0,
      y: 20,
      duration: 0.6,
      scrollTrigger: { trigger: sectionRef.current, start: 'top 85%', once: true },
    })

    gsap.from('.opp-heading', {
      opacity: 0,
      x: -40,
      duration: 0.8,
      scrollTrigger: { trigger: sectionRef.current, start: 'top 85%', once: true },
      delay: 0.1,
    })

    gsap.from('.opp-paragraph', {
      opacity: 0,
      x: -30,
      duration: 0.8,
      stagger: 0.12,
      scrollTrigger: { trigger: '.opp-text-col', start: 'top 85%', once: true },
      delay: 0.2,
    })

    gsap.from('.opp-quote', {
      opacity: 0,
      y: 20,
      duration: 0.8,
      scrollTrigger: { trigger: '.opp-quote', start: 'top 90%', once: true },
      delay: 0.4,
    })

    gsap.from('.opp-chart-card', {
      opacity: 0,
      x: 60,
      duration: 0.8,
      scrollTrigger: { trigger: '.opp-chart-card', start: 'top 85%', once: true },
      delay: 0.3,
    })

    gsap.from('.bar-item', {
      width: 0,
      duration: 1.2,
      stagger: 0.2,
      ease: 'power2.out',
      scrollTrigger: { trigger: '.opp-chart-card', start: 'top 85%', once: true },
      delay: 0.6,
    })
  }, { scope: sectionRef })

  const barData = [
    { label: 'GDP Contribution', value: '$2.9B', width: '100%' },
    { label: 'Productivity Gains', value: '$1.3B', width: '65%' },
    { label: 'Businesses on Meta', value: '910K', width: '85%' },
    { label: 'Card Demand', value: '51%', width: '51%' },
  ]

  return (
    <section
      ref={sectionRef}
      style={{ backgroundColor: '#7C2D4E', padding: '128px 24px' }}
    >
      <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-[55%_45%] gap-16 items-center">
        {/* Left Column — Text */}
        <div className="opp-text-col">
          <div className="opp-label text-[13px] font-medium uppercase tracking-[0.1em] mb-4" style={{ color: '#F5B800' }}>
            The Opportunity
          </div>
          <h2 className="opp-heading text-[36px] md:text-[64px] font-extrabold leading-tight tracking-[-0.03em]" style={{ color: '#F6F2EC' }}>
            The Informal Economy Is Not Marginal
          </h2>
          <p className="opp-paragraph mt-6 text-[16px] leading-relaxed" style={{ color: 'rgba(246,242,236,0.85)' }}>
            Spaza shops, informal traders, waste reclaimers, artisans, domestic workers — these enterprises provide livelihoods for millions of households, supply essential goods and services to communities, and contribute substantially to South Africa's economic output.
          </p>
          <p className="opp-paragraph mt-4 text-[16px] leading-relaxed" style={{ color: 'rgba(246,242,236,0.85)' }}>
            This informality is not a choice. It is a response to barriers — regulatory, financial, educational — that make formalization difficult or unattractive. When given the right tools, informal businesses rapidly adopt digital capabilities.
          </p>
          <div
            className="opp-quote mt-8 pl-6 py-2 text-[18px] md:text-[20px] leading-relaxed italic"
            style={{
              color: '#F6F2EC',
              borderLeft: '4px solid #F5B800',
            }}
          >
            The government's Spaza Shop Support Fund, a R500 million initiative, explicitly targets digital transformation and financial inclusion — creating a direct funding pathway for digital solutions.
          </div>
        </div>

        {/* Right Column — Bar Chart */}
        <div className="opp-chart-card rounded-[20px] p-8 md:p-12" style={{ backgroundColor: '#1A1A1A' }}>
          <h3 className="text-[20px] font-bold mb-8" style={{ color: '#F6F2EC' }}>Key Metrics</h3>
          <div className="space-y-6">
            {barData.map((bar) => (
              <div key={bar.label}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[13px] font-medium uppercase tracking-[0.02em]" style={{ color: '#78716C' }}>
                    {bar.label}
                  </span>
                  <span className="text-[16px] font-bold" style={{ color: '#F6F2EC' }}>
                    {bar.value}
                  </span>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                  <div
                    className="bar-item h-full rounded-full"
                    style={{
                      width: bar.width,
                      background: 'linear-gradient(90deg, #E86A34, #F5B800)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════ SECTION 4: PLATFORM PREVIEW ═══════════════════════════ */
function PlatformSection() {
  const features = [
    {
      icon: <WhatsAppIcon className="w-12 h-12 text-accent-teal" />,
      title: 'WhatsApp Commerce Engine',
      description: 'Manage orders, coordinate with suppliers, and reach customers beyond your immediate streets — all through the app township businesses already use every day.',
      link: '/platform',
    },
    {
      icon: <AIIcon className="w-12 h-12 text-accent-orange" />,
      title: 'AI Business Agent',
      description: 'An intelligent assistant that automates inventory tracking, sends payment reminders, manages customer relationships, and generates business reports — in your language.',
      link: '/platform',
    },
    {
      icon: <CardIcon className="w-12 h-12 text-accent-orange" />,
      title: 'Digital Payments & Finance',
      description: 'Accept card payments, track cash flow, build a digital transaction history, and unlock access to formal credit through verified business data.',
      link: '/platform',
    },
  ]

  return (
    <section className="bg-white" style={{ padding: '128px 24px' }}>
      <div className="max-w-[1200px] mx-auto">
        {/* Heading */}
        <motion.div
          className="text-center max-w-[800px] mx-auto mb-16"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUpStagger}
        >
          <motion.div variants={fadeUpChild} className="text-[13px] font-medium uppercase tracking-[0.1em] text-accent-orange mb-4">
            The Platform
          </motion.div>
          <motion.h2 variants={fadeUpChild} className="text-[36px] md:text-[64px] font-extrabold text-text-primary leading-tight tracking-[-0.03em]">
            From WhatsApp Commerce to AI-Powered Business Management
          </motion.h2>
          <motion.p variants={fadeUpChild} className="mt-6 text-[16px] md:text-[20px] leading-relaxed text-text-secondary max-w-[640px] mx-auto">
            Inyuku Digital builds on the foundation South African businesses have already laid — transforming WhatsApp-based commerce into a comprehensive platform.
          </motion.p>
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={cardStagger}
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={cardChild}
              whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}
              transition={{ duration: 0.3 }}
              className="bg-white border border-border-light rounded-2xl p-10 flex flex-col"
            >
              <motion.div
                className="mb-6"
                initial={{ scale: 0.8, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: easeOutArray }}
              >
                {feature.icon}
              </motion.div>
              <h3 className="text-[24px] md:text-[32px] font-semibold text-text-primary leading-tight tracking-[-0.01em]">
                {feature.title}
              </h3>
              <p className="mt-4 text-[16px] leading-relaxed text-text-secondary flex-1">
                {feature.description}
              </p>
              <Link
                to={feature.link}
                className="mt-6 inline-flex items-center text-[15px] font-semibold text-accent-orange hover:underline"
              >
                Learn More &rarr;
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ═══════════════════════════ SECTION 5: PROOF POINTS ═══════════════════════════ */
function ProofPointsSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [triggerBanner, setTriggerBanner] = useState(false)

  useGSAP(() => {
    ScrollTrigger.create({
      trigger: '.proof-banner',
      start: 'top 85%',
      once: true,
      onEnter: () => setTriggerBanner(true),
    })

    gsap.from('.proof-left-content', {
      opacity: 0,
      y: 40,
      duration: 0.8,
      scrollTrigger: { trigger: '.proof-left-content', start: 'top 85%', once: true },
    })

    gsap.from('.proof-right-image', {
      opacity: 0,
      scale: 1.05,
      duration: 1.0,
      scrollTrigger: { trigger: '.proof-right-image', start: 'top 85%', once: true },
    })
  }, { scope: sectionRef })

  return (
    <section ref={sectionRef} className="bg-cream" style={{ padding: '128px 0' }}>
      {/* Banner */}
      <div className="proof-banner" style={{ backgroundColor: '#1A1A1A', padding: '80px 24px' }}>
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-0">
          {[
            { value: 2.9, prefix: '$', suffix: 'B', label: 'contributed to South African GDP' },
            { value: 1.3, prefix: '$', suffix: 'B', label: 'in productivity gains from digital adoption' },
            { value: 910, prefix: '', suffix: ',000', label: 'businesses using Meta platforms as storefronts' },
          ].map((stat, i, arr) => (
            <div
              key={stat.label}
              className={`text-center ${i < arr.length - 1 ? 'md:border-r md:border-white/15' : ''}`}
            >
              <BannerStat {...stat} trigger={triggerBanner} />
              <p className="mt-3 text-[16px] md:text-[20px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Content */}
      <div className="max-w-[1200px] mx-auto px-6 mt-20 grid grid-cols-1 lg:grid-cols-[60%_40%] gap-12 items-start">
        <div className="proof-left-content">
          <h2 className="text-[28px] md:text-[48px] font-bold text-text-primary leading-tight tracking-[-0.02em]">
            The Evidence Is Clear
          </h2>
          <p className="mt-4 text-[16px] md:text-[20px] leading-relaxed text-text-secondary">
            Meta's economic impact research demonstrates that informal businesses can rapidly adopt digital tools when those tools are accessible, affordable, and delivered through familiar channels. WhatsApp Business has become the de facto operating system for township commerce.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              'Furniture makers in Alexandra showcasing products to buyers across Gauteng',
              'Catering businesses in Khayelitsha taking bookings from corporate clients in Cape Town',
              'Spaza shops accepting card payments and managing inventory digitally',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckmarkIcon className="w-5 h-5 text-accent-green flex-shrink-0 mt-1" />
                <span className="text-[16px] leading-relaxed text-text-secondary">{item}</span>
              </li>
            ))}
          </ul>
          <Link
            to="/impact"
            className="mt-8 inline-flex items-center text-[15px] font-semibold text-accent-orange hover:underline"
          >
            Explore Our Impact Data &rarr;
          </Link>
        </div>

        <div className="proof-right-image rounded-2xl overflow-hidden h-full min-h-[400px]">
          <img
            src="/hero-bg.jpg"
            alt="South African township street level"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </section>
  )
}

function BannerStat({
  value, prefix, suffix, trigger,
}: {
  value: number; prefix: string; suffix: string; trigger: boolean
}) {
  const count = useCountUp(Math.floor(value * 10), 1.5, trigger)
  const display = suffix === ',000' ? Math.floor(count / 10) * 1000 : (count / 10).toFixed(1)

  return (
    <span className="text-[40px] md:text-[64px] lg:text-[96px] font-black leading-none tracking-[-0.04em] text-accent-orange">
      {prefix}{display}{suffix === ',000' ? ',000' : suffix}
    </span>
  )
}

/* ═══════════════════════════ SECTION 6: CASE STUDIES ═══════════════════════════ */
function CaseStudySection() {
  const stories = [
    {
      image: '/story-furniture.jpg',
      name: 'Thabo M.',
      business: 'Furniture Maker',
      location: 'Alexandra, Gauteng',
      quote: 'Before, my customers were only people who walked past my workshop. Now I showcase my pieces to buyers across the province — all through WhatsApp.',
    },
    {
      image: '/story-catering.jpg',
      name: 'Nomsa K.',
      business: 'Catering Business',
      location: 'Khayelitsha, Cape Town',
      quote: 'I went from taking orders on a scrap of paper to managing bookings, payments, and delivery schedules on my phone. My business doubled in six months.',
    },
    {
      image: '/story-shopkeeper.jpg',
      name: 'David L.',
      business: 'Spaza Shop Owner',
      location: 'Soweto, Johannesburg',
      quote: 'The card payment terminal changed everything. Customers who used to walk past because they had no cash now shop here regularly.',
    },
  ]

  return (
    <section className="bg-white" style={{ padding: '128px 24px' }}>
      <div className="max-w-[1200px] mx-auto">
        {/* Heading */}
        <motion.div
          className="text-center mb-16"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUpStagger}
        >
          <motion.div variants={fadeUpChild} className="text-[13px] font-medium uppercase tracking-[0.1em] text-accent-orange mb-4">
            Real Stories
          </motion.div>
          <motion.h2 variants={fadeUpChild} className="text-[36px] md:text-[64px] font-extrabold text-text-primary leading-tight tracking-[-0.03em]">
            How Digital Tools Are Transforming Real Businesses
          </motion.h2>
          <motion.p variants={fadeUpChild} className="mt-6 text-[16px] md:text-[20px] leading-relaxed text-text-secondary max-w-[640px] mx-auto">
            Meet the entrepreneurs who are leading South Africa's informal economy into the digital age.
          </motion.p>
        </motion.div>

        {/* Story Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={cardStagger}
        >
          {stories.map((story) => (
            <motion.div
              key={story.name}
              variants={cardChild}
              whileHover={{ y: -6, boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}
              transition={{ duration: 0.3 }}
              className="bg-white border border-border-light rounded-2xl overflow-hidden"
            >
              <div className="aspect-[3/2] overflow-hidden">
                <motion.img
                  src={story.image}
                  alt={story.name}
                  className="w-full h-full object-cover"
                  initial={{ scale: 1.03 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.0, ease: easeOutArray }}
                />
              </div>
              <div className="p-8">
                <h3 className="text-[24px] font-semibold text-text-primary">{story.name}</h3>
                <p className="mt-1 text-[13px] font-medium uppercase tracking-[0.02em] text-text-muted">
                  {story.business} &middot; {story.location}
                </p>
                <p
                  className="mt-4 text-[16px] leading-relaxed text-text-secondary italic pl-5"
                  style={{ borderLeft: '3px solid #E86A34' }}
                >
                  &ldquo;{story.quote}&rdquo;
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ═══════════════════════════ SECTION 7: PARTNERS ═══════════════════════════ */
function PartnersSection() {
  const partners = [
    { abbr: 'DSBD', name: 'Department of Small Business Development' },
    { abbr: 'SASSA', name: 'South African Social Security Agency' },
    { abbr: 'SITA', name: 'State Information Technology Agency' },
    { abbr: 'DTIC', name: 'Department of Trade, Industry and Competition' },
    { abbr: 'Meta', name: 'Meta Platforms Inc.' },
  ]

  return (
    <section className="bg-cream" style={{ padding: '96px 24px' }}>
      <div className="max-w-[800px] mx-auto text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUpStagger}
        >
          <motion.div variants={fadeUpChild} className="text-[13px] font-medium uppercase tracking-[0.1em] text-text-muted mb-4">
            Supported By
          </motion.div>
          <motion.h2 variants={fadeUpChild} className="text-[28px] md:text-[48px] font-bold text-text-primary leading-tight tracking-[-0.02em]">
            Aligned with National Priorities
          </motion.h2>
          <motion.p variants={fadeUpChild} className="mt-4 text-[16px] md:text-[20px] leading-relaxed text-text-secondary max-w-[700px] mx-auto">
            Inyuku Digital is designed to complement and accelerate South Africa's government-led digital inclusion initiatives — from the Spaza Shop Support Fund to SITA's broadband expansion.
          </motion.p>
        </motion.div>
      </div>

      {/* Partner Logo Strip */}
      <motion.div
        className="max-w-[1200px] mx-auto mt-12 flex flex-wrap items-center justify-center gap-8 md:gap-12"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.1 } },
        }}
      >
        {partners.map((partner) => (
          <motion.div
            key={partner.abbr}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOutArray } },
            }}
            className="group flex items-center justify-center w-[120px] h-[48px] rounded-lg cursor-default transition-colors duration-300"
          >
            <span className="text-[14px] font-semibold text-text-muted group-hover:text-text-primary transition-colors duration-300 tracking-[0.05em]">
              {partner.abbr}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

/* ═══════════════════════════ SECTION 8: CTA ═══════════════════════════ */
function CTASection() {
  return (
    <section
      style={{
        background: 'linear-gradient(135deg, #E86A34 0%, #D15A28 100%)',
        padding: '96px 24px',
      }}
    >
      <motion.div
        className="max-w-[800px] mx-auto text-center"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.15 } },
        }}
      >
        <motion.h2
          variants={{
            hidden: { opacity: 0, y: 30 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: easeOutArray } },
          }}
          className="text-[36px] md:text-[64px] font-extrabold text-white leading-tight tracking-[-0.03em]"
        >
          Ready to Join the Digital Economy?
        </motion.h2>
        <motion.p
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.15, ease: easeOutArray } },
          }}
          className="mt-4 text-[16px] md:text-[20px] leading-relaxed text-white/90"
        >
          Whether you run a spaza shop, trade at a market, or build furniture in your workshop — Inyuku Digital gives you the tools to grow, manage, and formalize your business.
        </motion.p>
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.4, ease: easeOutArray } },
          }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            to="/platform"
            className="px-8 py-4 rounded-lg text-[15px] font-bold transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: '#FFFFFF', color: '#E86A34' }}
          >
            Get Started Free
          </Link>
          <Link
            to="/about"
            className="px-8 py-4 rounded-lg text-[15px] font-semibold text-white transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              border: '1.5px solid rgba(255,255,255,0.6)',
              backgroundColor: 'transparent',
            }}
          >
            Talk to Our Team
          </Link>
        </motion.div>
        <motion.p
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { duration: 0.6, delay: 0.7 } },
          }}
          className="mt-6 text-[13px] font-medium text-white/70"
        >
          No credit card required. Works on any phone with WhatsApp.
        </motion.p>
      </motion.div>
    </section>
  )
}
