'use client'

import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import {
  Download,
  Check,
} from 'lucide-react'

gsap.registerPlugin(ScrollTrigger)

/* ─────────────── Animation Variants (Framer Motion) ─────────────── */

const fadeUpStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

const fadeUpItem = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

const cardStagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15 },
  },
}

const cardItem = {
  hidden: { opacity: 0, y: 60 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

/* ─────────────── GSAP Isolated: CountUp Stat ─────────────── */

interface CountUpStatProps {
  end: number
  prefix?: string
  suffix?: string
  decimals?: number
  duration?: number
  label: string
  context: string
}

function CountUpStatGSAP({ end, prefix = '', suffix = '', decimals = 0, duration = 1.5, label, context }: CountUpStatProps) {
  const valueRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasAnimated = useRef(false)

  useGSAP(() => {
    if (!valueRef.current || !containerRef.current) return

    const obj = { value: 0 }

    gsap.fromTo(
      containerRef.current,
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top 85%',
          once: true,
        },
      }
    )

    ScrollTrigger.create({
      trigger: containerRef.current,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        if (hasAnimated.current) return
        hasAnimated.current = true
        gsap.to(obj, {
          value: end,
          duration,
          ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
          onUpdate: () => {
            if (valueRef.current) {
              valueRef.current.textContent = `${prefix}${obj.value.toFixed(decimals)}${suffix}`
            }
          },
        })
      },
    })
  }, { scope: containerRef })

  return (
    <div ref={containerRef} className="flex-1 px-6 md:px-8 py-10 md:py-12 text-center">
      <div
        ref={valueRef}
        className="text-[40px] md:text-[72px] font-black text-[#E86A34] leading-none tracking-[-0.04em]"
      >
        {prefix}{end.toFixed(decimals)}{suffix}
      </div>
      <h3 className="mt-4 text-[20px] md:text-[32px] font-semibold text-[#F6F2EC] leading-[1.2] tracking-[-0.01em]">
        {label}
      </h3>
      <p className="mt-3 text-[14px] md:text-[16px] text-[#F6F2EC]/60 leading-relaxed max-w-[280px] mx-auto">
        {context}
      </p>
    </div>
  )
}

/* ─────────────── GSAP Isolated: Horizontal Bar Chart ─────────────── */

const barData = [
  { category: 'Productivity Gains', value: '$1.3B', width: 100 },
  { category: 'Platform Commerce', value: '$980M', width: 75 },
  { category: 'Supplier Coordination', value: '$410M', width: 32 },
  { category: 'Customer Reach', value: '$310M', width: 24 },
  { category: 'Payment Efficiency', value: '$280M', width: 22 },
]

