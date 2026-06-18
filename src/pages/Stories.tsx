import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { Check } from 'lucide-react'
import { CheckmarkIcon } from '@/components/icons'

gsap.registerPlugin(ScrollTrigger)

/* ───────────────────── easing ───────────────────── */
const easeSmooth = [0.22, 1, 0.36, 1] as [number, number, number, number]

/* ───────────────────── filter categories ───────────────────── */
const storyCategories = ['All Stories', 'Artisans', 'Catering', 'Retail', 'Services'] as const
type StoryCategory = (typeof storyCategories)[number]

/* ═══════════════════════ GSAP SCROLL WRAPPERS (isolated) ═══════════════════════ */

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

function ImageReveal({
  src,
  alt,
  caption,
  className,
}: {
  src: string
  alt: string
  caption?: string
  className?: string
}) {
  const imgRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!imgRef.current) return
    gsap.fromTo(
      imgRef.current,
      { scale: 1.05, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 1.2,
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
    <div ref={imgRef} className={`overflow-hidden rounded-[20px] relative ${className}`}>
      <img src={src} alt={alt} className="w-full h-full object-cover" />
      {caption && (
        <div
          className="absolute bottom-0 left-0 right-0 p-6 text-[13px] font-medium"
          style={{
            background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
            color: 'rgba(255,255,255,0.8)',
            borderRadius: '0 0 20px 20px',
          }}
        >
          {caption}
        </div>
      )}
    </div>
  )
}

/* ───────────────────── Animated Counter (GSAP isolated) ───────────────────── */
function useCountUp(end: number, suffix = '', prefix = '') {
  const ref = useRef<HTMLSpanElement>(null)
  const hasRun = useRef(false)

  useGSAP(() => {
    if (!ref.current || hasRun.current) return
    const el = ref.current

    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        hasRun.current = true
        const obj = { val: 0 }
        gsap.to(obj, {
          val: end,
          duration: 1.5,
          ease: 'power3.out',
          onUpdate: () => {
            if (Number.isInteger(end)) {
              el.textContent = `${prefix}${Math.round(obj.val)}${suffix}`
            } else {
              el.textContent = `${prefix}${obj.val.toFixed(0)}${suffix}`
            }
          },
        })
      },
    })

    return () => {
      trigger.kill()
    }
  }, { scope: ref })

  return ref
}

function StatNumber({ value, suffix = '', prefix = '', label }: { value: number; suffix?: string; prefix?: string; label: string }) {
  const numRef = useCountUp(value, suffix, prefix)

  return (
    <div className="text-center md:text-left">
      <span ref={numRef} className="text-[36px] font-extrabold text-text-primary tracking-[-0.02em]">
        {prefix}0{suffix}
      </span>
      <p className="text-[13px] font-medium uppercase tracking-[0.02em] mt-1" style={{ color: '#78716C' }}>
        {label}
      </p>
    </div>
  )
}

/* ───────────────────── Featured Story Section ───────────────────── */
interface StoryData {
  label: string
  labelColor: string
  name: string
  role: string
  quote: string
  quoteColor: string
  body1: string
  body2: string
  stats: { value: number; suffix: string; prefix: string; label: string }[]
  imageSrc: string
  imageAlt: string
  imageCaption: string
  bgColor: string
  imagePosition: 'left' | 'right'
  storyKey: string
}

