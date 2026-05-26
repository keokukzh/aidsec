import React from 'react';
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { colors, variants } from '../data/videoData.js';

const ease = Easing.bezier(0.16, 1, 0.3, 1);

function enter(frame, delay = 0, duration = 24) {
  return interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
}

const getVariant = (variantName) => variants[variantName] ?? variants.Wide;

export function SceneTitle({ eyebrow, title, subtitle, variantName }) {
  const frame = useCurrentFrame();
  const variant = getVariant(variantName);
  const opacity = enter(frame, 5);
  const y = interpolate(opacity, [0, 1], [42, 0]);
  const isStory = variant.layout === 'story';
  const isSquare = variant.layout === 'square';

  return (
    <div style={{ transform: `translateY(${y}px)`, opacity, maxWidth: isStory ? 850 : 860 }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          border: `1px solid ${colors.gold30}`,
          color: colors.goldLight,
          borderRadius: 999,
          padding: isStory ? '12px 20px' : '10px 18px',
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: 700,
          fontSize: isStory ? 24 : 18,
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: isStory ? 34 : 26,
          background: 'rgba(200,168,76,0.08)',
        }}
      >
        {eyebrow}
      </div>
      <h1
        style={{
          margin: 0,
          color: colors.white,
          fontFamily: 'Instrument Serif',
          fontWeight: 400,
          lineHeight: 0.96,
          fontSize: isStory ? 82 : isSquare ? 68 : 78,
          letterSpacing: 0,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          margin: `${isStory ? 32 : 26}px 0 0`,
          color: colors.gray300,
          fontFamily: 'Plus Jakarta Sans',
          fontSize: isStory ? 31 : isSquare ? 24 : 25,
          lineHeight: 1.45,
          maxWidth: isStory ? 760 : 780,
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

export function MetricCard({ label, value }) {
  const frame = useCurrentFrame();
  const opacity = enter(frame, 16);
  const scale = interpolate(opacity, [0, 1], [0.9, 1]);

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        opacity,
        padding: '22px 24px',
        border: `1px solid rgba(200,168,76,0.26)`,
        borderRadius: 20,
        background: 'rgba(1,16,40,0.76)',
        boxShadow: '0 24px 70px rgba(0,0,0,0.24)',
      }}
    >
      <div
        style={{
          color: colors.goldLight,
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 17,
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: colors.white,
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 30,
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function GradeBadge({ grade, size = 124 }) {
  const text = String(grade || 'A');
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 22,
        background: colors.gold,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.navyDeep,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: text.length > 3 ? size * 0.24 : text.length > 1 ? size * 0.32 : size * 0.58,
        fontWeight: 800,
        lineHeight: 1,
        boxShadow: '0 18px 40px rgba(200,168,76,0.22)',
      }}
    >
      {text}
    </div>
  );
}

export function DashboardMock({ story, activeScene, variantName }) {
  const frame = useCurrentFrame();
  const variant = getVariant(variantName);
  const opacity = enter(frame, 10);
  const y = interpolate(opacity, [0, 1], [44, 0]);
  const isStory = variant.layout === 'story';
  const isSquare = variant.layout === 'square';
  const cardWidth = isStory ? 840 : isSquare ? 760 : 820;
  const showTrend = ['monitoring', 'reports', 'roi', 'trend', 'report', 'chart', 'pricing'].includes(activeScene.kind);

  return (
    <div style={{ width: cardWidth, transform: `translateY(${y}px)`, opacity }}>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 28,
          border: `1px solid rgba(255,255,255,0.12)`,
          background: 'rgba(11,29,58,0.78)',
          boxShadow: '0 28px 90px rgba(0,0,0,0.34)',
        }}
      >
        <Img
          src={staticFile(`images/${story.image}`)}
          style={{
            width: '100%',
            height: isStory ? 520 : 430,
            objectFit: 'cover',
            opacity: 0.72,
            display: 'block',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, transparent 30%, rgba(1,16,40,0.88) 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 34,
            right: 34,
            bottom: 34,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 22,
            alignItems: 'center',
            padding: 24,
            borderRadius: 20,
            background: 'rgba(1,16,40,0.88)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <GradeBadge grade={activeScene.grade ?? activeScene.metric} size={isStory ? 118 : 96} />
          <div>
            <div
              style={{
                color: colors.white,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: 800,
                fontSize: isStory ? 28 : 24,
              }}
            >
              {activeScene.title}
            </div>
            <div
              style={{
                color: colors.gray300,
                fontFamily: 'Plus Jakarta Sans',
                fontSize: isStory ? 21 : 18,
                marginTop: 8,
              }}
            >
              {activeScene.subtitle}
            </div>
          </div>
        </div>
      </div>
      {showTrend ? <AnimatedTrend width={cardWidth} compact={variant.layout !== 'wide'} /> : null}
    </div>
  );
}

function AnimatedTrend({ width, compact }) {
  const frame = useCurrentFrame();
  const progress = enter(frame, 34, 44);
  const bars = [0.42, 0.62, 0.55, 0.78, 0.9].map((value, index) => value * progress * (1 - index * 0.02));

  return (
    <div
      style={{
        marginTop: 24,
        padding: 24,
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : 'repeat(5, 1fr)',
        gap: 16,
        borderRadius: 22,
        background: 'rgba(255,255,255,0.045)',
        border: '1px solid rgba(255,255,255,0.08)',
        width,
      }}
    >
      {bars.map((bar, index) => (
        <div key={index} style={{ height: 86, display: 'flex', alignItems: 'flex-end' }}>
          <div
            style={{
              width: '100%',
              height: `${Math.max(10, bar * 86)}px`,
              borderRadius: 10,
              background: index === 4 ? colors.gold : index > 1 ? colors.green : colors.navyLight,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function ProcessTimeline({ story, activeScene, variantName }) {
  const variant = getVariant(variantName);
  const isStory = variant.layout === 'story';
  const activeIndex = Math.max(0, story.scenes.findIndex((scene) => scene.title === activeScene.title));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isStory ? '1fr' : `repeat(${story.scenes.length}, 1fr)`,
        gap: 14,
      }}
    >
      {story.scenes.map((scene, index) => (
        <div
          key={scene.title}
          style={{
            padding: isStory ? '18px 20px' : '16px 18px',
            borderRadius: 16,
            background: index <= activeIndex ? 'rgba(200,168,76,0.16)' : 'rgba(255,255,255,0.045)',
            border: `1px solid ${index <= activeIndex ? 'rgba(200,168,76,0.42)' : 'rgba(255,255,255,0.08)'}`,
            color: index <= activeIndex ? colors.goldLight : colors.gray300,
            fontFamily: 'Plus Jakarta Sans',
            fontSize: isStory ? 22 : 16,
            fontWeight: 700,
          }}
        >
          {scene.title}
        </div>
      ))}
    </div>
  );
}

export function SubtitleBar({ text, variantName }) {
  const frame = useCurrentFrame();
  const variant = getVariant(variantName);
  const opacity = enter(frame, 20, 20);
  const isStory = variant.layout === 'story';

  return (
    <div
      style={{
        position: 'absolute',
        left: isStory ? 62 : 92,
        right: isStory ? 62 : 92,
        bottom: isStory ? 104 : 68,
        opacity,
        padding: isStory ? '24px 28px' : '18px 26px',
        borderRadius: 18,
        background: 'rgba(1,16,40,0.82)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: colors.white,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: isStory ? 28 : 22,
        lineHeight: 1.35,
        textAlign: 'center',
      }}
    >
      {text}
    </div>
  );
}