function BarChartGSAP() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!containerRef.current) return
    const bars = containerRef.current.querySelectorAll('.bar-fill')
    const labels = containerRef.current.querySelectorAll('.bar-label')

    bars.forEach((bar, i) => {
      const targetWidth = barData[i].width
      gsap.fromTo(
        bar,
        { width: '0%' },
        {
          width: `${targetWidth}%`,
          duration: 1.2,
          delay: i * 0.15,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top 80%',
            once: true,
          },
        }
      )
    })

    labels.forEach((label, i) => {
      gsap.fromTo(
        label,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.5,
          delay: i * 0.15 + 0.3,
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top 80%',
            once: true,
          },
        }
      )
    })
  }, { scope: containerRef })

  return (
    <div ref={containerRef} className="max-w-[900px] mx-auto mt-16 space-y-4">
      {barData.map((bar) => (
        <div key={bar.category} className="flex items-center gap-4">
          <div className="flex-shrink-0 w-[160px] md:w-[200px] text-right">
            <span className="bar-label text-[16px] md:text-[24px] font-semibold text-[#1A1A1A] block">
              {bar.category}
            </span>
            <span className="bar-label text-[13px] text-[#78716C] block">{bar.value}</span>
          </div>
          <div className="flex-1 h-14 bg-white rounded-xl overflow-hidden">
            <div
              className="bar-fill h-full rounded-xl"
              style={{
                background: 'linear-gradient(90deg, #E86A34, #F5B800)',
                width: '0%',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────────────── GSAP Isolated: Donut Chart ─────────────── */

function DonutChartGSAP() {
  const circleRef = useRef<SVGCircleElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef<HTMLDivElement>(null)
  const hasAnimated = useRef(false)

  const circumference = 2 * Math.PI * 120 // r=120
  const targetOffset = circumference * 0.9 // 90%

  useGSAP(() => {
    if (!circleRef.current || !containerRef.current || !valueRef.current) return

    gsap.fromTo(
      containerRef.current,
      { opacity: 0, scale: 0.9 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top 85%',
          once: true,
        },
      }
    )

    const obj = { value: 0 }

    ScrollTrigger.create({
      trigger: containerRef.current,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        if (hasAnimated.current) return
        hasAnimated.current = true
        gsap.to(obj, {
          value: 90,
          duration: 1.5,
          ease: 'power2.out',
          onUpdate: () => {
            if (valueRef.current) {
              valueRef.current.textContent = `${Math.round(obj.value)}%`
            }
          },
        })
        gsap.fromTo(
          circleRef.current,
          { strokeDashoffset: circumference },
          {
            strokeDashoffset: targetOffset,
            duration: 1.5,
            ease: 'power2.out',
          }
        )
      },
    })
  }, { scope: containerRef })

  return (
    <div ref={containerRef} className="flex flex-col items-center">
      <div className="relative w-[240px] h-[240px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 260 260">
          {/* Background circle */}
          <circle
            cx="130"
            cy="130"
            r="120"
            fill="none"
            stroke="rgba(246,242,236,0.15)"
            strokeWidth="20"
          />
          {/* Foreground circle */}
          <circle
            ref={circleRef}
            cx="130"
            cy="130"
            r="120"
            fill="none"
            stroke="#F5B800"
            strokeWidth="20"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div ref={valueRef} className="text-[80px] font-black text-[#F5B800] leading-none tracking-[-0.04em]">
            0%
          </div>
        </div>
      </div>
      <p className="mt-6 text-[16px] text-[#F6F2EC]/70 text-center max-w-[200px]">
        of informal businesses still cash-only
      </p>
    </div>
  )
}

/* ─────────────── GSAP Isolated: Mini Stat CountUp ─────────────── */

function MiniStatGSAP({ end, prefix = '', suffix = '', duration = 1.2, label }: {
  end: number; prefix?: string; suffix?: string; duration?: number; label: string
}) {
  const valueRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasAnimated = useRef(false)

  useGSAP(() => {
    if (!valueRef.current || !containerRef.current) return
    const obj = { value: 0 }

    ScrollTrigger.create({
      trigger: containerRef.current,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        if (hasAnimated.current) return
        hasAnimated.current = true
        gsap.fromTo(
          containerRef.current,
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' }
        )
        gsap.to(obj, {
          value: end,
          duration,
          ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
          onUpdate: () => {
            if (valueRef.current) {
              valueRef.current.textContent = `${prefix}${end >= 100 ? Math.round(obj.value).toLocaleString() : obj.value.toFixed(0)}${suffix}`
            }
          },
        })
      },
    })
  }, { scope: containerRef })

  return (
    <div ref={containerRef} className="text-center py-4">
      <div ref={valueRef} className="text-[32px] md:text-[48px] font-black text-[#F5B800] leading-none tracking-[-0.03em]">
        {prefix}0{suffix}
      </div>
      <p className="mt-2 text-[13px] md:text-[15px] text-[#F6F2EC]/70">{label}</p>
    </div>
  )
}

/* ─────────────── Section 1: Impact Hero ─────────────── */

function ImpactHero() {
  const bgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!bgRef.current) return
    gsap.fromTo(
      bgRef.current,
      { scale: 1.05 },
      { scale: 1, duration: 2.5, ease: 'power2.out' }
    )
  }, [])

  return (
    <section className="relative min-h-[70vh] flex items-center overflow-hidden">
      <div
        ref={bgRef}
        className="absolute inset-0"
        style={{ transformOrigin: 'center center' }}
      >
        <Image
          src="/impact-hero.jpg"
          alt="Busy South African informal trading market"
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(26,26,26,0.55) 0%, rgba(26,26,26,0.8) 100%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-[720px] pl-[8vw] pr-6 py-24">
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="text-[13px] font-medium uppercase tracking-[0.1em] text-[#F5B800]"
        >
          MEASURABLE IMPACT
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mt-4 text-[36px] md:text-[64px] font-extrabold text-white leading-[1.0] tracking-[-0.03em]"
        >
          $2.9 Billion in GDP. Real Numbers. Real Growth.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mt-6 text-[16px] md:text-[20px] text-white/85 leading-relaxed max-w-[580px]"
        >
          Inyuku Digital and the broader digital ecosystem are generating measurable economic impact across South Africa's SME and informal economy — from productivity gains to formalization pathways.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mt-10"
        >
          <button
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg text-[15px] font-semibold transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: '#FFFFFF', color: '#E86A34' }}
          >
            <Download className="w-5 h-5" />
            Download Impact Report
          </button>
        </motion.div>
      </div>
    </section>
  )
}

