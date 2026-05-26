import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { colors } from '../data/videoData.js';

export function GlobalFonts() {
  return (
    <style>
      {`
        @font-face {
          font-family: 'Instrument Serif';
          src: url('${staticFile('fonts/instrument-serif-latin-400-normal.woff2')}') format('woff2');
          font-weight: 400;
        }
        @font-face {
          font-family: 'Plus Jakarta Sans';
          src: url('${staticFile('fonts/plus-jakarta-sans-latin-400-normal.woff2')}') format('woff2');
          font-weight: 400;
        }
        @font-face {
          font-family: 'Plus Jakarta Sans';
          src: url('${staticFile('fonts/plus-jakarta-sans-latin-700-normal.woff2')}') format('woff2');
          font-weight: 700;
        }
      `}
    </style>
  );
}

export function BrandFrame({ children, story, variant }) {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const introOpacity = interpolate(frame, [0, 45, durationInFrames - 60, durationInFrames], [0.18, 0.08, 0.08, 0.18], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const logoWidth = variant.layout === 'story' ? 150 : variant.layout === 'square' ? 118 : 132;
  const safe = variant.layout === 'story' ? 56 : 46;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.navyDeep, overflow: 'hidden' }}>
      <GlobalFonts />
      <OffthreadVideo
        src={staticFile('media/Scene_pingpong.mp4')}
        muted
        startFrom={0}
        style={{
          position: 'absolute',
          inset: 0,
          width,
          height,
          objectFit: 'cover',
          opacity: introOpacity,
          filter: 'saturate(0.8) contrast(1.08)',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 76% 14%, rgba(200,168,76,0.18), transparent 28%), radial-gradient(circle at 18% 80%, rgba(92,168,216,0.12), transparent 30%), linear-gradient(135deg, rgba(1,16,40,0.78), rgba(11,29,58,0.9))',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: variant.layout === 'story' ? '90px 90px' : '110px 110px',
          opacity: 0.22,
        }}
      />
      <div
        data-brand-logo
        style={{
          position: 'absolute',
          top: safe,
          left: safe,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          zIndex: 10,
          opacity: 0.84,
        }}
      >
        <Img src={staticFile('images/logowhite.webp')} style={{ width: logoWidth, height: 'auto' }} />
        {variant.layout !== 'story' ? (
          <div
            style={{
              height: 34,
              width: 1,
              background: colors.gold,
              opacity: 0.55,
            }}
          />
        ) : null}
        {variant.layout !== 'story' ? (
          <div
            style={{
              fontFamily: 'Plus Jakarta Sans',
              color: colors.gray300,
              fontSize: 18,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
            }}
          >
            {story.accent}
          </div>
        ) : null}
      </div>
      {children}
      <Audio src={staticFile('audio/aidsec-ambient.wav')} volume={0.08} />
    </AbsoluteFill>
  );
}
