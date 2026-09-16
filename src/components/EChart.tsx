import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart, HeatmapChart, GaugeChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  VisualMapComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

// Registering only what we use keeps the ECharts bundle far below the ~1 MB
// full build. Adding a new chart type here is the one step to remember.
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  VisualMapComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

interface Props {
  option: EChartsCoreOption;
  height?: number | string;
  className?: string;
  /** Skip re-rendering animation for sparkline grids with many instances. */
  silent?: boolean;
}

export function EChart({ option, height = 280, className, silent = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const chart = echarts.init(hostRef.current, undefined, {
      renderer: 'canvas',
      // Many small sparkline instances would otherwise animate on mount and
      // stutter the whole grid.
      useDirtyRect: silent,
    });
    instRef.current = chart;

    // ResizeObserver rather than a window listener: grid/flex reflows that
    // don't resize the window are the common case here.
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      chart.dispose();
      instRef.current = null;
    };
  }, [silent]);

  useEffect(() => {
    instRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return <div ref={hostRef} className={className} style={{ height, width: '100%' }} />;
}
