import React from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Image,
  Input,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ATTRIBUTE_ICON_BY_LABEL } from '../constants';
import type { MatchStoreState, SpriteRecord } from '../../../shared/types';
import {
  buildStatsCsv,
  buildUsageStats,
  STATS_METRIC_OPTIONS,
  STATS_RANGE_OPTIONS,
} from '../lib/stats';
import type { SpriteUsageRow, StatsMetricKey, StatsRangeKey } from '../lib/stats';

const { Text } = Typography;

function StatsColumnTitle({ text, tip }: { text: string; tip: string }) {
  return (
    <Tooltip
      styles={{
        root: { maxWidth: 'min(300px, 80vw)' },
        container: { whiteSpace: 'normal', wordBreak: 'break-word' },
      }}
      title={tip}
    >
      <span className="stats-column-title">
        {text}
        <span className="stats-column-hint" aria-hidden>?</span>
      </span>
    </Tooltip>
  );
}

type StatsViewProps = {
  matches: MatchStoreState['matches'];
  spriteMap: Map<string, SpriteRecord>;
  range: StatsRangeKey;
  metric: StatsMetricKey;
  player: string | null;
  tag: string | null;
  search: string;
  onRangeChange: (value: StatsRangeKey) => void;
  onMetricChange: (value: StatsMetricKey) => void;
  onPlayerChange: (value: string | null) => void;
  onTagChange: (value: string | null) => void;
  onSearchChange: (value: string) => void;
};

