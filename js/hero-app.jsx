import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'motion/react';
import BlurText from './BlurText.jsx';

const MESSAGES = [
  {
    cat: 'BACS STATISTIK',
    text: "35'727 Cybervorfälle in der Schweiz — allein im 1. Halbjahr 2025.",
  },
  { cat: 'WORDPRESS', text: "7'966 neue WordPress-Schwachstellen in 2024. 22 pro Tag." },
  { cat: 'BEDROHUNG', text: 'Automatisierte Angriffe treffen Kanzleien zuerst — oft unbemerkt.' },
  { cat: 'ANALYSE', text: '78% der Schweizer Kanzlei-Webseiten: Note F.' },
  { cat: 'IHR RISIKO', text: 'Was würde ein Datenleck für Ihre Kanzlei bedeuten?' },
  { cat: 'AIDSEC', text: 'Ihre Webseite ist das Ziel. Wir sind der Schutz.' },
];

const HOLD_DURATION = 3500;
const FADE_DURATION = 0.6;

function HeroRotator() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [animDone, setAnimDone] = useState(false);

  const handleAnimationComplete = useCallback(() => {
    setAnimDone(true);
  }, []);

  useEffect(() => {
    if (!animDone) return;
    const holdTimer = setTimeout(() => {
      setVisible(false);
    }, HOLD_DURATION);
    return () => clearTimeout(holdTimer);
  }, [animDone]);

  const handleFadeOutComplete = useCallback(() => {
    setIndex((prev) => (prev + 1) % MESSAGES.length);
    setAnimDone(false);
    setVisible(true);
  }, []);

  return (
    <div className="hero-rotator">
      {/* Category Badge */}
      <AnimatePresence mode="wait">
        {visible && (
          <motion.span
            key={'cat-' + index}
            className="hero-rotator__category"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {MESSAGES[index].cat}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Rotating Headline */}
      <AnimatePresence mode="wait" onExitComplete={handleFadeOutComplete}>
        {visible && (
          <motion.div
            key={index}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(8px)' }}
            transition={{ duration: FADE_DURATION, ease: 'easeInOut' }}
            className="hero-rotator__item"
          >
            <BlurText
              text={MESSAGES[index].text}
              delay={120}
              animateBy="words"
              direction="top"
              onAnimationComplete={handleAnimationComplete}
              className="hero-rotator__text"
              stepDuration={0.4}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Dots */}
      <div className="hero-rotator__dots">
        {MESSAGES.map((_, i) => (
          <span
            key={i}
            className={'hero-rotator__dot' + (i === index ? ' hero-rotator__dot--active' : '')}
          />
        ))}
      </div>
    </div>
  );
}

// Mount React island
const rootEl = document.getElementById('hero-react-root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<HeroRotator />);
}
