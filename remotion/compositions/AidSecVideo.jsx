import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { BrandFrame, GlobalFonts } from '../components/BrandFrame.jsx';
import {
  DashboardMock,
  GradeBadge,
  MetricCard,
  ProcessTimeline,
  SceneTitle,
  SubtitleBar,
} from '../components/ScenePrimitives.jsx';
import { colors, FPS, stories, variants } from '../data/videoData.js';

const getSceneWindow = (story, frame) => {
  let cursor = 0;

  for (const scene of story.scenes) {
    const length = scene.duration * FPS;
    if (frame < cursor + length) {
      return { scene, from: cursor, duration: length };
    }
    cursor += length;
  }

  const last = story.scenes[story.scenes.length - 1];
  return { scene: last, from: Math.max(0, cursor - last.duration * FPS), duration: last.duration * FPS };
};

const widthForVariant = (variantName) => variants[variantName].width;

const ShellGrid = ({ variantName, children }) => {
  const story = variantName === 'Story';
  const square = variantName === 'Square';

  return (
    <div
      style={{
        position: 'absolute',
        inset: story ? '150px 76px 238px' : square ? '116px 72px 174px' : '136px 118px 166px',
        display: 'grid',
        gridTemplateColumns: story ? '1fr' : 'minmax(0, 0.88fr) minmax(0, 1.12fr)',
        gridTemplateRows: story ? 'auto 1fr auto' : '1fr auto',
        gap: story ? 42 : 54,
        alignItems: 'center',
      }}
    >
      {children}
    </div>
  );
};

const SceneMetrics = ({ scene, variantName }) => {
  const story = variantName === 'Story';
  const square = variantName === 'Square';
  const metrics = scene.metrics ?? [{ label: 'Status', value: scene.metric ?? scene.grade ?? 'A' }];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: story ? '1fr' : square ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
        gap: story ? 18 : 20,
      }}
    >
      {metrics.map((metric) => (
        <MetricCard key={metric.label} label={metric.label} value={metric.value} />
      ))}
    </div>
  );
};

const SceneVisual = ({ story, scene, variantName }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const storyVariant = variantName === 'Story';
  const cardScale = interpolate(frame, [0, 28], [0.96, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        position: 'relative',
        transform: `scale(${cardScale})`,
        transformOrigin: 'center',
        minHeight: storyVariant ? 640 : 440,
      }}
    >
      <DashboardMock story={story} activeScene={scene} variantName={variantName} />
      <div
        style={{
          position: 'absolute',
          right: storyVariant ? 28 : 38,
          top: storyVariant ? 28 : 34,
          display: 'flex',
          gap: storyVariant ? 12 : 16,
          alignItems: 'center',
        }}
      >
        <GradeBadge grade={scene.grade ?? scene.metric} size={storyVariant ? 120 : widthForVariant(variantName) < 1200 ? 112 : 138} />
      </div>
    </div>
  );
};

const SceneBody = ({ story, scene, variantName }) => {
  const frame = useCurrentFrame();
  const storyVariant = variantName === 'Story';
  const square = variantName === 'Square';
  const sceneOpacity = interpolate(frame, [0, 14, 155, 180], [0, 1, 1, 0.88], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sceneY = interpolate(frame, [0, 20], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity, transform: `translateY(${sceneY}px)` }}>
      <ShellGrid variantName={variantName}>
        <div
          style={{
            display: 'grid',
            gap: storyVariant ? 34 : 36,
            alignSelf: 'center',
          }}
        >
          <SceneTitle
            eyebrow={story.eyebrow ?? story.accent}
            title={scene.title}
            subtitle={scene.copy ?? scene.subtitle}
            variantName={variantName}
          />
          {!storyVariant && <SceneMetrics scene={scene} variantName={variantName} />}
        </div>

        <SceneVisual story={story} scene={scene} variantName={variantName} />

        {storyVariant && <SceneMetrics scene={scene} variantName={variantName} />}

        <div
          style={{
            gridColumn: storyVariant ? '1' : '1 / -1',
            alignSelf: 'end',
          }}
        >
          <ProcessTimeline story={story} activeScene={scene} variantName={variantName} />
        </div>
      </ShellGrid>
      <SubtitleBar text={scene.subtitle} variantName={variantName} />
    </AbsoluteFill>
  );
};

const FinalFrame = ({ story, variantName }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 30], [0.94, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const storyVariant = variantName === 'Story';

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: storyVariant ? '170px 82px 130px' : '130px 150px 115px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          width: '100%',
          maxWidth: storyVariant ? 820 : 1180,
          padding: storyVariant ? '56px 42px' : '68px 72px',
          border: `1px solid ${colors.gold30}`,
          borderRadius: 34,
          background: 'linear-gradient(135deg, rgba(12,31,52,0.90), rgba(3,11,20,0.88))',
          boxShadow: '0 42px 120px rgba(0,0,0,0.34)',
        }}
      >
        <div
          style={{
            color: colors.gold,
            fontFamily: 'Plus Jakarta Sans',
            fontSize: storyVariant ? 24 : 28,
            fontWeight: 700,
            letterSpacing: 1.8,
            textTransform: 'uppercase',
            marginBottom: 30,
          }}
        >
          AidSec.ch
        </div>
        <h1
          style={{
            margin: 0,
            color: colors.white,
            fontFamily: 'Instrument Serif',
            fontSize: storyVariant ? 70 : 86,
            lineHeight: 0.98,
            fontWeight: 400,
          }}
        >
          {story.cta}
        </h1>
        <p
          style={{
            margin: '34px auto 0',
            color: colors.gray200,
            fontFamily: 'Plus Jakarta Sans',
            fontSize: storyVariant ? 29 : 30,
            lineHeight: 1.45,
            maxWidth: 820,
          }}
        >
          Schweizer Security-Härtung mit belegbarem Status, Report und Monitoring.
        </p>
      </div>
    </AbsoluteFill>
  );
};

export const AidSecVideo = ({ storyKey, variantName }) => {
  const frame = useCurrentFrame();
  const story = stories[storyKey];
  const { scene, from } = getSceneWindow(story, frame);
  const isFinal = scene.kind === 'cta';

  return (
    <BrandFrame story={story} variant={variantName}>
      <GlobalFonts />
      <Sequence from={from}>
        {isFinal ? (
          <FinalFrame story={story} variantName={variantName} />
        ) : (
          <SceneBody story={story} scene={scene} variantName={variantName} />
        )}
      </Sequence>
    </BrandFrame>
  );
};
