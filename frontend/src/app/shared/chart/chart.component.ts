import { Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartData,
  ChartOptions,
  ChartType,
  DoughnutController,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

Chart.register(
  LineController,
  BarController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
);

@Component({
  selector: 'app-chart',
  template: `
    <div class="chart-container">
      <canvas #canvas></canvas>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 120px;
    }

    .chart-container {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 120px;
    }
  `,
})
export class ChartComponent implements OnDestroy {
  readonly type = input<ChartType>('line');
  readonly data = input<ChartData | null>(null);
  readonly options = input<ChartOptions>({ responsive: true, maintainAspectRatio: false });

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const canvas = this.canvasRef()?.nativeElement;
      const data = this.data();
      const type = this.type();
      const options = this.options();

      if (!canvas) {
        return;
      }

      this.chart?.destroy();
      if (!data) {
        this.chart = null;
        return;
      }
      const canvasStyles = getComputedStyle(canvas);
      Chart.defaults.color = canvasStyles.color;
      this.chart = new Chart(canvas, { type, data, options });
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
