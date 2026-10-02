import { describe, expect, it } from 'vitest';
import { FALLBACK_PALETTE, loadedVsEmptyOption, paletteFrom } from '../chart-options';
import type { JourneyDistanceChart } from '../../workspace/journey';

const chart = (over: Partial<JourneyDistanceChart> = {}): JourneyDistanceChart => ({
  sequences: ['Chặng 1', 'Chặng 2'],
  loadedKm: [105, 0],
  emptyKm: [0, 105],
  omittedLegs: 0,
  ...over,
});

describe('bieu do km — hai chuoi, va mau chang rong den tu bang mau', () => {
  it('km co hang va km rong la HAI chuoi chong nhau, khong mot chuoi to hai mau', () => {
    const option = loadedVsEmptyOption(chart(), FALLBACK_PALETTE) as unknown as {
      series: readonly { name: string; stack: string; itemStyle: { color: string } }[];
    };

    expect(option.series).toHaveLength(2);
    expect(option.series.map((entry) => entry.name)).toEqual(['Km có hàng', 'Km rỗng']);
    expect(option.series.every((entry) => entry.stack === 'km')).toBe(true);
    expect(option.series[1]?.itemStyle.color).toBe(FALLBACK_PALETTE.empty);
  });

  it('chi ve dung so cot bang so nhan truc — khong bia them mot cot nao', () => {
    const option = loadedVsEmptyOption(chart(), FALLBACK_PALETTE) as unknown as {
      xAxis: { data: readonly string[] };
      series: readonly { data: readonly number[] }[];
    };

    expect(option.xAxis.data).toHaveLength(2);
    expect(option.series[0]?.data).toHaveLength(2);
    expect(option.series[1]?.data).toHaveLength(2);
  });

  it('khong chang nao ve duoc thi bieu do rong — khong mot cot mac dinh nao', () => {
    const option = loadedVsEmptyOption(
      chart({ sequences: [], loadedKm: [], emptyKm: [], omittedLegs: 3 }),
      FALLBACK_PALETTE,
    ) as unknown as {
      xAxis: { data: readonly string[] };
      series: readonly { data: readonly number[] }[];
    };

    expect(option.xAxis.data).toEqual([]);
    expect(option.series[0]?.data).toEqual([]);
  });

  it('bang mau doc tu bien CSS, va lui ve mac dinh khi bien rong', () => {
    const style = {
      getPropertyValue: (name: string) => (name === '--tx-stop' ? ' #ff0000 ' : ''),
    };

    const palette = paletteFrom(style);

    expect(palette.empty).toBe('#ff0000');
    expect(palette.loaded).toBe(FALLBACK_PALETTE.loaded);
  });

  it('tat dinh — hai lan dung cung dau vao cho cung tuy chon', () => {
    expect(loadedVsEmptyOption(chart(), FALLBACK_PALETTE)).toEqual(
      loadedVsEmptyOption(chart(), FALLBACK_PALETTE),
    );
  });
});