export function StatsView({
  matches,
  spriteMap,
  range,
  metric,
  player,
  tag,
  search,
  onRangeChange,
  onMetricChange,
  onPlayerChange,
  onTagChange,
  onSearchChange,
}: StatsViewProps) {
  const { message } = App.useApp();
  const stats = buildUsageStats(matches, spriteMap, {
    range,
    player,
    tag,
    metric,
  });
  const keyword = search.trim().toLowerCase();
  const visibleRows = keyword
    ? stats.rows.filter((row) => row.name.toLowerCase().includes(keyword))
    : stats.rows;
  const maxUsagePercent = stats.rows[0]?.usagePercent ?? 0;
  const playerOptions = Array.from(new Set(matches.flatMap((match) => [
    match.leftPlayer,
    match.rightPlayer,
  ]).filter(Boolean)));
  const tagOptions = Array.from(new Set(matches.flatMap((match) => match.tags ?? [])));
  const trendColors = ['#d38b2d', '#4f8cff', '#c24635'];
  const topTrendRows = stats.rows.slice(0, 3);
  const dailyKeys = stats.dailyKeys.slice(-14);
  const topUsageForTrend = Math.max(1, ...topTrendRows.flatMap((row) => dailyKeys.map((key) => row.dailyGames.get(key) ?? 0)));

  const statsColumns: ColumnsType<SpriteUsageRow> = [
    {
      title: '#',
      key: 'rank',
      width: 56,
      render: (_: unknown, __: SpriteUsageRow, index: number) => {
        if (keyword) {
          return <Text type="secondary">{index + 1}</Text>;
        }
        const rankCls = index < 3 ? `stats-rank-${index + 1}` : 'stats-rank-plain';
        return <span className={`stats-rank ${rankCls}`}>{index + 1}</span>;
      },
    },
    {
      title: '精灵',
      dataIndex: 'name',
      key: 'name',
      render: (_: unknown, record: SpriteUsageRow) => (
        <Space>
          {record.spritePath ? (
            <Image
              preview={false}
              src={record.spritePath}
              alt={record.name}
              width={44}
              height={44}
              className="stats-row-image"
              fallback="/assets/ui/back.png"
            />
          ) : (
            <div className="stats-row-image stats-row-image-fallback">{record.name.slice(0, 1)}</div>
          )}
          <Space direction="vertical" size={2}>
            <Text strong>{record.name}</Text>
            {record.attributes.length ? (
              <Text type="secondary" className="stats-row-attrs">{record.attributes.join(' / ')}</Text>
            ) : (
              <Text type="secondary" className="stats-row-attrs">未知属性</Text>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: (
        <StatsColumnTitle
          text={metric === 'pickRate' ? '使用率' : '上场率'}
          tip={metric === 'pickRate'
            ? '使用率 = 登场只次 ÷ 总登场只次（同局重复携带按只次计）'
            : '上场率 = 登场场次 ÷ 总场次（同局同侧重复携带只计 1 次）'}
        />
      ),
      key: 'usage',
      showSorterTooltip: false,
      render: (_: unknown, record: SpriteUsageRow) => (
        <div className="stats-usage-cell">
          <Progress
            percent={maxUsagePercent > 0 ? Math.max(2, (record.usagePercent / maxUsagePercent) * 100) : 0}
            showInfo={false}
            size="small"
            className="stats-usage-bar"
          />
          <Text className="stats-usage-value">{record.usagePercent.toFixed(1)}%</Text>
        </div>
      ),
      sorter: (a, b) => a.usageRate - b.usageRate,
    },
    {
      title: <StatsColumnTitle text="登场只次" tip="登场只次 = 精灵在局内阵容中出现的次数（同名精灵同局重复携带按只次逐只计）" />,
      dataIndex: 'picks',
      key: 'picks',
      width: 136,
      align: 'right',
      showSorterTooltip: false,
      sorter: (a, b) => a.picks - b.picks,
    },
    {
      title: <StatsColumnTitle text="登场场次" tip="登场场次 = 精灵登场的场次数（同局同侧重复携带同名精灵只计 1 次）" />,
      dataIndex: 'games',
      key: 'games',
      width: 136,
      align: 'right',
      showSorterTooltip: false,
      sorter: (a, b) => a.games - b.games,
    },
    {
      title: '胜场',
      dataIndex: 'wins',
      key: 'wins',
      width: 96,
      align: 'right',
      sorter: (a, b) => a.wins - b.wins,
    },
    {
      title: '胜率',
      key: 'winRate',
      width: 112,
      align: 'right',
      sorter: (a, b) => (a.winRate ?? -1) - (b.winRate ?? -1),
      render: (_: unknown, record: SpriteUsageRow) => (
        record.winRate === null ? (
          <Text type="secondary">-</Text>
        ) : (
          <Text type={record.winRate >= 0.5 ? 'success' : 'danger'} className="stats-winrate">
            {(record.winRate * 100).toFixed(1)}%
          </Text>
        )
      ),
    },
    {
      title: <StatsColumnTitle text="趋势" tip="趋势 = 本周期登场场次 − 上一等长周期登场场次（范围选择“全部”时不显示）" />,
      key: 'trend',
      width: 104,
      align: 'center',
      render: (_: unknown, record: SpriteUsageRow) => (
        record.trendDelta > 0 ? (
          <Text type="success">▲{record.trendDelta}</Text>
        ) : record.trendDelta < 0 ? (
          <Text type="danger">▼{Math.abs(record.trendDelta)}</Text>
        ) : (
          <Text type="secondary">—</Text>
        )
      ),
    },
  ];

  function exportStatsCsv() {
    const csv = buildStatsCsv(stats.rows, metric);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `精灵${metric === 'pickRate' ? '使用率' : '上场率'}统计.csv`;
    link.click();
    URL.revokeObjectURL(url);
    message.success(`已导出 ${stats.rows.length} 条精灵统计`);
  }

  return (
    <Space direction="vertical" size={18} className="page-stack">
      <Card title="统计口径">
        <Space wrap size={12}>
          <Segmented
            value={range}
            options={STATS_RANGE_OPTIONS}
            onChange={(value) => onRangeChange(value as StatsRangeKey)}
          />
          <Segmented
            value={metric}
            options={STATS_METRIC_OPTIONS}
            onChange={(value) => onMetricChange(value as StatsMetricKey)}
          />
          <Select
            showSearch
            allowClear
            placeholder="搜索选择选手"
            value={player ?? undefined}
            options={playerOptions.map((playerName) => ({ value: playerName, label: playerName }))}
            onChange={(value) => onPlayerChange(value ?? null)}
            className="stats-filter-select"
            optionFilterProp="label"
          />
          <Select
            showSearch
            allowClear
            placeholder="搜索选择赛事标签"
            value={tag ?? undefined}
            options={tagOptions.map((tagName) => ({ value: tagName, label: tagName }))}
            onChange={(value) => onTagChange(value ?? null)}
            className="stats-filter-select"
            optionFilterProp="label"
          />
        </Space>
      </Card>

      <Row gutter={[18, 18]}>
        <Col xs={12} xl={6}>
          <Card size="small" className="subtle-card">
            <Statistic title="统计场次" value={stats.totalGames} suffix="局" />
            <Text type="secondary">有阵容记录的对局</Text>
          </Card>
        </Col>
        <Col xs={12} xl={6}>
          <Card size="small" className="subtle-card">
            <Statistic title="登场精灵总数" value={stats.totalPicks} suffix="只次" />
            <Text type="secondary">场均 {(stats.totalGames > 0 ? stats.totalPicks / stats.totalGames : 0).toFixed(1)} 只</Text>
          </Card>
        </Col>
        <Col xs={12} xl={6}>
          <Card size="small" className="subtle-card">
            <Statistic title="不同精灵数" value={stats.distinctSprites} suffix="种" />
            <Text type="secondary">筛选范围内出现过</Text>
          </Card>
        </Col>
        <Col xs={12} xl={6}>
          <Card size="small" className="subtle-card">
            <Statistic
              title="热门属性"
              value={stats.attributeRows[0]?.attribute ?? '-'}
              styles={{ content: { fontSize: 22 } }}
            />
            <Text type="secondary">{stats.attributeRows[0] ? `占比 ${stats.attributeRows[0].percent.toFixed(1)}%` : '暂无数据'}</Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={18}>
          <Card
            title={metric === 'pickRate' ? '精灵使用率排行' : '精灵上场率排行'}
            extra={(
              <Space wrap>
                <Input.Search
                  placeholder="搜索精灵名称"
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  className="stats-search"
                  allowClear
                />
                <Button onClick={exportStatsCsv} disabled={!stats.rows.length}>导出 CSV</Button>
              </Space>
            )}
          >
            <Table
              rowKey={(record) => record.key}
              columns={statsColumns}
              dataSource={visibleRows}
              size="middle"
              pagination={{ pageSize: 15, showSizeChanger: false, hideOnSinglePage: true }}
              locale={{ emptyText: '当前筛选范围内暂无登场记录' }}
            />
            <Text type="secondary" className="stats-footnote">
              {metric === 'pickRate'
                ? '使用率 = 登场只次 ÷ 总登场只次（同局重复携带按只次计）'
                : '上场率 = 登场场次 ÷ 总场次（同局同侧重复携带只计 1 次）'}
              {' · 胜率 = 该精灵所在一侧获胜场次 ÷ 登场场次'}
            </Text>
          </Card>
        </Col>
        <Col xs={24} xl={6}>
          <Space direction="vertical" size={18} className="page-stack stats-side-stack">
            <Card title="属性分布" extra={<Text type="secondary">按登场只次</Text>}>
              {stats.attributeRows.length ? (
                <Space direction="vertical" size={10} className="page-stack">
                  {stats.attributeRows.slice(0, 8).map((row) => {
                    const iconPath = ATTRIBUTE_ICON_BY_LABEL.get(row.attribute);
                    return (
                      <div key={row.attribute} className="stats-attribute-row">
                        <span className="stats-attribute-pill">
                          {iconPath && (
                            <img
                              src={iconPath}
                              alt={row.attribute}
                              width={16}
                              height={16}
                            />
                          )}
                          <span className="stats-attribute-pill-text">{row.attribute}</span>
                        </span>
                        <Progress
                          percent={row.percent}
                          showInfo={false}
                          size="small"
                          className="stats-usage-bar"
                        />
                        <Text className="stats-usage-value">{row.percent.toFixed(1)}%</Text>
                      </div>
                    );
                  })}
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
              )}
            </Card>

            <Card title="Top 3 登场趋势" extra={<Text type="secondary">按日聚合</Text>}>
              {topTrendRows.length && dailyKeys.length > 1 ? (
                <Space direction="vertical" size={10} className="page-stack">
                  <svg viewBox={`0 0 ${Math.max(dailyKeys.length * 40, 120)} 140`} className="stats-trend-svg" preserveAspectRatio="none">
                    {topTrendRows.map((row, rowIndex) => {
                      const points = dailyKeys.map((key, index) => {
                        const games = row.dailyGames.get(key) ?? 0;
                        const x = dailyKeys.length > 1 ? (index / (dailyKeys.length - 1)) * 100 : 0;
                        const y = 130 - (games / topUsageForTrend) * 120;
                        return `${x},${Math.max(4, y)}`;
                      }).join(' ');
                      return (
                        <polyline key={row.key} points={points} fill="none" stroke={trendColors[rowIndex]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                      );
                    })}
                  </svg>
                  <Space wrap size={14}>
                    {topTrendRows.map((row, rowIndex) => (
                      <Text key={row.key} type="secondary">
                        <span className="stats-trend-dot" style={{ background: trendColors[rowIndex] }} />
                        {row.name}
                      </Text>
                    ))}
                  </Space>
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="需要至少两天的登场数据" />
              )}
            </Card>
          </Space>
        </Col>
      </Row>
    </Space>
  );
}
