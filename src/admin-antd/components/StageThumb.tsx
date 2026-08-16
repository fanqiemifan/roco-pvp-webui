import React, { useEffect, useRef, useState } from 'react';
import { getPreviewOrigin } from '../lib/preview';

const STAGE_THUMB_INNER_WIDTH = 1920;
const STAGE_THUMB_INNER_HEIGHT = 1080;

export function StageThumb({ label, previewPath }: { label: string; previewPath: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }
    const update = () => {
      const width = container.clientWidth;
      if (width > 0) {
        // 容器为 16:9，与 1920x1080 同比例，按宽度等比缩放即可完整展示
        setScale(width / STAGE_THUMB_INNER_WIDTH);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="stage-card-thumb" ref={containerRef}>
      <div
        className="stage-card-thumb-viewport"
        style={{
          width: Math.floor(STAGE_THUMB_INNER_WIDTH * scale),
          height: Math.floor(STAGE_THUMB_INNER_HEIGHT * scale),
        }}
      >
        <div
          className="stage-card-thumb-stage"
          style={{ transform: `scale(${scale})` }}
        >
          <iframe
            title={label}
            className="stage-card-frame"
            src={`${getPreviewOrigin()}${previewPath}`}
            scrolling="no"
            loading="lazy"
          />
        </div>
      </div>
      <span className="stage-card-thumb-mark">{label}</span>
    </div>
  );
}
