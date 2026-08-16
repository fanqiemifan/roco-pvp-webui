import React from 'react';
import type { Page4SlotState } from '../../../shared/types';
import { SpritePetCard } from './SpritePetCard';

export type Page4SlotVisualProps = {
  slot: Page4SlotState;
  index: number;
  size?: number;
  className?: string;
  placeholderClassName?: string;
};

export function Page4SlotVisual({
  slot,
  index,
  size = 96,
  className,
  placeholderClassName,
}: Page4SlotVisualProps) {
  if (!slot.sprite?.path) {
    return (
      <div
        className={`slot-placeholder${placeholderClassName ? ` ${placeholderClassName}` : ''}`}
        style={{ width: size, height: size }}
      >
        {index + 1}
      </div>
    );
  }

  return (
    <div
      className={`page4-slot-visual${slot.isDead ? ' is-dead' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--page4-death-size': `${size}px` } as React.CSSProperties}
    >
      <SpritePetCard sprite={slot.sprite} size={size} />
    </div>
  );
}
