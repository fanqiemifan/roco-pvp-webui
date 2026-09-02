import React, { type ReactNode } from 'react';
import { Typography } from 'antd';

const { Paragraph, Text } = Typography;

export function SettingField({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>{label}</Text>
      {hint ? (
        <Paragraph type="secondary" style={{ marginBottom: 6, fontSize: 12 }}>{hint}</Paragraph>
      ) : null}
      {children}
    </div>
  );
}
