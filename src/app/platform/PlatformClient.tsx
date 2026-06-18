'use client'

import { useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import {
  ShoppingBag,
  CreditCard,
  Truck,
  MessageCircle,
  Brain,
  Clock,
  Users,
  FileText,
  Smartphone,
  Wallet,
  TrendingUp,
  Shield,
  Play,
  MessageSquare,
} from 'lucide-react'
import { CheckmarkIcon } from '@/components/icons'

gsap.registerPlugin(ScrollTrigger)

/* ─────────────── Animation Variants ─────────────── */

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

const slideInRight = {
  hidden: { opacity: 0, x: 60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 1.0, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

/* ─────────────── GSAP Isolated: Stat Overlay ─────────────── */

function StatOverlayGSAP() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!containerRef.current) return
    gsap.from(containerRef.current, {
      y: 20,
      opacity: 0,
      duration: 0.8,
      delay: 0.5,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: containerRef.current,
        start: 'top 85%',
        once: true,
      },
    })
  }, { scope: containerRef })

  return (
    <div
      ref={containerRef}
      className="absolute bottom-6 left-6 bg-white rounded-xl p-6 shadow-lg"
    >
      <div className="text-[48px] font-black text-[#E86A34] leading-none tracking-[-0.04em]">
        51%
      </div>
      <p className="mt-2 text-[13px] font-medium text-[#78716C] max-w-[180px] leading-snug">
        of informal businesses want card payment options
      </p>
    </div>
  )
}

/* ─────────────── GSAP Isolated: Chat Bubbles ─────────────── */

function ChatBubblesGSAP() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (!containerRef.current) return
    const bubbles = containerRef.current.querySelectorAll('.chat-bubble')
    gsap.fromTo(
      bubbles,
      { opacity: 0, y: 10, scale: 0.95 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        stagger: 0.4,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top 80%',
          once: true,
        },
      }
    )
  }, { scope: containerRef })

  return (
    <div ref={containerRef} className="flex flex-col gap-3 p-4">
      <div className="chat-bubble self-start bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm max-w-[80%]">
        <p className="text-[11px] text-[#444444]">Hi! Do you have mazoe juice in stock?</p>
      </div>
      <div className="chat-bubble self-end bg-[#DCF8C6] rounded-lg rounded-tr-none px-3 py-2 shadow-sm max-w-[80%]">
        <p className="text-[11px] text-[#1A1A1A]">Yes! We have 500ml and 2 litre bottles. R18 and R55.</p>
      </div>
      <div className="chat-bubble self-start bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm max-w-[80%]">
        <p className="text-[11px] text-[#444444]">Great, can I order 2 x 500ml for delivery?</p>
      </div>
      <div className="chat-bubble self-end bg-[#DCF8C6] rounded-lg rounded-tr-none px-3 py-2 shadow-sm max-w-[80%]">
        <p className="text-[11px] text-[#1A1A1A]">Sure! Total is R36. Click below to pay:</p>
        <button className="mt-2 bg-[#E86A34] text-white text-[10px] font-semibold px-4 py-1.5 rounded-full">
          Pay Now R36
        </button>
      </div>
      <div className="chat-bubble self-start flex items-center gap-2 text-[#78716C]">
        <span className="text-[10px]">Delivered</span>
        <CheckmarkIcon className="w-3 h-3 text-[#2D7A3E]" />
      </div>
    </div>
  )
}

/* ─────────────── Section 1: Hero ─────────────── */

