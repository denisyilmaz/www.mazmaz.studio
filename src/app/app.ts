import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MazGrid } from './maz-grid/maz-grid';

@Component({
  selector: 'app-root',
  imports: [MazGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {}
