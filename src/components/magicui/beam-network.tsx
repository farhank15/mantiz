import { forwardRef, useRef } from "react";
import { cn } from "./utils";
import AnimatedBeam from "./animated-beam";

const Circle = forwardRef<
  HTMLDivElement,
  { className?: string; children?: React.ReactNode }
>(({ className, children }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "z-10 flex size-14 items-center justify-center rounded-full border-2",
        "border-(--border) bg-(--surface-1)",
        "shadow-[0_0_20px_-8px_rgba(0,0,0,0.6)]",
        "transition-all duration-300 hover:border-(--interactive) hover:shadow-[0_0_15px_rgba(88,166,255,0.15)]",
        className,
      )}
    >
      {children}
    </div>
  );
});
Circle.displayName = "Circle";

export default function BeamNetwork() {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);

  // Top row
  const topLeftRef = useRef<HTMLDivElement>(null);
  const topRightRef = useRef<HTMLDivElement>(null);

  // Middle row
  const midLeftRef = useRef<HTMLDivElement>(null);
  const midRightRef = useRef<HTMLDivElement>(null);

  // Bottom row
  const botLeftRef = useRef<HTMLDivElement>(null);
  const botRightRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative flex h-75 w-full items-center justify-center overflow-hidden p-4 sm:p-10"
      ref={containerRef}
    >
      {/* 3 rows x 3 columns grid of circles */}
      <div className="flex size-full max-h-60 max-w-lg flex-col items-stretch justify-between gap-6 sm:gap-8">
        {/* Row 1 */}
        <div className="flex flex-row items-center justify-between">
          <Circle ref={topLeftRef}>
            <DiffIcon />
          </Circle>
          <Circle ref={topRightRef}>
            <PatternIcon />
          </Circle>
        </div>

        {/* Row 2 */}
        <div className="flex flex-row items-center justify-between">
          <Circle ref={midLeftRef}>
            <MockIcon />
          </Circle>
          <Circle
            ref={centerRef}
            className="size-20 `border-(--interactive) bg-(--interactive)/10"
          >
            <MantizIcon />
          </Circle>
          <Circle ref={midRightRef}>
            <CatchIcon />
          </Circle>
        </div>

        {/* Row 3 */}
        <div className="flex flex-row items-center justify-between">
          <Circle ref={botLeftRef}>
            <AssertIcon />
          </Circle>
          <Circle ref={botRightRef}>
            <VerdictIcon />
          </Circle>
        </div>
      </div>

      {/* All beams connecting to center */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={topLeftRef}
        toRef={centerRef}
        curvature={-60}
        endYOffset={-8}
        gradientStartColor="#EE3124"
        gradientStopColor="#58A6FF"
        duration={4}
        pathWidth={1.5}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={topRightRef}
        toRef={centerRef}
        curvature={60}
        endYOffset={-8}
        gradientStartColor="#F5A623"
        gradientStopColor="#58A6FF"
        duration={4.5}
        delay={0.3}
        pathWidth={1.5}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={midLeftRef}
        toRef={centerRef}
        gradientStartColor="#FF6B00"
        gradientStopColor="#58A6FF"
        duration={3.5}
        delay={0.2}
        pathWidth={1.5}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={midRightRef}
        toRef={centerRef}
        reverse
        gradientStartColor="#00DC82"
        gradientStopColor="#58A6FF"
        duration={5}
        delay={0.4}
        pathWidth={1.5}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={botLeftRef}
        toRef={centerRef}
        curvature={-60}
        endYOffset={8}
        gradientStartColor="#EE3124"
        gradientStopColor="#58A6FF"
        duration={4.5}
        delay={0.6}
        pathWidth={1.5}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={botRightRef}
        toRef={centerRef}
        curvature={60}
        endYOffset={8}
        reverse
        gradientStartColor="#00DC82"
        gradientStopColor="#58A6FF"
        duration={4}
        delay={0.5}
        pathWidth={1.5}
      />
    </div>
  );
}

/* ---- Icons ---- */

function MantizIcon() {
  return (
    <img
      src="mantiz.png"
      alt="mantoz.png"
      title="mantiz"
      className="h-full w-full"
    />
  );
}

function DiffIcon() {
  return (
    <svg
      className="h-5 w-5 text-(--severity-critical)"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
      />
    </svg>
  );
}

function PatternIcon() {
  return (
    <svg
      className="h-5 w-5 text-(--severity-medium)"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
      />
    </svg>
  );
}

function MockIcon() {
  return (
    <svg
      className="h-5 w-5 text-(--severity-high)"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
      />
    </svg>
  );
}

function CatchIcon() {
  return (
    <svg
      className="h-5 w-5 text-(--success)"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function AssertIcon() {
  return (
    <svg
      className="h-5 w-5 text-(--severity-critical)"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
      />
    </svg>
  );
}

function VerdictIcon() {
  return (
    <svg
      className="h-5 w-5 text-(--severity-low)"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}
