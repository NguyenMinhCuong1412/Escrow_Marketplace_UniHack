'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const AUTO_SLIDE_INTERVAL_MS = 5000;

interface CollectibleSlide {
  src: string;
  alt: string;
}

const COLLECTIBLE_SLIDES: CollectibleSlide[] = [
  {
    src: '/images/collectibles/lego-set.webp',
    alt: 'Mô hình kiến trúc lắp ghép sưu tầm bằng gạch nhựa',
  },
  {
    src: '/images/collectibles/collectible-figure.webp',
    alt: 'Figure hiệp sĩ viễn tưởng sơn hoàn thiện tỷ lệ sưu tầm',
  },
  {
    src: '/images/collectibles/scale-model-car.webp',
    alt: 'Mô hình xe cổ die-cast tỷ lệ 1:18 màu xanh cobalt',
  },
  {
    src: '/images/collectibles/trading-cards.webp',
    alt: 'Bộ ba thẻ bài sưu tầm holographic trong hộp acrylic bảo vệ',
  },
  {
    src: '/images/collectibles/collectible-coins.webp',
    alt: 'Xu bạc và xu vàng kỷ niệm sưu tầm trong hộp bảo quản',
  },
  {
    src: '/images/collectibles/mecha-model.webp',
    alt: 'Mô hình lắp ráp robot mecha sưu tầm trên đế trưng bày',
  },
];

/**
 * Interactive showcase carousel for hobby collectibles on the Auth page.
 * Supports manual navigation, 5s auto-advance, pause on hover/focus/hidden tab,
 * touch swipe, keyboard arrow keys, and prefers-reduced-motion.
 */
export function CollectiblesCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isTouching, setIsTouching] = useState(false);
  const [isTabHidden, setIsTabHidden] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const elapsedMsRef = useRef<number>(0);
  const lastTickRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const isPaused =
    isHovered || isFocused || isTouching || isTabHidden || prefersReducedMotion;

  const resetProgress = useCallback(() => {
    elapsedMsRef.current = 0;
    lastTickRef.current = performance.now();
    if (progressBarRef.current) {
      progressBarRef.current.style.width = '0%';
    }
  }, []);

  const goToNext = useCallback(() => {
    resetProgress();
    setCurrentIndex((prev) => (prev + 1) % COLLECTIBLE_SLIDES.length);
  }, [resetProgress]);

  const goToPrev = useCallback(() => {
    resetProgress();
    setCurrentIndex(
      (prev) => (prev - 1 + COLLECTIBLE_SLIDES.length) % COLLECTIBLE_SLIDES.length
    );
  }, [resetProgress]);

  // Pause auto-slide when browser tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabHidden(document.visibilityState === 'hidden');
    };
    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Respect user's prefers-reduced-motion OS setting
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
      if (mediaQuery.matches && progressBarRef.current) {
        elapsedMsRef.current = 0;
        progressBarRef.current.style.width = '0%';
      }
    };
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => {
      mediaQuery.removeEventListener('change', updatePreference);
    };
  }, []);

  // Auto-slide & synchronized 0-100% progress timer
  useEffect(() => {
    if (isPaused) {
      lastTickRef.current = null;
      return;
    }

    let rafId = 0;
    lastTickRef.current = performance.now();

    const step = (now: number) => {
      const prev = lastTickRef.current ?? now;
      const delta = Math.max(0, now - prev);
      lastTickRef.current = now;

      elapsedMsRef.current += delta;

      if (elapsedMsRef.current >= AUTO_SLIDE_INTERVAL_MS) {
        elapsedMsRef.current = 0;
        if (progressBarRef.current) {
          progressBarRef.current.style.width = '0%';
        }
        setCurrentIndex((idx) => (idx + 1) % COLLECTIBLE_SLIDES.length);
      } else if (progressBarRef.current) {
        const percent = Math.min(
          100,
          (elapsedMsRef.current / AUTO_SLIDE_INTERVAL_MS) * 100
        );
        progressBarRef.current.style.width = `${percent.toFixed(2)}%`;
      }

      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isPaused]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToNext();
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    setIsTouching(true);
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsTouching(false);
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || e.changedTouches.length === 0) return;

    const endTouch = e.changedTouches[0];
    const deltaX = endTouch.clientX - start.x;
    const deltaY = endTouch.clientY - start.y;

    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        goToNext();
      } else {
        goToPrev();
      }
    }
  };

  const handleTouchCancel = () => {
    setIsTouching(false);
    touchStartRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Trưng bày đồ sưu tầm"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setIsFocused(false);
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-4 focus-visible:ring-offset-[#F7F8FA] rounded-3xl"
    >
      {/* Image Frame */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E5E7EB] bg-[#FFFFFF] shadow-sm touch-pan-y">
        <div
          className="flex h-full w-full transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {COLLECTIBLE_SLIDES.map((slide, idx) => (
            <div
              key={slide.src}
              role="group"
              aria-roledescription="slide"
              aria-label={`${idx + 1} / ${COLLECTIBLE_SLIDES.length}: ${slide.alt}`}
              aria-hidden={idx !== currentIndex}
              className="relative h-full w-full shrink-0 bg-[#FFFFFF]"
            >
              <Image
                src={slide.src}
                alt={slide.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 660px"
                priority={idx === 0}
                draggable={false}
                className="object-cover object-center select-none"
              />
            </div>
          ))}
        </div>

        {/* Prev Arrow */}
        <button
          type="button"
          onClick={goToPrev}
          aria-label="Ảnh trước"
          className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#FFFFFF]/90 hover:bg-[#FFFFFF] text-[#17191F] border border-[#E5E7EB] shadow-sm flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Next Arrow */}
        <button
          type="button"
          onClick={goToNext}
          aria-label="Ảnh tiếp theo"
          className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#FFFFFF]/90 hover:bg-[#FFFFFF] text-[#17191F] border border-[#E5E7EB] shadow-sm flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Single Slim Progress Bar Below Image */}
      <div
        aria-hidden="true"
        className="mt-3.5 sm:mt-4 h-1 w-full rounded-full bg-[#E5E7EB] overflow-hidden"
      >
        <div
          ref={progressBarRef}
          className="h-full w-0 rounded-full bg-[#3458D4]"
        />
      </div>
    </div>
  );
}