const stories: StoryData[] = [
  {
    label: 'FEATURED STORY',
    labelColor: '#E86A34',
    name: 'Thabo Mthembu',
    role: 'Furniture Maker — Alexandra, Gauteng',
    quote: 'Before, my customers were only people who walked past my workshop. Now I showcase my pieces to buyers across the province — all through WhatsApp.',
    quoteColor: '#E86A34',
    body1: 'Thabo started making furniture in a small workshop in Alexandra township ten years ago. His work was exceptional — hand-crafted pieces that rivaled anything in Sandton\'s furniture stores — but his customer base was limited to people who happened to walk past his corrugated iron workshop.',
    body2: 'When a friend showed him how to use WhatsApp Business to share photos of his work, everything changed. Within three months, Thabo was receiving orders from buyers in Midrand, Pretoria, and even Durban. He now uses Inyuku Digital to manage his catalog, track orders, and accept card payments — something he never thought possible for a township business.',
    stats: [
      { value: 3, suffix: 'x', prefix: '', label: 'customer reach' },
      { value: 40, suffix: '%', prefix: '', label: 'revenue increase' },
      { value: 12, suffix: '', prefix: '', label: 'new repeat clients' },
    ],
    imageSrc: '/story-furniture.jpg',
    imageAlt: 'Thabo in his Alexandra workshop',
    imageCaption: 'Thabo in his Alexandra workshop, 2025',
    bgColor: '#F6F2EC',
    imagePosition: 'right',
    storyKey: 'artisans',
  },
  {
    label: 'FEATURED STORY',
    labelColor: '#F5B800',
    name: 'Nomsa Khotso',
    role: 'Catering Business Owner — Khayelitsha, Cape Town',
    quote: 'I went from taking orders on a scrap of paper to managing bookings, payments, and delivery schedules on my phone. My business doubled in six months.',
    quoteColor: '#F5B800',
    body1: 'Nomsa started her catering business cooking for funerals and community events in Khayelitsha. Her food was renowned — word spread quickly — but managing the business side was chaos. Orders came through random WhatsApp messages, payments were tracked in a notebook, and she frequently double-booked herself.',
    body2: 'After adopting Inyuku Digital, Nomsa now has an automated booking system, professional invoices, and a customer database of over 200 clients. She\'s expanded from community events to corporate catering contracts in Cape Town\'s CBD — a market she never thought she could access.',
    stats: [
      { value: 2, suffix: 'x', prefix: '', label: 'revenue growth' },
      { value: 200, suffix: '+', prefix: '', label: 'customer database' },
      { value: 5, suffix: '', prefix: '', label: 'corporate contracts' },
    ],
    imageSrc: '/story-catering.jpg',
    imageAlt: 'Nomsa in her Khayelitsha kitchen',
    imageCaption: 'Nomsa in her Khayelitsha kitchen, 2025',
    bgColor: '#FFFFFF',
    imagePosition: 'left',
    storyKey: 'catering',
  },
  {
    label: 'FEATURED STORY',
    labelColor: '#0D9488',
    name: 'David Letlape',
    role: 'Spaza Shop Owner — Soweto, Johannesburg',
    quote: 'The card payment terminal changed everything. Customers who used to walk past because they had no cash now shop here regularly.',
    quoteColor: '#0D9488',
    body1: 'David has run his spaza shop on a busy Soweto street for eight years. He knew his customers wanted to pay by card — he\'d lost countless sales to people who only had cards — but the cost and complexity of traditional card machines made it seem impossible.',
    body2: 'Through Inyuku Digital\'s low-cost card reader and WhatsApp-based inventory system, David transformed his shop. He now tracks his 200+ product lines digitally, accepts card payments from hundreds of customers weekly, and has built a transaction history that qualified him for a micro-loan to expand his stock.',
    stats: [
      { value: 35, suffix: '%', prefix: '', label: 'increase in daily sales' },
      { value: 200, suffix: '+', prefix: '', label: 'products tracked digitally' },
      { value: 15, suffix: 'K', prefix: 'R', label: 'first formal loan approved' },
    ],
    imageSrc: '/story-shopkeeper.jpg',
    imageAlt: 'David at his spaza shop counter',
    imageCaption: 'David at his spaza shop counter, Soweto, 2025',
    bgColor: '#F6F2EC',
    imagePosition: 'right',
    storyKey: 'retail',
  },
]

const categoryFilterMap: Record<string, string[]> = {
  'thabo': ['All Stories', 'Artisans'],
  'nomsa': ['All Stories', 'Catering'],
  'david': ['All Stories', 'Retail'],
}