/* ─────────────── Section 2: Key Metrics Dashboard ─────────────── */

function KeyMetricsDashboard() {
  return (
    <section className="py-[64px] md:py-[96px]" style={{ backgroundColor: '#1A1A1A' }}>
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
          <CountUpStatGSAP
            end={2.9}
            prefix="$"
            suffix="B"
            decimals={1}
            duration={1.5}
            label="contributed to South African GDP"
            context="through Meta platform-enabled commerce in 2025"
          />
          <CountUpStatGSAP
            end={1.3}
            prefix="$"
            suffix="B"
            decimals={1}
            duration={1.5}
            label="in productivity gains"
            context="from faster coordination and lower transaction costs"
          />
          <CountUpStatGSAP
            end={910}
            suffix="K"
            decimals={0}
            duration={1.5}
            label="SMEs using digital storefronts"
            context="on Facebook, Instagram, and WhatsApp"
          />
          <CountUpStatGSAP
            end={51}
            suffix="%"
            decimals={0}
            duration={1.5}
            label="of informal businesses report"
            context="strong customer interest in paying by card"
          />
        </div>
      </div>
    </section>
  )
}

/* ─────────────── Section 3: Meta Research Findings ─────────────── */

const findings = [
  {
    num: 1,
    title: 'Platform Adoption Is Already Widespread',
    body: "910,000 South African SMEs used Meta's platforms as digital storefronts in 2025, contributing an estimated $2.9 billion to GDP and generating $1.3 billion in productivity gains from faster coordination and lower transaction costs.",
  },
  {
    num: 2,
    title: 'Informal Businesses Are Ready to Formalize',
    body: 'When digital tools are accessible, affordable, and delivered through familiar channels, informal businesses rapidly adopt them. WhatsApp Business has become the de facto operating system for township commerce.',
  },
  {
    num: 3,
    title: 'The Gap Is the Opportunity',
    body: "Despite the adoption already seen, this represents only a fraction of the potential. 90% of informal enterprises remain cash-only, and the demand for digital payments, inventory management, and business tools far outstrips supply.",
  },
]

