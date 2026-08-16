import React from 'react';
import { Button, Card, Space, Typography } from 'antd';
import { Page4SlotVisual } from '../components/Page4SlotVisual';
import type { Page4PanelEditorState, PanelSide } from '../types';

const { Text, Paragraph } = Typography;

type Page4DeathPanelProps = {
  page4Panels: Record<PanelSide, Page4PanelEditorState>;
  onTogglePage4DeadAt: (side: PanelSide, slotIndex: number) => void;
};

export function Page4DeathPanel({ page4Panels, onTogglePage4DeadAt }: Page4DeathPanelProps) {
  const entries = (['left', 'right'] as PanelSide[]).flatMap((side) => (
    page4Panels[side].selected.map((slot, index) => ({
      side,
      slot,
      index,
    }))
  ));
  const selectedCount = entries.filter((entry) => entry.slot.sprite).length;
  const deadCount = entries.filter((entry) => entry.slot.sprite && entry.slot.isDead).length;

  return (
    <Card
      title="仅显示阵容精灵阵亡控制"
      extra={<Text type="secondary">已选 {selectedCount} / 12 · 阵亡 {deadCount}</Text>}
    >
      <Space direction="vertical" size={12} className="control-stack">
        <Paragraph type="secondary">点击已有精灵图片可切换阵亡状态，阵亡效果会同步应用到仅显示阵容页。</Paragraph>
        <div className="page4-death-slot-grid">
          {entries.map(({ side, slot, index }) => {
            const isEmpty = !slot.sprite;
            return (
              <Button
                key={`${side}-page4-death-${index}`}
                className={`page4-death-slot-button${slot.isDead ? ' is-dead' : ''}${isEmpty ? ' is-empty' : ''}`}
                disabled={isEmpty}
                title={slot.sprite ? `${side === 'left' ? '左侧' : '右侧'} ${index + 1} 号位` : '空槽位'}
                onClick={() => onTogglePage4DeadAt(side, index)}
              >
                <Page4SlotVisual
                  slot={slot}
                  index={side === 'left' ? index : index + 6}
                  size={76}
                  className="page4-death-slot-visual"
                  placeholderClassName="page4-death-slot-placeholder"
                />
              </Button>
            );
          })}
        </div>
      </Space>
    </Card>
  );
}
