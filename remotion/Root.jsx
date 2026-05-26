import React from 'react';
import { Composition, Folder, registerRoot } from 'remotion';
import { AidSecVideo } from './compositions/AidSecVideo.jsx';
import { FPS, stories, variants } from './data/videoData.js';

const RemotionRoot = () => (
  <Folder name="AidSec-previews">
    {Object.entries(stories).map(([storyKey, story]) =>
      Object.entries(variants).map(([variantName, variant]) => (
        <Composition
          key={`${storyKey}${variantName}`}
          id={`${storyKey}${variantName}`}
          component={AidSecVideo}
          durationInFrames={story.duration * FPS}
          fps={FPS}
          width={variant.width}
          height={variant.height}
          defaultProps={{ storyKey, variantName }}
        />
      )),
    )}
  </Folder>
);

registerRoot(RemotionRoot);
