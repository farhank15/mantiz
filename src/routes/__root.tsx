import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { AuthProvider } from "../lib/auth-context";
import { QueryClientProvider } from "../lib/query-client";

import appCss from "../styles.css?url";

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Mantiz — AI Coding Agent Lie Detector",
      },
      {
        name: "description",
        content: "Mantiz detects when AI coding agents fake a passing test suite. Scan any diff or PR for hallucinated assertions, assertion tampering, disabled tests, and more. Free, no signup.",
      },

      // ── Open Graph (Facebook, LinkedIn, Discord) ──
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:url",
        content: "https://mantiz-wine.vercel.app",
      },
      {
        property: "og:title",
        content: "Mantiz — AI Coding Agent Lie Detector",
      },
      {
        property: "og:description",
        content: "Detect when AI agents fake a passing test suite. 11 detection engines scan diffs and PRs for cheating patterns. Free, no signup.",
      },

      // ── OG Image ──
      {
        property: "og:image",
        content: "https://mantiz-wine.vercel.app/og-image.png",
      },
      {
        property: "og:image:width",
        content: "1200",
      },
      {
        property: "og:image:height",
        content: "630",
      },

      // ── Twitter Card ──
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "Mantiz — AI Coding Agent Lie Detector",
      },
      {
        name: "twitter:description",
        content: "Detect when AI agents fake a passing test suite. 11 detection engines scan diffs for cheating patterns. Free.",
      },
      {
        name: "twitter:image",
        content: "https://mantiz-wine.vercel.app/og-image.png",
      },

      // ── Robots ──
      {
        name: "robots",
        content: "index, follow",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "canonical",
        href: "https://mantiz-wine.vercel.app",
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "Mantiz",
          "description": "AI coding agent lie detector. Scans diffs and PRs for patterns agents use to fake a passing test suite.",
          "url": "https://mantiz-wine.vercel.app",
          "applicationCategory": "DeveloperApplication",
          "operatingSystem": "Web, CLI",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
          },
          "author": {
            "@type": "Person",
            "name": "farhank15",
            "url": "https://github.com/farhank15",
          },
        }) }} />
      </head>
      <body className="font-sans antialiased wrap-anywhere selection:bg-[rgba(88,166,255,0.2)]">
        <QueryClientProvider>
          <AuthProvider>
            <Header />
            {children}
            <Footer />
          </AuthProvider>
        </QueryClientProvider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