function PlatformHero() {
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
          src="/platform-hero.jpg"
          alt="Shopkeeper with smartphone"
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(26,26,26,0.6) 0%, rgba(26,26,26,0.85) 100%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-[680px] pl-[8vw] pr-6 py-24">
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="text-[13px] font-medium uppercase tracking-[0.1em] text-[#F5B800]"
        >
          INYUKU DIGITAL PLATFORM
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mt-4 text-[36px] md:text-[64px] font-extrabold text-white leading-[1.0] tracking-[-0.03em]"
        >
          Your Business, Powered by AI
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mt-6 text-[16px] md:text-[20px] text-white/85 leading-relaxed max-w-[560px]"
        >
          An intelligent platform that transforms how South African SMEs and informal businesses operate — from order management and payments to inventory tracking and customer relationships.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <Link href="/platform"
            className="inline-flex items-center px-8 py-4 rounded-lg text-[15px] font-semibold transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: '#FFFFFF', color: '#E86A34' }}
          >
            Start Free Trial
          </Link>
          <button
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg text-[15px] font-semibold text-white transition-all duration-250 hover:scale-[1.02]"
            style={{ border: '1.5px solid rgba(255,255,255,0.4)', backgroundColor: 'transparent' }}
          >
            <Play className="w-4 h-4" />
            Watch Demo
          </button>
        </motion.div>
      </div>
    </section>
  )
}

/* ─────────────── Section 2: Three Pillars ─────────────── */

const pillars = [
  {
    num: '01',
    title: 'Connect',
    desc: 'Meet your customers where they already are — on WhatsApp, the operating system of township commerce.',
    features: ['WhatsApp Business integration', 'Product catalog', 'Order management', 'Broadcast messaging'],
  },
  {
    num: '02',
    title: 'Automate',
    desc: 'Let AI handle the repetitive work — from inventory alerts to payment reminders — so you can focus on growing your business.',
    features: ['AI business agent', 'Auto inventory tracking', 'Smart payment reminders', 'Business reports'],
  },
  {
    num: '03',
    title: 'Grow',
    desc: 'Build a verified digital profile that unlocks access to formal credit, new markets, and government support programs.',
    features: ['Digital transaction history', 'Credit scoring', 'Market expansion', 'Government program integration'],
  },
]

