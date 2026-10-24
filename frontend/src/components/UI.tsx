import {
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Orbit,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import type { Status } from "../lib/types";
import { statuses } from "../lib/science";
export function Logo() {
  return (
    <Link to="/" className="brand" aria-label="TerraShift home">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M4 18 20 8l16 10M4 25l16-10 16 10M4 32l16-10 16 10" />
      </svg>
      <span>
        TERRA<span>SHIFT</span>
        <small>A CHANGING PLANET. A NEW PERSPECTIVE.</small>
      </span>
    </Link>
  );
}
export function Button({
  to,
  children,
  secondary = false,
  className = "",
}: {
  to: string;
  children: ReactNode;
  secondary?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={`button ${secondary ? "secondary" : ""} ${className}`}
    >
      {children}
      {secondary ? <ArrowUpRight size={17} /> : <ArrowRight size={18} />}
    </Link>
  );
}
export function StatusBadge({ status }: { status: Status }) {
  const s = statuses[status];
  return (
    <span className={`status ${s.className}`} title={s.explanation}>
      <i />
      {s.label}
    </span>
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="eyebrow">
      <span />
      {children}
    </div>
  );
}
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
export function SourceLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="source-link">
      {children}
      <ExternalLink size={12} />
    </a>
  );
}
export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <Reveal className="page-intro">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1>{title}</h1>
      <p>{description}</p>
    </Reveal>
  );
}
export function Skeleton({
  label = "Loading research evidence…",
}: {
  label?: string;
}) {
  return (
    <div className="skeleton-block" role="status">
      <Orbit className="spin" size={25} />
      <p>{label}</p>
      <i />
      <i />
      <i />
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Orbit size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Logo />
        <p>
          Look closer.
          <br />
          <strong>The planet has a story to tell.</strong>
        </p>
        <Link
          to="/explore"
          className="round-arrow"
          aria-label="Open global explorer"
        >
          <ArrowUpRight />
        </Link>
      </div>
      <div className="footer-bottom">
        <span>NASA SPACE APPS 2026 · DANCING WITH THE SARs</span>
        <div>
          <Link to="/data">Data & methodology</Link>
          <SourceLink href="https://github.com/snslighting/terrashift">
            Open source
          </SourceLink>
          <Link to="/about">About</Link>
        </div>
        <span>INDEPENDENT PROJECT · RESEARCH PREVIEW</span>
      </div>
    </footer>
  );
}
export const PathArrow = ChevronRight;
