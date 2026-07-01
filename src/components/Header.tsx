import { Link, useLocation } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "../lib/auth-context";

// ─── Icons (inline SVG to avoid importing heavy icon sets) ──────

const MenuIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M3 5h14" />
    <path d="M3 10h14" />
    <path d="M3 15h14" />
  </svg>
);

const CloseIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M5 5l10 10M15 5l-10 10" />
  </svg>
);

const GithubIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="currentColor"
    width="18"
    height="18"
  >
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="currentColor"
    width="18"
    height="18"
  >
    <path d="M12.6 1h2.2L10 6.48 15.64 15h-4.41L7.78 9.82 3.23 15H1l5.14-5.84L.72 1h4.52l3.12 4.73L12.6 1zm-.77 12.67h1.22L4.57 2.26H3.26l8.57 11.41z" />
  </svg>
);

// ─── Navigation Links ───────────────────────────────────────────

interface NavLink {
  to: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { to: "/", label: "Home" },
  { to: "/scan", label: "Scan Diff" },
  { to: "/pr-scan", label: "Scan PR" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Settings" },
];

// ─── Active Link Component ──────────────────────────────────────

function NavLinkItem({
  link,
  onClick,
}: {
  link: NavLink;
  onClick?: () => void;
}) {
  const location = useLocation();
  const isActive =
    location.pathname === link.to ||
    (link.to !== "/" && location.pathname.startsWith(link.to));

  return (
    <Link
      to={link.to as any}
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200 rounded-lg ${
        isActive
          ? "text-ink bg-interactive/10"
          : "text-ink-muted hover:text-ink hover:bg-surface-2/50"
      }`}
    >
      {isActive && (
        <motion.span
          layoutId="nav-active-bg"
          className="absolute inset-0 rounded-lg bg-interactive/10"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <span className="relative z-10">{link.label}</span>
    </Link>
  );
}

// ─── Auth Button ─────────────────────────────────────────────────

function AuthButton({
  variant = "default",
}: {
  variant?: "default" | "mobile";
}) {
  const { user, isAuthenticated, login, logout, isLoading } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (isLoading) {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-surface-2" />;
  }

  if (isAuthenticated && user) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="flex items-center gap-2 rounded-full border border-border bg-surface-1 px-2 py-1 transition-all duration-200 hover:border-interactive/30 hover:bg-surface-2 hover:shadow-[0_0_12px_rgba(88,166,255,0.08)]"
        >
          <img
            src={user.avatar}
            alt={user.login}
            className="h-7 w-7 rounded-full ring-1 ring-border"
          />
          <span className="hidden text-xs font-medium text-ink sm:block max-w-20 truncate">
            {user.login}
          </span>
          <svg
            className={`hidden h-3 w-3 text-ink-muted transition-transform duration-200 sm:block ${
              showUserMenu ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        <AnimatePresence>
          {showUserMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface-1 shadow-2xl shadow-black/30"
            >
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-ink truncate">
                  {user.name}
                </p>
                <p className="text-xs text-ink-muted">@{user.login}</p>
              </div>
              <div className="p-1.5">
                <Link
                  to="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
                    />
                  </svg>
                  Settings
                </Link>
              </div>
              <div className="border-t border-border p-1.5">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:bg-severity-critical/10 hover:text-severity-critical"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                    />
                  </svg>
                  Sign Out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className={`inline-flex items-center gap-2 font-medium transition-all duration-200 ${
        variant === "mobile"
          ? "w-full justify-center rounded-xl border border-interactive/20 bg-interactive/8 px-4 py-2.5 text-sm text-interactive hover:bg-interactive/15"
          : "rounded-full border border-interactive/25 bg-interactive/10 px-3.5 py-1.5 text-xs text-interactive hover:bg-interactive/20 hover:shadow-[0_0_12px_rgba(88,166,255,0.1)]"
      }`}
    >
      <GithubIcon />
      Sign In
    </button>
  );
}

// ─── Main Header Component ──────────────────────────────────────

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useAuth();

  const visibleLinks = NAV_LINKS.filter((link) => {
    if (link.to === "/pr-scan" || link.to === "/history" || link.to === "/settings") {
      return isAuthenticated;
    }
    return true;
  });

  // Close mobile menu on route change
  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsMobileMenuOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-var(--header-bg)] backdrop-blur-xl supports-backdrop-filter:bg-[rgba(13,17,23,0.75)]">
      <nav className="page-wrap mx-auto flex h-14 sm:h-16 items-center gap-4">
        {/* Logo */}
        <Link
          to="/"
          className="shrink-0 inline-flex items-center gap-2.5 rounded-full px-3 py-1.5 transition hover:opacity-80"
        >
          <span className="flex h-2 w-2 rounded-full bg-linear-to-r from-[#EE3124] to-severity-high shadow-[0_0_6px_rgba(238,49,36,0.4)]" />
          <span className="text-base font-bold tracking-tight text-ink">
            Mantiz
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex md:items-center md:gap-1 flex-1">
          <LayoutGroup>
            {visibleLinks.map((link) => (
              <NavLinkItem key={link.to} link={link} />
            ))}
          </LayoutGroup>
        </div>

        {/* Desktop Right Section */}
        <div className="hidden md:flex items-center gap-2 ml-auto">
          {/* Social icons */}
          <a
            href="https://github.com/farhank15/mantiz"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-2 text-ink-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label="View on GitHub"
          >
            <GithubIcon />
          </a>
          <a
            href="https://x.com/TestSprite"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-2 text-ink-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label="Follow TestSprite on X"
          >
            <XIcon />
          </a>

          <div className="h-5 w-px bg-border mx-0.5" />

          <ThemeToggle />

          <AuthButton />
        </div>

        {/* Mobile Right Section */}
        <div className="flex md:hidden items-center gap-1.5 ml-auto">
          <ThemeToggle />
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="rounded-lg p-2 text-ink-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* Slide-in drawer */}
            <motion.div
              ref={mobileMenuRef}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed right-0 top-0 z-50 h-full w-70 border-l border-border bg-surface-1 shadow-2xl md:hidden"
            >
              <div className="flex h-full flex-col">
                {/* Drawer header */}
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <span className="text-sm font-semibold text-ink">Menu</span>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="rounded-lg p-1.5 text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                    aria-label="Close menu"
                  >
                    <CloseIcon />
                  </button>
                </div>

                {/* Drawer navigation links */}
                <div className="flex-1 overflow-y-auto px-3 py-4">
                  <div className="space-y-1">
                    <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-subdued">
                      Navigation
                    </p>
                    {visibleLinks.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to as any}
                        onClick={closeMobileMenu}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                        activeProps={{
                          className: "text-ink bg-interactive/10 font-semibold",
                        }}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>

                  <div className="mt-6 border-t border-border pt-5 px-3">
                    <p className="pb-3 text-[11px] font-semibold uppercase tracking-widest text-ink-subdued">
                      Account
                    </p>
                    <AuthButton variant="mobile" />

                    {/* Mobile social links */}
                    <div className="mt-4 flex items-center gap-3">
                      <a
                        href="https://github.com/farhank15/mantiz"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                      >
                        <GithubIcon className="h-4 w-4" />
                        GitHub
                      </a>
                      <a
                        href="https://x.com/TestSprite"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                      >
                        <XIcon className="h-4 w-4" />X / Twitter
                      </a>
                    </div>
                  </div>
                </div>

                {/* Drawer footer */}
                <div className="border-t border-border px-5 py-3">
                  <p className="text-[10px] text-ink-subdued">
                    Built for TestSprite S3
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