function ThreePillars() {
  return (
    <section className="py-[80px] md:py-[128px]" style={{ backgroundColor: '#F6F2EC' }}>
      <div className="max-w-[1280px] mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUpStagger}
          className="text-center mb-16"
        >
          <motion.p variants={fadeUpItem} className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#E86A34]">
            HOW IT WORKS
          </motion.p>
          <motion.h2 variants={fadeUpItem} className="mt-3 text-[28px] md:text-[64px] font-extrabold text-[#1A1A1A] leading-[1.0] tracking-[-0.03em]">
            Three Pillars of Digital Transformation
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={cardStagger}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-[1200px] mx-auto"
        >
          {pillars.map((pillar) => (
            <motion.div
              key={pillar.num}
              variants={cardItem}
              whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}
              transition={{ duration: 0.3 }}
              className="relative bg-white border border-[#E7E5E4] rounded-[20px] p-8 md:p-12 overflow-hidden"
              style={{ borderLeftWidth: '4px', borderLeftColor: '#E86A34' }}
            >
              <span className="absolute top-4 right-4 text-[80px] font-black text-[#E7E5E4] leading-none select-none">
                {pillar.num}
              </span>
              <h3 className="text-[28px] md:text-[48px] font-bold text-[#1A1A1A] leading-[1.1] tracking-[-0.02em] relative z-10">
                {pillar.title}
              </h3>
              <p className="mt-4 text-[16px] md:text-[20px] text-[#444444] leading-relaxed relative z-10">
                {pillar.desc}
              </p>
              <ul className="mt-8 space-y-3 relative z-10">
                {pillar.features.map((f, i) => (
                  <motion.li
                    key={f}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.08, duration: 0.5 }}
                    className="flex items-center gap-3 text-[15px] text-[#444444]"
                  >
                    <CheckmarkIcon className="w-5 h-5 text-[#2D7A3E] flex-shrink-0" />
                    {f}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─────────────── Section 3: WhatsApp Commerce Engine ─────────────── */

const whatsappFeatures = [
  {
    icon: ShoppingBag,
    title: 'Product Catalog',
    desc: 'Create a digital product catalog within WhatsApp — with images, prices, and stock levels that update automatically.',
  },
  {
    icon: CreditCard,
    title: 'In-Chat Payments',
    desc: 'Send payment links directly in WhatsApp conversations. Customers pay by card or instant EFT without leaving the chat.',
  },
  {
    icon: Truck,
    title: 'Order Tracking',
    desc: 'Every order gets a tracking number. Customers get automatic status updates — received, preparing, ready, delivered.',
  },
  {
    icon: MessageCircle,
    title: 'Auto-Responses',
    desc: 'AI-powered responses handle common questions 24/7 — hours, prices, stock availability, delivery areas — in English, isiZulu, isiXhosa, and Afrikaans.',
  },
]

function WhatsAppCommerce() {
  return (
    <section className="py-[80px] md:py-[128px] bg-white">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUpStagger}
          >
            <motion.p variants={fadeUpItem} className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#0D9488]">
              CORE FEATURE
            </motion.p>
            <motion.h2 variants={fadeUpItem} className="mt-3 text-[28px] md:text-[64px] font-extrabold text-[#1A1A1A] leading-[1.0] tracking-[-0.03em]">
              WhatsApp Is Already Your Storefront. We Make It Smarter.
            </motion.h2>
            <motion.p variants={fadeUpItem} className="mt-6 text-[16px] md:text-[20px] text-[#444444] leading-relaxed">
              Informal traders across South Africa already use WhatsApp to manage orders, coordinate with suppliers, and reach customers. Inyuku Digital amplifies this behavior — adding product catalogs, payment links, order tracking, and automated responses.
            </motion.p>

            <div className="mt-10 space-y-6">
              {whatsappFeatures.map((feat, i) => (
                <motion.div
                  key={feat.title}
                  variants={fadeUpItem}
                  className="flex gap-4 pb-6"
                  style={{ borderBottom: i < whatsappFeatures.length - 1 ? '1px solid #E7E5E4' : 'none' }}
                >
                  <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
                    <feat.icon className="w-10 h-10 text-[#0D9488]" />
                  </div>
                  <div>
                    <h4 className="text-[18px] md:text-[24px] font-semibold text-[#1A1A1A] leading-[1.3]">
                      {feat.title}
                    </h4>
                    <p className="mt-1 text-[15px] md:text-[16px] text-[#444444] leading-relaxed">
                      {feat.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right: Phone Mockup */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={slideInRight}
            className="flex justify-center"
          >
            <div
              className="relative w-[280px] h-[520px] rounded-[40px] p-3 shadow-2xl"
              style={{
                backgroundColor: '#1A1A1A',
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                transform: 'rotate(-3deg)',
              }}
            >
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#1A1A1A] rounded-b-xl z-10" />
              {/* Screen */}
              <div className="w-full h-full bg-[#E8F5E9] rounded-[32px] overflow-hidden relative">
                {/* WhatsApp Header */}
                <div className="bg-[#0D9488] text-white px-4 pt-8 pb-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold leading-tight">Inyuku Shop</p>
                    <p className="text-[9px] text-white/70">online</p>
                  </div>
                </div>
                <ChatBubblesGSAP />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── Section 4: AI Business Agent ─────────────── */

const aiCapabilities = [
  {
    icon: Brain,
    title: 'Smart Inventory',
    desc: 'Tracks stock levels automatically. Alerts you when items are running low. Suggests reorder quantities based on sales patterns.',
  },
  {
    icon: Clock,
    title: 'Payment Reminders',
    desc: 'Automatically sends friendly payment reminders to customers with outstanding balances. No awkward conversations needed.',
  },
  {
    icon: Users,
    title: 'Customer Insights',
    desc: 'Identifies your best customers, tracks purchase patterns, and suggests personalized promotions to increase loyalty.',
  },
  {
    icon: FileText,
    title: 'Business Reports',
    desc: 'Generates weekly and monthly reports — sales, expenses, profit margins — in plain language you can actually understand.',
  },
]

function AIBusinessAgent() {
  return (
    <section className="py-[80px] md:py-[128px]" style={{ backgroundColor: '#1A1A1A' }}>
      <div className="max-w-[1280px] mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUpStagger}
          className="text-center mb-16"
        >
          <motion.p variants={fadeUpItem} className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#F5B800]">
            ARTIFICIAL INTELLIGENCE
          </motion.p>
          <motion.h2 variants={fadeUpItem} className="mt-3 text-[28px] md:text-[64px] font-extrabold text-[#F6F2EC] leading-[1.0] tracking-[-0.03em]">
            Your 24/7 Business Assistant
          </motion.h2>
          <motion.p variants={fadeUpItem} className="mt-6 text-[16px] md:text-[20px] text-[#F6F2EC]/80 leading-relaxed max-w-[700px] mx-auto">
            An AI agent that understands South African commerce — available in multiple languages, trained on local business patterns, and designed for entrepreneurs who've never used business software before.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={cardStagger}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-[1200px] mx-auto"
        >
          {aiCapabilities.map((cap) => (
            <motion.div
              key={cap.title}
              variants={cardItem}
              whileHover={{
                y: -2,
                borderColor: 'rgba(245,184,0,0.3)',
              }}
              transition={{ duration: 0.3 }}
              className="bg-[#2A2A2A] rounded-2xl p-8 md:p-10 border border-transparent"
            >
              <motion.div
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
              >
                <cap.icon className="w-10 h-10 text-[#F5B800]" />
              </motion.div>
              <h3 className="mt-6 text-[22px] md:text-[32px] font-semibold text-[#F6F2EC] leading-[1.2] tracking-[-0.01em]">
                {cap.title}
              </h3>
              <p className="mt-3 text-[15px] md:text-[16px] text-[#F6F2EC]/70 leading-relaxed">
                {cap.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─────────────── Section 5: Payments & Financial Inclusion ─────────────── */

const paymentFeatures = [
  {
    icon: Smartphone,
    title: 'Low-Cost Card Reader',
    desc: 'Compact, affordable card reader that connects to your phone via Bluetooth. Accepts tap, chip, and PIN.',
  },
  {
    icon: Wallet,
    title: 'Instant Settlement',
    desc: 'Money lands in your mobile wallet within minutes — not days. No minimum balance requirements.',
  },
  {
    icon: TrendingUp,
    title: 'Build Credit History',
    desc: 'Every digital transaction builds your business credit profile — unlocking access to formal loans and supplier credit.',
  },
  {
    icon: Shield,
    title: 'Secure & Compliant',
    desc: 'PCI-DSS compliant. All transactions encrypted. Your customers data is always protected.',
  },
]

function PaymentsSection() {
  return (
    <section className="py-[80px] md:py-[128px]" style={{ backgroundColor: '#F6F2EC' }}>
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-12 items-center">
          {/* Left: Image */}
          <motion.div
            initial={{ opacity: 0, scale: 1.05 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="relative"
          >
            <Image
              src="/solutions-spaza.jpg"
              alt="Spaza shop interior with card terminal"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover rounded-[20px]"
            />
            <StatOverlayGSAP />
          </motion.div>

          {/* Right: Text */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUpStagger}
            className="lg:pl-12"
          >
            <motion.p variants={fadeUpItem} className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#2D7A3E]">
              FINANCIAL INCLUSION
            </motion.p>
            <motion.h2 variants={fadeUpItem} className="mt-3 text-[28px] md:text-[64px] font-extrabold text-[#1A1A1A] leading-[1.0] tracking-[-0.03em]">
              From Cash-Only to Card-Ready
            </motion.h2>
            <motion.p variants={fadeUpItem} className="mt-6 text-[16px] md:text-[20px] text-[#444444] leading-relaxed">
              Around 90% of South Africa's informal enterprises are cash-only — even though 51% report strong customer interest in paying by card. Inyuku Digital removes the barriers: low-cost card readers, zero monthly fees, and instant settlements to your mobile money wallet.
            </motion.p>

            <motion.div
              variants={cardStagger}
              className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6"
            >
              {paymentFeatures.map((feat) => (
                <motion.div key={feat.title} variants={cardItem} className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
                    <feat.icon className="w-8 h-8 text-[#2D7A3E]" />
                  </div>
                  <div>
                    <h4 className="text-[16px] md:text-[24px] font-semibold text-[#1A1A1A] leading-[1.3]">
                      {feat.title}
                    </h4>
                    <p className="mt-1 text-[14px] md:text-[16px] text-[#444444] leading-relaxed">
                      {feat.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── Section 6: Multi-Language Support ─────────────── */

const languages = ['English', 'isiZulu', 'isiXhosa', 'Afrikaans', 'Sesotho', 'Setswana', 'Sepedi', 'Xitsonga']

function MultiLanguage() {
  return (
    <section className="py-[64px] md:py-[96px] bg-white">
      <div className="max-w-[1280px] mx-auto px-6 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUpStagger}
        >
          <motion.p variants={fadeUpItem} className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#E86A34]">
            ACCESSIBILITY
          </motion.p>
          <motion.h2 variants={fadeUpItem} className="mt-3 text-[28px] md:text-[48px] font-bold text-[#1A1A1A] leading-[1.1] tracking-[-0.02em]">
            Built for South Africa. In Your Language.
          </motion.h2>
          <motion.p variants={fadeUpItem} className="mt-6 text-[16px] md:text-[20px] text-[#444444] leading-relaxed max-w-[640px] mx-auto">
            The platform interface, AI agent, and customer communications work in the languages South African businesses actually use — not just English.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.06 } },
          }}
          className="mt-12 flex flex-wrap justify-center gap-4"
        >
          {languages.map((lang, i) => (
            <motion.span
              key={lang}
              variants={{
                hidden: { opacity: 0, scale: 0.9 },
                visible: {
                  opacity: 1,
                  scale: 1,
                  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
                },
              }}
              className="inline-flex items-center px-6 py-3 rounded-full text-[13px] font-semibold border cursor-default"
              style={{
                backgroundColor: i === 0 ? '#E86A34' : '#F6F2EC',
                color: i === 0 ? '#FFFFFF' : '#444444',
                borderColor: '#E7E5E4',
              }}
            >
              {lang}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─────────────── Section 7: CTA ─────────────── */

function PlatformCTA() {
  return (
    <section className="py-[64px] md:py-[96px]" style={{ backgroundColor: '#7C2D4E' }}>
      <div className="max-w-[700px] mx-auto px-6 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="text-[28px] md:text-[64px] font-extrabold text-[#F6F2EC] leading-[1.0] tracking-[-0.03em]"
        >
          Start Managing Your Business Smarter Today
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mt-6 text-[16px] md:text-[20px] text-[#F6F2EC]/85 leading-relaxed"
        >
          Join thousands of South African SMEs already using Inyuku Digital. Set up takes less than 5 minutes — and it's free to get started.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link href="/platform"
            className="inline-flex items-center px-8 py-4 rounded-lg text-[15px] font-semibold text-white transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: '#E86A34' }}
          >
            Create Free Account
          </Link>
          <Link href="/about"
            className="inline-flex items-center px-8 py-4 rounded-lg text-[15px] font-semibold text-white transition-all duration-250 hover:scale-[1.02]"
            style={{ border: '1.5px solid rgba(255,255,255,0.4)', backgroundColor: 'transparent' }}
          >
            Schedule a Demo
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, delay: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="mt-8 flex flex-wrap items-center justify-center gap-8"
        >
          {[
            { icon: Shield, label: 'Free Forever' },
            { icon: CreditCard, label: 'No Credit Card' },
            { icon: MessageSquare, label: 'WhatsApp Required' },
          ].map((badge) => (
            <span key={badge.label} className="flex items-center gap-2 text-[13px] font-medium text-[#F6F2EC]/60">
              <badge.icon className="w-4 h-4" />
              {badge.label}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─────────────── Main Page Component ─────────────── */

export default function PlatformClient() {
  return (
    <div>
      <PlatformHero />
      <ThreePillars />
      <WhatsAppCommerce />
      <AIBusinessAgent />
      <PaymentsSection />
      <MultiLanguage />
      <PlatformCTA />
    </div>
  )
}
