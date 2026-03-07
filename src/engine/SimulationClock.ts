export class SimulationClock {
  private timer: number | null = null;

  start(onTick: () => void, intervalMs: number) {
    this.stop();
    this.timer = window.setInterval(onTick, Math.max(10, intervalMs));
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning() {
    return this.timer !== null;
  }
}
