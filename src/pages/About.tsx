import { useRef } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import {
  Building2,
  Store,
  Users,
  Globe,
  BarChart3,
  HandHeart,
} from 'lucide-react';
import { Link } from 'react-router';

gsap.registerPlugin(ScrollTrigger);

/* ─────────────────────── Animation Variants ─────────────────────── */

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const staggerContainerSlow = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.2 } },
};

const cardStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const easeOutExpo = [0.16, 1, 0.3, 1] as [number, number, number, number];

/* ─────────────────────── Section 1: Hero ─────────────────────── */

function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.fromTo(
        '.about-hero-bg',
        { scale: 1.05 },
        { scale: 1, duration: 2.5, ease: 'power2.out' }
      );
      gsap.fromTo(
        '.about-hero-overline',
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, delay: 0.3, ease: 'power3.out' }
      );
      gsap.fromTo(
        '.about-hero-headline',
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.0, delay: 0.5, ease: 'power3.out' }
      );
      gsap.fromTo(
        '.about-hero-sub',
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, delay: 0.8, ease: 'power3.out' }
      );
    },
    { scope: heroRef }
  );

  return (
    <section
      ref={heroRef}
      className="relative w-full min-h-[70vh] flex items-center overflow-hidden"
    >
      <div className="about-hero-bg absolute inset-0">
        <img
          src="/about-team.jpg"
          alt="Team collaboration"
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(26,26,26,0.6) 0%, rgba(26,26,26,0.8) 100%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-[720px] px-6 md:px-[8vw] py-24">
        <p
          className="about-hero-overline text-[13px] font-medium uppercase tracking-[0.1em] mb-4"
          style={{ color: '#F5B800' }}
        >
          Our Mission
        </p>
        <h1
          className="about-hero-headline text-[36px] md:text-[64px] font-extrabold leading-[1.0] tracking-[-0.03em] text-white"
        >
          Technology Rooted in Community
        </h1>
        <p
          className="about-hero-sub mt-6 text-[16px] md:text-[20px] leading-relaxed max-w-[580px]"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          Inyuku Digital exists to close the digital divide between South Africa's
          formal corporate sector and its vast informal economy — not by imposing
          foreign solutions, but by building on the tools and behaviors township
          businesses have already adopted.
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────── Section 2: Two Economies (GSAP) ─────────────────────── */

function TwoEconomiesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 85%',
          once: true,
        },
      });

      tl.fromTo(
        '.te-heading-group',
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }
      )
        .fromTo(
          '.te-left-col > *',
          { x: -30, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.7, stagger: 0.12, ease: 'power3.out' },
          '-=0.3'
        )
        .fromTo(
          '.te-right-col > *',
          { x: 30, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.7, stagger: 0.12, ease: 'power3.out' },
          '-=0.6'
        )
        .fromTo(
          '.te-highlight',
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out' },
          '-=0.3'
        );
    },
    { scope: sectionRef }
  );

  const formalFeatures = [
    'Business bank accounts and formal credit access',
    'Digital marketing and e-commerce capabilities',
    'Enterprise software and cloud infrastructure',
    'Data analytics and business intelligence',
    'Regulatory compliance and social protection',
  ];

  const informalFeatures = [
    'No business bank accounts or formal credit',
    'No inventory management or digital marketing',
    'Cash-only transactions, no digital payment history',
    'No access to formal business training or support',
    'No social protection or regulatory compliance',
  ];

  return (
    <section
      ref={sectionRef}
      className="w-full"
      style={{ backgroundColor: '#F6F2EC', padding: '128px 24px' }}
    >
      <div className="max-w-[1280px] mx-auto">
        {/* Heading */}
        <div className="te-heading-group text-center max-w-[640px] mx-auto">
          <p
            className="text-[13px] font-medium uppercase tracking-[0.08em] mb-4"
            style={{ color: '#E86A34' }}
          >
            The Context
          </p>
          <h2 className="text-[28px] md:text-[64px] font-extrabold leading-[1.0] tracking-[-0.03em] text-text-primary">
            Understanding South Africa's Two Economies
          </h2>
          <p className="mt-4 text-[16px] md:text-[20px] leading-relaxed text-text-secondary">
            South Africa's economy is not one economy — it is two. Understanding
            this divide is essential to understanding why Inyuku Digital matters.
          </p>
        </div>

        {/* Two Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mt-20 max-w-[1200px] mx-auto">
          {/* Left — Formal */}
          <div className="te-left-col">
            <div className="flex items-center gap-3 mb-4">
              <Building2 size={32} style={{ color: '#78716C' }} />
              <h3 className="text-[28px] md:text-[48px] font-bold leading-[1.1] tracking-[-0.02em] text-text-primary">
                The Formal Economy
              </h3>
            </div>
            <p className="text-[16px] md:text-[20px] leading-relaxed text-text-secondary">
              South Africa's formal corporate sector has sophisticated digital
              capabilities — enterprise software, cloud infrastructure, digital
              banking, e-commerce platforms, and data analytics. These businesses
              operate with full formal infrastructure.
            </p>
            <ul className="mt-6 space-y-3">
              {formalFeatures.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span
                    className="mt-2 w-[6px] h-[6px] rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#78716C' }}
                  />
                  <span className="text-[16px] leading-relaxed text-text-secondary">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — Informal */}
          <div className="te-right-col">
            <div className="flex items-center gap-3 mb-4">
              <Store size={32} style={{ color: '#E86A34' }} />
              <h3 className="text-[28px] md:text-[48px] font-bold leading-[1.1] tracking-[-0.02em] text-text-primary">
                The Informal Economy
              </h3>
            </div>
            <p className="text-[16px] md:text-[20px] leading-relaxed text-text-secondary">
              The vast SME and informal economy — encompassing spaza shops,
              traders, artisans, domestic workers, and waste reclaimers — operates
              with minimal formal infrastructure. These businesses are not marginal;
              they are the economic foundation of millions of households.
            </p>
            <ul className="mt-6 space-y-3">
              {informalFeatures.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span
                    className="mt-2 w-[6px] h-[6px] rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#E86A34' }}
                  />
                  <span className="text-[16px] leading-relaxed text-text-secondary">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
            {/* Highlight Box */}
            <div
              className="te-highlight mt-8 p-6 rounded-r-xl"
              style={{
                backgroundColor: '#FFFFFF',
                borderLeft: '4px solid #E86A34',
                borderRadius: '0 12px 12px 0',
              }}
            >
              <p className="text-[16px] md:text-[20px] leading-relaxed italic text-text-primary">
                This informality is not a choice for most operators. It is a
                response to barriers — regulatory, financial, educational — that
                make formalization difficult or unattractive.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Section 3: Our Approach ─────────────────────── */

const approachCards = [
  {
    number: '01',
    title: 'Meet People Where They Are',
    description:
      "WhatsApp Business is already the de facto operating system for township commerce. We don't ask businesses to learn new platforms — we make the platform they already use more powerful.",
    principle: 'Behavioral foundation first',
  },
  {
    number: '02',
    title: 'Remove Barriers, Don\u2019t Add Them',
    description:
      'Cost of devices, connectivity, digital literacy, and trust are the real barriers to adoption. Our platform is free to start, works on any phone, operates in multiple languages, and requires no technical knowledge.',
    principle: 'Accessibility above features',
  },
  {
    number: '03',
    title: 'Formalize Through Use, Not Registration',
    description:
      'Businesses become formal not by filling out government forms but by building a digital transaction history. Every sale, every payment, every inventory update creates a verified business profile.',
    principle: 'Formalization as outcome',
  },
];

function ApproachSection() {
  return (
    <section
      className="w-full"
      style={{ backgroundColor: '#FFFFFF', padding: '128px 24px' }}
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Heading */}
        <motion.div
          className="text-center max-w-[640px] mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
        >
          <motion.p
            className="text-[13px] font-medium uppercase tracking-[0.08em] mb-4"
            style={{ color: '#2D7A3E' }}
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            Our Approach
          </motion.p>
          <motion.h2
            className="text-[28px] md:text-[64px] font-extrabold leading-[1.0] tracking-[-0.03em] text-text-primary"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            Building on What Already Works
          </motion.h2>
          <motion.p
            className="mt-4 text-[16px] md:text-[20px] leading-relaxed text-text-secondary"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            Instead of imposing complex new systems, Inyuku Digital amplifies the
            tools and behaviors South African informal businesses have already
            adopted.
          </motion.p>
        </motion.div>

        {/* Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerContainerSlow}
        >
          {approachCards.map((card) => (
            <motion.div
              key={card.number}
              className="relative p-8 md:p-12 rounded-[20px] border transition-all duration-300 hover:-translate-y-1 group"
              style={{
                backgroundColor: '#FFFFFF',
                borderColor: '#E7E5E4',
              }}
              variants={fadeInUp}
              transition={{ duration: 0.8, ease: easeOutExpo }}
              whileHover={{
                boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
                y: -4,
              }}
            >
              {/* Number watermark */}
              <span
                className="absolute top-4 right-4 text-[64px] font-black leading-none"
                style={{ color: '#E7E5E4' }}
              >
                {card.number}
              </span>

              <h3 className="text-[22px] md:text-[32px] font-semibold leading-[1.2] tracking-[-0.01em] text-text-primary relative z-10">
                {card.title}
              </h3>
              <p className="mt-4 text-[16px] leading-relaxed text-text-secondary relative z-10">
                {card.description}
              </p>

              {/* Principle box */}
              <div
                className="mt-6 p-4 rounded-xl relative z-10"
                style={{ backgroundColor: '#F6F2EC' }}
              >
                <p
                  className="text-[13px] font-medium uppercase tracking-[0.08em]"
                  style={{ color: '#2D7A3E' }}
                >
                  {card.principle}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────── Section 4: Government Partnerships ─────────────────────── */

const partnerships = [
  {
    partner: 'Department of Small Business Development',
    initiative: 'Spaza Shop Support Fund (R500M)',
    role: 'Direct funding pathway for digital payment systems, inventory management tools, and business training for informal spaza shops',
  },
  {
    partner: 'SITA',
    initiative: 'National Broadband Expansion',
    role: 'Infrastructure foundation — expanding connectivity to underserved communities where digital adoption is currently constrained',
  },
  {
    partner: 'SASSA & Municipal Programs',
    initiative: 'Grant Recipient Linkages',
    role: 'Scale pathway through integration with SASSA grant disbursement and municipal partnership programs for township business development',
  },
];

function PartnershipsSection() {
  return (
    <section
      className="w-full"
      style={{ backgroundColor: '#7C2D4E', padding: '128px 24px' }}
    >
      <div className="max-w-[1200px] mx-auto">
        {/* Heading */}
        <motion.div
          className="max-w-[640px]"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
        >
          <motion.p
            className="text-[13px] font-medium uppercase tracking-[0.08em] mb-4"
            style={{ color: '#F5B800' }}
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            Government Partnerships
          </motion.p>
          <motion.h2
            className="text-[28px] md:text-[64px] font-extrabold leading-[1.0] tracking-[-0.03em]"
            style={{ color: '#F6F2EC' }}
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            Aligned with National Development Priorities
          </motion.h2>
          <motion.p
            className="mt-4 text-[16px] md:text-[20px] leading-relaxed"
            style={{ color: 'rgba(246,242,236,0.85)' }}
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            Inyuku Digital is designed to complement, not compete with, South
            Africa's government-led initiatives for SME development and digital
            inclusion.
          </motion.p>
        </motion.div>

        {/* Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={cardStagger}
        >
          {partnerships.map((p) => (
            <motion.div
              key={p.partner}
              className="p-8 md:p-10 rounded-2xl border transition-all duration-300"
              style={{
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderColor: 'rgba(255,255,255,0.15)',
              }}
              variants={fadeInUp}
              transition={{ duration: 0.8, ease: easeOutExpo }}
              whileHover={{
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderColor: 'rgba(245,184,0,0.4)',
              }}
            >
              <h3 className="text-[22px] md:text-[32px] font-semibold leading-[1.2] tracking-[-0.01em]" style={{ color: '#F6F2EC' }}>
                {p.partner}
              </h3>
              <p
                className="mt-3 text-[13px] font-medium uppercase tracking-[0.08em]"
                style={{ color: '#F5B800' }}
              >
                {p.initiative}
              </p>
              <p
                className="mt-4 text-[16px] leading-relaxed"
                style={{ color: 'rgba(246,242,236,0.75)' }}
              >
                {p.role}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────── Section 5: The Evidence ─────────────────────── */

const evidenceBlocks = [
  {
    stat: '$2.9B',
    text: 'contributed to South African GDP by 910,000 SMEs using Meta platforms as digital storefronts. This is not theoretical — this is measured economic output from businesses that were previously offline.',
    color: '#E86A34',
    bg: '#FFFFFF',
    textColor: '#444444',
  },
  {
    stat: '$1.3B',
    text: 'in productivity gains generated from faster coordination and lower transaction costs. When informal businesses adopt digital tools, the efficiency gains are immediate and substantial.',
    color: '#2D7A3E',
    bg: '#FFFFFF',
    textColor: '#444444',
  },
  {
    stat: '90%',
    text: "of South Africa's informal enterprises still operate as cash-only businesses — despite 51% reporting strong customer demand for card payments. The gap between demand and supply for digital tools is the opportunity.",
    color: '#F5B800',
    bg: '#1A1A1A',
    textColor: 'rgba(246,242,236,0.85)',
  },
];

function EvidenceSection() {
  return (
    <section
      className="w-full"
      style={{ backgroundColor: '#F6F2EC', padding: '128px 24px' }}
    >
      <div className="max-w-[900px] mx-auto">
        {/* Heading */}
        <motion.div
          className="text-center mb-20"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
        >
          <motion.p
            className="text-[13px] font-medium uppercase tracking-[0.08em] mb-4"
            style={{ color: '#E86A34' }}
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            The Evidence
          </motion.p>
          <motion.h2
            className="text-[28px] md:text-[64px] font-extrabold leading-[1.0] tracking-[-0.03em] text-text-primary"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            The Research That Validates Our Mission
          </motion.h2>
          <motion.p
            className="mt-4 text-[16px] md:text-[20px] leading-relaxed text-text-secondary"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            Meta's 2025 economic impact research on South Africa provides the
            empirical foundation for Inyuku Digital's approach.
          </motion.p>
        </motion.div>

        {/* Evidence Blocks */}
        <motion.div
          className="flex flex-col gap-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerContainerSlow}
        >
          {evidenceBlocks.map((block) => (
            <motion.div
              key={block.stat}
              className="grid grid-cols-1 md:grid-cols-[30%_70%] gap-8 p-8 md:p-12 rounded-[20px]"
              style={{
                backgroundColor: block.bg,
              }}
              variants={fadeInUp}
              transition={{ duration: 0.8, ease: easeOutExpo }}
            >
              <div className="flex items-center md:items-start">
                <motion.span
                  className="text-[40px] md:text-[64px] font-black leading-none tracking-[-0.04em]"
                  style={{ color: block.color }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.5, ease: easeOutExpo }}
                >
                  {block.stat}
                </motion.span>
              </div>
              <p
                className="text-[16px] md:text-[20px] leading-relaxed flex items-center"
                style={{ color: block.textColor }}
              >
                {block.text}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────── Section 6: Our Values ─────────────────────── */

const values = [
  {
    name: 'Accessibility First',
    description:
      "If a spaza shop owner in Soweto can't use it on their current phone without training, we haven't done our job.",
    borderColor: '#E86A34',
    icon: HandHeart,
  },
  {
    name: 'Community Over Individual',
    description:
      'We measure success not by individual business revenue but by the collective economic resilience of the communities we serve.',
    borderColor: '#0D9488',
    icon: Users,
  },
  {
    name: 'Evidence Over Assumption',
    description:
      'Every feature, every partnership, every investment decision is grounded in research and validated by real user behavior.',
    borderColor: '#2D7A3E',
    icon: BarChart3,
  },
  {
    name: 'Local Context, Global Quality',
    description:
      'We build with the technical sophistication of Silicon Valley and the cultural understanding of Soweto, Khayelitsha, and Alexandra.',
    borderColor: '#7C2D4E',
    icon: Globe,
  },
];

function ValuesSection() {
  return (
    <section
      className="w-full"
      style={{ backgroundColor: '#FFFFFF', padding: '96px 24px' }}
    >
      <div className="max-w-[800px] mx-auto">
        {/* Heading */}
        <motion.div
          className="text-center mb-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
        >
          <motion.p
            className="text-[13px] font-medium uppercase tracking-[0.08em] mb-4"
            style={{ color: '#E86A34' }}
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            Our Values
          </motion.p>
          <motion.h2
            className="text-[28px] md:text-[48px] font-bold leading-[1.1] tracking-[-0.02em] text-text-primary"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            The Principles That Guide Us
          </motion.h2>
        </motion.div>

        {/* Value Cards Grid */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-6"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerContainer}
        >
          {values.map((v) => {
            const Icon = v.icon;
            return (
              <motion.div
                key={v.name}
                className="p-8 rounded-2xl"
                style={{
                  backgroundColor: '#F6F2EC',
                  borderLeft: `4px solid ${v.borderColor}`,
                }}
                variants={fadeInUp}
                transition={{ duration: 0.8, ease: easeOutExpo }}
              >
                <Icon size={28} style={{ color: v.borderColor }} className="mb-3" />
                <h3 className="text-[22px] md:text-[32px] font-semibold leading-[1.2] tracking-[-0.01em] text-text-primary">
                  {v.name}
                </h3>
                <p className="mt-3 text-[16px] leading-relaxed text-text-secondary">
                  {v.description}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────── Section 7: Team ─────────────────────── */

const teamMembers = [
  {
    name: 'Team Lead',
    role: 'Founder & CEO',
    focus: 'Strategy, partnerships, government relations',
  },
  {
    name: 'Tech Lead',
    role: 'CTO',
    focus: 'Platform architecture, AI/ML, product engineering',
  },
  {
    name: 'Community Lead',
    role: 'Head of Community',
    focus: 'Township outreach, onboarding, user research',
  },
  {
    name: 'Product Lead',
    role: 'Head of Product',
    focus: 'UX design, feature roadmap, user experience',
  },
];

function TeamSection() {
  return (
    <section
      className="w-full"
      style={{ backgroundColor: '#F6F2EC', padding: '96px 24px' }}
    >
      <div className="max-w-[1000px] mx-auto">
        {/* Heading */}
        <motion.div
          className="text-center mb-12 max-w-[640px] mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={staggerContainer}
        >
          <motion.p
            className="text-[13px] font-medium uppercase tracking-[0.08em] mb-4"
            style={{ color: '#78716C' }}
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            The Team
          </motion.p>
          <motion.h2
            className="text-[28px] md:text-[48px] font-bold leading-[1.1] tracking-[-0.02em] text-text-primary"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            Building for South Africa, by South Africans
          </motion.h2>
          <motion.p
            className="mt-4 text-[16px] leading-relaxed text-text-secondary"
            variants={fadeInUp}
            transition={{ duration: 0.8, ease: easeOutExpo }}
          >
            Our team combines deep expertise in technology, business, and
            community development — all grounded in lived experience of South
            Africa's economic realities.
          </motion.p>
        </motion.div>

        {/* Team Grid */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={staggerContainer}
        >
          {teamMembers.map((member) => (
            <motion.div
              key={member.name}
              className="flex flex-col items-center text-center"
              variants={fadeInUp}
              transition={{ duration: 0.8, ease: easeOutExpo }}
            >
              {/* Avatar placeholder */}
              <motion.div
                className="w-[120px] h-[120px] rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: '#E7E5E4',
                  border: '3px solid #FFFFFF',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                }}
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.3 }}
              >
                <Users size={40} style={{ color: '#78716C' }} />
              </motion.div>
              <h3 className="mt-4 text-[22px] md:text-[32px] font-semibold leading-[1.2] tracking-[-0.01em] text-text-primary">
                {member.name}
              </h3>
              <p
                className="mt-1 text-[13px] font-medium uppercase tracking-[0.08em]"
                style={{ color: '#E86A34' }}
              >
                {member.role}
              </p>
              <p className="mt-2 text-[16px] leading-relaxed" style={{ color: '#78716C' }}>
                {member.focus}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────── Section 8: CTA ─────────────────────── */

function CTASection() {
  return (
    <section
      className="w-full"
      style={{ backgroundColor: '#1A1A1A', padding: '96px 24px' }}
    >
      <motion.div
        className="max-w-[800px] mx-auto text-center"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={staggerContainer}
      >
        <motion.h2
          className="text-[28px] md:text-[64px] font-extrabold leading-[1.0] tracking-[-0.03em]"
          style={{ color: '#F6F2EC' }}
          variants={fadeInUp}
          transition={{ duration: 0.8, ease: easeOutExpo }}
        >
          Join the Mission to Digitize South Africa's Economy
        </motion.h2>
        <motion.p
          className="mt-4 text-[16px] md:text-[20px] leading-relaxed"
          style={{ color: 'rgba(246,242,236,0.8)' }}
          variants={fadeInUp}
          transition={{ duration: 0.8, ease: easeOutExpo }}
        >
          Whether you're a business owner, government stakeholder, investor, or
          ecosystem partner — there's a role for you in South Africa's digital
          transformation.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
          variants={staggerContainer}
        >
          <motion.div variants={fadeInUp} transition={{ duration: 0.8, ease: easeOutExpo }}>
            <Link
              to="/platform"
              className="inline-block px-8 py-4 rounded-lg text-[15px] font-semibold text-white transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: '#E86A34' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#D15A28';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(232, 106, 52, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#E86A34';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              Start as a Business
            </Link>
          </motion.div>
          <motion.div variants={fadeInUp} transition={{ duration: 0.8, ease: easeOutExpo }}>
            <Link
              to="/about"
              className="inline-block px-8 py-4 rounded-lg text-[15px] font-semibold transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                border: '1.5px solid rgba(255,255,255,0.4)',
                backgroundColor: 'transparent',
                color: '#FFFFFF',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.borderColor = '#FFFFFF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
              }}
            >
              Partner With Us
            </Link>
          </motion.div>
          <motion.div variants={fadeInUp} transition={{ duration: 0.8, ease: easeOutExpo }}>
            <Link
              to="/about"
              className="inline-block px-8 py-4 rounded-lg text-[15px] font-semibold transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                border: '1.5px solid rgba(255,255,255,0.4)',
                backgroundColor: 'transparent',
                color: '#FFFFFF',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.borderColor = '#FFFFFF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
              }}
            >
              Contact the Team
            </Link>
          </motion.div>
        </motion.div>

        <motion.p
          className="mt-8 text-[22px] md:text-[32px] font-semibold"
          style={{ color: '#F5B800' }}
          variants={fadeInUp}
          transition={{ duration: 0.8, delay: 0.5, ease: easeOutExpo }}
        >
          hello@inyuku.digital
        </motion.p>
      </motion.div>
    </section>
  );
}

/* ─────────────────────── Main Page ─────────────────────── */

export default function About() {
  return (
    <>
      <HeroSection />
      <TwoEconomiesSection />
      <ApproachSection />
      <PartnershipsSection />
      <EvidenceSection />
      <ValuesSection />
      <TeamSection />
      <CTASection />
    </>
  );
}