function MetaResearch() {
  return (
    <section className="py-[80px] md:py-[128px]" style={{ backgroundColor: '#F6F2EC' }}>
      <div className="max-w-[1280px] mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUpStagger}
          className="text-center mb-16 md:mb-20"
        >
          <motion.p variants={fadeUpItem} className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#E86A34]">
            RESEARCH FOUNDATION
          </motion.p>
          <motion.h2 variants={fadeUpItem} className="mt-3 text-[28px] md:text-[64px] font-extrabold text-[#1A1A1A] leading-[1.0] tracking-[-0.03em]">
            Evidence from Meta's Economic Impact Research
          </motion.h2>
          <motion.p variants={fadeUpItem} className="mt-6 text-[16px] md:text-[20px] text-[#444444] leading-relaxed max-w-[720px] mx-auto">
            Meta's 2025 economic impact study on South Africa provides the research foundation that validates the opportunity for digital transformation in the informal economy.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-12 lg:gap-16">
          {/* Left: Findings */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.2 } },
            }}
            className="space-y-0"
          >
            {findings.map((finding, i) => (
              <motion.div
                key={finding.num}
                variants={fadeUpItem}
                className="flex gap-6 py-8"
                style={{ borderBottom: i < findings.length - 1 ? '1px solid #E7E5E4' : 'none' }}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.3 }}
                  className="flex-shrink-0 w-10 h-10 rounded-full bg-[#E86A34] flex items-center justify-center"
                >
                  <span className="text-white text-[16px] font-bold">{finding.num}</span>
                </motion.div>
                <div>
                  <h3 className="text-[20px] md:text-[32px] font-semibold text-[#1A1A1A] leading-[1.2] tracking-[-0.01em]">
                    {finding.title}
                  </h3>
                  <p className="mt-3 text-[16px] md:text-[20px] text-[#444444] leading-relaxed">
                    {finding.body}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Right: Pull Quote */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 1.0, delay: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="lg:sticky lg:top-[120px] self-start"
          >
            <div className="bg-[#1A1A1A] rounded-[20px] p-8 md:p-12">
              <div className="text-[72px] md:text-[96px] font-black text-[#E86A34] leading-[0.5]">&ldquo;</div>
              <p className="mt-4 text-[20px] md:text-[32px] font-bold text-[#F6F2EC] leading-[1.3] tracking-[-0.01em]">
                The opportunity for AI agents is to build on this behavioral foundation, adding intelligence, automation, and integration that transforms WhatsApp-based commerce into a comprehensive business management platform.
              </p>
              <p className="mt-6 text-[13px] font-medium text-[#78716C]">
                — Meta Economic Impact Research, 2025
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── Section 4: Government Alignment ─────────────── */

const initiatives = [
  {
    amount: 'R500 Million',
    title: 'Spaza Shop Support Fund (SSSF)',
    desc: 'Launched by the Department of Small Business Development, targeting digital transformation and financial inclusion for informal spaza shops through financial assistance, infrastructure upgrades, and business training.',
    alignment: 'Direct funding pathway for digital payment systems and inventory management tools',
  },
  {
    amount: 'National',
    title: 'SITA Broadband Expansion',
    desc: "SITA's expanding broadband connectivity progressively addresses the infrastructure barrier that currently limits digital adoption in underserved communities.",
    alignment: 'Enables the connectivity layer Inyuku Digital depends on',
  },
  {
    amount: 'National',
    title: 'Digital Literacy Programs',
    desc: 'Government digital literacy programs address the skills gap that prevents informal business owners from adopting digital tools.',
    alignment: "Reduces the adoption barrier for Inyuku Digital's user base",
  },
]

function GovernmentAlignment() {
  return (
    <section className="py-[80px] md:py-[128px] bg-white">
      <div className="max-w-[1280px] mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUpStagger}
          className="text-center mb-16"
        >
          <motion.p variants={fadeUpItem} className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#2D7A3E]">
            POLICY ALIGNMENT
          </motion.p>
          <motion.h2 variants={fadeUpItem} className="mt-3 text-[28px] md:text-[64px] font-extrabold text-[#1A1A1A] leading-[1.0] tracking-[-0.03em]">
            Aligned with National Priorities
          </motion.h2>
          <motion.p variants={fadeUpItem} className="mt-6 text-[16px] md:text-[20px] text-[#444444] leading-relaxed max-w-[720px] mx-auto">
            Inyuku Digital is designed to complement and accelerate South Africa's government-led digital inclusion and economic development initiatives.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={cardStagger}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-[1200px] mx-auto"
        >
          {initiatives.map((item) => (
            <motion.div
              key={item.title}
              variants={cardItem}
              whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}
              transition={{ duration: 0.3 }}
              className="rounded-[20px] p-8 md:p-12"
              style={{ backgroundColor: '#F6F2EC' }}
            >
              <motion.span
                initial={{ scale: 0.9 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="inline-block bg-[#2D7A3E] text-white text-[13px] font-medium uppercase tracking-[0.08em] rounded-lg px-4 py-2"
              >
                {item.amount}
              </motion.span>
              <h3 className="mt-6 text-[20px] md:text-[32px] font-semibold text-[#1A1A1A] leading-[1.2] tracking-[-0.01em]">
                {item.title}
              </h3>
              <p className="mt-4 text-[15px] md:text-[16px] text-[#444444] leading-relaxed">
                {item.desc}
              </p>
              <div
                className="mt-8 pt-6"
                style={{ borderTop: '2px solid #E7E5E4' }}
              >
                <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-[#2D7A3E]">
                  INYUKU ALIGNMENT
                </p>
                <p className="mt-2 text-[15px] text-[#444444] leading-relaxed">
                  {item.alignment}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─────────────── Section 5: Economic Contribution Breakdown ─────────────── */

function EconomicContribution() {
  return (
    <section className="py-[80px] md:py-[128px]" style={{ backgroundColor: '#F6F2EC' }}>
      <div className="max-w-[1280px] mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUpStagger}
        >
          <motion.p variants={fadeUpItem} className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#E86A34]">
            ECONOMIC CONTRIBUTION
          </motion.p>
          <motion.h2 variants={fadeUpItem} className="mt-3 text-[28px] md:text-[64px] font-extrabold text-[#1A1A1A] leading-[1.0] tracking-[-0.03em]">
            Where the Value Is Created
          </motion.h2>
          <motion.p variants={fadeUpItem} className="mt-6 text-[16px] md:text-[20px] text-[#444444] leading-relaxed max-w-[640px]">
            The $2.9 billion GDP contribution is distributed across multiple value chains — each representing an opportunity for further digitization and formalization.
          </motion.p>
        </motion.div>

        <BarChartGSAP />
      </div>
    </section>
  )
}

/* ─────────────── Section 6: Scale Potential ─────────────── */

const scaleBullets = [
  'Direct integration with SASSA grant disbursement systems',
  'Municipal partnership programs for township business development',
  'Progressive infrastructure improvement through SITA broadband',
  'Growing digital literacy reducing the skills barrier',
]

function ScalePotential() {
  return (
    <section className="py-[80px] md:py-[128px]" style={{ backgroundColor: '#7C2D4E' }}>
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeUpStagger}
          >
            <motion.p variants={fadeUpItem} className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#F5B800]">
              GROWTH POTENTIAL
            </motion.p>
            <motion.h2 variants={fadeUpItem} className="mt-3 text-[28px] md:text-[64px] font-extrabold text-[#F6F2EC] leading-[1.0] tracking-[-0.03em]">
              This Is Just the Beginning
            </motion.h2>
            <motion.p variants={fadeUpItem} className="mt-6 text-[16px] md:text-[20px] text-[#F6F2EC]/85 leading-relaxed">
              With 90% of informal enterprises still operating as cash-only businesses, the scale potential is enormous. SASSA grant recipient linkages and municipal partnership programs could accelerate adoption across millions of businesses.
            </motion.p>
            <motion.ul
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.1 } },
              }}
              className="mt-8 space-y-4"
            >
              {scaleBullets.map((bullet) => (
                <motion.li
                  key={bullet}
                  variants={fadeUpItem}
                  className="flex items-start gap-3 text-[15px] md:text-[16px] text-[#F6F2EC]/90"
                >
                  <Check className="w-5 h-5 text-[#F5B800] flex-shrink-0 mt-0.5" />
                  {bullet}
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>

          {/* Right: Donut + Mini Stats */}
          <div>
            <DonutChartGSAP />
            <div className="mt-8 grid grid-cols-3 divide-x divide-white/10">
              <MiniStatGSAP end={3.5} suffix="M+" label="informal businesses in South Africa" />
              <MiniStatGSAP end={500} prefix="R" suffix="M" label="Spaza Shop Support Fund allocation" />
              <MiniStatGSAP end={51} suffix="%" label="demand for card payments" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── Section 7: CTA — Download Report ─────────────── */

function ReportCTA() {
  const [email, setEmail] = useState('')

  return (
    <section className="py-[64px] md:py-[96px]" style={{ backgroundColor: '#1A1A1A' }}>
      <div className="max-w-[700px] mx-auto px-6 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="text-[28px] md:text-[64px] font-extrabold text-[#F6F2EC] leading-[1.0] tracking-[-0.03em]"
        >
          Get the Full Impact Report
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mt-6 text-[16px] md:text-[20px] text-[#F6F2EC]/80 leading-relaxed"
        >
          Download our comprehensive impact report with full economic modeling, research methodology, and detailed breakdowns of the GDP contribution data.
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full sm:w-auto flex-1 max-w-[360px] px-5 py-4 rounded-lg text-[15px] text-[#F6F2EC] placeholder:text-[#78716C] outline-none focus:ring-2 focus:ring-[#E86A34]"
            style={{
              backgroundColor: '#2A2A2A',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          />
          <button
            type="submit"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-lg text-[15px] font-semibold text-white transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: '#E86A34' }}
          >
            <Download className="w-5 h-5" />
            Download Report
          </button>
        </motion.form>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-4 text-[13px] text-[#78716C]"
        >
          Free download. No spam. We respect your privacy.
        </motion.p>
      </div>
    </section>
  )
}

/* ─────────────── Main Page Component ─────────────── */

export default function Impact() {
  return (
    <div>
      <ImpactHero />
      <KeyMetricsDashboard />
      <MetaResearch />
      <GovernmentAlignment />
      <EconomicContribution />
      <ScalePotential />
      <ReportCTA />
    </div>
  )
}