function FeaturedStory({ story }: { story: StoryData }) {
  const narrative = (
    <ScrollReveal staggerChildren={0.12} className="flex flex-col justify-center">
      <div className="reveal-item">
        <span
          className="text-[13px] font-medium tracking-[0.08em] uppercase"
          style={{ color: story.labelColor }}
        >
          {story.label}
        </span>
      </div>
      <h2 className="reveal-item mt-4 text-[36px] md:text-[48px] font-extrabold text-text-primary leading-tight tracking-[-0.02em]">
        {story.name}
      </h2>
      <p className="reveal-item mt-2 text-[22px] md:text-[24px] font-medium" style={{ color: '#78716C' }}>
        {story.role}
      </p>

      {/* Quote block */}
      <div
        className="reveal-item mt-8 pl-6"
        style={{ borderLeft: `4px solid ${story.quoteColor}` }}
      >
        <p className="text-[20px] md:text-[24px] italic leading-relaxed text-text-primary">
          &ldquo;{story.quote}&rdquo;
        </p>
      </div>

      <p className="reveal-item mt-8 text-[15px] md:text-[16px] leading-relaxed text-text-secondary">
        {story.body1}
      </p>
      <p className="reveal-item mt-4 text-[15px] md:text-[16px] leading-relaxed text-text-secondary">
        {story.body2}
      </p>

      {/* Stats */}
      <div className="reveal-item mt-10 flex flex-wrap gap-8 md:gap-10">
        {story.stats.map((s) => (
          <StatNumber key={s.label} value={s.value} suffix={s.suffix} prefix={s.prefix} label={s.label} />
        ))}
      </div>
    </ScrollReveal>
  )

  const image = (
    <ImageReveal
      src={story.imageSrc}
      alt={story.imageAlt}
      caption={story.imageCaption}
      className="w-full h-[350px] md:h-full md:min-h-[550px]"
    />
  )

  return (
    <section style={{ backgroundColor: story.bgColor, padding: '96px 0' }} className="md:py-[128px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-[55%_45%] gap-12 md:gap-16 items-center">
          {story.imagePosition === 'left' ? (
            <>
              {image}
              {narrative}
            </>
          ) : (
            <>
              {narrative}
              {image}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════ COMMUNITY VOICES (isolated GSAP) ═══════════════════════ */
const testimonials = [
  {
    name: 'Precious N.',
    business: 'Hair Salon, Durban',
    quote: 'I used to write every appointment in a book. Now my clients book through WhatsApp, get automatic reminders, and pay deposits before they even arrive. My no-show rate dropped from 30% to 5%.',
  },
  {
    name: 'Sipho D.',
    business: 'Electronics Repair, Tembisa',
    quote: "The quote and invoice feature alone is worth it. I look professional now — like a real business, not just a guy with a screwdriver.",
  },
  {
    name: 'Grace M.',
    business: 'Bakery, Gugulethu',
    quote: "My daughter helped me set it up in 10 minutes. Now I track which cakes sell best, when to bake more, and who my best customers are. At 58, I never thought I'd be using AI.",
  },
]

function TestimonialCard({
  testimonial,
  index,
}: {
  testimonial: (typeof testimonials)[0]
  index: number
}) {
  return (
    <motion.div
      className="flex flex-col p-8 md:p-12 rounded-[20px]"
      style={{ backgroundColor: '#2A2A2A' }}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay: index * 0.15, ease: easeSmooth }}
      whileHover={{
        y: -2,
        borderColor: 'rgba(232,106,52,0.3)',
        borderWidth: 1,
        borderStyle: 'solid',
      }}
    >
      <span
        className="text-[48px] font-bold leading-none"
        style={{ color: '#E86A34' }}
      >
        &ldquo;
      </span>
      <p
        className="mt-2 text-[16px] md:text-[18px] italic leading-relaxed"
        style={{ color: 'rgba(246,242,236,0.9)' }}
      >
        {testimonial.quote}
      </p>
      <div className="mt-6 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <p className="text-[18px] font-semibold" style={{ color: '#F6F2EC' }}>
          {testimonial.name}
        </p>
        <p className="text-[13px] font-medium mt-1" style={{ color: '#78716C' }}>
          {testimonial.business}
        </p>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════ SHARE STORY FORM ═══════════════════════ */
function ShareStorySection() {
  const sectionRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!sectionRef.current) return
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionRef.current,
        start: 'top 85%',
        once: true,
      },
    })
    tl.fromTo('.share-left .reveal-item', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.12, ease: 'power3.out' })
      .fromTo('.share-form', { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0.2)
  }, { scope: sectionRef })

  const benefits = [
    'Featured on our website and social media',
    'Free premium features for 6 months',
    'Connect with other business owners in your area',
  ]

  const [formState, setFormState] = useState({
    name: '',
    businessName: '',
    businessType: '',
    story: '',
  })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <section ref={sectionRef} className="py-[80px] md:py-[96px]" style={{ backgroundColor: '#F6F2EC' }}>
      <div className="max-w-[1000px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
          {/* Left column */}
          <div className="share-left">
            <ScrollReveal staggerChildren={0.12}>
              <h2 className="reveal-item text-[32px] md:text-[48px] font-extrabold text-text-primary leading-tight tracking-[-0.02em]">
                Are You a Business Owner Using Inyuku Digital?
              </h2>
              <p className="reveal-item mt-4 text-[16px] md:text-[18px] leading-relaxed text-text-secondary">
                We&apos;d love to share your story. Tell us how digital tools have changed your business — and inspire thousands of other South African entrepreneurs to take the leap.
              </p>
              <ul className="reveal-item mt-6 space-y-3">
                {benefits.map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <Check size={20} className="flex-shrink-0 mt-0.5" style={{ color: '#2D7A3E' }} />
                    <span className="text-[15px] text-text-secondary">{b}</span>
                  </li>
                ))}
              </ul>
            </ScrollReveal>
          </div>

          {/* Right column — Form */}
          <motion.div
            className="share-form bg-white rounded-[16px] p-8 md:p-10"
            style={{
              border: '1px solid #E7E5E4',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            }}
          >
            {submitted ? (
              <div className="text-center py-12">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                  style={{ backgroundColor: '#2D7A3E' }}
                >
                  <CheckmarkIcon className="w-8 h-8 text-white" />
                </div>
                <h3 className="mt-6 text-[24px] font-bold text-text-primary">Thank You!</h3>
                <p className="mt-2 text-[15px] text-text-secondary">
                  We&apos;ve received your story and will be in touch soon.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[14px] font-medium text-text-primary mb-1.5">Your Name</label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                    className="w-full px-4 py-3.5 rounded-lg text-[15px] outline-none transition-all duration-200"
                    style={{
                      backgroundColor: '#F6F2EC',
                      border: '1px solid #E7E5E4',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#E86A34'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,106,52,0.15)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#E7E5E4'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-text-primary mb-1.5">Business Name</label>
                  <input
                    type="text"
                    required
                    value={formState.businessName}
                    onChange={(e) => setFormState((s) => ({ ...s, businessName: e.target.value }))}
                    className="w-full px-4 py-3.5 rounded-lg text-[15px] outline-none transition-all duration-200"
                    style={{
                      backgroundColor: '#F6F2EC',
                      border: '1px solid #E7E5E4',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#E86A34'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,106,52,0.15)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#E7E5E4'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-text-primary mb-1.5">Business Type</label>
                  <select
                    required
                    value={formState.businessType}
                    onChange={(e) => setFormState((s) => ({ ...s, businessType: e.target.value }))}
                    className="w-full px-4 py-3.5 rounded-lg text-[15px] outline-none transition-all duration-200 appearance-none cursor-pointer"
                    style={{
                      backgroundColor: '#F6F2EC',
                      border: '1px solid #E7E5E4',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#E86A34'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,106,52,0.15)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#E7E5E4'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <option value="">Select your business type</option>
                    <option value="spaza">Spaza Shop</option>
                    <option value="trader">Trader / Vendor</option>
                    <option value="artisan">Artisan / Craftsman</option>
                    <option value="catering">Catering / Food Service</option>
                    <option value="services">Professional Services</option>
                    <option value="retail">Retail Shop</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[14px] font-medium text-text-primary mb-1.5">Your Story</label>
                  <textarea
                    required
                    rows={4}
                    value={formState.story}
                    onChange={(e) => setFormState((s) => ({ ...s, story: e.target.value }))}
                    className="w-full px-4 py-3.5 rounded-lg text-[15px] outline-none transition-all duration-200 resize-none"
                    style={{
                      backgroundColor: '#F6F2EC',
                      border: '1px solid #E7E5E4',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#E86A34'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,106,52,0.15)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#E7E5E4'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-4 rounded-lg text-[15px] font-semibold text-white transition-all duration-250 hover:scale-[1.01] active:scale-[0.99] mt-2"
                  style={{ backgroundColor: '#E86A34' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#D15A28'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#E86A34'
                  }}
                >
                  Submit Your Story
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════ MAIN STORIES PAGE ═══════════════════════ */
export default function Stories() {
  const [activeFilter, setActiveFilter] = useState<StoryCategory>('All Stories')
  const heroRef = useRef<HTMLDivElement>(null)

  /* hero entrance — GSAP isolated */
  useGSAP(() => {
    if (!heroRef.current) return
    const tl = gsap.timeline()
    tl.fromTo('.st-hero-overline', { opacity: 0 }, { opacity: 1, duration: 0.4 })
      .fromTo('.st-hero-headline', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0.2)
      .fromTo('.st-hero-sub', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0.4)
      .fromTo('.st-hero-tab', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: 'power3.out' }, 0.6)
  }, { scope: heroRef })

  const isStoryVisible = (storyKey: string) => {
    return categoryFilterMap[storyKey]?.includes(activeFilter) ?? true
  }

  return (
    <div>
      {/* ─────────────── Section 1: Hero ─────────────── */}
      <section
        ref={heroRef}
        className="relative pt-[120px] md:pt-[160px] pb-[80px] md:pb-[96px] overflow-hidden"
        style={{ backgroundColor: '#1A1A1A' }}
      >
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'url(/hero-overlay-pattern.png)',
            backgroundSize: '512px',
            backgroundRepeat: 'repeat',
            backgroundPosition: 'center',
            opacity: 0.03,
          }}
        />
        <div className="relative max-w-[800px] mx-auto px-6 text-center">
          <p
            className="st-hero-overline text-[13px] font-medium tracking-[0.1em] uppercase"
            style={{ color: '#E86A34' }}
          >
            REAL STORIES, REAL IMPACT
          </p>
          <h1 className="st-hero-headline mt-5 text-[36px] md:text-[64px] font-extrabold leading-tight tracking-[-0.03em]" style={{ color: '#F6F2EC', lineHeight: 1.05 }}>
            Meet the Entrepreneurs Leading South Africa&apos;s Digital Economy
          </h1>
          <p className="st-hero-sub mt-5 text-[16px] md:text-[20px] leading-relaxed max-w-[640px] mx-auto" style={{ color: 'rgba(246,242,236,0.75)' }}>
            From Alexandra to Khayelitsha, from furniture workshops to catering kitchens — these are the stories of South Africans who are building the future of informal commerce, one digital tool at a time.
          </p>

          {/* Filter tabs */}
          <div className="mt-10 md:mt-12 flex flex-wrap items-center justify-center gap-2">
            {storyCategories.map((cat) => (
              <motion.button
                key={cat}
                className="st-hero-tab px-5 py-2.5 rounded-full text-[14px] font-medium transition-colors duration-200"
                style={{
                  backgroundColor: activeFilter === cat ? '#F6F2EC' : '#2A2A2A',
                  color: activeFilter === cat ? '#1A1A1A' : 'rgba(246,242,236,0.7)',
                }}
                onClick={() => setActiveFilter(cat)}
                whileHover={activeFilter !== cat ? { backgroundColor: '#3A3A3A' } : {}}
                whileTap={{ scale: 0.97 }}
              >
                {cat}
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── Featured Stories ─────────────── */}
      <AnimatePresence mode="wait">
        {stories.map((story) =>
          isStoryVisible(story.storyKey) ? (
            <motion.div
              key={story.storyKey}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: easeSmooth }}
            >
              <FeaturedStory story={story} />
            </motion.div>
          ) : null
        )}
      </AnimatePresence>

      {/* ─────────────── Section 5: Community Voices ─────────────── */}
      <CommunityVoicesSection />

      {/* ─────────────── Section 6: Share Your Story ─────────────── */}
      <ShareStorySection />
    </div>
  )
}

/* ═────────────────── Community Voices Section ─────────────────── */
function CommunityVoicesSection() {
  const sectionRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!sectionRef.current) return
    gsap.fromTo(
      '.comm-heading',
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 85%',
          once: true,
        },
      }
    )
  }, { scope: sectionRef })

  return (
    <section
      ref={sectionRef}
      className="py-[80px] md:py-[128px]"
      style={{ backgroundColor: '#1A1A1A' }}
    >
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="text-center mb-12 md:mb-16">
          <p
            className="comm-heading text-[13px] font-medium tracking-[0.1em] uppercase"
            style={{ color: '#F5B800' }}
          >
            COMMUNITY VOICES
          </p>
          <h2
            className="comm-heading mt-4 text-[32px] md:text-[48px] font-extrabold tracking-[-0.02em]"
            style={{ color: '#F6F2EC' }}
          >
            What Business Owners Are Saying
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <TestimonialCard key={t.name} testimonial={t} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
